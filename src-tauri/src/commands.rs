//! Tauri 命令层：前端通过 window.__TAURI__.core.invoke 调用的全部接口。
//! 数据量小（个人记账），聚合统计放在前端做，后端只负责存取与校验。

use chrono::Local;
use rusqlite::params;
use serde::Serialize;

use crate::db;

// ---------- 数据结构 ----------

#[derive(Serialize)]
pub struct Ledger {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct Record {
    pub id: i64,
    pub ledger_id: i64,
    pub ledger_name: String,
    pub period: String,
    pub amount: f64,
    pub note: String,
    pub created_at: String,
}

// ---------- 账户 ----------

#[tauri::command]
pub fn list_accounts() -> Result<Vec<String>, String> {
    let dir = db::data_dir();
    let mut out = Vec::new();
    if dir.exists() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for entry in rd.flatten() {
                let p = entry.path();
                if p.extension().map(|x| x == "db").unwrap_or(false) {
                    if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                        out.push(stem.to_string());
                    }
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn create_account(name: String) -> Result<(), String> {
    let safe = db::sanitize_account(&name)?;
    let path = db::db_path(&safe)?;
    if path.exists() {
        return Err(format!("账户 '{}' 已存在", safe));
    }
    db::open_db(&safe)?; // 创建文件 + 初始化表结构
    Ok(())
}

#[tauri::command]
pub fn delete_account(name: String) -> Result<(), String> {
    let safe = db::sanitize_account(&name)?;
    let path = db::db_path(&safe)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))?;
    }
    Ok(())
}

// ---------- 账本 ----------

#[tauri::command]
pub fn list_ledgers(account: String) -> Result<Vec<Ledger>, String> {
    let conn = db::open_db(&account)?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, created_at FROM ledgers ORDER BY created_at DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Ledger {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_ledger(account: String, name: String, description: String) -> Result<Ledger, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("账本名称不能为空".into());
    }
    let conn = db::open_db(&account)?;
    conn.execute(
        "INSERT INTO ledgers (name, description) VALUES (?1, ?2)",
        params![name, description.trim()],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("账本 '{}' 已存在", name)
        } else {
            format!("创建账本失败: {e}")
        }
    })?;
    let id = conn.last_insert_rowid();
    let created_at: String = conn
        .query_row("SELECT created_at FROM ledgers WHERE id = ?1", params![id], |r| r.get(0))
        .unwrap_or_default();
    Ok(Ledger { id, name, description: description.trim().to_string(), created_at })
}

