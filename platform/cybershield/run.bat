@echo off
title CyberShield v3 -- DAS Plc Security Training Platform
cd /d "%~dp0"
echo.
echo  ============================================================
echo   CYBERSHIELD v3 -- Dannex Ayrton Starwin Plc
echo   IT Security Awareness Training Platform
echo  ============================================================
echo.
echo  Installing / checking dependencies...
pip install flask waitress apscheduler
if errorlevel 1 (
    echo.
    echo  ERROR: pip install failed. Check your internet connection.
    pause
    exit /b 1
)
echo  Dependencies OK.
echo.
echo  Starting CyberShield on http://localhost:5076
echo  Press Ctrl+C to stop.
echo.
python app.py
if errorlevel 1 (
    echo.
    echo  ============================================================
    echo   ERROR: Python exited with an error (see above).
    echo  ============================================================
)
pause
