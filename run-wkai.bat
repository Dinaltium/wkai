@echo off
REM WKAI - Workshop AI - Startup Script for Windows
REM Usage: run-wkai.bat

setlocal EnableDelayedExpansion

set "BASE_DIR=%CD%"
set "BACKEND_DIR=%BASE_DIR%\wkai-backend"
set "STUDENT_DIR=%BASE_DIR%\wkai-student"
set "INSTRUCTOR_DIR=%BASE_DIR%\wkai"

echo ==========================================
echo   WKAI - Workshop AI Startup Script
echo   Platform: Windows
echo ==========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    echo Download from: https://nodejs.org/
    exit /b 1
)

REM Redis check (optional but helpful)
where redis-server >nul 2>nul
if errorlevel 1 (
    echo WARNING: Local Redis [redis-server] not found in PATH.
    echo Ensure Redis is running on localhost:6379
)

REM Check if directories exist
if not exist "%BACKEND_DIR%" (
    echo ERROR: wkai-backend directory not found in %BASE_DIR%
    exit /b 1
)

if not exist "%STUDENT_DIR%" (
    echo ERROR: wkai-student directory not found in %BASE_DIR%
    exit /b 1
)

if not exist "%INSTRUCTOR_DIR%" (
    echo ERROR: wkai directory not found in %BASE_DIR%
    exit /b 1
)

echo [1/5] Checking local environment...
echo       Using local Redis and Neon Postgres.
echo       Make sure wkai-backend/.env is configured with your Neon URL.
echo.
timeout /t 2 /nobreak >nul

echo.
echo [2/5] Running database migrations (if needed)...
cd /d "%BACKEND_DIR%"
call npm run db:migrate

echo.
echo [3/5] Starting backend server...
echo       URL: http://localhost:4000
start "WKAI Backend" cmd /k "cd /d %BACKEND_DIR% && npm run dev"

echo.
echo [4/5] Starting student web app...
cd /d "%STUDENT_DIR%"
echo       URL: http://localhost:3000
start "WKAI Student App" cmd /k "cd /d %STUDENT_DIR% && npm run dev"

echo.
echo [5/5] Preparing instructor app...
cd /d "%INSTRUCTOR_DIR%"
echo.
echo ==========================================
echo   Servers Started Successfully!
echo ==========================================
echo.
echo   Backend:       http://localhost:4000
echo   Student App:   http://localhost:3000
echo   Instructor:    Desktop app (see below)
echo.
echo   To start the Instructor Desktop App:
echo     cd /d %INSTRUCTOR_DIR%
echo     npm run tauri:dev
echo.
echo   First time only - fix icon issue:
echo     npm run tauri icon -- --input ./icons/128x128.png
echo.
echo   To stop servers:
echo     Run stop-wkai.bat
echo ==========================================
echo.
echo Opening instructor app instructions...
timeout /t 3 /nobreak >nul

exit /b 0
