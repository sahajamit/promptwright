# Testing the App Icon

## Current Status
The dock icon is not showing the JARVIS logo. Let's debug this.

## Steps to Debug

### 1. Restart the App
Stop (Ctrl+C) and restart:
```bash
pnpm dev:desktop
```

### 2. Check the Terminal Output

Look for these console messages when the app starts:
```
Platform: darwin
__dirname: /path/to/dist/main
process.cwd(): /path/to/packages/desktop
Trying icon path: ...
✓ Found icon at: ...
Icon size: { width: 512, height: 512 }
✓ Dock icon set successfully
```

### 3. Common Issues

**If you see:**
```
✗ Icon not found. Tried: [...]
```
**Solution:** The icon files are not in the expected location. Check:
```bash
ls -la assets/icon.*
```

**If you see:**
```
Icon size: { width: 0, height: 0 }
✗ Icon image is empty
```
**Solution:** The icon file is corrupted or invalid. Regenerate:
```bash
./scripts/generate-icons.sh
```

**If you see:**
```
✓ Dock icon set successfully
```
But the icon still doesn't show, this is a macOS development limitation.

### 4. Why Development Icons Are Tricky

In **development mode**, Electron apps don't have a proper .app bundle, so macOS may:
- Ignore the dock icon
- Cache the Electron default icon
- Not update until you build the app

### 5. Test with Production Build

To truly test the icon:

```bash
# Build the app
pnpm build

# Run the built app (not dev mode)
pnpm start
```

Or package it:
```bash
pnpm package
open release/mac/JARVIS\ AI.app
```

The packaged app **will** show the correct icon.

## Alternative: Force Icon in Development

Add this AppleScript to force set the dock icon (macOS only):

```bash
# Create a shell script
cat > set-dev-icon.sh << 'EOF'
#!/bin/bash
osascript -e 'tell application "Electron" to set image of dock tile to POSIX file "'$(pwd)'/assets/icon.icns"'
EOF
chmod +x set-dev-icon.sh

# Run after starting the app
./set-dev-icon.sh
```

## Expected Behavior

- **Development**: Icon may not show (Electron limitation)
- **Production Build**: Icon **will** show correctly
- **Packaged App**: Icon **will** show everywhere

## Verification

Copy the console output from the terminal and check:
1. All paths being tried
2. Which path found the icon
3. Icon size (should be 512x512 or similar)
4. Whether setting succeeded
