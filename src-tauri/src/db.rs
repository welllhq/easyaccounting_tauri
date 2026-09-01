//! 数据库层：数据目录解析 + SQLite 连接管理与表结构初始化。
//!
//! 设计原则（延续原版"轻量、本地、便携"的初心）：
//! - 一个账户 = 一个 .db 文件，放在 `data/` 目录；
//! - 优先使用 exe 同级 `data/`（便携模式，兼容旧版 easyAccounting_CPP 的数据），
//!   目录不可写时退回系统应用数据目录；
//! - 表结构与旧版完全一致，旧数据零迁移直接可用。

use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

/// 解析数据目录（便携优先）
pub fn data_dir() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    let portable = exe_dir.join("data");
    if portable.exists() || is_writable(&exe_dir) {
        portable
    } else {
        // 退回系统应用数据目录（安装到 Program Files 等只读位置时）
        let base = std::env::var("APPDATA")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".to_string());
        PathBuf::from(base).join("EasyAccounting").join("data")
    }
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".write_probe_{}", std::process::id()));
    match fs::write(&probe, b"") {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// 校验并规范化账户名，防止路径穿越与非法字符
pub fn sanitize_account(name: &str) -> Result<String, String> {
    let t = name.trim();
    if t.is_empty() {
        return Err("账户名不能为空".into());
    }
    if t == "." || t == ".." {
        return Err("非法的账户名".into());
    }
    if t.chars()
        .any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'))
    {
        return Err("账户名包含非法字符".into());
    }
    Ok(t.to_string())
}

/// 构造账户对应的 .db 文件完整路径
pub fn db_path(account: &str) -> Result<PathBuf, String> {
    let name = sanitize_account(account)?;
    Ok(data_dir().join(format!("{}.db", name)))
}

/// 打开（必要时创建）账户数据库，并保证表结构存在
pub fn open_db(account: &str) -> Result<Connection, String> {
    let path = db_path(account)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建数据目录: {e}"))?;
    }
    let conn = Connection::open(&path).map_err(|e| format!("无法打开数据库: {e}"))?;
    init_schema(&conn)?;
    Ok(conn)
}

/// 初始化表结构（与旧版 schema 完全兼容，幂等）
fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS ledgers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
        );
        CREATE TABLE IF NOT EXISTS asset_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ledger_id INTEGER,
            amount REAL NOT NULL,
            note TEXT,
            period TEXT,
            created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (ledger_id) REFERENCES ledgers (id)
        );
        CREATE INDEX IF NOT EXISTS idx_records_ledger ON asset_records(ledger_id, period);
        CREATE INDEX IF NOT EXISTS idx_records_period ON asset_records(period);
        "#,
    )
    .map_err(|e| format!("初始化数据表失败: {e}"))?;
    Ok(())
}
