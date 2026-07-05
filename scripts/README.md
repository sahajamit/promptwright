# JARVIS-AI Scripts

This directory contains utility scripts for building, packaging, and distributing JARVIS-AI.

---

## 📦 Packaging Scripts

### Build Scripts

#### `build-win-portable.sh`
Builds a portable Windows package (no installer required).

**Usage:**
```bash
./scripts/build-win-portable.sh
```

**Output:**
- `packages/desktop/release/win-unpacked/` - Unpacked Windows app
- `packages/desktop/release/JARVIS-AI-1.0.0-win-x64-portable.zip` - Portable ZIP

---

#### `build-packages-with-zscaler.sh`
Full-featured build script with Zscaler proxy support for enterprise environments.

**Usage:**
```bash
# Build both Mac and Windows
./scripts/build-packages-with-zscaler.sh

# Build with custom Zscaler certificate
./scripts/build-packages-with-zscaler.sh --zscaler-cert ~/zscaler.crt

# Build only Mac
./scripts/build-packages-with-zscaler.sh --skip-windows

# Build only Windows
./scripts/build-packages-with-zscaler.sh --skip-mac

# Clean cache and rebuild
./scripts/build-packages-with-zscaler.sh --clean
```

**Features:**
- Pre-downloads electron-builder binaries
- Handles Zscaler SSL certificate issues
- Supports both Mac and Windows cross-compilation
- Automatic retry with fallback strategies

---

## 🔪 Chunking Scripts

Large package files (>100MB) need to be split into smaller chunks for GitHub storage (20MB limit per file).

### Splitting Packages into Chunks

#### `chunk-packages.sh`
Automatically splits packaged builds into chunks for GitHub.

**Usage:**
```bash
# Split with default chunk size (19MB)
./scripts/chunk-packages.sh

# Split with custom chunk size (e.g., 10MB)
./scripts/chunk-packages.sh 10
```

**What it does:**
1. Looks for packaged files in `packages/desktop/release/`:
   - `JARVIS-AI-1.0.0-arm64-mac.zip`
   - `JARVIS-AI-1.0.0-win-x64-portable.zip`
2. Deletes existing chunks in:
   - `binaries/mac-jarvis-app-chunks/`
   - `binaries/win-jarvis-app-chunks/`
3. Splits packages into chunks (default: 19MB each)
4. Generates metadata files:
   - `metadata.json` - JSON metadata for programmatic use
   - `*.manifest` - Human-readable manifest

**Output:**
```
binaries/
├── mac-jarvis-app-chunks/
│   ├── JARVIS-AI-1.0.0-arm64-mac.zip.partaa
│   ├── JARVIS-AI-1.0.0-arm64-mac.zip.partab
│   ├── JARVIS-AI-1.0.0-arm64-mac.zip.partac
│   ├── ...
│   ├── JARVIS-AI-1.0.0-arm64-mac.zip.manifest
│   └── metadata.json
└── win-jarvis-app-chunks/
    ├── JARVIS-AI-1.0.0-win-x64-portable.zip.partaa
    ├── JARVIS-AI-1.0.0-win-x64-portable.zip.partab
    ├── ...
    ├── JARVIS-AI-1.0.0-win-x64-portable.zip.manifest
    └── metadata.json
```

---

### Joining Chunks Back Together

#### `join-chunks.sh`
Reassembles packages from chunks on any machine.

**Usage:**
```bash
# Join Mac package
./scripts/join-chunks.sh mac

# Join Windows package
./scripts/join-chunks.sh win

# Join to custom output directory
./scripts/join-chunks.sh mac ~/Desktop/packages
./scripts/join-chunks.sh win ~/Desktop/packages
```

**What it does:**
1. Reads metadata from chunk directory
2. Verifies all chunks are present
3. Concatenates chunks in correct order
4. Verifies file size matches expected size
5. Verifies MD5 checksum matches original
6. Creates reassembled package file

**Output:**
- Default: `packages/desktop/release/JARVIS-AI-1.0.0-*.zip`
- Custom: `<output_dir>/JARVIS-AI-1.0.0-*.zip`

---

## 🔄 Complete Workflow

### On Development Machine (Package Creator)

1. **Build the packages:**
   ```bash
   pnpm build
   pnpm pkg:all
   ```

2. **Split into chunks for GitHub:**
   ```bash
   ./scripts/chunk-packages.sh
   ```

