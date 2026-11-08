@echo off
title ITAM v2 - IT Asset Management System - DAS Plc
echo ============================================================
echo   ITAM v2 - IT Asset Management System
echo   DAS Plc (Dannex . Ayrton . Starwin)
echo   Port: 5057
echo   Open browser to: http://localhost:5057
echo ============================================================
echo   Login Accounts:
echo     admin      / admin123    (Full Admin)
echo     it_manager / manager123  (IT Manager)
echo     it_staff   / staff123    (IT Staff)
echo     viewer     / viewer123   (Read-Only)
echo ============================================================
echo.
cd /d "%~dp0"
echo Installing requirements...
pip install -r requirements.txt --quiet
echo.
echo Starting ITAM v2...
echo Press Ctrl+C to stop the server.
echo.
python app.py
pause
