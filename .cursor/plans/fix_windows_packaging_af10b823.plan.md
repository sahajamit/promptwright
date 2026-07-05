---
name: Fix Windows Packaging
overview: Solve the Windows packaging 403 error on work Mac by downloading winCodeSign binary on personal laptop and providing automated cache setup for work Mac
todos:
  - id: create-cache-dir
    content: Create .electron-builder-cache directory structure with README
    status: completed
  - id: download-script
    content: Create scripts/download-electron-builder-cache.sh to download binaries on personal Mac
    status: completed
  - id: setup-script
    content: Create scripts/setup-electron-builder-cache.sh to extract binaries on work Mac
    status: completed
  - id: update-gitignore
    content: Modify .gitignore to track .7z files but ignore extracted content
    status: completed
  - id: update-build-script
    content: Enhance scripts/build-win-portable.sh with cache validation
    status: completed
  - id: download-binaries
    content: Run download script on personal Mac to fetch winCodeSign and other binaries
    status: completed
  - id: test-setup
    content: Test the setup script locally to ensure proper extraction
    status: completed
  - id: update-docs
    content: Add cache setup instructions to CLAUDE.md and README
    status: completed
isProject: false
---

# Fix Windows Packaging Behind Corporate Firewall

## Problem Summary

Your work Mac cannot build Windows packages because `electron-builder` tries to download `winCodeSign-2.6.0.7z` (5.6 MB) from GitHub, but the corporate firewall returns **403 Forbidden**. Since you build daily, you need a reliable, automated solution.

## Root Cause

The error occurs because `electron-builder` uses a **Go binary** (`app-builder`) that doesn't respect Node.js SSL environment variables. The Go program tries to download Windows code signing tools even when signing is disabled.

## Recommended Solution: Local Cache Repository

Since you build daily and are on your personal laptop now, we'll create a local cache that can be easily set up on your work Mac.

### Architecture

```mermaid
flowchart LR
    PersonalMac[Personal Mac<br/>Download binaries] -->|Transfer via repo| WorkMac[Work Mac]
    WorkMac -->|Run setup script| Cache[~/.electron-builder-cache/]
    Cache -->|Symlink to| SystemCache[~/Library/Caches/<br/>electron-builder/]
    SystemCache -->|Used by| ElectronBuilder[electron-builder]
```



### Implementation Steps

**Step 1: Create Cache Directory Structure**

Create `.electron-builder-cache/` in the repo root (tracked in git) to store the downloaded binaries:

```
.electron-builder-cache/
├── winCodeSign-2.6.0.7z (5.6 MB - CRITICAL for Windows cross-compile)
├── nsis-3.0.4.1.7z (NSIS installer builder)
├── nsis-resources-3.4.1.7z (NSIS resources)
└── README.md (instructions)
```

**Step 2: Download Binaries on Personal Mac**

Create a script `[scripts/download-electron-builder-cache.sh](scripts/download-electron-builder-cache.sh)` that:

- Downloads all required electron-builder binaries from GitHub
- Stores them in `.electron-builder-cache/`
- Verifies checksums (optional but recommended)
- Can be run on personal laptop where GitHub is accessible

**Step 3: Setup Script for Work Mac**

Create `[scripts/setup-electron-builder-cache.sh](scripts/setup-electron-builder-cache.sh)` that:

- Extracts cached `.7z` files to `~/Library/Caches/electron-builder/`
- Creates proper directory structure electron-builder expects
- Runs once on work Mac after cloning/pulling repo
- Idempotent (safe to run multiple times)

**Step 4: Update .gitignore**

Modify `[.gitignore](.gitignore)` to:

- **Track** `.electron-builder-cache/*.7z` files (exception to general rule)
- **Ignore** `.electron-builder-cache/extracted/` (working directory)
- Add clear comments explaining why binaries are tracked

**Step 5: Update Build Scripts**

Modify `[scripts/build-win-portable.sh](scripts/build-win-portable.sh)` to:

