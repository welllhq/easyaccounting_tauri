/* ============ 轻账本 · 应用主逻辑 ============ */
"use strict";

const App = (() => {
  const state = {
    isTauri: !!window.__TAURI__,
    accounts: [],
    account: null,
    ledgers: [],
    records: [],           // 全量记录（统计引擎使用）
    selectedLedgerId: null,
    historyPage: 0,
    historyPageSize: 15,
    historyTotal: 0,
    rangePreset: "1y",
    rangeStart: null,
    rangeEnd: null,
    pieMode: "latest",
    pieDate: null,
  };

  const DOT_COLORS = ["#185FA5", "#0F6E56", "#BA7517", "#993C1D", "#7F77DD", "#D4537E", "#888780", "#639922", "#378ADD", "#1D9E75"];

  const api = {
    invoke: (cmd, args = {}) =>
      state.isTauri ? window.__TAURI__.core.invoke(cmd, args) : MockApi.invoke(cmd, args),
  };

  const $ = (id) => document.getElementById(id);

  // ---------------- 初始化 ----------------

  async function init() {
    Charts.init("trendChart", "pieChart");
    bindEvents();
    $("recordDate").value = Stats.todayKey();
    await loadAccounts();
  }

  function bindEvents() {
    // 视图切换
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
        $(btn.dataset.view).classList.add("active");
        if (btn.dataset.view === "view-stats") renderStats();
        setTimeout(() => { window.dispatchEvent(new Event("resize")); }, 30);
      });
    });

    // 账户
    $("accountSelect").addEventListener("change", (e) => {
      if (e.target.value) openAccount(e.target.value);
    });
    $("createAccountBtn").addEventListener("click", onCreateAccount);
    $("deleteAccountBtn").addEventListener("click", onDeleteAccount);
    $("emptyCreateAccountBtn").addEventListener("click", onCreateAccount);
    $("openDataDirBtn").addEventListener("click", () => api.invoke("open_data_dir").catch((e) => toast(String(e), "error")));

    // 账本
    $("createLedgerBtn").addEventListener("click", onCreateLedger);

    // 记录
    $("recordForm").addEventListener("submit", onAddRecord);
    $("historySearch").addEventListener("input", () => { state.historyPage = 0; refreshHistory(); });
    $("historyLedger").addEventListener("change", () => { state.historyPage = 0; refreshHistory(); });
    $("prevPageBtn").addEventListener("click", () => { if (state.historyPage > 0) { state.historyPage--; refreshHistory(); } });
    $("nextPageBtn").addEventListener("click", () => {
      if ((state.historyPage + 1) * state.historyPageSize < state.historyTotal) { state.historyPage++; refreshHistory(); }
    });

    // 统计
    document.querySelectorAll("#rangeTabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#rangeTabs button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.rangePreset = btn.dataset.range;
        $("customRange").classList.toggle("hidden", btn.dataset.range !== "custom");
        if (btn.dataset.range === "custom" && !state.rangeStart) {
          $("rangeEnd").value = Stats.todayKey();
          $("rangeStart").value = Stats.addMonths(Stats.todayKey(), -6);
          state.rangeStart = $("rangeStart").value;
          state.rangeEnd = $("rangeEnd").value;
        }
        renderStats();
      });
    });
    $("applyRangeBtn").addEventListener("click", () => {
      state.rangeStart = $("rangeStart").value;
      state.rangeEnd = $("rangeEnd").value;
      renderStats();
    });
    $("showTotal").addEventListener("change", () => renderStats());
    $("pieMode").addEventListener("change", (e) => {
      state.pieMode = e.target.value;
      $("pieDate").classList.toggle("hidden", e.target.value !== "date");
      renderPie();
    });
    $("pieDate").addEventListener("change", (e) => { state.pieDate = e.target.value || null; renderPie(); });

    $("exportCsvBtn").addEventListener("click", exportCsv);
    $("exportPngBtn").addEventListener("click", () => {
      Charts.exportTrendPng();
      toast("趋势图已导出为 PNG", "success");
    });
    $("backupBtn").addEventListener("click", onBackup);
  }

  // ---------------- 账户 ----------------

  async function loadAccounts() {
    state.accounts = await api.invoke("list_accounts");
    const sel = $("accountSelect");
    sel.innerHTML = "";
    if (state.accounts.length) {
      state.accounts.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      $("emptyAccount").classList.add("hidden");
      await openAccount(state.accounts[0]);
    } else {
      state.account = null;
      $("emptyAccount").classList.remove("hidden");
      clearAll();
    }
  }

  function clearAll() {
    $("ledgerList").innerHTML = "";
    $("recordLedger").innerHTML = "<option value=''>暂无账本</option>";
    $("historyLedger").innerHTML = "<option value=''>全部账本</option>";
    $("historyTable").querySelector("tbody").innerHTML = "";
    $("historyInfo").textContent = "";
    state.ledgers = []; state.records = [];
    $("kpiTotal").textContent = "--";
    $("kpiMonth").textContent = "--";
    $("kpiYtd").textContent = "--";
    $("kpiCount").textContent = "--";
    Charts.renderEmpty("trendChart");
    Charts.renderEmpty("pieChart");
  }

  async function openAccount(name) {
    state.account = name;
    state.historyPage = 0;
    const [ledgers, records] = await Promise.all([
      api.invoke("list_ledgers", { account: name }),
      api.invoke("all_records", { account: name }),
    ]);
    state.ledgers = ledgers;
    state.records = records;
    const dir = await api.invoke("data_dir").catch(() => "");
    $("dataDirLabel").textContent = dir ? "数据目录：" + dir : "";
    renderLedgerList();
    renderRecordForm();
    refreshHistory();
    renderStats();
  }

  // ---------------- 账本 ----------------

  function renderLedgerList() {
    const ul = $("ledgerList");
    ul.innerHTML = "";
    const latest = Stats.latestByLedger(state.records);
    $("ledgerEmpty").classList.toggle("hidden", state.ledgers.length > 0);
    state.ledgers.forEach((l, i) => {
      const li = document.createElement("li");
      li.className = "ledger-item" + (state.selectedLedgerId === l.id ? " selected" : "");
      li.dataset.id = l.id;
      const cur = latest.get(l.id);
      li.innerHTML = `
        <span class="ledger-dot" style="background:${DOT_COLORS[i % DOT_COLORS.length]}"></span>
        <span class="ledger-info">
          <span class="ledger-name">${esc(l.name)}</span>
          <span class="ledger-desc">${esc(l.description || "无描述")}</span>
        </span>
        <span class="ledger-amount">${cur ? money(cur.amount) : "--"}</span>
        <button class="ledger-del" title="删除账本">×</button>`;
      li.addEventListener("click", () => {
        state.selectedLedgerId = l.id;
        renderLedgerList();
        $("historyLedger").value = String(l.id);
        state.historyPage = 0;
        refreshHistory();
      });
      li.querySelector(".ledger-del").addEventListener("click", (e) => {
        e.stopPropagation();
        onDeleteLedger(l);
      });
      ul.appendChild(li);
    });
  }

  async function onCreateLedger() {
    const res = await formModal({
      title: "新建账本",
      okText: "创建",
      fields: [
        { key: "name", label: "账本名称", value: "", placeholder: "如：银行存款" },
        { key: "description", label: "描述（可选）", value: "", placeholder: "如：活期 + 定期" },
      ],
    });
    if (!res || !res.name.trim()) return;
    try {
      const lg = await api.invoke("create_ledger", { account: state.account, name: res.name, description: res.description || "" });
      toast(`账本「${lg.name}」创建成功`, "success");
      await reloadData();
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function onDeleteLedger(l) {
    const ok = await confirmModal({
      title: "删除账本",
      message: `确定要删除账本「${l.name}」吗？\n该账本下所有资产记录将一并删除，此操作不可撤销！`,
      okText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.invoke("delete_ledger", { account: state.account, id: l.id });
      toast("账本已删除", "success");
      if (state.selectedLedgerId === l.id) state.selectedLedgerId = null;
      await reloadData();
    } catch (e) {
      toast(String(e), "error");
    }
  }

  // ---------------- 记录 ----------------

  function renderRecordForm() {
    const sel = $("recordLedger");
    sel.innerHTML = "";
    if (!state.ledgers.length) {
      sel.innerHTML = "<option value=''>暂无账本，请先创建</option>";
      return;
    }
    state.ledgers.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name;
      sel.appendChild(opt);
    });
  }

  async function onAddRecord(e) {
    e.preventDefault();
    const ledgerId = Number($("recordLedger").value);
    const amount = parseFloat($("recordAmount").value);
    const note = $("recordNote").value.trim();
    const period = $("recordDate").value;
    if (!ledgerId) return toast("请先选择账本", "error");
    if (!amount || amount <= 0) return toast("请输入有效的金额（大于 0）", "error");
    if (!period) return toast("请选择日期", "error");
    try {
      await api.invoke("add_record", { account: state.account, ledger_id: ledgerId, amount, note, period });
      $("recordAmount").value = "";
      $("recordNote").value = "";
      $("recordDate").value = Stats.todayKey();
      await reloadData();
      toast("记录已添加", "success");
    } catch (err) {
      toast(String(err), "error");
    }
  }

  async function onEditRecord(r) {
    const res = await formModal({
      title: "编辑记录",
      okText: "保存",
      fields: [
        {
          key: "ledger_id", label: "账本", type: "select", value: r.ledger_id,
          options: state.ledgers.map((l) => ({ value: l.id, label: l.name })),
        },
        { key: "period", label: "日期", type: "date", value: r.period },
        { key: "amount", label: "金额 (¥)", type: "number", value: r.amount, step: "0.01" },
        { key: "note", label: "备注", value: r.note || "" },
      ],
    });
    if (!res) return;
    if (!res.amount || res.amount <= 0) return toast("金额必须大于 0", "error");
    if (!res.period) return toast("日期不能为空", "error");
    try {
      await api.invoke("update_record", {
        account: state.account, id: r.id, ledger_id: Number(res.ledger_id),
        amount: res.amount, note: res.note || "", period: res.period,
      });
      await reloadData();
      toast("记录已更新", "success");
    } catch (err) {
      toast(String(err), "error");
    }
  }

  async function onDeleteRecord(r) {
    const ok = await confirmModal({
      title: "删除记录",
      message: `确定要删除 ${r.period} 「${r.ledger_name}」 ${money(r.amount)} 的记录吗？`,
      okText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.invoke("delete_record", { account: state.account, id: r.id });
      await reloadData();
      toast("记录已删除", "success");
    } catch (err) {
      toast(String(err), "error");
    }
  }

  async function refreshHistory() {
    const tbody = $("historyTable").querySelector("tbody");
    tbody.innerHTML = "";
    const ledgerId = $("historyLedger").value ? Number($("historyLedger").value) : null;
    const keyword = $("historySearch").value.trim() || null;
    const [rows, total] = await Promise.all([
      api.invoke("list_records", {
        account: state.account, ledger_id: ledgerId, keyword,
        offset: state.historyPage * state.historyPageSize, limit: state.historyPageSize,
      }),
      api.invoke("count_records", { account: state.account, ledger_id: ledgerId, keyword }),
    ]);
    state.historyTotal = total;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:28px 0;">暂无记录</td></tr>`;
    }
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.period)}</td>
        <td><span class="ledger-name">${esc(r.ledger_name)}</span></td>
        <td class="num">${money(r.amount)}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;">${esc(r.note || "")}</td>
        <td class="num col-ops">
          <button class="row-op" data-act="edit">编辑</button>
          <button class="row-op danger" data-act="del">删除</button>
        </td>`;
      tr.querySelector('[data-act="edit"]').addEventListener("click", () => onEditRecord(r));
      tr.querySelector('[data-act="del"]').addEventListener("click", () => onDeleteRecord(r));
      tr.addEventListener("dblclick", () => onEditRecord(r));
      tbody.appendChild(tr);
    });
    const totalPages = Math.max(1, Math.ceil(total / state.historyPageSize));
    $("historyInfo").textContent = `共 ${total} 条 · 第 ${state.historyPage + 1}/${totalPages} 页`;
    $("prevPageBtn").disabled = state.historyPage <= 0;
    $("nextPageBtn").disabled = (state.historyPage + 1) * state.historyPageSize >= total;
  }

  // ---------------- 统计看板 ----------------

  function resolveRange() {
    return Stats.resolveRange(state.records, state.rangePreset, state.rangeStart, state.rangeEnd);
  }

  function renderStats() {
    if (!state.ledgers.length || !state.records.length) {
      $("kpiTotal").textContent = "--";
      $("kpiMonth").textContent = "--";
      $("kpiYtd").textContent = "--";
      $("kpiCount").textContent = "--";
      Charts.renderEmpty("trendChart");
      Charts.renderEmpty("pieChart");
      $("changeTable").querySelector("tbody").innerHTML =
        `<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:28px 0;">暂无数据</td></tr>`;
      return;
    }
    const { startKey, endKey } = resolveRange();
    if (!startKey || !endKey) {
      toast("请选择自定义时间范围", "error");
      return;
    }
    const kpi = Stats.computeKpis(state.ledgers, state.records);
    $("kpiTotal").textContent = money(kpi.totalNow);
    $("kpiMonth").innerHTML =
      `${money(kpi.monthChange)} <span class="kpi-sub ${trendClass(kpi.monthChange)}">${pct(kpi.monthChangePct)}</span>`;
    $("kpiYtd").innerHTML =
      `${money(kpi.ytdChange)} <span class="kpi-sub ${trendClass(kpi.ytdChange)}">${pct(kpi.ytdChangePct)}</span>`;
    $("kpiCount").textContent = `${kpi.ledgerCount} / ${kpi.recordCount}`;

    const td = Stats.trendData(state.ledgers, state.records, startKey, endKey);
    Charts.renderTrend(td, { showTotal: $("showTotal").checked });

    renderPie();
    renderChangeTable(kpi);
  }

  function renderPie() {
    if (!state.ledgers.length) return;
    const atDate = state.pieMode === "date" && state.pieDate ? state.pieDate : null;
    const data = Stats.pieData(state.ledgers, state.records, atDate);
    if (!data.length) {
      Charts.renderEmpty("pieChart");
      return;
    }
    Charts.renderPie(data);
  }

  function renderChangeTable(kpi) {
    const { startKey, endKey } = resolveRange();
    const rows = Stats.changeTable(state.ledgers, state.records, startKey, endKey);
    const tbody = $("changeTable").querySelector("tbody");
    tbody.innerHTML = "";
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:28px 0;">暂无数据</td></tr>`;
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(r.name)}</td>
        <td class="num">${money(r.current)}</td>
        <td class="num ${trendClass(r.delta)}">${deltaFmt(r.delta)}<br/><span style="font-size:11px;">${pct(r.deltaPct)}</span></td>
        <td class="num ${trendClass(r.monthDelta)}">${deltaFmt(r.monthDelta)}<br/><span style="font-size:11px;">${pct(r.monthDeltaPct)}</span></td>
        <td class="num ${trendClass(r.ytdDelta)}">${deltaFmt(r.ytdDelta)}<br/><span style="font-size:11px;">${pct(r.ytdDeltaPct)}</span></td>
        <td class="num">${r.hi != null ? money(r.hi) : "--"}</td>
        <td class="num">${r.lo != null ? money(r.lo) : "--"}</td>
        <td class="num">${r.avg != null ? money(r.avg) : "--"}</td>
        <td class="num">${r.count}</td>`;
      tbody.appendChild(tr);
    });
  }

  // ---------------- 导出 / 备份 ----------------

  function exportCsv() {
    if (!state.records.length) return toast("暂无数据可导出", "error");
    const { startKey, endKey } = resolveRange();
    const kpi = Stats.computeKpis(state.ledgers, state.records);
    const rows = Stats.changeTable(state.ledgers, state.records, startKey, endKey);
    const lines = [];
    lines.push("轻账本导出,账户," + state.account);
    lines.push("导出时间," + new Date().toLocaleString());
    lines.push("");
    lines.push("汇总");
    lines.push(["总资产", "本月变动", "本月变动%", "年初至今", "年初至今%", "账本数", "记录数"].join(","));
    lines.push([
      kpi.totalNow.toFixed(2),
      kpi.monthChange.toFixed(2),
      kpi.monthChangePct != null ? kpi.monthChangePct.toFixed(2) : "",
      kpi.ytdChange.toFixed(2),
      kpi.ytdChangePct != null ? kpi.ytdChangePct.toFixed(2) : "",
      kpi.ledgerCount, kpi.recordCount,
    ].join(","));
    lines.push("");
    lines.push("变动分析（区间 " + startKey + " ~ " + endKey + "）");
    lines.push(["账本", "当前值", "较上次", "较上次%", "较月初", "较月初%", "较年初", "较年初%", "区间最高", "区间最低", "区间平均", "记录数"].join(","));
    rows.forEach((r) => {
      lines.push([
        csvCell(r.name),
        r.current.toFixed(2),
        r.delta != null ? r.delta.toFixed(2) : "", r.deltaPct != null ? r.deltaPct.toFixed(2) : "",
        r.monthDelta.toFixed(2), r.monthDeltaPct != null ? r.monthDeltaPct.toFixed(2) : "",
        r.ytdDelta.toFixed(2), r.ytdDeltaPct != null ? r.ytdDeltaPct.toFixed(2) : "",
        r.hi != null ? r.hi.toFixed(2) : "", r.lo != null ? r.lo.toFixed(2) : "", r.avg != null ? r.avg.toFixed(2) : "",
        r.count,
      ].join(","));
    });
    lines.push("");
    lines.push("明细记录（区间 " + startKey + " ~ " + endKey + "）");
    lines.push(["日期", "账本", "金额", "备注"].join(","));
    state.records
      .filter((r) => r.period >= startKey && r.period <= endKey)
      .sort((a, b) => (a.period < b.period ? -1 : 1))
      .forEach((r) => lines.push([r.period, csvCell(r.ledger_name), r.amount.toFixed(2), csvCell(r.note)].join(",")));
    downloadFile(`轻账本_${state.account}_${Stats.todayKey()}.csv`, "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
    toast("统计 CSV 已导出", "success");
  }

  async function onBackup() {
    try {
      const path = await api.invoke("backup_db", { account: state.account });
      toast("备份成功：" + path, "success");
    } catch (e) {
      toast(String(e), "error");
    }
  }

  // ---------------- 账户操作 ----------------

  async function onCreateAccount() {
    const res = await formModal({
      title: "新建账户",
      okText: "创建",
      fields: [{ key: "name", label: "账户名称", value: "", placeholder: "如：家庭账户" }],
    });
    if (!res || !res.name.trim()) return;
    try {
      await api.invoke("create_account", { name: res.name.trim() });
      toast("账户创建成功", "success");
      await loadAccounts();
      $("accountSelect").value = res.name.trim();
      await openAccount(res.name.trim());
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function onDeleteAccount() {
    if (!state.account) return;
    const ok = await confirmModal({
      title: "删除账户",
      message: `确定要删除账户「${state.account}」吗？\n该账户下所有账本与记录将全部删除，此操作不可撤销！`,
      okText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.invoke("delete_account", { name: state.account });
      toast("账户已删除", "success");
      await loadAccounts();
    } catch (e) {
      toast(String(e), "error");
    }
  }

  // ---------------- 工具 ----------------

  async function reloadData() {
    const [ledgers, records] = await Promise.all([
      api.invoke("list_ledgers", { account: state.account }),
      api.invoke("all_records", { account: state.account }),
    ]);
    state.ledgers = ledgers;
    state.records = records;
    // 同步账本筛选下拉
    const historyLedger = $("historyLedger");
    const prev = historyLedger.value;
    historyLedger.innerHTML = "<option value=''>全部账本</option>";
    state.ledgers.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name;
      historyLedger.appendChild(opt);
    });
    historyLedger.value = prev;
    renderLedgerList();
    renderRecordForm();
    refreshHistory();
    renderStats();
  }

  document.addEventListener("DOMContentLoaded", init);
  return {};
})();
