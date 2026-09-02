# 注1：除了这句话以外，其他所有内容由deepseek V4 flash 生成
# 轻账本 · EasyAccounting (Tauri 重写版)

> 一个自用的资产盘点工具 · Tauri + ECharts 重写版
> 前身：[easyAccounting_CPP](https://github.com/welllhq/easyAccounting_CPP)（Qt/C++）

## 简介

延续原版"轻量、本地、便携"的初心，用 **Tauri 2 + ECharts** 重写：

- **打包体积约 10MB 级**（不打包浏览器内核，使用系统 WebView2），单 exe 直接运行
- 数据仍是**本地 SQLite**，一个账户 = 一个 `.db` 文件，**与原版数据 100% 兼容**（表结构一致，零迁移）
- 统计看板全面重做：修复原版折线图 `LIMIT 10` 截断等 Bug，图表内嵌、时间联动、变动分析、一键导出

## 主要功能

- **多账户**：每个账户独立 `.db`，创建 / 切换 / 删除
- **多账本**：一个账户下按资产类别建账本（银行存款、基金、数字货币……），记录"某日期该资产的值"（快照制）
- **历史记录**：按账本筛选、关键词搜索、分页、双击编辑、删除
- **数据统计看板**：
  - KPI 指标卡：总资产、本月变动、年初至今（涨红跌绿）
  - 资产趋势图：各账本"快照前推"阶梯线 + 可开关的**总资产线**
  - 资产结构饼图：最新结构 / 指定历史日期回放
  - 变动分析表：当前值、较上次、较月初、较年初、区间最高/最低/平均
  - 时间范围联动：全部 / 近1月 / 近3月 / 近6月 / 近1年 / 自定义
  - 导出：统计表 CSV（Excel 可直接打开）、趋势图 PNG、数据库一键备份

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Tauri 2（Rust） |
| 数据库 | SQLite（rusqlite bundled，免外部依赖） |
| 界面 | 原生 HTML / CSS / JS（无框架、无构建步骤，最轻） |
| 图表 | ECharts 5（本地内置） |

## 开发与构建

前置：Rust 工具链 + MSVC Build Tools + WebView2（Win10/11 自带）。见 [BUILD.md](BUILD.md)。

```bash
# 开发模式（热重载前端，改 src/ 下文件后刷新即可）
cargo tauri dev

# 发布构建（产出 NSIS 安装包 + 便携版 exe）
cargo tauri build
```

产物位于 `src-tauri/target/release/bundle/`。

> ✅ 构建状态：v0.2.0 已在 Windows x64 编译通过并完成冒烟测试（窗口正常启动/关闭），
> 产物见 `../release/`（安装包 + 便携版 + 使用说明）。

## 数据与兼容

- 数据目录：**便携优先** —— 优先使用 exe 同级 `data/` 目录（把原版 `data/` 文件夹直接拷到新 exe 旁边即可继续用）；目录不可写时退回 `%APPDATA%/EasyAccounting/data`
- 表结构：`ledgers`（账本）、`asset_records`（资产快照记录），与原版完全一致
- 备份：统计页"备份数据库"会把当前 `.db` 复制到 `data/backups/` 并带时间戳

## 目录结构

```
easyaccounting_tauri/
├── src/                 # 前端（无需构建）
│   ├── index.html       # 页面骨架
│   ├── styles.css       # 样式（浅色现代扁平）
│   ├── app.js           # 主逻辑
│   ├── stats.js         # 统计引擎（纯计算，可单测）
│   ├── charts.js        # ECharts 图表
│   ├── ui.js            # toast / 模态框 / 格式化
│   ├── mock.js          # 浏览器自测模式的数据层
│   └── lib/echarts.min.js
├── scripts/
│   ├── gen_icons.py     # 图标生成
│   └── test_stats.js    # 统计引擎单元测试
└── src-tauri/           # Rust 后端
    ├── src/{main,lib,db,commands}.rs
    ├── tauri.conf.json
    └── capabilities/default.json
```

## 测试

```bash
# 统计引擎单元测试（无需浏览器 / Rust）
node scripts/test_stats.js
```

纯浏览器自测：直接双击打开 `src/index.html`，应用会检测到无 Tauri 环境并自动使用内置 mock 数据。