- Check if cache exists, prompt to run setup script if missing
- Set `ELECTRON_BUILDER_CACHE` environment variable if using custom location
- Provide helpful error messages if binaries are missing

## Alternative Solutions (Documented for Context)

### Option A: Git LFS (Large File Storage)

- **Pros**: Designed for large binaries, doesn't bloat repo
- **Cons**: Requires Git LFS setup, may not work behind firewall
- **Use when**: You have Git LFS access and want cleaner repo

### Option B: SSL_CERT_FILE Environment Variable (Root Cause Fix)

Set environment variable to use Zscaler certificate:

```bash
# Find Zscaler cert
security find-certificate -a -p /Library/Keychains/System.keychain | grep -i zscaler

# Export Zscaler cert
# Open Keychain Access → System → Zscaler Root CA → Export → Save as zscaler.crt

# Add to ~/.zshrc on work Mac
export SSL_CERT_FILE=/path/to/zscaler.crt

# Or use combined bundle (system CAs + Zscaler)
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > ~/combined-ca-bundle.crt
cat /path/to/zscaler.crt >> ~/combined-ca-bundle.crt
export SSL_CERT_FILE=~/combined-ca-bundle.crt
```

- **Pros**: Fixes root cause, works for all Go tools
- **Cons**: Requires finding/exporting Zscaler cert, may be blocked by IT
- **Use when**: You have access to Zscaler certificate and IT allows SSL configuration

### Option C: Build on Different Network

- Build on personal Mac or via CI/CD
- Transfer packages to work Mac
- **Use when**: Infrequent builds or CI/CD available

## Key Files to Create/Modify

1. **New Files**:
  - `.electron-builder-cache/README.md` - Instructions for cache usage
  - `scripts/download-electron-builder-cache.sh` - Download script (run on personal Mac)
  - `scripts/setup-electron-builder-cache.sh` - Setup script (run on work Mac)
2. **Modified Files**:
  - `.gitignore` - Add exception for `.electron-builder-cache/*.7z`
  - `scripts/build-win-portable.sh` - Check cache before building
  - `README.md` or `CLAUDE.md` - Document the cache setup process

## Workflow After Implementation

### On Personal Mac (one-time or when binaries update)

```bash
# Download latest binaries
./scripts/download-electron-builder-cache.sh

# Commit to repo
git add .electron-builder-cache/
git commit -m "chore: update electron-builder cache binaries"
git push
```

### On Work Mac (one-time setup)

```bash
# Pull latest code with cached binaries
git pull

# Extract binaries to system cache
./scripts/setup-electron-builder-cache.sh

# Build Windows package (now works!)
pnpm pkg:win
```

### Daily Builds on Work Mac

```bash
# Just build normally - cache already set up
pnpm pkg:win
```

## Success Criteria

- ✅ Windows packaging works on work Mac without 403 errors
- ✅ Setup is automated (one script to run on work Mac)
- ✅ Daily builds require no manual intervention
- ✅ Solution works offline once cache is set up
- ✅ Repo size increase is acceptable (~6-10 MB for compressed archives)

## Trade-offs


| Aspect            | Impact                                                    |
| ----------------- | --------------------------------------------------------- |
| **Repo Size**     | +6-10 MB for compressed `.7z` files                       |
| **Setup Time**    | ~2 minutes one-time setup on work Mac                     |
| **Maintenance**   | Low - binaries rarely change (last update 2020)           |
| **Network Usage** | One-time download on personal Mac, no network on work Mac |
| **CI/CD Impact**  | May need to run setup script in CI if building there      |


## Why This Approach

1. **Reliability**: Works offline, no dependency on corporate network
2. **Simplicity**: Two scripts, automatic setup
3. **Speed**: Daily builds have no overhead after initial setup
4. **Maintainability**: Clear separation of cache management
5. **Team-Friendly**: Other developers can use same cache
6. **No IT Dependency**: Doesn't require Zscaler cert access or IT approval

