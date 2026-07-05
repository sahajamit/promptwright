# Promptwright Cleanup Script for Windows (PowerShell)
# Safely kills only the Chrome debug session on port 9222
# Does NOT affect your regular Chrome browser windows

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Promptwright Cleanup Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$KilledSomething = $false

# 1. Find and kill process using port 9222
Write-Host "[1/3] Checking for Chrome debug session on port 9222..." -ForegroundColor Yellow
try {
    $connections = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pid = $conn.OwningProcess
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "      Found debug Chrome (PID: $pid, Name: $($proc.ProcessName)) - killing..."
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                $KilledSomething = $true
            }
        }
        Write-Host "      Done."
    } else {
        Write-Host "      No Chrome debug session found on port 9222."
    }
} catch {
    Write-Host "      No Chrome debug session found on port 9222."
}

# 2. Kill Chrome processes started with --remote-debugging-port=9222
Write-Host ""
Write-Host "[2/3] Checking for Playwright Chrome processes..." -ForegroundColor Yellow
try {
    $chromeProcs = Get-WmiObject Win32_Process -Filter "Name='chrome.exe' OR Name='chromium.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*--remote-debugging-port=9222*" }
    
    if ($chromeProcs) {
        foreach ($proc in $chromeProcs) {
            Write-Host "      Found Playwright Chrome (PID: $($proc.ProcessId)) - killing..."
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            $KilledSomething = $true
        }
        Write-Host "      Done."
    } else {
        Write-Host "      No Playwright Chrome processes found."
    }
} catch {
    Write-Host "      No Playwright Chrome processes found."
}

# 3. Kill MCP server processes
Write-Host ""
Write-Host "[3/3] Checking for MCP server processes..." -ForegroundColor Yellow
try {
    $mcpProcs = Get-WmiObject Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*@playwright/mcp*" -or $_.CommandLine -like "*playwright*mcp*" }
    
    if ($mcpProcs) {
        foreach ($proc in $mcpProcs) {
            Write-Host "      Found MCP server (PID: $($proc.ProcessId)) - killing..."
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            $KilledSomething = $true
        }
        Write-Host "      Done."
    } else {
        Write-Host "      No MCP server processes found."
    }
} catch {
    Write-Host "      No MCP server processes found."
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
if ($KilledSomething) {
    Write-Host "  Cleanup complete!" -ForegroundColor Green
} else {
    Write-Host "  Nothing to clean up - all clear!" -ForegroundColor Green
}
Write-Host "  You can now launch Promptwright." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