#[tauri::command]
pub fn delete_ledger(account: String, id: i64) -> Result<(), String> {
    let conn = db::open_db(&account)?;
    conn.execute("BEGIN IMMEDIATE TRANSACTION", []).map_err(|e| e.to_string())?;
    let res = (|| -> Result<(), String> {
        conn.execute("DELETE FROM asset_records WHERE ledger_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM ledgers WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })();
    match res {
        Ok(_) => conn.execute("COMMIT", []).map_err(|e| e.to_string()).map(|_| ()),
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// ---------- 资产记录 ----------

fn record_from_row(r: &rusqlite::Row) -> rusqlite::Result<Record> {
    Ok(Record {
        id: r.get(0)?,
        ledger_id: r.get(1)?,
        ledger_name: r.get(2)?,
        period: r.get(3)?,
        amount: r.get(4)?,
        note: r.get(5)?,
        created_at: r.get(6)?,
    })
}

const RECORD_SELECT: &str = "SELECT ar.id, ar.ledger_id, IFNULL(l.name,'(已删除账本)'), ar.period, ar.amount, IFNULL(ar.note,''), ar.created_at FROM asset_records ar LEFT JOIN ledgers l ON ar.ledger_id = l.id";

/// 分页查询历史记录（支持按账本筛选 + 关键字搜索）
#[tauri::command]
pub fn list_records(
    account: String,
    ledger_id: Option<i64>,
    keyword: Option<String>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Record>, String> {
    let conn = db::open_db(&account)?;
    let mut sql = String::from(RECORD_SELECT);
    let mut conds: Vec<String> = Vec::new();
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(lid) = ledger_id {
        conds.push("ar.ledger_id = ?".into());
        args.push(Box::new(lid));
    }
    let kw = keyword.unwrap_or_default().trim().to_string();
    if !kw.is_empty() {
        conds.push("(ar.note LIKE ? OR l.name LIKE ?)".into());
        args.push(Box::new(format!("%{kw}%")));
        args.push(Box::new(format!("%{kw}%")));
    }
    if !conds.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conds.join(" AND "));
    }
    sql.push_str(" ORDER BY ar.period DESC, ar.created_at DESC, ar.id DESC LIMIT ? OFFSET ?");
    args.push(Box::new(limit));
    args.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let arg_refs: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let rows = stmt
        .query_map(arg_refs.as_slice(), record_from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// 记录总数（配合分页）
#[tauri::command]
pub fn count_records(account: String, ledger_id: Option<i64>, keyword: Option<String>) -> Result<i64, String> {
    let conn = db::open_db(&account)?;
    let mut sql = String::from("SELECT COUNT(*) FROM asset_records ar LEFT JOIN ledgers l ON ar.ledger_id = l.id");
    let mut conds: Vec<String> = Vec::new();
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(lid) = ledger_id {
        conds.push("ar.ledger_id = ?".into());
        args.push(Box::new(lid));
    }
    let kw = keyword.unwrap_or_default().trim().to_string();
    if !kw.is_empty() {
        conds.push("(ar.note LIKE ? OR l.name LIKE ?)".into());
        args.push(Box::new(format!("%{kw}%")));
        args.push(Box::new(format!("%{kw}%")));
    }
    if !conds.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conds.join(" AND "));
    }
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let arg_refs: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    stmt.query_row(arg_refs.as_slice(), |r| r.get(0)).map_err(|e| e.to_string())
}

/// 拉取全部记录（统计引擎使用，数据量小直接全量）
#[tauri::command]
pub fn all_records(account: String) -> Result<Vec<Record>, String> {
    let conn = db::open_db(&account)?;
    let sql = format!("{RECORD_SELECT} ORDER BY ar.period ASC, ar.created_at ASC, ar.id ASC");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], record_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn validate_period(period: &str) -> Result<String, String> {
    let t = period.trim();
    if t.len() != 10 || !t.chars().enumerate().all(|(i, c)| {
        if i == 4 || i == 7 {
            c == '-'
        } else {
            c.is_ascii_digit()
        }
    }) {
        return Err("日期格式应为 yyyy-MM-dd".into());
    }
    Ok(t.to_string())
}

#[tauri::command]
pub fn add_record(
    account: String,
    ledger_id: i64,
    amount: f64,
    note: String,
    period: String,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Err("金额必须大于 0".into());
    }
    let period = validate_period(&period)?;
    let conn = db::open_db(&account)?;
    conn.execute(
        "INSERT INTO asset_records (ledger_id, amount, note, period) VALUES (?1, ?2, ?3, ?4)",
        params![ledger_id, amount, note.trim(), period],
    )
    .map_err(|e| format!("添加记录失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_record(
    account: String,
    id: i64,
    ledger_id: i64,
    amount: f64,
    note: String,
    period: String,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Err("金额必须大于 0".into());
    }
    let period = validate_period(&period)?;
    let conn = db::open_db(&account)?;
    conn.execute(
        "UPDATE asset_records SET ledger_id = ?1, amount = ?2, note = ?3, period = ?4 WHERE id = ?5",
        params![ledger_id, amount, note.trim(), period, id],
    )
    .map_err(|e| format!("更新记录失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_record(account: String, id: i64) -> Result<(), String> {
    let conn = db::open_db(&account)?;
    conn.execute("DELETE FROM asset_records WHERE id = ?1", params![id])
        .map_err(|e| format!("删除记录失败: {e}"))?;
    Ok(())
}

// ---------- 工具 ----------

/// 备份当前账户数据库到 data/backups/ 下（带时间戳）
#[tauri::command]
pub fn backup_db(account: String) -> Result<String, String> {
    let safe = db::sanitize_account(&account)?;
    let src = db::db_path(&safe)?;
    if !src.exists() {
        return Err("账户数据库不存在".into());
    }
    let backups_dir = db::data_dir().join("backups");
    std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    let stamp = Local::now().format("%Y%m%d_%H%M%S");
    let dst = backups_dir.join(format!("{}_{}.db", safe, stamp));
    std::fs::copy(&src, &dst).map_err(|e| format!("备份失败: {e}"))?;
    Ok(dst.to_string_lossy().to_string())
}

/// 返回数据目录路径（用于界面展示与打开）
#[tauri::command]
pub fn data_dir() -> Result<String, String> {
    Ok(db::data_dir().to_string_lossy().to_string())
}

/// 打开数据目录（资源管理器）
#[tauri::command]
pub fn open_data_dir() -> Result<(), String> {
    let dir = db::data_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("无法打开目录: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

