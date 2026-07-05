#!/bin/bash
#
# Promptwright Build Script
# Automates packaging for Windows and Mac with Zscaler proxy support
#
# Usage: ./scripts/build-packages.sh [options]
#   --zscaler-cert <path>   Path to Zscaler certificate (optional)
#   --skip-windows          Skip Windows build
#   --skip-mac              Skip macOS build
#   --mac-zip-only          Use ZIP instead of DMG for macOS (avoids hdiutil issues)
#   --clean                 Clean cache and rebuild
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$PROJECT_ROOT/packages/desktop"
CACHE_DIR="$HOME/Library/Caches/electron-builder"
COMBINED_CA_BUNDLE="$HOME/.jarvis-combined-ca-bundle.crt"

# Electron Builder binary URLs
NSIS_URL="https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z"
NSIS_RESOURCES_URL="https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z"
WIN_CODE_SIGN_URL="https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
WINE_URL="https://github.com/electron-userland/electron-builder-binaries/releases/download/wine-4.0.1-mac/wine-4.0.1-mac.7z"

# Default options
ZSCALER_CERT=""
SKIP_WINDOWS=false
SKIP_MAC=false
MAC_ZIP_ONLY=false
CLEAN_CACHE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --zscaler-cert)
            ZSCALER_CERT="$2"
            shift 2
            ;;
        --skip-windows)
            SKIP_WINDOWS=true
            shift
            ;;
        --skip-mac)
            SKIP_MAC=true
            shift
            ;;
        --mac-zip-only)
            MAC_ZIP_ONLY=true
            shift
            ;;
        --clean)
            CLEAN_CACHE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --zscaler-cert <path>   Path to Zscaler certificate"
            echo "  --skip-windows          Skip Windows build"
            echo "  --skip-mac              Skip macOS build"
            echo "  --mac-zip-only          Use ZIP instead of DMG (avoids hdiutil issues)"
            echo "  --clean                 Clean cache before build"
            echo "  -h, --help              Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

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

# Detect and configure proxy
detect_proxy() {
    # Check if proxy is already set
    if [[ -n "$HTTPS_PROXY" || -n "$https_proxy" ]]; then
        log_info "Proxy detected: ${HTTPS_PROXY:-$https_proxy}"
        return 0
    fi
    
    # Try to detect proxy from system preferences (macOS)
    local proxy_host proxy_port
    proxy_host=$(networksetup -getwebproxy "Wi-Fi" 2>/dev/null | grep "Server:" | awk '{print $2}')
    proxy_port=$(networksetup -getwebproxy "Wi-Fi" 2>/dev/null | grep "Port:" | awk '{print $2}')
    
    if [[ -n "$proxy_host" && "$proxy_host" != "(null)" && -n "$proxy_port" ]]; then
        log_info "Detected system proxy: $proxy_host:$proxy_port"
        export HTTPS_PROXY="http://$proxy_host:$proxy_port"
        export HTTP_PROXY="http://$proxy_host:$proxy_port"
    fi
}

# Print banner
print_banner() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}           Promptwright Build Script                      ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}     Packaging for Windows & macOS                     ${BLUE}║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Create combined CA bundle with system CAs + Zscaler
create_combined_ca_bundle() {
    local zscaler_cert="$1"
    
    log_info "Creating combined CA bundle..."
    
    # Start with system root CAs
    if security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > "$COMBINED_CA_BUNDLE" 2>/dev/null; then
        log_info "Added system root certificates"
    fi
    
    # Add System keychain CAs (includes corporate certs)
    if security find-certificate -a -p /Library/Keychains/System.keychain >> "$COMBINED_CA_BUNDLE" 2>/dev/null; then
        log_info "Added System keychain certificates"
    fi
    
    # Add user keychain CAs
    if security find-certificate -a -p ~/Library/Keychains/login.keychain-db >> "$COMBINED_CA_BUNDLE" 2>/dev/null; then
        log_info "Added user keychain certificates"
    fi
    
    # Append Zscaler cert if provided
    if [[ -n "$zscaler_cert" && -f "$zscaler_cert" ]]; then
        cat "$zscaler_cert" >> "$COMBINED_CA_BUNDLE"
        log_info "Added Zscaler certificate: $zscaler_cert"
    fi
    
    log_success "Combined CA bundle created at: $COMBINED_CA_BUNDLE"
}

