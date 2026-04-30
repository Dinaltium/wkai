@echo off
REM WKAI - Workshop AI - Stop Script for Windows
REM Usage: stop-wkai.bat

echo ==========================================
echo   Stopping WKAI Servers...
echo ==========================================
echo.

echo [1/3] Stopping backend server (port 4000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do (
    taskkill /F /PID %%a 2>nul
)

echo [2/3] Stopping student app (port 3000/3001)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do (
    taskkill /F /PID %%a 2>nul
)

echo [3/3] Stopping database connections...
REM No Docker to stop. Backend will close connections on exit.

echo.
echo ==========================================
echo   All WKAI servers stopped.
echo ==========================================

pause
