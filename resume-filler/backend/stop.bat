@echo off
chcp 65001 > nul
echo ========================================
echo 简历自动填写助手 - 停止服务
echo ========================================
echo.

cd /d "%~dp0"

echo 正在停止端口 8001 上的所有进程...

REM 方法1: 通过端口号找到主进程并使用 /T 杀死进程树
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo 终止主进程 PID: %%a 及其子进程
    taskkill /F /PID %%a /T 2>nul
)

REM 等待进程结束
timeout /t 2 /nobreak >nul

REM 方法2: 清理 server.py 相关进程
echo 清理 server.py 相关进程...
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%server.py%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do (
    echo 终止进程 PID: %%a
    taskkill /F /PID %%a 2>nul
)

REM 方法3: 清理 multiprocessing 子进程
echo 清理 multiprocessing 子进程...
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%multiprocessing%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do (
    echo 终止子进程 PID: %%a
    taskkill /F /PID %%a 2>nul
)

REM 验证端口是否释放
echo.
echo 验证端口状态...
netstat -ano | findstr :8001 | findstr LISTENING >nul
if errorlevel 1 (
    echo 端口 8001 已释放
) else (
    echo 警告: 端口 8001 仍被占用
    echo 尝试强制清理所有相关 Python 进程...
    for /f "tokens=2" %%a in ('wmic process where "name='python.exe'" get processid 2^>nul ^| findstr /r "[0-9]"') do (
        taskkill /F /PID %%a 2>nul
    )
)

echo.
echo 服务已停止。
pause