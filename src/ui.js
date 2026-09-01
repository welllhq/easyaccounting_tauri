/* ============ UI 工具：toast / 模态框 / 格式化 ============ */
"use strict";

/** 轻提示 */
function toast(msg, type) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.25s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 260);
  }, 2400);
}

/** 金额格式化：¥ 1,234,567.89 */
function money(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  const neg = n < 0;
  const s = Math.abs(n).toFixed(2);
  const parts = s.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + "¥ " + parts.join(".");
}

/** 千分位（不带符号，用于图表轴） */
function compactMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + "万";
  return String(Math.round(n * 100) / 100);
}

/** 带符号百分比 */
function pct(v) {
  if (v === null || v === undefined || isNaN(v)) return "--";
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}

/** 涨跌样式类：涨红跌绿 */
function trendClass(v) {
  if (v === null || v === undefined || isNaN(v) || Math.abs(v) < 0.005) return "flat";
  return v > 0 ? "up" : "down";
}

/** 带符号金额：+¥ 376.98 / -¥ 376.98 / ¥ 0.00；null → -- */
function deltaFmt(v) {
  if (v === null || v === undefined || isNaN(v)) return "--";
  if (Math.abs(v) < 0.005) return money(0);
  return (v > 0 ? "+" : "-") + money(Math.abs(v));
}

/** HTML 转义 */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** 通用模态框：resolve(true/false) */
function confirmModal({ title, message, okText = "确定", danger = false }) {
  return new Promise((resolve) => {
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <div class="modal-body"><p>${esc(message)}</p></div>
        <div class="modal-actions">
          <button class="btn ghost" data-act="cancel">取消</button>
          <button class="btn ${danger ? "danger-text" : "primary"}" data-act="ok">${esc(okText)}</button>
        </div>
      </div>`;
    const close = (v) => { mask.remove(); resolve(v); };
    mask.addEventListener("click", (e) => {
      if (e.target === mask) close(false);
    });
    mask.querySelector('[data-act="cancel"]').addEventListener("click", () => close(false));
    mask.querySelector('[data-act="ok"]').addEventListener("click", () => close(true));
    document.getElementById("modal-root").appendChild(mask);
    mask.querySelector('[data-act="ok"]').focus();
  });
}

/**
 * 表单模态框：返回字段值对象或 null
 * @param {object} opts { title, fields: [{key,label,type,value,placeholder,options}], okText }
 */
function formModal(opts) {
  return new Promise((resolve) => {
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    const fieldsHtml = opts.fields
      .map((f) => {
        let input;
        if (f.type === "select") {
          input = `<select data-key="${f.key}">${(f.options || [])
            .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? "") ? "selected" : ""}>${esc(o.label)}</option>`)
            .join("")}</select>`;
        } else if (f.type === "date") {
          input = `<input type="date" data-key="${f.key}" value="${esc(f.value ?? "")}" />`;
        } else {
          input = `<input type="${f.type || "text"}" data-key="${f.key}" value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder || "")}" step="${f.step || ""}" />`;
        }
        return `<div class="field"><label>${esc(f.label)}</label>${input}</div>`;
      })
      .join("");
    mask.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esc(opts.title)}</h3>
        <div class="modal-body">${fieldsHtml}</div>
        <div class="modal-actions">
          <button class="btn ghost" data-act="cancel">取消</button>
          <button class="btn primary" data-act="ok">${esc(opts.okText || "确定")}</button>
        </div>
      </div>`;
    const close = (v) => { mask.remove(); resolve(v); };
    mask.addEventListener("click", (e) => {
      if (e.target === mask) close(null);
    });
    mask.querySelector('[data-act="cancel"]').addEventListener("click", () => close(null));
    mask.querySelector('[data-act="ok"]').addEventListener("click", () => {
      const out = {};
      for (const f of opts.fields) {
        const el = mask.querySelector(`[data-key="${f.key}"]`);
        out[f.key] = f.type === "number" ? parseFloat(el.value) : el.value;
      }
      close(out);
    });
    mask.querySelector(".modal .field input, .modal .field select")?.focus();
    document.getElementById("modal-root").appendChild(mask);
  });
}

/** 触发浏览器下载（CSV / PNG） */
function downloadFile(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** dataURL -> Blob（用于导出图表 PNG） */
function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:(.*?);/)[1];
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** CSV 转义 */
function csvCell(s) {
  const t = String(s ?? "");
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
