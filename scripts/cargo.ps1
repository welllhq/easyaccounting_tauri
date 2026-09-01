# cargo-with-vcvars.ps1 - 在 MSVC 环境下调用 cargo
# 用法：.\scripts\cargo.ps1 build --release   （等价于先调用 vcvars64 再 cargo build --release）
param([Parameter(ValueFromRemainingArguments=$true)]$args)

$vcvars = 'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { Write-Error "vcvars64.bat 未找到：$vcvars"; exit 1 }

$cmdLine = "call `"$vcvars`" >NUL && cargo $($args -join ' ')"
cmd /c $cmdLine
exit $LASTEXITCODE