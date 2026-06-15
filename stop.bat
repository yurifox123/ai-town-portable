@echo off
chcp 65001 >nul
echo 正在查找并关闭 AI生态小镇服务器...

:: 查找占用 3061 端口的进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3061') do (
    echo 找到进程 PID: %%a
    taskkill /F /PID %%a 2>nul
    if errorlevel 1 (
        echo 需要使用管理员权限运行
    ) else (
        echo ✅ AI生态小镇服务器已关闭
    )
)

:: 如果没有找到进程
if errorlevel 1 (
    echo 未找到运行中的服务器
)

pause