3. **Commit chunks to repository:**
   ```bash
   git add binaries/mac-jarvis-app-chunks/
   git add binaries/win-jarvis-app-chunks/
   git commit -m "Update packaged builds"
   git push
   ```

---

### On Another Machine (Package Consumer)

1. **Clone the repository:**
   ```bash
   git clone <repository>
   cd jarvis-ai
   ```

2. **Reassemble Mac package:**
   ```bash
   ./scripts/join-chunks.sh mac
   ```

3. **Reassemble Windows package:**
   ```bash
   ./scripts/join-chunks.sh win
   ```

4. **Extract and use:**
   ```bash
   # Mac
   unzip packages/desktop/release/JARVIS-AI-1.0.0-arm64-mac.zip
   
   # Windows
   unzip packages/desktop/release/JARVIS-AI-1.0.0-win-x64-portable.zip
   ```

---

## 📋 Quick Reference

### NPM Scripts (from project root)

```bash
# Development
pnpm dev:desktop          # Run desktop app in dev mode
pnpm dev:cli              # Run CLI in dev mode

# Building
pnpm build                # Build all packages
pnpm build:desktop        # Build desktop app only

# Packaging
pnpm pkg                  # Package for current platform
pnpm pkg:mac              # Package for Mac (DMG + ZIP)
pnpm pkg:win              # Package for Windows (portable ZIP)
pnpm pkg:win-installer    # Package for Windows (NSIS installer, requires Wine)
pnpm pkg:all              # Package for both Mac and Windows
```

### Direct Script Usage

```bash
# Build Windows portable
./scripts/build-win-portable.sh

# Build with Zscaler support
./scripts/build-packages-with-zscaler.sh

# Split packages into chunks
./scripts/chunk-packages.sh [chunk_size_mb]

# Join chunks back together
./scripts/join-chunks.sh <mac|win> [output_dir]
```

---

## 🔧 Troubleshooting

### Chunking Issues

**Problem:** "Package not found" error when running `chunk-packages.sh`

**Solution:** Build packages first:
```bash
pnpm build && pnpm pkg:all
```

---

**Problem:** Chunks not generating

**Solution:** Check if release directory exists:
```bash
ls -l packages/desktop/release/
```

---

### Joining Issues

**Problem:** "Chunks directory not found"

**Solution:** Ensure you've cloned the repository with chunks:
```bash
ls -l binaries/mac-jarvis-app-chunks/
ls -l binaries/win-jarvis-app-chunks/
```

---

**Problem:** "Checksum mismatch" error

**Solution:** Some chunks may be corrupted. Re-clone the repository:
```bash
rm -rf binaries/
git checkout binaries/
```

---

**Problem:** "Chunk count mismatch"

**Solution:** Some chunks are missing. Verify all chunks are present:
```bash
ls -l binaries/mac-jarvis-app-chunks/*.part*
ls -l binaries/win-jarvis-app-chunks/*.part*
```

---

## 📄 File Structure

```
scripts/
├── README.md                          # This file
├── build-win-portable.sh              # Build Windows portable package
├── build-packages-with-zscaler.sh     # Build with proxy support
├── chunk-packages.sh                  # Split packages into chunks
├── join-chunks.sh                     # Join chunks back together
└── file-chunker.sh                    # Legacy generic chunker (deprecated)

binaries/
├── mac-jarvis-app-chunks/             # Mac package chunks
│   ├── *.partaa, *.partab, ...       # Chunk files
│   ├── *.manifest                     # Human-readable manifest
│   └── metadata.json                  # Machine-readable metadata
└── win-jarvis-app-chunks/             # Windows package chunks
    ├── *.partaa, *.partab, ...       # Chunk files
    ├── *.manifest                     # Human-readable manifest
    └── metadata.json                  # Machine-readable metadata
```

---

## 🤝 Contributing

When adding new scripts:
1. Make scripts executable: `chmod +x scripts/your-script.sh`
2. Add proper error handling with `set -e`
3. Include colored logging for better UX
4. Document usage in this README
5. Test on both macOS and Linux if applicable

---

## 📞 Support

For issues with:
- **Building**: See `specs/PACKAGING.md`
- **Windows builds**: See `specs/WINDOWS_BUILD_README.md`
- **Distribution**: See `specs/DISTRIBUTION_SUMMARY.md`