# Detect and configure Zscaler certificate
configure_zscaler() {
    log_info "Configuring SSL certificates..."

    # Try common Zscaler certificate locations
    COMMON_LOCATIONS=(
        "$HOME/zscaler.crt"
        "$HOME/Desktop/zscaler.crt"
        "$HOME/Desktop/work/zscaler/zscaler.crt"
        "/etc/ssl/certs/zscaler.crt"
    )

    # Use provided cert or find one
    if [[ -z "$ZSCALER_CERT" ]]; then
        for loc in "${COMMON_LOCATIONS[@]}"; do
            if [[ -f "$loc" ]]; then
                log_info "Found Zscaler certificate at: $loc"
                ZSCALER_CERT="$loc"
                break
            fi
        done
    fi

    # Create combined CA bundle
    create_combined_ca_bundle "$ZSCALER_CERT"
    
    # Export for Go programs (app-builder)
    export SSL_CERT_FILE="$COMBINED_CA_BUNDLE"
    
    # Export for Node.js
    export NODE_EXTRA_CA_CERTS="$COMBINED_CA_BUNDLE"
    
    log_info "SSL_CERT_FILE=$SSL_CERT_FILE"
    log_info "NODE_EXTRA_CA_CERTS=$NODE_EXTRA_CA_CERTS"
}

# Clean electron-builder cache
clean_cache() {
    log_info "Cleaning electron-builder cache..."
    rm -rf "$CACHE_DIR/nsis"
    rm -rf "$CACHE_DIR/nsis-resources"
    rm -rf "$CACHE_DIR/winCodeSign"
    rm -rf "$CACHE_DIR/wine"
    log_success "Cache cleaned"
}

# Download file with retry and fallback
download_file() {
    local url="$1"
    local output="$2"
    local name="$3"
    local curl_error
    local exit_code
    
    log_info "Downloading $name from: $url"
    
    # Common curl options: progress bar, 5-min timeout, 30s connection timeout
    local CURL_OPTS="--progress-bar --max-time 300 --connect-timeout 30"
    
    # Try with combined CA bundle first
    curl -L --fail $CURL_OPTS --cacert "$COMBINED_CA_BUNDLE" -o "$output" "$url"
    exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        log_success "$name downloaded"
        return 0
    fi
    log_warn "Attempt 1 failed (exit code: $exit_code)"
    
    # Fallback: Try with just Zscaler cert
    if [[ -n "$ZSCALER_CERT" && -f "$ZSCALER_CERT" ]]; then
        curl -L --fail $CURL_OPTS --cacert "$ZSCALER_CERT" -o "$output" "$url"
        exit_code=$?
        if [[ $exit_code -eq 0 ]]; then
            log_success "$name downloaded (with Zscaler cert)"
            return 0
        fi
        log_warn "Attempt 2 (Zscaler cert) failed (exit code: $exit_code)"
    fi
    
    # Fallback: Try with system defaults
    curl -L --fail $CURL_OPTS -o "$output" "$url"
    exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        log_success "$name downloaded (system SSL)"
        return 0
    fi
    log_warn "Attempt 3 (system SSL) failed (exit code: $exit_code)"
    
    # Last resort: Try with --insecure (not ideal but gets the job done)
    log_warn "SSL verification failed, trying insecure download for $name..."
    curl -L --fail $CURL_OPTS --insecure -o "$output" "$url"
    exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        log_success "$name downloaded (insecure)"
        return 0
    fi
    
    log_error "Failed to download $name (all attempts failed, last exit code: $exit_code)"
    log_warn "You may need to download this file manually from:"
    log_warn "  $url"
    log_warn "And place it at: $output"
    rm -f "$output"  # Remove potentially incomplete file
    return 1
}

