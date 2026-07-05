# Windows Build - Portable Version

**Date:** January 29, 2026  
**Build Type:** Portable (No Installer Required)  
**Status:** ✅ Ready for Testing

---

## About This Build

This is a **portable Windows build** of JARVIS-AI. Because electron-builder on macOS cannot create NSIS installers without Wine, we're providing the unpacked application that can run directly without installation.

### File Details

**Package:** `JARVIS-AI-1.0.0-win-x64-portable.zip`  
**Location:** `packages/desktop/release/JARVIS-AI-1.0.0-win-x64-portable.zip`  
**Architecture:** Windows x64  
**Code State:** Stable (commit c794de7 - reverted state)

---

## Installation Instructions

### 1. Extract the ZIP File

```powershell
# Extract to your preferred location
# For example: C:\Program Files\JARVIS-AI\
```

**Right-click** → **Extract All** → Choose destination folder

### 2. Run the Application

Navigate to the extracted folder and run:

```
JARVIS-AI.exe
```

**Tip:** Create a shortcut to `JARVIS-AI.exe` on your desktop for easy access.

---

## First Launch Requirements

### Install Node.js

JARVIS-AI requires Node.js to run Playwright MCP:

1. Download Node.js from: https://nodejs.org/
2. Install version 18+ or 20+ (LTS recommended)
3. Verify installation:
   ```powershell
   node --version
   ```

### Install Playwright Browsers (Automatic)

On first use of the "Manual Test Execution" persona, Playwright will automatically install Chromium. This is a one-time process that takes 1-2 minutes.

---

## Cleanup Script (IMPORTANT!)

### The Relaunch Issue

When you close JARVIS-AI and relaunch it, you may encounter:
```
Error: Cannot call write after a stream was destroyed
```

This happens because Chrome (port 9222) and MCP processes don't shut down cleanly.

### Solution: Run Cleanup Script Before Relaunch

The cleanup scripts are included in the ZIP at:
```
win-unpacked\resources\app.asar.unpacked\scripts\
```

However, they need to be copied to the root folder for easy access.

#### Quick Setup

1. **Copy cleanup scripts to root:**
   - Copy `cleanup-jarvis.ps1` from extracted folder to desktop
   - Copy `cleanup-jarvis.bat` from extracted folder to desktop

2. **Before relaunching JARVIS-AI:**
   - Double-click `cleanup-jarvis.bat`
   - OR run PowerShell: `.\cleanup-jarvis.ps1`

#### What the Cleanup Script Does

✅ **Kills only:**
- Chrome debug session on port 9222
- Chrome with `--remote-debugging-port=9222` flag
- `@playwright/mcp` server processes

❌ **Does NOT affect:**
- Your regular Chrome browser
- Chrome tabs, bookmarks, extensions
- Any other applications

**Your normal browsing is 100% safe!**

---

## Usage Workflow

### Normal Use

1. **Launch** - Run `JARVIS-AI.exe`
2. **Work** - Use personas, run tests, etc.
3. **Close** - Exit the application normally

### Relaunching

1. **Close** - Exit JARVIS-AI completely
2. **Clean** - Run `cleanup-jarvis.bat` or `cleanup-jarvis.ps1`
3. **Launch** - Run `JARVIS-AI.exe` again

---

## Cleanup Script Examples

### Quick One-Liner (PowerShell)

```powershell
Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*@playwright/mcp*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### Manual Process Check

**Check what's using port 9222:**
```powershell
Get-NetTCPConnection -LocalPort 9222 | Select-Object OwningProcess
```

**Kill specific process:**
```powershell
Stop-Process -Id <PID> -Force
```

---

## Testing Checklist

- [ ] Extract ZIP file
- [ ] Run JARVIS-AI.exe
- [ ] Select "Manual Test Execution" persona
- [ ] Wait for Playwright browser installation (first time only)
- [ ] Run a test (e.g., saucedemo login)
- [ ] Verify test executes correctly
- [ ] Verify recording playback works
- [ ] Close the app
- [ ] Run cleanup script
- [ ] Relaunch JARVIS-AI.exe
- [ ] Verify persona selection works on relaunch

---

## Troubleshooting

### "Windows protected your PC" Warning

This appears because the app isn't signed with a Windows code signing certificate.

**Solution:**
1. Click "More info"
2. Click "Run anyway"

### PowerShell Execution Policy Error

If you get "execution policy" error when running `.ps1` scripts:

**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Or simply use the `.bat` file which bypasses this automatically.

### Port 9222 Still In Use

If cleanup script doesn't work:

1. Check what's using it:
   ```powershell
   Get-NetTCPConnection -LocalPort 9222
   ```

2. Open Task Manager (Ctrl+Shift+Esc)
3. Find "Chrome" or "node" processes
4. End those tasks manually

### Antivirus Flags the App

Some antivirus software may flag Electron apps as suspicious.

**Solution:**
- Add JARVIS-AI folder to antivirus exclusions
- This is safe - the app is open source and built from the codebase

---

## Building NSIS Installer (Optional)

If you need a proper Windows installer, you must build on a Windows machine:

1. **On Windows machine:**
   ```powershell
   git clone <repository>
   cd jarvis-ai/packages/desktop
   pnpm install
   pnpm build
   pnpm package
   ```

2. **Output:**
   - `release/JARVIS-AI-Setup-1.0.0.exe` (~140MB)
   - NSIS installer with proper installation wizard

---

## Known Limitations

- **No automatic cleanup** - Must run script manually before relaunch
- **Requires Node.js** - Must be installed separately
- **Portable only** - No Windows installer from macOS build
- **Not signed** - Windows SmartScreen warning on first run

These will be addressed in future updates.

---

## File Structure

```
win-unpacked/
├── JARVIS-AI.exe          ← Main executable (180MB)
├── resources/
│   ├── app.asar           ← Bundled application
│   └── jarvis.config.yaml ← Configuration
├── locales/               ← Language files
├── chrome_*.pak           ← Chrome resources
├── *.dll                  ← Runtime libraries
└── ...                    ← Other Electron files
```

---

## Support

For issues or questions:
1. Check `REVERT_TO_STABLE_SUMMARY.md` for detailed implementation notes
2. Check `packages/desktop/scripts/README.md` for script documentation
3. Review execution logs for error details

---

**The Windows portable build is ready for testing! 🚀**
