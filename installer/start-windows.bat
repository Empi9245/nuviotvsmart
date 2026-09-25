@echo off
title Nuvio TV - Hisense VIDAA Launcher
echo =======================================================
echo   Starting Nuvio TV Server for Hisense VIDAA OS
echo =======================================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python or run with node: npm run serve:vidaa
    pause
    exit /b 1
)

if exist "%~dp0server.py" (
    cd /d "%~dp0"
    python server.py
) else if exist "%~dp0installer\server.py" (
    cd /d "%~dp0"
    python installer\server.py
) else (
    echo [ERROR] Could not find server.py
    pause
)
pause
