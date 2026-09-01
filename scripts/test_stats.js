/* 统计引擎单元测试（node 运行，不依赖浏览器） */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "stats.js"), "utf8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.replace("const Stats = (() =>", "globalThis.Stats = (() =>"), ctx);
const S = ctx.Stats;

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, "\n    expected:", JSON.stringify(expected), "\n    actual:  ", JSON.stringify(actual)); }
}

// ---- 样本数据 ----
const ledgers = [
  { id: 1, name: "存款" },
  { id: 2, name: "基金" },
];
const records = [
  { id: 1, ledger_id: 1, period: "2026-01-05", amount: 1000, created_at: "2026-01-05 10:00:00" },
  { id: 2, ledger_id: 1, period: "2026-03-10", amount: 1200, created_at: "2026-03-10 10:00:00" },
  { id: 3, ledger_id: 2, period: "2026-02-01", amount: 500, created_at: "2026-02-01 10:00:00" },
  { id: 4, ledger_id: 2, period: "2026-04-01", amount: 600, created_at: "2026-04-01 10:00:00" },
  { id: 5, ledger_id: 1, period: "2026-03-10", amount: 1100, created_at: "2026-03-10 22:00:00" }, // 同日更新，应取最新
];

console.log("== latestByLedger ==");
const latest = S.latestByLedger(records);
eq("账本1 最新取同日较晚一条 1100", latest.get(1).amount, 1100);
eq("账本2 最新 600", latest.get(2).amount, 600);

console.log("== trendData 前推快照 ==");
const td = S.trendData(ledgers, records, "2026-01-01", "2026-04-02");
eq("日期数 92 天", td.dates.length, 92);
const idx = (d) => td.dates.indexOf(d);
eq("1/05 账本1=1000", td.per[0].points[idx("2026-01-05")].value, 1000);
eq("2/01 账本1 前推=1000", td.per[0].points[idx("2026-02-01")].value, 1000);
eq("3/10 账本1=1100(同日较晚)", td.per[0].points[idx("2026-03-10")].value, 1100);
eq("2/01 总资产=1500", td.total[idx("2026-02-01")].value, 1500);
eq("3/10 总资产=1600(1100+500, 同日取最新)", td.total[idx("2026-03-10")].value, 1600);
eq("4/02 总资产=1700", td.total[idx("2026-04-02")].value, 1700);

console.log("== computeKpis ==");
const kpi = S.computeKpis(ledgers, records);
eq("总资产 = 1100+600", kpi.totalNow, 1700);
eq("账本数 2", kpi.ledgerCount, 2);
eq("记录数 5", kpi.recordCount, 5);
// 月初(2026-09-01) 前推值 = 1700 → 本月变动 0
eq("本月变动 = 0", kpi.monthChange, 0);
// 年初(2026-01-01) 前推值 = 0 → 年初至今 = 1700
eq("年初至今 = 1700", kpi.ytdChange, 1700);

console.log("== changeTable ==");
const rows = S.changeTable(ledgers, records, "2026-01-01", "2026-09-30");
eq("行数 2", rows.length, 2);
const r1 = rows.find((r) => r.name === "存款");
eq("存款 当前 1100", r1.current, 1100);
eq("存款 较上次 = -100 (1100 vs 1200 倒数第二条)", r1.delta, -100);
eq("存款 区间最高 1200", r1.hi, 1200);
eq("存款 区间最低 1000", r1.lo, 1000);
eq("存款 区间平均 (1000+1200+1100)/3", r1.avg, 1100);

console.log("== pieData ==");
const pie = S.pieData(ledgers, records, null);
eq("最新结构 基金在前(600<1100 排序后存款在前)", pie[0].name, "存款");
eq("最新结构 存款 1100", pie[0].value, 1100);
const pieOld = S.pieData(ledgers, records, "2026-02-15");
eq("2026-02-15 存款=1000", pieOld.find((p) => p.name === "存款").value, 1000);

console.log("== resolveRange ==");
const rAll = S.resolveRange(records, "all");
eq("全部范围 起点=最早记录", rAll.startKey, "2026-01-05");
eq("全部范围 终点=今天或最晚记录", rAll.endKey, "2026-09-01");
const r1m = S.resolveRange(records, "1m");
eq("近1月起点", r1m.startKey, "2026-08-01");

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
