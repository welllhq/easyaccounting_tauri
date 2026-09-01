/* ============ ECharts 图表层 ============ */
"use strict";

const Charts = (() => {
  const PALETTE = [
    "#185FA5", "#0F6E56", "#BA7517", "#993C1D", "#7F77DD",
    "#D4537E", "#888780", "#639922", "#378ADD", "#1D9E75", "#D85A30",
  ];

  let trendChart = null;
  let pieChart = null;

  function init(trendElId, pieElId) {
    trendChart = echarts.init(document.getElementById(trendElId), null, { renderer: "canvas" });
    pieChart = echarts.init(document.getElementById(pieElId), null, { renderer: "canvas" });
    window.addEventListener("resize", () => {
      trendChart && trendChart.resize();
      pieChart && pieChart.resize();
    });
  }

  /** 趋势图：总资产线 + 各账本阶梯线 */
  function renderTrend(td, { showTotal = true } = {}) {
    const series = [];
    if (showTotal && td.total.length) {
      series.push({
        name: "总资产",
        type: "line",
        data: td.total.map((p) => p.value),
        step: "end",
        symbol: "none",
        lineStyle: { width: 3, color: "#185FA5" },
        itemStyle: { color: "#185FA5" },
        areaStyle: { color: "#185FA5", opacity: 0.08 },
        z: 6,
        tooltip: { valueFormatter: (v) => money(v) },
      });
    }
    td.per.forEach((p, i) => {
      const color = PALETTE[i % PALETTE.length];
      series.push({
        name: p.name,
        type: "line",
        data: p.points.map((pt) => pt.value),
        step: "end",
        connectNulls: false,
        symbol: "none",
        lineStyle: { width: 1.6, color },
        itemStyle: { color },
        tooltip: { valueFormatter: (v) => (v == null ? "--" : money(v)) },
      });
    });

    trendChart.setOption(
      {
        color: PALETTE,
        animationDuration: 300,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross", label: { formatter: (p) => p.value } },
        },
        legend: { type: "scroll", bottom: 0, itemWidth: 16, textStyle: { fontSize: 11, color: "#57606A" } },
        grid: { left: 74, right: 20, top: 24, bottom: 46 },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: td.dates,
          axisLine: { lineStyle: { color: "#D0D7DE" } },
          axisLabel: { fontSize: 11, color: "#8C959F" },
        },
        yAxis: {
          type: "value",
          scale: true,
          axisLabel: { fontSize: 11, color: "#8C959F", formatter: (v) => compactMoney(v) },
          splitLine: { lineStyle: { color: "#EEF1F4" } },
        },
        series,
      },
      { notMerge: true }
    );
  }

  /** 饼图：资产结构 */
  function renderPie(data) {
    const total = data.reduce((a, b) => a + b.value, 0);
    pieChart.setOption(
      {
        color: PALETTE,
        tooltip: {
          trigger: "item",
          formatter: (p) => `${p.name}<br/>${money(p.value)}<br/>占比 ${p.percent}%`,
        },
        legend: {
          type: "scroll",
          orient: "vertical",
          right: 8,
          top: "middle",
          textStyle: { fontSize: 12, color: "#57606A" },
        },
        graphic: [
          {
            type: "text",
            left: "34%",
            top: "42%",
            style: { text: "总资产", textAlign: "center", fill: "#8C959F", fontSize: 12 },
          },
          {
            type: "text",
            left: "34%",
            top: "52%",
            style: { text: compactMoney(total), textAlign: "center", fill: "#1F2328", fontSize: 16, fontWeight: 500 },
          },
        ],
        series: [
          {
            name: "资产结构",
            type: "pie",
            radius: ["44%", "70%"],
            center: ["34%", "50%"],
            minAngle: 3,
            itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
            label: { show: false },
            emphasis: { scaleSize: 6 },
            data,
          },
        ],
      },
      { notMerge: true }
    );
  }

  /** 无数据占位 */
  function renderEmpty(elId) {
    const c = elId === "trendChart" ? trendChart : pieChart;
    c.clear();
    c.setOption({
      graphic: {
        type: "text",
        left: "center",
        top: "middle",
        style: { text: "暂无数据，先添加一些记录吧", fill: "#8C959F", fontSize: 13 },
      },
    });
  }

  /** 导出 PNG */
  function exportTrendPng() {
    if (!trendChart) return;
    const url = trendChart.getDataURL({ pixelRatio: 2, backgroundColor: "#fff" });
    downloadFile("资产趋势.png", dataUrlToBlob(url), "image/png");
  }

  return { init, renderTrend, renderPie, renderEmpty, exportTrendPng };
})();
