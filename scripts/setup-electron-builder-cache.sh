#!/bin/bash
#
# Setup Electron Builder Cache
# Run this on your work Mac AFTER pulling the repo with cached binaries
#
# This script extracts the pre-downloaded electron-builder binaries from
# .electron-builder-cache/ to ~/Library/Caches/electron-builder/ where
# electron-builder expects to find them.
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
SOURCE_CACHE="$PROJECT_ROOT/.electron-builder-cache"
DEST_CACHE="$HOME/Library/Caches/electron-builder"
NSIS_VERSION="3.0.4.1"
NSIS_RESOURCES_VERSION="3.4.1"
WIN_CODESIGN_VERSION="2.6.0"

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
    echo -e "${BLUE}║${NC}       Setup Electron Builder Cache                    ${BLUE}║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check for 7z or p7zip
    if ! command -v 7z &> /dev/null && ! command -v 7za &> /dev/null; then
        log_error "7-Zip is not installed!"
        log_error "Install with: brew install p7zip"
        exit 1
    fi
    
    # Determine which 7z command to use
    if command -v 7z &> /dev/null; then
        SEVEN_ZIP_CMD="7z"
    else
        SEVEN_ZIP_CMD="7za"
    fi
    
    log_success "Found 7-Zip: $SEVEN_ZIP_CMD"
}

# Check if cached binaries exist
check_cached_binaries() {
    log_info "Checking for cached binaries..."
    
    if [[ ! -d "$SOURCE_CACHE" ]]; then
        log_error "Cache directory not found: $SOURCE_CACHE"
        log_error "Please run ./scripts/download-electron-builder-cache.sh on a network without firewall first."
        exit 1
    fi
    
    local missing=0
    
    if [[ ! -f "$SOURCE_CACHE/nsis-3.0.4.1.7z" ]]; then
        log_warn "Missing: nsis-3.0.4.1.7z"
        missing=$((missing + 1))
    fi
    
    if [[ ! -f "$SOURCE_CACHE/nsis-resources-3.4.1.7z" ]]; then
        log_warn "Missing: nsis-resources-3.4.1.7z"
        missing=$((missing + 1))
    fi
    
    if [[ ! -f "$SOURCE_CACHE/winCodeSign-2.6.0.7z" ]]; then
        log_error "Missing: winCodeSign-2.6.0.7z (CRITICAL!)"
        missing=$((missing + 1))
    fi
    
    if [[ $missing -gt 0 ]]; then
        log_error "Missing $missing required binary files!"
        log_error "Please run ./scripts/download-electron-builder-cache.sh on a network without firewall."
        exit 1
    fi
    
    log_success "All required binaries found"
}

# Extract a 7z archive
extract_archive() {
    local archive="$1"
    local dest_dir="$2"
    local name="$3"
    
    log_info "Extracting $name..."
    log_info "  From: $archive"
    log_info "  To: $dest_dir"
    
    # Create destination directory
    mkdir -p "$dest_dir"
    
    # Extract with 7z (quiet mode, yes to overwrite)
    if $SEVEN_ZIP_CMD x "$archive" -o"$dest_dir" -y > /dev/null 2>&1; then
        log_success "$name extracted successfully"
        return 0
    else
        log_error "Failed to extract $name"
        return 1
    fi
}

