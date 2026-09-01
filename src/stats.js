/* ============ 统计引擎 ============
 * 数据模型（与原版一致）：每条记录 = 某账本在某日期的资产快照值。
 * 因此：
 *  - 账本在日期 D 的资产 = period <= D 的最新一条记录（前推填充）；
 *  - 总资产在日期 D = 各账本在 D 的资产之和；
 *  - 趋势图按"阶梯/前推"语义绘制，同一账本同一天多条记录取最新。
 */
"use strict";

const Stats = (() => {
  const DAY = 86400000;

  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const todayKey = () => keyOf(new Date());
  const nextDay = (k) => {
    const d = parseKey(k);
    d.setDate(d.getDate() + 1);
    return keyOf(d);
  };
  const addMonths = (k, n) => {
    const d = parseKey(k);
    d.setMonth(d.getMonth() + n);
    return keyOf(d);
  };
  const addDays = (k, n) => {
    const d = parseKey(k);
    d.setDate(d.getDate() + n);
    return keyOf(d);
  };

  /** 每个账本的最新记录（period 最大，其次 created_at 最大） */
  function latestByLedger(records) {
    const m = new Map();
    for (const r of records) {
      const cur = m.get(r.ledger_id);
      if (!cur || r.period > cur.period || (r.period === cur.period && r.created_at > cur.created_at)) {
        m.set(r.ledger_id, r);
      }
    }
    return m;
  }

  /** 按账本分组并按 (period, created_at) 排序 */
  function groupSorted(records) {
    const g = new Map();
    for (const r of records) {
      if (!g.has(r.ledger_id)) g.set(r.ledger_id, []);
      g.get(r.ledger_id).push(r);
    }
    for (const arr of g.values()) {
      arr.sort((a, b) =>
        a.period < b.period ? -1 : a.period > b.period ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
      );
    }
    return g;
  }

  /** 单个账本在 [startKey, endKey] 上的前推快照序列（尚未出现前为 null） */
  function ledgerSeries(sorted, startKey, endKey) {
    const out = [];
    let idx = 0, val = null, has = false;
    while (idx < sorted.length && sorted[idx].period <= startKey) { val = sorted[idx].amount; has = true; idx++; }
    out.push({ date: startKey, value: has ? val : null });
    let d = startKey;
    while (d < endKey) {
      d = nextDay(d);
      while (idx < sorted.length && sorted[idx].period <= d) { val = sorted[idx].amount; has = true; idx++; }
      out.push({ date: d, value: has ? val : null });
    }
    return out;
  }

  /** 生成 [startKey, endKey] 的日期序列 */
  function dateRange(startKey, endKey) {
    const dates = [];
    let d = startKey;
    while (true) {
      dates.push(d);
      if (d === endKey) break;
      d = nextDay(d);
    }
    return dates;
  }

  /**
   * 趋势数据
   * @returns {{dates:string[], per:{name,id,points:{date,value}[]}[], total:{date,value}[]}}
   */
  function trendData(ledgers, records, startKey, endKey) {
    const g = groupSorted(records);
    const dates = dateRange(startKey, endKey);
    const per = ledgers.map((l) => {
      const arr = g.get(l.id) || [];
      const points = arr.length
        ? ledgerSeries(arr, startKey, endKey)
        : dates.map((date) => ({ date, value: null }));
      return { name: l.name, id: l.id, points };
    });
    const total = dates.map((date, i) => {
      let sum = 0;
      for (const p of per) {
        const v = p.points[i].value;
        if (v != null) sum += v;
      }
      return { date, value: sum };
    });
    return { dates, per, total };
  }

  /** 某账本在指定日期的资产值（无记录则 0） */
  function valueAt(records, ledgerId, dateKey) {
    let best = null;
    for (const r of records) {
      if (r.ledger_id === ledgerId && r.period <= dateKey) {
        if (!best || r.period > best.period || (r.period === best.period && r.created_at > best.created_at)) best = r;
      }
    }
    return best ? best.amount : 0;
  }

  /** 全部账本在指定日期的总资产 */
  function totalAt(records, ledgers, dateKey) {
    let sum = 0;
    for (const l of ledgers) sum += valueAt(records, l.id, dateKey);
    return sum;
  }

  /** KPI：总资产 / 本月变动 / 年初至今 / 账本·记录数 */
  function computeKpis(ledgers, records) {
    const latest = latestByLedger(records);
    let totalNow = 0;
    for (const [, r] of latest) totalNow += r.amount;
    const now = todayKey();
    const monthStart = now.slice(0, 8) + "01";
    const yearStart = now.slice(0, 5) + "01-01";
    const tMonth = totalAt(records, ledgers, monthStart);
    const tYear = totalAt(records, ledgers, yearStart);
    const monthChange = totalNow - tMonth;
    const ytdChange = totalNow - tYear;
    return {
      totalNow,
      monthChange,
      monthChangePct: tMonth !== 0 ? (monthChange / tMonth) * 100 : null,
      ytdChange,
      ytdChangePct: tYear !== 0 ? (ytdChange / tYear) * 100 : null,
      ledgerCount: ledgers.length,
      recordCount: records.length,
      latest,
    };
  }

  /** 变动分析表 */
  function changeTable(ledgers, records, rangeStart, rangeEnd) {
    const latest = latestByLedger(records);
    const now = todayKey();
    const monthStart = now.slice(0, 8) + "01";
    const yearStart = now.slice(0, 5) + "01-01";
    const rows = [];
    for (const l of ledgers) {
      const lr = records.filter((r) => r.ledger_id === l.id);
      const sorted = lr.slice().sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
      const cur = latest.get(l.id);
      const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
      const current = cur ? cur.amount : 0;
      const prevAmt = prev ? prev.amount : null;
      const mStart = valueAt(records, l.id, monthStart);
      const yStart = valueAt(records, l.id, yearStart);
      const range = lr.filter((r) => r.period >= rangeStart && r.period <= rangeEnd);
      const amounts = range.map((r) => r.amount);
      const sum = amounts.reduce((a, b) => a + b, 0);
      rows.push({
        name: l.name,
        current,
        delta: prevAmt != null ? current - prevAmt : null,
        deltaPct: prevAmt ? ((current - prevAmt) / prevAmt) * 100 : null,
        monthDelta: current - mStart,
        monthDeltaPct: mStart ? ((current - mStart) / mStart) * 100 : null,
        ytdDelta: current - yStart,
        ytdDeltaPct: yStart ? ((current - yStart) / yStart) * 100 : null,
        hi: amounts.length ? Math.max(...amounts) : null,
        lo: amounts.length ? Math.min(...amounts) : null,
        avg: amounts.length ? sum / amounts.length : null,
        count: range.length,
      });
    }
    return rows;
  }

  /** 饼图数据：atDateKey 为空表示最新结构 */
  function pieData(ledgers, records, atDateKey) {
    const latest = latestByLedger(records);
    const data = [];
    for (const l of ledgers) {
      const v = atDateKey ? valueAt(records, l.id, atDateKey) : (latest.get(l.id) ? latest.get(l.id).amount : 0);
      if (v > 0) data.push({ name: l.name, value: Math.round(v * 100) / 100 });
    }
    data.sort((a, b) => b.value - a.value);
    return data;
  }

  /** 根据预设解析时间范围；返回 {startKey, endKey} */
  function resolveRange(records, preset, customStart, customEnd) {
    const now = todayKey();
    if (preset === "all") {
      let min = null, max = null;
      for (const r of records) {
        if (!min || r.period < min) min = r.period;
        if (!max || r.period > max) max = r.period;
      }
      const start = min || now;
      const end = max && max > now ? max : now;
      return { startKey: start, endKey: end };
    }
    if (preset === "1m") return { startKey: addMonths(now, -1), endKey: now };
    if (preset === "3m") return { startKey: addMonths(now, -3), endKey: now };
    if (preset === "6m") return { startKey: addMonths(now, -6), endKey: now };
    if (preset === "1y") return { startKey: addMonths(now, -12), endKey: now };
    if (preset === "custom") {
      let s = customStart, e = customEnd;
      if (!s || !e) return { startKey: null, endKey: null };
      if (s > e) { const t = s; s = e; e = t; }
      return { startKey: s, endKey: e };
    }
    return { startKey: addMonths(now, -12), endKey: now };
  }

  return {
    latestByLedger, trendData, computeKpis, changeTable, pieData,
    resolveRange, todayKey, keyOf, addMonths, addDays,
  };
})();
