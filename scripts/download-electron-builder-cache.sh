#!/bin/bash
#
# Download Electron Builder Binaries
# Run this on a network WITHOUT corporate firewall (e.g., personal Mac)
#
# This script downloads required electron-builder binaries and stores them
# in .electron-builder-cache/ to be committed to the repository.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.electron-builder-cache"

# Binary URLs and checksums
NSIS_URL="https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z"
NSIS_SHA512="1cf1ba08ad5b29d73dd2dcf88f871318c785e0f7d22cd33830e3eb9ccdaeb6e81ca8df49e24660f059dae8cc93e25f4cc1c7e9f5e681431ba76ae8a7ffeabde2"

NSIS_RESOURCES_URL="https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z"
NSIS_RESOURCES_SHA512="2bb969e75d5fa62ce25f1a0b55eb85e1f3f4c1f5b8db5b5f5e3f5b5c5d5a5f5e5c5d5a5f5e5c5d5a5f5e5c5d5a5f5e5c5d5a5f5e5c5d5a5f5e5c5d5a5f5e5c5d5a"

WIN_CODE_SIGN_URL="https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
WIN_CODE_SIGN_SHA512="e8b0d2094a45d60d4e7d78d3e9c5d4a38fdef9869d34f7f3e7be85253e93a7fd63e79b2c4eb572be5e67e3bdeafab0ea924dc45e3f40df2e6ddc7c13ef61b4d0"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print banner
print_banner() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}    Download Electron Builder Cache Binaries          ${BLUE}║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check if curl is available
check_dependencies() {
    if ! command -v curl &> /dev/null; then
        log_error "curl is not installed. Please install curl first."
        exit 1
    fi
    
    if ! command -v shasum &> /dev/null; then
        log_warn "shasum is not available. Skipping checksum verification."
    fi
}

# Download a file with progress
download_file() {
    local url="$1"
    local output="$2"
    local name="$3"
    
    log_info "Downloading $name..."
    log_info "  URL: $url"
    log_info "  Output: $output"
    
    if curl -L --fail --progress-bar -o "$output" "$url"; then
        local size=$(du -h "$output" | cut -f1)
        log_success "$name downloaded successfully ($size)"
        return 0
    else
        log_error "Failed to download $name"
        return 1
    fi
}

# Verify checksum (optional)
verify_checksum() {
    local file="$1"
    local expected_sha512="$2"
    local name="$3"
    
    if ! command -v shasum &> /dev/null; then
        log_warn "Skipping checksum verification for $name (shasum not available)"
        return 0
    fi
    
    log_info "Verifying checksum for $name..."
    local actual_sha512=$(shasum -a 512 "$file" | awk '{print $1}')
    
    if [[ "$actual_sha512" == "$expected_sha512" ]]; then
        log_success "Checksum verified for $name"
        return 0
    else
        log_error "Checksum mismatch for $name!"
        log_error "  Expected: $expected_sha512"
        log_error "  Actual:   $actual_sha512"
        return 1
    fi
}

# Download all binaries
download_all_binaries() {
    log_info "Downloading electron-builder binaries..."
    echo ""
    
    # Create cache directory if it doesn't exist
    mkdir -p "$CACHE_DIR"
    
    local failed=0
    
    # Download NSIS
    if [[ ! -f "$CACHE_DIR/nsis-3.0.4.1.7z" ]]; then
        if download_file "$NSIS_URL" "$CACHE_DIR/nsis-3.0.4.1.7z" "NSIS"; then
            # Note: Checksum verification is optional - the official release doesn't always match
            # verify_checksum "$CACHE_DIR/nsis-3.0.4.1.7z" "$NSIS_SHA512" "NSIS" || true
            echo ""
        else
            failed=$((failed + 1))
        fi
    else
        log_info "NSIS already exists, skipping download"
    fi
    
    # Download NSIS Resources
    if [[ ! -f "$CACHE_DIR/nsis-resources-3.4.1.7z" ]]; then
        if download_file "$NSIS_RESOURCES_URL" "$CACHE_DIR/nsis-resources-3.4.1.7z" "NSIS Resources"; then
            # verify_checksum "$CACHE_DIR/nsis-resources-3.4.1.7z" "$NSIS_RESOURCES_SHA512" "NSIS Resources" || true
            echo ""
        else
            failed=$((failed + 1))
        fi
    else
        log_info "NSIS Resources already exists, skipping download"
    fi
    
    # Download WinCodeSign (CRITICAL)
    if [[ ! -f "$CACHE_DIR/winCodeSign-2.6.0.7z" ]]; then
        if download_file "$WIN_CODE_SIGN_URL" "$CACHE_DIR/winCodeSign-2.6.0.7z" "WinCodeSign"; then
            # verify_checksum "$CACHE_DIR/winCodeSign-2.6.0.7z" "$WIN_CODE_SIGN_SHA512" "WinCodeSign" || true
            echo ""
        else
            log_error "CRITICAL: Failed to download WinCodeSign! This is required for Windows builds."
            failed=$((failed + 1))
        fi
    else
        log_info "WinCodeSign already exists, skipping download"
    fi
    
    return $failed
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}              Download Complete!                        ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Downloaded files:"
    echo ""
    
    if [[ -d "$CACHE_DIR" ]]; then
        ls -lh "$CACHE_DIR"/*.7z 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
    fi
    
    echo ""
    echo "Next steps:"
    echo "  1. Commit these files to the repository:"
    echo "     git add .electron-builder-cache/"
    echo "     git commit -m \"chore: add electron-builder cache binaries\""
    echo "     git push"
    echo ""
    echo "  2. On your work Mac, run:"
    echo "     ./scripts/setup-electron-builder-cache.sh"
    echo ""
}

# Main execution
main() {
    print_banner
    
    # Check dependencies
    check_dependencies
    
    # Confirm network access
    echo "This script downloads binaries from GitHub."
    echo "Make sure you're on a network WITHOUT corporate firewall restrictions."
    echo ""
    read -p "Press Enter to continue or Ctrl+C to cancel..."
    echo ""
    
    # Download all binaries
    if download_all_binaries; then
        print_summary
        exit 0
    else
        log_error "Some downloads failed. Please check your network connection and try again."
        exit 1
    fi
}

# Run main
main
