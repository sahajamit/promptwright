# App Icon Fix

## Issue
The Electron app was showing the default Electron icon in the dock/taskbar instead of the JARVIS logo.

## Root Causes

1. **Wrong Icon Format**: Using `.png` instead of platform-specific formats:
   - macOS needs `.icns` (Apple Icon Image format)
   - Windows needs `.ico` (Windows Icon format)
   - Linux can use `.png`

2. **macOS Dock Icon**: Needed explicit `app.dock.setIcon()` call

3. **Icon Cache**: macOS caches app icons, requiring restart

## Fix Applied

### 1. Generated Platform-Specific Icons

Created proper icon formats from the source PNG:
```bash
png2icons assets/icon.png assets/icon -icns  # macOS
png2icons assets/icon.png assets/icon -ico   # Windows
```

Files created:
- `assets/icon.icns` - 336KB (macOS, multiple resolutions)
- `assets/icon.ico` - 422KB (Windows, multiple resolutions)  
- `assets/icon.png` - 56KB (Linux, source)

### 2. Updated Main Process

Added platform-specific icon selection:
```typescript
let iconPath: string;
if (process.platform === "darwin") {
  iconPath = path.join(__dirname, "../../assets/icon.icns");
} else if (process.platform === "win32") {
  iconPath = path.join(__dirname, "../../assets/icon.ico");
} else {
  iconPath = path.join(__dirname, "../../assets/icon.png");
}

// Set dock icon for macOS
if (process.platform === "darwin" && app.dock) {
  app.dock.setIcon(iconPath);
}
```

### 3. Updated Build Configuration

Modified `package.json` to use correct icon formats:
```json
{
  "build": {
    "mac": { "icon": "assets/icon.icns" },
    "win": { "icon": "assets/icon.ico" },
    "linux": { "icon": "assets/icon.png" }
  }
}
```

## How to Apply

### Restart the App

1. Stop the dev server (Ctrl+C)
2. Restart:
   ```bash
   pnpm dev:desktop
   ```

### Clear macOS Icon Cache (if needed)

If the icon still doesn't change on macOS:

```bash
# Clear icon cache
rm ~/Library/Caches/com.apple.iconservices.store

# Kill Dock to refresh
killall Dock

# Restart the app
pnpm dev:desktop
```

### Regenerate Icons (if needed)

If you update the source logo:

```bash
cd packages/desktop
./scripts/generate-icons.sh
```

Or manually:
```bash
cd packages/desktop/assets
png2icons icon.png icon -icns
png2icons icon.png icon -ico
```

## Verification

After restarting, you should see:
- ✅ JARVIS logo in macOS Dock
- ✅ JARVIS logo in Windows Taskbar  
- ✅ JARVIS logo in Linux app launcher
- ✅ JARVIS logo in Alt+Tab / Mission Control

## Notes

- **Development**: Icon changes require app restart
- **Production**: Built app will have the correct icon automatically
- **Icon Sizes**: The `.icns` and `.ico` files contain multiple resolutions (16x16 to 1024x1024)
- **Retina Support**: macOS .icns includes @2x versions for high-DPI displays

## Platform-Specific Info

### macOS (.icns)
Contains: 16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024
All sizes include @1x and @2x variants for Retina displays

### Windows (.ico)
Contains: 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256
Used in taskbar, window frame, and file explorer

### Linux (.png)
Single 512x512 PNG
Used by desktop environments and app launchers
