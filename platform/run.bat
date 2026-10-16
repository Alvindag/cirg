@echo off
title DAS Trust Hub
cd /d "%~dp0"
echo Installing requirements...
pip install -r requirements.txt --quiet
if errorlevel 1 (echo pip install failed & pause & exit /b 1)
echo.
set /p SERVERIP=Enter this server's LAN IP address (e.g. 192.168.1.20), or press Enter for this PC only: 
if not defined HUB_ADMIN_PASSWORD echo (First run: the Hub admin password is shown below, once. Copy it.)
if "%SERVERIP%"=="" (python run_all.py --data data) else (python run_all.py --data data --lan %SERVERIP%)
pause
