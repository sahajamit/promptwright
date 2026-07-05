# JARVIS-AI Desktop App Packaging Guide

Complete guide for packaging JARVIS-AI as a distributable desktop application for Windows and macOS, including troubleshooting for enterprise environments behind corporate proxies (Zscaler).

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Windows Packaging](#windows-packaging)
- [macOS Packaging](#macos-packaging)
- [Enterprise/Proxy Troubleshooting](#enterpriseproxy-troubleshooting)
- [Distribution](#distribution)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Required for build |
| pnpm | Latest | Package manager |
| Wine | 4.0+ | Only for Windows cross-compile on Mac |

**End-User Requirements:**
- GitHub Copilot CLI installed and authenticated (`copilot auth login`)
- Chrome browser (for Record & Repeat persona)

---

## Quick Start

### Automated Build (Recommended)

Use the automated build script that handles Zscaler proxy issues:

```bash
# From project root
./scripts/build-packages.sh

# With Zscaler certificate
./scripts/build-packages.sh --zscaler-cert /path/to/zscaler.crt

# Build only Mac
./scripts/build-packages.sh --skip-windows

# Clean cache and rebuild
./scripts/build-packages.sh --clean
```

### Manual Build

```bash
# From project root
pnpm build

# Package for current platform
cd packages/desktop
pnpm package

# Package for specific platform
npx electron-builder --win --x64 --publish never   # Windows
npx electron-builder --mac --publish never          # macOS
```

---

## Windows Packaging

### Build Command

```bash
cd packages/desktop
npx electron-builder --win nsis --x64 --publish never
```

### Output

| File | Location |
|------|----------|
| `JARVIS-AI-Setup-1.0.0.exe` | `packages/desktop/release/` |

### Installation Behavior

- **Install Path**: `%LOCALAPPDATA%\Programs\JARVIS-AI`
- **Admin Required**: No (per-user installation)
- **Shortcuts**: Desktop + Start Menu

### Cross-Compile from macOS

```bash
# Install Wine (one-time)
brew install --cask wine-stable

# Build Windows installer
cd packages/desktop
npx electron-builder --win nsis --x64 --publish never
```

---

## macOS Packaging

### Build Command

```bash
cd packages/desktop
npx electron-builder --mac --publish never
```

### Output

| File | Location |
|------|----------|
| `JARVIS-AI-x.x.x-arm64.dmg` | `packages/desktop/release/` |
| `JARVIS-AI-x.x.x-arm64-mac.zip` | `packages/desktop/release/` |

### Code Signing (Optional)

For distribution outside your organization:

```bash
# Set signing identity
export CSC_NAME="Developer ID Application: Your Name"

# Or use certificate file
export CSC_LINK=path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password

npx electron-builder --mac
```

---

## Enterprise/Proxy Troubleshooting

### Zscaler Proxy Issues

When building behind a corporate proxy (Zscaler, etc.), you may encounter 403 errors downloading electron-builder dependencies:

```
⨯ part download request failed with status code 403
url=https://github.com/electron-userland/electron-builder-binaries/...
```

### Solution 1: Manual Pre-Download (Recommended)

Download required binaries manually and place them in electron-builder's cache:

```bash
# Create cache directories
mkdir -p ~/Library/Caches/electron-builder/nsis
mkdir -p ~/Library/Caches/electron-builder/winCodeSign
mkdir -p ~/Library/Caches/electron-builder/nsis-resources
mkdir -p ~/Library/Caches/electron-builder/wine

# Download with Zscaler certificate
ZSCALER_CERT=/path/to/zscaler.crt

# NSIS (required for Windows installer)
curl -L --cacert $ZSCALER_CERT \
  -o ~/Library/Caches/electron-builder/nsis/nsis-3.0.4.1.7z \
  https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z

# NSIS Resources
curl -L --cacert $ZSCALER_CERT \
  -o ~/Library/Caches/electron-builder/nsis-resources/nsis-resources-3.4.1.7z \
  https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z

# WinCodeSign (required for Windows)
curl -L --cacert $ZSCALER_CERT \
  -o ~/Library/Caches/electron-builder/winCodeSign/winCodeSign-2.6.0.7z \
  https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z

# Wine (required for Windows cross-compile on Mac)
curl -L --cacert $ZSCALER_CERT \
  -o ~/Library/Caches/electron-builder/wine/wine-4.0.1-mac.7z \
  https://github.com/electron-userland/electron-builder-binaries/releases/download/wine-4.0.1-mac/wine-4.0.1-mac.7z
```

### Solution 2: Configure Go/Golang SSL Certificate (Root Cause Fix)

The download failures happen in `app-builder`, a **Go binary** that doesn't respect Node.js environment variables. Go uses different environment variables for custom CA certificates:

```bash
# Set the Zscaler certificate for Go programs
export SSL_CERT_FILE=/path/to/zscaler.crt

# Or point to a directory containing certificates
export SSL_CERT_DIR=/path/to/certs/

# Now run the build
cd packages/desktop
npx electron-builder --win nsis --x64 --publish never
```

**Creating a combined certificate bundle:**

If `SSL_CERT_FILE` alone doesn't work, create a bundle with both system CAs and Zscaler:

```bash
# macOS: Export system CAs and append Zscaler cert
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > ~/combined-ca-bundle.crt
cat /path/to/zscaler.crt >> ~/combined-ca-bundle.crt

# Use the combined bundle
export SSL_CERT_FILE=~/combined-ca-bundle.crt
npx electron-builder --win
```

**Permanent configuration (add to `~/.zshrc` or `~/.bashrc`):**

```bash
export SSL_CERT_FILE=/path/to/zscaler.crt
# or
export SSL_CERT_FILE=~/combined-ca-bundle.crt
```

### Solution 3: Build Unpacked Directory Only

Skip installer creation to avoid NSIS dependency entirely:

```bash
# Build unpacked directory (no NSIS needed)
npx electron-builder --win --dir

# Output: packages/desktop/release/win-unpacked/
```

Then create a ZIP file for distribution:

```bash
cd packages/desktop/release
zip -r JARVIS-AI-Windows.zip win-unpacked/
```

### Solution 4: Configure NODE_EXTRA_CA_CERTS

> [!NOTE]
> This works for Node.js downloads but NOT for `app-builder` (Go binary) which makes most electron-builder downloads.

```bash
export NODE_EXTRA_CA_CERTS=/path/to/zscaler.crt
npx electron-builder --win
```

### Solution 5: Build on Non-Proxy Network

The simplest solution is to build on a machine without proxy restrictions:

1. Clone the repo on a personal machine or CI server
2. Run `pnpm install && pnpm build`
3. Run `npx electron-builder --win --mac`
4. Transfer the installers to your enterprise network

### Finding Your Zscaler Certificate

```bash
# macOS - Check System Keychain
security find-certificate -a -p /Library/Keychains/System.keychain | grep -i zscaler

# Or export from Keychain Access:
# 1. Open Keychain Access
# 2. Find "Zscaler Root CA"
# 3. Right-click → Export → Save as .crt or .pem
```

---

## Distribution

### Windows Enterprise Deployment

| Feature | Value |
|---------|-------|
| Install Location | `%LOCALAPPDATA%\Programs\JARVIS-AI` |
| Admin Required | No |
| Silent Install | `JARVIS-AI-Setup-x.x.x.exe /S` |
| Uninstall | Via Windows Settings or `uninstall.exe` |

### macOS Enterprise Deployment

| Feature | Value |
|---------|-------|
| Install Location | `/Applications/JARVIS-AI.app` |
| Admin Required | No (drag to Applications) |
| DMG Distribution | Mount, drag to Applications |

### Network Requirements

The installed app requires network access to:

| Endpoint | Purpose |
|----------|---------|
| `copilot-proxy.githubusercontent.com` | GitHub Copilot API |
| `api.github.com` | Authentication |

---

## Build Artifacts Reference

After a successful build:

```
packages/desktop/release/
├── JARVIS-AI-Setup-1.0.0.exe          # Windows NSIS installer
├── JARVIS-AI-Setup-1.0.0.exe.blockmap # Delta updates
├── JARVIS-AI-x.x.x-arm64.dmg          # macOS DMG
├── JARVIS-AI-x.x.x-arm64-mac.zip      # macOS ZIP
├── win-unpacked/                       # Windows unpacked
├── mac-arm64/                          # macOS unpacked
└── builder-effective-config.yaml       # Build config used
```
