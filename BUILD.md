# 轻账本 · 构建指南（Windows）

本应用无需 Node.js / npm，纯 Rust + 静态前端，构建链非常简单。

## 1. 安装 Rust（含 MSVC 链接器）

推荐用 winget 一键装（PowerShell）：

```powershell
# 安装 Rustup
winget install Rustlang.Rustup

# 安装 MSVC Build Tools（提供链接器 link.exe，约 2-4GB，可后台慢慢装）
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive"
```

或者手动：下载 [rustup-init.exe](https://rustup.rs/) 安装，然后安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/zh-hans/downloads/#build-tools) 并勾选 **"使用 C++ 的桌面开发"** 工作负载。

> WebView2 运行时 Win10/Win11 自带（Edge 依赖），一般无需额外安装。

## 2. 验证安装

```powershell
rustup show          # 应显示 stable-x86_64-pc-windows-msvc
cargo --version      # 应输出版本号
```

若 `rustup show` 默认 toolchain 不是 MSVC 版，执行：

```powershell
rustup default stable-x86_64-pc-windows-msvc
```

## 3. 安装 Tauri CLI

二选一（推荐第一种，cargo 全链路）：

```powershell
# 方式 A：cargo 安装（编译较久，一次性约 5-10 分钟）
cargo install tauri-cli --version "^2" --locked

# 方式 B：若机器上有 Node.js，可用预编译二进制（秒装）
npm install -g @tauri-apps/cli
```

## 4. 构建

在项目根目录（`easyaccounting_tauri/`）：

```powershell
# 开发模式：启动应用窗口，改 src/ 前端后刷新即可生效
cargo tauri dev

# 发布构建：产出安装包 + 便携版
cargo tauri build
```

产物：

```
src-tauri/target/release/bundle/nsis/EasyAccounting_0.2.0_x64-setup.exe   # 安装包
src-tauri/target/release/bundle/portable/EasyAccounting_0.2.0_x64.exe     # 便携版（直接拷走即用）
```

> 首次构建需下载编译约 400 个 Rust crate，耗时 5-15 分钟属正常。

## 5. 数据兼容（重要）

把原版 easyAccounting_CPP 的 `data/` 文件夹**原样拷到新 exe 同级目录**，启动即可看到原有账户与数据，零迁移。

## 常见问题

| 现象 | 处理 |
|---|---|
| `link.exe` 找不到 | MSVC Build Tools 未装完，重跑 winget 命令，装完重开终端 |
| `cargo tauri` 不是命令 | 未装 Tauri CLI，或安装后未重开终端 |
| 构建报 `WebView2` 相关错 | 系统缺 WebView2 运行时，官网下载安装 |
| 便携版启动后找不到数据 | 确认 `data/` 与 exe 同级；exe 所在目录需可写 |
