#!/bin/bash
# ============================================================================
# Package Chunker - Split packaged builds into chunks for GitHub
# ============================================================================
# Automatically splits Mac and Windows packaged builds into chunks
# and generates metadata for reassembly.
#
# Usage:
#   ./chunk-packages.sh [chunk_size_mb]
#
# Default chunk size: 19MB (stays under GitHub's 20MB limit)
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$PROJECT_ROOT/packages/desktop/release"
BINARIES_DIR="$PROJECT_ROOT/binaries"
CHUNK_SIZE_MB="${1:-19}"  # Default 19MB
CHUNK_SIZE_BYTES=$((CHUNK_SIZE_MB * 1024 * 1024))

# Package files to chunk
MAC_PACKAGE="Promptwright-1.0.0-arm64-mac.zip"
WIN_PACKAGE="Promptwright-1.0.0-win-x64-portable.zip"

# Output directories
MAC_CHUNKS_DIR="$BINARIES_DIR/mac-jarvis-app-chunks"
WIN_CHUNKS_DIR="$BINARIES_DIR/win-jarvis-app-chunks"

# Logging functions
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

log_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo ""
}

# Get file size in bytes (cross-platform)
get_file_size() {
    local file="$1"
    stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null
}

# Get MD5 checksum (cross-platform)
get_md5() {
    local file="$1"
    md5 -q "$file" 2>/dev/null || md5sum "$file" | awk '{print $1}'
}

# Format bytes to human readable
format_bytes() {
    local bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        echo "$(( bytes / 1024 ))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$(( bytes / 1048576 ))MB"
    else
        echo "$(( bytes / 1073741824 ))GB"
    fi
}

# Split a package file into chunks
split_package() {
    local package_file="$1"
    local output_dir="$2"
    local platform_name="$3"
    
    log_header "Chunking $platform_name Package"
    
    # Check if package exists
    if [[ ! -f "$package_file" ]]; then
        log_error "Package not found: $package_file"
        log_warn "Run 'pnpm pkg:all' or 'pnpm pkg:$platform_name' first to create packages"
        return 1
    fi
    
    local filename=$(basename "$package_file")
    local filesize=$(get_file_size "$package_file")
    local checksum=$(get_md5 "$package_file")
    local chunk_count=$(( (filesize + CHUNK_SIZE_BYTES - 1) / CHUNK_SIZE_BYTES ))
    
    log_info "Package: $filename"
    log_info "Size: $(format_bytes $filesize)"
    log_info "MD5: $checksum"
    log_info "Will create $chunk_count chunks (${CHUNK_SIZE_MB}MB each)"
    echo ""
    
    # Delete existing chunks
    if [[ -d "$output_dir" ]]; then
        log_info "Cleaning existing chunks in $(basename "$output_dir")..."
        rm -rf "$output_dir"
    fi
    
    # Create output directory
    mkdir -p "$output_dir"
    log_success "Created output directory: $output_dir"
    
    # Split file into chunks
    log_info "Splitting into chunks..."
    cd "$output_dir"
    split -b ${CHUNK_SIZE_BYTES} "$package_file" "${filename}.part"
    
    # Rename chunks with proper numbering
    local counter=1
    for chunk in ${filename}.part*; do
        if [[ -f "$chunk" ]]; then
            local new_name=$(printf "${filename}.part%02x" $((counter - 1)))
            mv "$chunk" "$new_name"
            log_info "Created: $new_name ($(format_bytes $(get_file_size "$new_name")))"
            ((counter++))
        fi
    done
    
    # Create manifest file
    local manifest_file="${filename}.manifest"
    log_info "Creating manifest: $manifest_file"
    cat > "$manifest_file" << EOF
# Package Manifest
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# To reassemble: Use scripts/join-chunks.sh

FILENAME=$filename
CHECKSUM=$checksum
TOTAL_SIZE=$filesize
CHUNK_COUNT=$chunk_count
CHUNK_SIZE_MB=$CHUNK_SIZE_MB
EOF
    
    # Create metadata.json
    local metadata_file="metadata.json"
    log_info "Creating metadata: $metadata_file"
    cat > "$metadata_file" << EOF
{
    "package_name": "$filename",
    "checksum": "$checksum",
    "chunk_count": $chunk_count,
    "total_size": $filesize,
    "chunk_size_mb": $CHUNK_SIZE_MB,
    "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "platform": "$platform_name"
}
EOF
    
    log_success "$platform_name package chunked successfully!"
    log_info "Output: $output_dir"
    log_info "Chunks: $chunk_count files"
    echo ""
}

# Main execution
main() {
    log_header "Promptwright Package Chunker"
    
    log_info "Project Root: $PROJECT_ROOT"
    log_info "Release Dir: $RELEASE_DIR"
    log_info "Binaries Dir: $BINARIES_DIR"
    log_info "Chunk Size: ${CHUNK_SIZE_MB}MB"
    echo ""
    
    # Check if release directory exists
    if [[ ! -d "$RELEASE_DIR" ]]; then
        log_error "Release directory not found: $RELEASE_DIR"
        log_warn "Run 'pnpm build && pnpm pkg:all' first"
        exit 1
    fi
    
    # Split Mac package
    if split_package "$RELEASE_DIR/$MAC_PACKAGE" "$MAC_CHUNKS_DIR" "mac"; then
        log_success "✅ Mac package chunked"
    else
        log_warn "⚠️  Mac package chunking skipped"
    fi
    
    # Split Windows package
    if split_package "$RELEASE_DIR/$WIN_PACKAGE" "$WIN_CHUNKS_DIR" "win"; then
        log_success "✅ Windows package chunked"
    else
        log_warn "⚠️  Windows package chunking skipped"
    fi
    
    # Summary
    log_header "Chunking Complete!"
    
    echo "Chunked packages ready for GitHub:"
    echo ""
    
    if [[ -d "$MAC_CHUNKS_DIR" ]]; then
        local mac_count=$(ls -1 "$MAC_CHUNKS_DIR"/*.part* 2>/dev/null | wc -l | tr -d ' ')
        echo -e "  ${GREEN}✓${NC} Mac chunks: $mac_count files in binaries/mac-jarvis-app-chunks/"
    fi
    
    if [[ -d "$WIN_CHUNKS_DIR" ]]; then
        local win_count=$(ls -1 "$WIN_CHUNKS_DIR"/*.part* 2>/dev/null | wc -l | tr -d ' ')
        echo -e "  ${GREEN}✓${NC} Windows chunks: $win_count files in binaries/win-jarvis-app-chunks/"
    fi
    
    echo ""
    echo "To reassemble on another machine:"
    echo "  ./scripts/join-chunks.sh mac"
    echo "  ./scripts/join-chunks.sh win"
    echo ""
}

# Run main
main
