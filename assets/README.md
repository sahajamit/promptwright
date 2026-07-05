# JARVIS AI Assets

This folder contains shared assets for the JARVIS AI project.

## Logo

- **File**: `logo.png`
- **Size**: 512x512px
- **Format**: PNG with transparency
- **Usage**:
  - Desktop app icon (Electron)
  - UI header logo
  - Documentation
  - Branding materials

## Usage in Desktop App

The logo is automatically copied to:
1. `packages/desktop/assets/icon.png` - App icon for Electron
2. `packages/desktop/src/renderer/assets/logo.png` - UI asset for React components

These copies are created during the build process and are tracked separately.

## Adding New Assets

When adding new assets:
1. Place them in this folder with descriptive names
2. Update this README with usage information
3. If needed for the desktop app, update the build scripts to copy them
4. Ensure proper licenses are documented

## Logo Design

The JARVIS AI logo features:
- Blue circular border
- Stylized "J" in the center
- Clean, modern design
- Works well at all sizes
- Suitable for light and dark backgrounds
