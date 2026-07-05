# Promptwright Launcher with Auto-Cleanup
# This script automatically cleans up stale processes before launching the app

$PromptwrightHome = if ($env:PROMPTWRIGHT_HOME) { $env:PROMPTWRIGHT_HOME } else { "$env:USERPROFILE\.promptwright" }
$AppPath = "$PromptwrightHome\win-unpacked\Promptwright.exe"

# Kill existing Promptwright app if running
Get-Process -Name "Promptwright" -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill Chrome on port 9222
Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | 
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Kill Playwright Chrome processes
Get-WmiObject Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*--remote-debugging-port=9222*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Kill MCP server processes
Get-WmiObject Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*@playwright/mcp*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Brief pause for cleanup
Start-Sleep -Milliseconds 500

# Launch the app
if (Test-Path $AppPath) {
    Start-Process $AppPath
} else {
    Write-Host "Error: Promptwright.exe not found at $AppPath" -ForegroundColor Red
    Write-Host "Please run the installer again."
    exit 1
}
