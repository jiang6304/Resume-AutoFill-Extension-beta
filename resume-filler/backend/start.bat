@echo off
chcp 65001 > nul
echo ========================================
echo 简历自动填写助手 - 后端服务启动
echo ========================================
echo.

cd /d "%~dp0"

REM 强制终止所有占用端口 8001 的进程
echo 检查并清理端口 8001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001.*LISTENING" 2^>nul') do (
    echo 正在终止进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

REM 额外清理：终止所有 python.exe 进程中运行 uvicorn 的
echo 清理残留的 Python 进程...
wmic process where "commandline like '%%uvicorn%%' and commandline like '%%8001%%'" delete >nul 2>&1

REM 短暂等待确保端口释放
timeout /t 2 /nobreak >nul

REM 再次检查端口
netstat -ano | findstr ":8001.*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo 端口已释放
) else (
    echo 警告: 端口仍被占用，尝试强制终止所有 Python 进程...
    taskkill /F /IM python.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

REM 清理 Python 缓存
echo 清理 Python 缓存...
if exist __pycache__ rd /s /q __pycache__ >nul 2>&1
if exist routers\__pycache__ rd /s /q routers\__pycache__ >nul 2>&1
if exist utils\__pycache__ rd /s /q utils\__pycache__ >nul 2>&1
if exist services\__pycache__ rd /s /q services\__pycache__ >nul 2>&1
if exist models\__pycache__ rd /s /q models\__pycache__ >nul 2>&1

echo 激活虚拟环境...
call venv\Scripts\activate.bat

echo.
echo 检查依赖...
python -c "import fastapi, uvicorn, httpx, docx, openpyxl" 2>nul
if errorlevel 1 (
    echo 正在安装依赖...
    pip install -r requirements.txt
)

echo.
echo 启动后端服务...
echo 服务地址: http://127.0.0.1:8001
echo API文档: http://127.0.0.1:8001/docs
echo 按 Ctrl+C 停止服务
echo.

REM 使用 --reload 启动，代码修改后自动重载
python -m uvicorn server:app --host 127.0.0.1 --port 8001 --reload

pause