# Extract archive into an explicit versioned directory expected by electron-builder.
# Some 7z archives contain files at root, so we always extract into a temp dir first
# then move contents under a deterministic version folder.
extract_to_versioned_dir() {
    local archive="$1"
    local parent_dir="$2"
    local version_dir_name="$3"
    local marker_path="$4"
    local name="$5"
    local version_dir="$parent_dir/$version_dir_name"
    local temp_dir

    # Already extracted in expected layout
    if [[ -e "$marker_path" ]]; then
        log_info "$name already set up, skipping"
        return 0
    fi

    temp_dir="$(mktemp -d)"
    mkdir -p "$parent_dir"

    log_info "Extracting $name..."
    log_info "  From: $archive"
    log_info "  To: $version_dir"

    if ! $SEVEN_ZIP_CMD x "$archive" -o"$temp_dir" -y > /dev/null 2>&1; then
        rm -rf "$temp_dir"
        log_error "Failed to extract $name"
        return 1
    fi

    rm -rf "$version_dir"
    mkdir -p "$version_dir"

    # Move extracted contents into deterministic version directory.
    if ! mv "$temp_dir"/* "$version_dir"/ 2>/dev/null; then
        # If glob fails (unlikely), keep directory and continue to marker check.
        true
    fi

    rm -rf "$temp_dir"

    if [[ -e "$marker_path" ]]; then
        log_success "$name extracted successfully"
        return 0
    fi

    log_error "$name extracted but marker not found: $marker_path"
    return 1
}

# Keep source .7z archives in cache paths as fallback for app-builder lookup.
copy_archive_to_cache() {
    local source_archive="$1"
    local target_archive="$2"
    mkdir -p "$(dirname "$target_archive")"
    cp -f "$source_archive" "$target_archive"
}

# Setup NSIS cache
setup_nsis() {
    local archive="$SOURCE_CACHE/nsis-3.0.4.1.7z"
    local dest="$DEST_CACHE/nsis"
    local version_dir="nsis-$NSIS_VERSION"
    local marker="$dest/$version_dir/Bin/makensis.exe"

    copy_archive_to_cache "$archive" "$dest/$version_dir.7z"
    extract_to_versioned_dir "$archive" "$dest" "$version_dir" "$marker" "NSIS"
}

# Setup NSIS Resources cache
setup_nsis_resources() {
    local archive="$SOURCE_CACHE/nsis-resources-3.4.1.7z"
    local dest="$DEST_CACHE/nsis-resources"
    local version_dir="nsis-resources-$NSIS_RESOURCES_VERSION"
    local marker="$dest/$version_dir/plugins"

    copy_archive_to_cache "$archive" "$dest/$version_dir.7z"
    extract_to_versioned_dir "$archive" "$dest" "$version_dir" "$marker" "NSIS Resources"

    # Backward-compatible flat layout for tooling that reads old path.
    if [[ ! -d "$dest/plugins" && -d "$dest/$version_dir/plugins" ]]; then
        cp -R "$dest/$version_dir/plugins" "$dest/plugins"
    fi
}

# Setup WinCodeSign cache
setup_wincodesign() {
    local archive="$SOURCE_CACHE/winCodeSign-2.6.0.7z"
    local dest="$DEST_CACHE/winCodeSign"
    local version_dir="winCodeSign-$WIN_CODESIGN_VERSION"
    local marker="$dest/$version_dir/rcedit-x64.exe"

    copy_archive_to_cache "$archive" "$dest/$version_dir.7z"
    extract_to_versioned_dir "$archive" "$dest" "$version_dir" "$marker" "WinCodeSign (CRITICAL)"
}

# Verify setup
verify_setup() {
    log_info "Verifying setup..."
    
    local all_good=true
    
    # Check NSIS
    if [[ -f "$DEST_CACHE/nsis/nsis-$NSIS_VERSION/Bin/makensis.exe" ]]; then
        log_success "NSIS cache verified"
    else
        log_error "NSIS cache not found!"
        all_good=false
    fi
    
    # Check NSIS Resources
    if [[ -d "$DEST_CACHE/nsis-resources/nsis-resources-$NSIS_RESOURCES_VERSION/plugins" || -d "$DEST_CACHE/nsis-resources/plugins" ]]; then
        log_success "NSIS Resources cache verified"
    else
        log_error "NSIS Resources cache not found!"
        all_good=false
    fi
    
    # Check WinCodeSign
    if [[ -f "$DEST_CACHE/winCodeSign/winCodeSign-$WIN_CODESIGN_VERSION/rcedit-x64.exe" ]]; then
        log_success "WinCodeSign cache verified"
    else
        log_error "WinCodeSign cache not found!"
        all_good=false
    fi
    
    if [[ "$all_good" == true ]]; then
        return 0
    else
        return 1
    fi
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}              Setup Complete!                           ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Electron-builder cache is now set up at:"
    echo "  $DEST_CACHE"
    echo ""
    echo "You can now build Windows packages:"
    echo "  pnpm pkg:win"
    echo ""
    echo "This setup persists until you clear the cache."
    echo "You only need to run this script once (or after cache cleanup)."
    echo ""
}

# Main execution
main() {
    print_banner
    
    # Check dependencies
    check_dependencies
    
    # Check if cached binaries exist
    check_cached_binaries
    
    # Create destination cache directory
    mkdir -p "$DEST_CACHE"
    
    # Setup each component
    log_info "Setting up electron-builder cache..."
    echo ""
    
    setup_nsis
    setup_nsis_resources
    setup_wincodesign
    
    echo ""
    
    # Verify everything is set up correctly
    if verify_setup; then
        print_summary
        exit 0
    else
        log_error "Setup verification failed!"
        exit 1
    fi
}

# Run main
main
