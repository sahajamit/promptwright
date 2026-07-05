# Promptwright Installer for Windows
# Checks prerequisites, installs the app, and sets up PATH

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Promptwright Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$PromptwrightHome = "$env:USERPROFILE\.promptwright"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MinNodeVersion = 22
$MinCopilotVersion = "0.0.400"

# 1. Check Node.js >= 22
Write-Host ""
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = (node -v) -replace 'v', ''
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -ge $MinNodeVersion) {
        Write-Host "      ✓ Node.js v$nodeVersion found" -ForegroundColor Green
    } else {
        Write-Host "      ✗ Node.js v$MinNodeVersion+ required (found v$nodeVersion)" -ForegroundColor Red
        Write-Host "      Please install from: https://nodejs.org/"
        exit 1
    }
} catch {
    Write-Host "      ✗ Node.js not found" -ForegroundColor Red
    Write-Host "      Please install Node.js v$MinNodeVersion+ from: https://nodejs.org/"
    exit 1
}

# 2. Check/Install GitHub Copilot CLI
Write-Host ""
Write-Host "[2/5] Checking GitHub Copilot CLI..." -ForegroundColor Yellow
try {
    $copilotVersion = copilot --version 2>$null | Select-Object -First 1
    Write-Host "      ✓ Copilot CLI found: $copilotVersion" -ForegroundColor Green
} catch {
    Write-Host "      Copilot CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @github/copilot
    Write-Host "      ✓ Copilot CLI installed" -ForegroundColor Green
}
Write-Host ""
Write-Host "      ⚠️  IMPORTANT: Make sure you are logged in to Copilot CLI!" -ForegroundColor Yellow
Write-Host "         Run 'copilot auth login' if you haven't already."

# 3. Create/recreate installation directory
Write-Host ""
Write-Host "[3/5] Setting up installation directory..." -ForegroundColor Yellow
if (Test-Path $PromptwrightHome) {
    Write-Host "      Removing existing installation..."
    Remove-Item -Recurse -Force $PromptwrightHome
}
New-Item -ItemType Directory -Path $PromptwrightHome | Out-Null
Write-Host "      ✓ Created $PromptwrightHome" -ForegroundColor Green

# 4. Extract and install app
Write-Host ""
Write-Host "[4/5] Installing Promptwright app..." -ForegroundColor Yellow
Expand-Archive -Path "$ScriptDir\Promptwright-1.0.0-win-x64-portable.zip" -DestinationPath $PromptwrightHome -Force
Copy-Item "$ScriptDir\scripts\promptwright.bat" -Destination $PromptwrightHome
Copy-Item "$ScriptDir\scripts\promptwright.ps1" -Destination $PromptwrightHome
Write-Host "      ✓ App installed to $PromptwrightHome" -ForegroundColor Green

# 5. Add to PATH
Write-Host ""
Write-Host "[5/5] Adding to PATH..." -ForegroundColor Yellow
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$PromptwrightHome*") {
    [Environment]::SetEnvironmentVariable("Path", "$PromptwrightHome;$currentPath", "User")
    Write-Host "      ✓ Added to user PATH" -ForegroundColor Green
} else {
    Write-Host "      ✓ Already in PATH" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start Promptwright:"
Write-Host "  1. Open a new Command Prompt or PowerShell"
Write-Host "  2. Run: promptwright"
Write-Host ""
Write-Host "Or double-click: $PromptwrightHome\promptwright.bat"
Write-Host ""
