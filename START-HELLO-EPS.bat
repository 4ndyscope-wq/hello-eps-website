@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Hello EPS - Local Setup

echo ==================================================
echo        HELLO EPS - LOCAL ADMIN MOCK TEST
echo ==================================================
echo.
echo This setup installs the required local software:
echo - Node.js LTS
echo - PostgreSQL database
echo - Hello EPS app dependencies
echo.
echo Internet connection and Windows Package Manager (winget) are required ONCE.
echo No Docker and no paid hosting are required.
echo.
pause

where winget >nul 2>nul
if errorlevel 1 (
  echo ERROR: winget is not available on this PC.
  echo Install or update "App Installer" from Microsoft Store, then run this file again.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [1/5] Installing Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto install_error
) else (
  echo [1/5] Node.js already installed.
)
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js install finished but Windows cannot find node.exe yet.
  echo Restart Windows, then run START-HELLO-EPS.bat again.
  pause
  exit /b 1
)

set "PGROOT=%ProgramFiles%\PostgreSQL"
set "PSQL="
for /d %%D in ("%PGROOT%\*") do if exist "%%~fD\bin\psql.exe" set "PSQL=%%~fD\bin\psql.exe"
if not defined PSQL (
  echo [2/5] Installing PostgreSQL 17...
  winget install --id PostgreSQL.PostgreSQL.17 --exact --silent --accept-package-agreements --accept-source-agreements --override "--mode unattended --unattendedmodeui none --superpassword HelloEPS_Local_DB_2026! --serverport 5432 --servicename postgresql-x64-17"
  if errorlevel 1 goto install_error
  if exist "%PGROOT%\17\bin\psql.exe" set "PSQL=%PGROOT%\17\bin\psql.exe"
)
if not defined PSQL (
  echo PostgreSQL command-line tools were not found after installation.
  echo Please install PostgreSQL 17, then run this file again.
  pause
  exit /b 1
)

echo [3/5] Starting local PostgreSQL service...
sc start postgresql-x64-17 >nul 2>nul
set "PGPASSWORD=HelloEPS_Local_DB_2026!"
"%PSQL%" -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "DO $do$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='hello_eps') THEN CREATE ROLE hello_eps LOGIN PASSWORD 'i3FJ-52asnKooHHsWDit9IHRCGdxYYCcIp7dyU2QwCo'; ELSE ALTER ROLE hello_eps WITH LOGIN PASSWORD 'i3FJ-52asnKooHHsWDit9IHRCGdxYYCcIp7dyU2QwCo'; END IF; END $do$;"
if errorlevel 1 (
  echo Could not connect to PostgreSQL as its default administrator.
  echo If PostgreSQL was already installed with a different password, contact support for setup help.
  pause
  exit /b 1
)
"%PSQL%" -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE hello_eps OWNER hello_eps;"
if errorlevel 1 (
  "%PSQL%" -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE hello_eps OWNER TO hello_eps;"
  if errorlevel 1 goto install_error
)

echo [4/5] Preparing local login and database settings...
node scripts\setup-local-env.js
if errorlevel 1 goto install_error

echo [5/5] Installing and starting Hello EPS...
call npm install --omit=dev
if errorlevel 1 goto install_error
start "Hello EPS Local Server" cmd /k "cd /d ""%~dp0"" ^&^& npm start"
echo Waiting for the exam server and database to start...
timeout /t 10 /nobreak >nul
call npm run create-admin
if errorlevel 1 (
  echo Could not configure the test login. Check that the Hello EPS server window is running.
  pause
  exit /b 1
)
start "" http://localhost:3000/mock-test.html
echo.
echo Hello EPS should now open in your browser.
echo Keep the server window open while using the mock test.
echo Login username: helloeps
echo Login password: hello111@
echo.
pause
exit /b 0

:install_error
echo.
echo Setup could not finish. Please take a photo of the error above and send it here.
pause
exit /b 1
