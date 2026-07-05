# Desktop App Assets

This folder contains assets specific to the Promptwright desktop Electron application.

## Files

- **promptwright-logo.png**: Source brand logo (1563x1563), carried over from the Promptwright brand.
- **icon.png**: App icon, PNG (1024x1024) for Linux.
- **icon.icns**: macOS application icon (multiple resolutions).
- **icon.ico**: Windows application icon (multiple resolutions).

All icons are generated from `promptwright-logo.png`.

## Build Integration

These icons are referenced in:
- `package.json` build configuration for electron-builder (`mac.icon`, `win.icon`, `linux.icon`).
- `src/main/index.ts` for the BrowserWindow icon.

## Regenerating the icons (macOS)

If you update `promptwright-logo.png`, regenerate the icons:

```bash
cd packages/desktop/assets
SRC=promptwright-logo.png

# Linux PNG
sips -z 1024 1024 "$SRC" --out icon.png

# macOS ICNS
ICONSET=/tmp/pw.iconset; rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png"
  sips -z $((s*2)) $((s*2)) "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$ICONSET" -o icon.icns

# Windows ICO (needs png-to-ico; no ImageMagick required)
npx --yes png-to-ico icon.png > icon.ico
```

The source logo should be:
- PNG format
- At least 512x512px (square) for best quality on all platforms.
