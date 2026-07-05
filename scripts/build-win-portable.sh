#!/bin/bash
#
# Build Windows Portable Package
# Creates win-unpacked directory and zips it into ${PORTABLE_NAME}
#

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$PROJECT_ROOT/packages/desktop"
RELEASE_DIR="$DESKTOP_DIR/release"
VERSION=$(node -p "require('./packages/desktop/package.json').version" 2>/dev/null || echo "0.0.1")
PORTABLE_NAME="Promptwright-${VERSION}-win-x64-portable.zip"
COPILOT_WIN_BIN_REL="resources/app.asar.unpacked/node_modules/@github/copilot-win32-x64/copilot.exe"
PLAYWRIGHT_CLI_REL="resources/app.asar.unpacked/node_modules/@playwright/cli/playwright-cli.js"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "\033[1;33m[WARN]\033[0m $1"
}

# Check if electron-builder cache is set up
check_cache() {
    local CACHE_DIR="$HOME/Library/Caches/electron-builder"
    local CRITICAL_MISSING=false
    
    # Check for WinCodeSign (CRITICAL for Windows builds)
    if [[ ! -f "$CACHE_DIR/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe" ]]; then
        log_warn "WinCodeSign cache not found (CRITICAL for Windows builds)"
        CRITICAL_MISSING=true
    fi
    
    # Check for NSIS
    if [[ ! -f "$CACHE_DIR/nsis/nsis-3.0.4.1/Bin/makensis.exe" ]]; then
        log_warn "NSIS cache not found"
        CRITICAL_MISSING=true
    fi
    
    # If critical components are missing, provide instructions
    if [[ "$CRITICAL_MISSING" == true ]]; then
        echo ""
        log_error "electron-builder cache is not set up!"
        echo ""
        echo "This is likely because you're on a corporate network with firewall restrictions."
        echo ""
        echo "To fix this, run the setup script:"
        echo "  ${GREEN}./scripts/setup-electron-builder-cache.sh${NC}"
        echo ""
        echo "If the cached binaries are missing, download them first on a network without firewall:"
        echo "  ${GREEN}./scripts/download-electron-builder-cache.sh${NC}"
        echo ""
        echo "See .electron-builder-cache/README.md for more details."
        echo ""
        
        # Ask if user wants to continue anyway
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Build cancelled"
            exit 1
        fi
    fi
}

log_info "Building Windows portable package..."

# Check cache before building
check_cache

# Force electron-builder to use the canonical cache path.
export ELECTRON_BUILDER_CACHE="$HOME/Library/Caches/electron-builder"

# Navigate to desktop package
cd "$DESKTOP_DIR"

# Build Windows unpacked directory
log_info "Running electron-builder for Windows (unpacked)..."
if npx electron-builder --win --x64 --dir --publish never; then
    log_success "Windows build completed"
else
    log_error "Windows build failed"
    exit 1
fi

# Check if win-unpacked was created
if [[ ! -d "$RELEASE_DIR/win-unpacked" ]]; then
    log_error "win-unpacked directory not found at: $RELEASE_DIR/win-unpacked"
    exit 1
fi

log_info "win-unpacked directory created successfully"

COPILOT_WIN_BIN="$RELEASE_DIR/win-unpacked/$COPILOT_WIN_BIN_REL"
if [[ ! -f "$COPILOT_WIN_BIN" ]]; then
    log_error "Missing required Copilot native binary: $COPILOT_WIN_BIN_REL"
    log_error "Build artifact is incomplete and may fail on Windows startup."
    exit 1
fi
log_info "Verified Copilot native binary: $COPILOT_WIN_BIN_REL"

PLAYWRIGHT_CLI_PATH="$RELEASE_DIR/win-unpacked/$PLAYWRIGHT_CLI_REL"
if [[ ! -f "$PLAYWRIGHT_CLI_PATH" ]]; then
    log_error "Missing required Playwright CLI entry: $PLAYWRIGHT_CLI_REL"
    log_error "CLI automation mode may fail in packaged Windows builds."
    exit 1
fi
log_info "Verified Playwright CLI entry: $PLAYWRIGHT_CLI_REL"

# Navigate to release directory
cd "$RELEASE_DIR"

# Remove old portable zip if it exists
if [[ -f "${PORTABLE_NAME}" ]]; then
    log_info "Removing old portable zip..."
    rm "${PORTABLE_NAME}"
fi

# Create portable zip
log_info "Creating portable zip archive..."
if zip -r -q ${PORTABLE_NAME} win-unpacked/; then
    log_success "Portable zip created: ${PORTABLE_NAME}"
    
    # Get file size
    SIZE=$(du -h "${PORTABLE_NAME}" | cut -f1)
    log_info "File size: $SIZE"
else
    log_error "Failed to create portable zip"
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}           Windows Portable Build Complete!            ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "Output location: $RELEASE_DIR/"
echo "  - win-unpacked/ (unpacked directory)"
echo "  - ${PORTABLE_NAME} ($SIZE)"
echo ""
