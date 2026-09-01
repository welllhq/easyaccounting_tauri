/* ============ Mock 数据层（浏览器自测模式） ============
 * 在没有 Tauri 环境（纯浏览器打开 index.html）时，
 * MockApi 提供与 Rust 后端完全一致的命令接口，
 * 便于开发期验证界面与统计逻辑。种子随机保证数据稳定。
 */
"use strict";

const MockApi = (() => {
  // 可重复的伪随机
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = mulberry32(20260901);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  let idSeq = 1000;
  const state = {};

  function ensure(account) {
    if (!state[account]) {
      state[account] = { ledgers: [], records: [] };
      seedAccount(account);
    }
    return state[account];
  }

  function seedAccount(account) {
    const s = state[account];
    const defs = [
      { name: "银行存款", desc: "活期 + 定期", base: 86000, drift: 0.006 },
      { name: "基金账户", desc: "指数基金定投", base: 30000, drift: 0.015 },
      { name: "数字货币", desc: "BTC / ETH", base: 9000, drift: 0.05 },
      { name: "收藏品", desc: "邮票 / 钱币", base: 5000, drift: 0.004 },
    ];
    let lid = 1;
    for (const d of defs) {
      s.ledgers.push({ id: lid, name: d.name, description: d.desc, created_at: "2025-01-05 10:00:00" });
      let v = d.base;
      const notes = ["月度盘点", "工资到账", "定投买入", "行情波动", "购入新品", "卖出部分", "转入资金"];
      // 从 2025-01 起每月 1-2 条记录
      for (let y = 2025; y <= 2026; y++) {
        for (let m = 1; m <= 12; m++) {
          if (y === 2026 && m > 8) break;
          const times = m % 2 === 0 ? 2 : 1;
          for (let t = 0; t < times; t++) {
            const day = 1 + Math.floor(rand() * 27);
            v = Math.max(100, v * (1 + (rand() - 0.46) * d.drift * 2));
            s.records.push({
              id: idSeq++,
              ledger_id: lid,
              ledger_name: d.name,
              period: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
              amount: Math.round(v * 100) / 100,
              note: pick(notes),
              created_at: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")} 12:00:00`,
            });
          }
        }
      }
      lid++;
    }
    s.records.sort((a, b) => (a.period < b.period ? -1 : 1));
  }

  function filtered(account, ledgerId, keyword) {
    const s = ensure(account);
    let rows = s.records.slice();
    if (ledgerId) rows = rows.filter((r) => r.ledger_id === ledgerId);
    if (keyword) {
      const k = keyword.toLowerCase();
      rows = rows.filter((r) => (r.note || "").toLowerCase().includes(k) || r.ledger_name.toLowerCase().includes(k));
    }
    rows = rows.slice().sort((a, b) =>
      a.period < b.period ? 1 : a.period > b.period ? -1 : a.created_at < b.created_at ? 1 : -1
    );
    return rows;
  }

  return {
    async invoke(cmd, args = {}) {
      switch (cmd) {
        case "list_accounts": {
          const names = Object.keys(state);
          if (names.length === 0) {
            state["家庭账户"] = { ledgers: [], records: [] };
            seedAccount("家庭账户");
            state["个人账户"] = { ledgers: [], records: [] };
            seedAccount("个人账户");
          }
          return Object.keys(state).sort();
        }
        case "create_account": {
          if (state[args.name]) throw "账户已存在";
          state[args.name] = { ledgers: [], records: [] };
          return null;
        }
        case "delete_account": {
          delete state[args.name];
          return null;
        }
        case "list_ledgers": return ensure(args.account).ledgers.slice();
        case "create_ledger": {
          const s = ensure(args.account);
          const id = s.ledgers.length ? Math.max(...s.ledgers.map((l) => l.id)) + 1 : 1;
          const lg = { id, name: args.name.trim(), description: (args.description || "").trim(), created_at: new Date().toISOString().slice(0, 19).replace("T", " ") };
          s.ledgers.push(lg);
          return lg;
        }
        case "delete_ledger": {
          const s = ensure(args.account);
          s.ledgers = s.ledgers.filter((l) => l.id !== args.id);
          s.records = s.records.filter((r) => r.ledger_id !== args.id);
          return null;
        }
        case "list_records": {
          const rows = filtered(args.account, args.ledger_id, args.keyword);
          return rows.slice(args.offset || 0, (args.offset || 0) + (args.limit || 50));
        }
        case "count_records": {
          return filtered(args.account, args.ledger_id, args.keyword).length;
        }
        case "all_records": {
          return ensure(args.account).records.slice().sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
        }
        case "add_record": {
          const s = ensure(args.account);
          const lg = s.ledgers.find((l) => l.id === args.ledger_id);
          s.records.push({
            id: idSeq++, ledger_id: args.ledger_id, ledger_name: lg ? lg.name : "(已删除账本)",
            period: args.period, amount: args.amount, note: args.note || "",
            created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          });
          return null;
        }
        case "update_record": {
          const s = ensure(args.account);
          const r = s.records.find((x) => x.id === args.id);
          if (r) {
            r.ledger_id = args.ledger_id; r.amount = args.amount; r.note = args.note || ""; r.period = args.period;
            const lg = s.ledgers.find((l) => l.id === args.ledger_id);
            r.ledger_name = lg ? lg.name : "(已删除账本)";
          }
          return null;
        }
        case "delete_record": {
          const s = ensure(args.account);
          s.records = s.records.filter((r) => r.id !== args.id);
          return null;
        }
        case "backup_db": return "mock:/data/backups/" + args.account + "_20260901_000000.db";
        case "data_dir": return "D:\\mock\\data";
        case "open_data_dir": return null;
        default: throw "未知命令: " + cmd;
      }
    },
  };
})();
