@echo off
REM clean-fresh.bat — Reset Promptwright to a fresh-install state (Windows)
REM Usage: scripts\clean-fresh.bat [--all]
REM   --all  Also removes build outputs (dist\, release\) and node_modules

setlocal EnableDelayedExpansion

set "removed=0"

echo.
echo === Promptwright Fresh Install Cleanup ===
echo.

REM ── 1. Electron app data (sessions, config, recordings, process registry) ──
echo App data (Electron userData):
call :remove_path "%APPDATA%\Promptwright" "%%APPDATA%%\Promptwright"

REM ── 2. Global skills directory ──
echo.
echo Global skills ^& temp:
call :remove_path "%USERPROFILE%\.promptwright" "%%USERPROFILE%%\.promptwright"

REM ── 3. Temporary recordings in system temp dir ──
echo.
echo Temporary recordings:
call :remove_path "%TEMP%\promptwright-recordings" "%%TEMP%%\promptwright-recordings"

REM ── 4. Playwright CLI dev cache ──
echo.
echo Playwright CLI dev cache:
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
call :remove_path "%PROJECT_DIR%\packages\desktop\.playwright-cli" "packages\desktop\.playwright-cli"

REM ── 5. Playwright CLI config files that may have been written to home dir ──
echo.
echo Playwright CLI config:
call :remove_path "%USERPROFILE%\playwright-cli.json" "%%USERPROFILE%%\playwright-cli.json"

REM ── 6. Kill any running Chrome debug processes on port 9222 ──
echo.
echo Stale processes:
set "killed=0"
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":9222 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
    set "killed=1"
)
if "!killed!"=="1" (
    echo   X Killed Chrome debug processes on port 9222
    set /a removed+=1
) else (
    echo   OK No Chrome debug process on port 9222
)

REM ── 7. Build outputs (only with --all) ──
if "%~1"=="--all" (
    echo.
    echo Build outputs:
    call :remove_path "%PROJECT_DIR%\packages\core\dist" "packages\core\dist"
    call :remove_path "%PROJECT_DIR%\packages\cli\dist" "packages\cli\dist"
    call :remove_path "%PROJECT_DIR%\packages\desktop\dist" "packages\desktop\dist"
    call :remove_path "%PROJECT_DIR%\packages\desktop\release" "packages\desktop\release"

    echo.
    echo Node modules:
    call :remove_path "%PROJECT_DIR%\node_modules" "node_modules (root)"
    call :remove_path "%PROJECT_DIR%\packages\core\node_modules" "packages\core\node_modules"
    call :remove_path "%PROJECT_DIR%\packages\cli\node_modules" "packages\cli\node_modules"
    call :remove_path "%PROJECT_DIR%\packages\desktop\node_modules" "packages\desktop\node_modules"
    echo.
    echo Run 'pnpm install ^&^& pnpm build' to rebuild.
)

echo.
echo Done. Removed !removed! item(s). App will start as fresh install.
echo.

endlocal
exit /b 0

REM ── Helper: remove a path if it exists ──
:remove_path
set "target=%~1"
set "label=%~2"
if exist "%target%\" (
    rmdir /s /q "%target%" >nul 2>&1
    echo   X Removed: %label%
    set /a removed+=1
) else if exist "%target%" (
    del /f /q "%target%" >nul 2>&1
    echo   X Removed: %label%
    set /a removed+=1
) else (
    echo   OK Already clean: %label%
)
exit /b 0
