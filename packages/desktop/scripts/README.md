# Promptwright Cleanup Scripts

These scripts safely kill leftover Chrome debug sessions and MCP server processes before relaunching Promptwright.

## Why You Need This

When Promptwright closes, sometimes Chrome (running on port 9222 for Playwright MCP) and MCP server processes don't shut down cleanly. This causes the error on relaunch:

```
Error: Cannot call write after a stream was destroyed
```

Running these scripts before relaunching fixes the issue.

---

## 🍎 macOS

### Quick Use

```bash
# From the promptwright directory:
./packages/desktop/scripts/cleanup-promptwright.sh
```

### Manual Alternative

```bash
lsof -ti:9222 | xargs kill -9 2>/dev/null
pkill -f "remote-debugging-port=9222" 2>/dev/null
pkill -f "@playwright/mcp" 2>/dev/null
```

---

## 🪟 Windows

### Quick Use (Double-Click)

1. Navigate to: `packages\desktop\scripts\`
2. Double-click: `cleanup-promptwright.bat`

### PowerShell

```powershell
# From the promptwright directory:
.\packages\desktop\scripts\cleanup-promptwright.ps1
```

### Manual Alternative (PowerShell)

```powershell
Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*@playwright/mcp*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

---

## Safety

These scripts are **100% safe** for your system:

✅ **Only kills:**
- Chrome debug session on port 9222
- Chrome processes with `--remote-debugging-port=9222` flag
- `@playwright/mcp` server processes

❌ **Does NOT kill:**
- Your regular Chrome browser windows
- Chrome tabs, bookmarks, or extensions
- Any other applications

**Your normal browsing is completely unaffected.**

---

## Workflow

1. **Use Promptwright** - Run tests, execute tasks, etc.
2. **Quit the app** - Close Promptwright completely (Cmd+Q on Mac)
3. **Run cleanup script** - Use one of the scripts above
4. **Relaunch** - Open Promptwright again

---

## Troubleshooting

### Script says "Permission denied" (macOS)

Make the script executable:

```bash
chmod +x packages/desktop/scripts/cleanup-promptwright.sh
```

### PowerShell says "execution policy" error (Windows)

Run PowerShell as Administrator and execute:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Or use the batch file (`cleanup-promptwright.bat`) which bypasses this automatically.

### Port 9222 still in use after cleanup

Check what's using it:

**macOS:**
```bash
lsof -i:9222
```

**Windows:**
```powershell
Get-NetTCPConnection -LocalPort 9222 | Select-Object OwningProcess
```

Then manually kill the process ID shown.

---

## Future Improvements

These scripts are a temporary workaround. Future versions of Promptwright will automatically clean up processes on quit, eliminating the need for manual cleanup.

---

**Questions?** See the main documentation at `REVERT_TO_STABLE_SUMMARY.md`
