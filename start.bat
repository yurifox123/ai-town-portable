@echo off
chcp 65001 >nul
title AI生态小镇启动器

echo ========================================
echo          AI生态小镇启动器
echo ========================================
echo.

if not exist "package.json" (
    echo ❌ 请在项目根目录运行此脚本
    echo    当前目录: %cd%
    pause
    exit /b 1
)

echo ✅ 当前目录: %cd%

if not exist "node_modules" (
    echo.
    echo 📦 检测到依赖尚未安装，正在执行 npm install...
    call npm install
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
)

if not exist ".env" (
    echo.
    echo ⚠️ 未找到 .env，正在根据 .env.example 创建
    copy ".env.example" ".env" >nul
    echo ✅ 已创建 .env，可稍后补充 LLM 配置
)

:menu
echo.
echo ========================================
echo            请选择操作
echo ========================================
echo  1. 启动服务（npm start）
echo  2. 开发模式（npm run dev）
echo  3. 运行测试（npm test）
echo  4. 类型检查（npm run lint）
echo  5. 构建项目（npm run build）
echo  6. 停止 3061 端口服务（npm run stop）
echo  7. 编辑 .env
echo  8. 退出
echo ========================================
echo.

set /p choice="请输入你的选择 (1-8): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto dev
if "%choice%"=="3" goto test
if "%choice%"=="4" goto lint
if "%choice%"=="5" goto build
if "%choice%"=="6" goto stop
if "%choice%"=="7" goto config
if "%choice%"=="8" goto exit
if /i "%choice%"=="q" goto exit

echo ❌ 无效选择，请重新输入
goto menu

:start
echo.
echo 🌐 启动 Web 服务...
echo    默认地址: http://localhost:3061
echo    如果 3061 被占用，服务会自动尝试下一个端口
echo    按 Ctrl+C 停止服务
echo.
call npm start
pause
goto menu

:dev
echo.
echo 🛠️ 启动开发模式...
echo    按 Ctrl+C 停止服务
echo.
call npm run dev
pause
goto menu

:test
echo.
echo 🧪 运行测试...
call npm test
echo.
pause
goto menu

:lint
echo.
echo 🔍 执行类型检查...
call npm run lint
echo.
pause
goto menu

:build
echo.
echo 📦 构建项目...
call npm run build
echo.
pause
goto menu

:stop
echo.
echo 🛑 停止 3061 端口服务...
call npm run stop
echo.
pause
goto menu

:config
echo.
echo ⚙️ 编辑环境配置...
if exist ".env" (
    notepad ".env"
) else (
    echo ❌ 未找到 .env 配置文件
)
goto menu

:exit
echo.
echo 👋 再见！
timeout /t 1 >nul
exit /b 0
