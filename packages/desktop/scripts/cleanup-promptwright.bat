@echo off
REM Promptwright Cleanup Script for Windows (CMD)
REM Runs the PowerShell script

echo ==========================================
echo   Promptwright Cleanup Script
echo ==========================================
echo.
echo Running cleanup...
powershell -ExecutionPolicy Bypass -File "%~dp0cleanup-promptwright.ps1"
pause
