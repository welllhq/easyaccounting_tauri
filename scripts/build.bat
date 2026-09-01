@echo off
rem 轻账本构建脚本：加载 MSVC 环境后执行 cargo
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >NUL
cd /D "%~dp0..\src-tauri"
set CARGO_TERM_COLOR=never
cargo %*
exit /b %ERRORLEVEL%