# Pre-download electron-builder binaries
predownload_binaries() {
    log_info "Pre-downloading electron-builder binaries..."

    # Create cache directories
    mkdir -p "$CACHE_DIR/nsis"
    mkdir -p "$CACHE_DIR/nsis-resources"
    mkdir -p "$CACHE_DIR/winCodeSign"
    mkdir -p "$CACHE_DIR/wine"

    # Download NSIS
    if [[ ! -f "$CACHE_DIR/nsis/nsis-3.0.4.1.7z" ]]; then
        download_file "$NSIS_URL" "$CACHE_DIR/nsis/nsis-3.0.4.1.7z" "NSIS"
    else
        log_info "NSIS already cached"
    fi

    # Download NSIS Resources
    if [[ ! -f "$CACHE_DIR/nsis-resources/nsis-resources-3.4.1.7z" ]]; then
        download_file "$NSIS_RESOURCES_URL" "$CACHE_DIR/nsis-resources/nsis-resources-3.4.1.7z" "NSIS Resources"
    else
        log_info "NSIS Resources already cached"
    fi

    # Download WinCodeSign
    if [[ ! -f "$CACHE_DIR/winCodeSign/winCodeSign-2.6.0.7z" ]]; then
        download_file "$WIN_CODE_SIGN_URL" "$CACHE_DIR/winCodeSign/winCodeSign-2.6.0.7z" "WinCodeSign"
    else
        log_info "WinCodeSign already cached"
    fi

    # Download Wine (for Windows cross-compile on Mac)
    if [[ ! -f "$CACHE_DIR/wine/wine-4.0.1-mac.7z" ]]; then
        download_file "$WINE_URL" "$CACHE_DIR/wine/wine-4.0.1-mac.7z" "Wine"
    else
        log_info "Wine already cached"
    fi
}

# Build the project
build_project() {
    log_info "Building project..."
    cd "$PROJECT_ROOT"
    pnpm build
    log_success "Project built successfully"
}

# Package for Windows
build_windows() {
    if [[ "$SKIP_WINDOWS" == true ]]; then
        log_info "Skipping Windows build (--skip-windows)"
        return 0
    fi

    log_info "Packaging for Windows..."
    cd "$DESKTOP_DIR"
    
    set +e  # Don't exit on error for this section
    if npx electron-builder --win nsis --x64 --publish never; then
        log_success "Windows package created successfully!"
        log_info "Output: $DESKTOP_DIR/release/Promptwright-Setup-*.exe"
    else
        log_error "Windows packaging failed"
        log_warn "Try running with --clean flag or manually download binaries"
        log_warn "See specs/PACKAGING.md for Zscaler troubleshooting"
    fi
    set -e
}

# Package for macOS
build_mac() {
    if [[ "$SKIP_MAC" == true ]]; then
        log_info "Skipping macOS build (--skip-mac)"
        return 0
    fi

    log_info "Packaging for macOS..."
    cd "$DESKTOP_DIR"
    
    set +e  # Don't exit on error for this section
    
    if [[ "$MAC_ZIP_ONLY" == true ]]; then
        # ZIP only - avoids hdiutil issues on corporate Macs
        log_info "Building ZIP only (--mac-zip-only)"
        if npx electron-builder --mac zip --publish never; then
            log_success "macOS ZIP package created successfully!"
            log_info "Output: $DESKTOP_DIR/release/Promptwright-*.zip"
        else
            log_error "macOS packaging failed"
        fi
    else
        # Try DMG first, fallback to ZIP if hdiutil fails
        if npx electron-builder --mac --publish never; then
            log_success "macOS package created successfully!"
            log_info "Output: $DESKTOP_DIR/release/Promptwright-*.dmg"
        else
            log_warn "DMG creation failed (likely hdiutil issue on corporate Mac)"
            log_info "Retrying with ZIP format..."
            
            if npx electron-builder --mac zip --publish never; then
                log_success "macOS ZIP package created successfully!"
                log_info "Output: $DESKTOP_DIR/release/Promptwright-*.zip"
            else
                log_error "macOS packaging failed completely"
            fi
        fi
    fi
    
    set -e
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                    BUILD COMPLETE                      ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Build artifacts location: $DESKTOP_DIR/release/"
    echo ""
    
    if [[ -d "$DESKTOP_DIR/release" ]]; then
        echo "Generated files:"
        ls -lh "$DESKTOP_DIR/release/" 2>/dev/null | grep -E "\.(exe|dmg|zip)$" | awk '{print "  " $9 " (" $5 ")"}'
    fi
    echo ""
}

# Main execution
main() {
    print_banner

    # Detect proxy settings
    detect_proxy

    # Configure SSL for Zscaler
    configure_zscaler

    # Clean cache if requested
    if [[ "$CLEAN_CACHE" == true ]]; then
        clean_cache
    fi

    # Pre-download binaries
    predownload_binaries

    # Build project
    build_project

    # Package for each platform
    build_mac
    build_windows

    # Print summary
    print_summary
}

# Run main
main
