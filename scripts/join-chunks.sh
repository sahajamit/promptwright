#!/bin/bash
# ============================================================================
# Chunk Joiner - Reassemble chunked packages
# ============================================================================
# Reassembles Mac or Windows packages from chunks
#
# Usage:
#   ./join-chunks.sh <platform> [output_dir]
#
# Platforms: mac, win, windows
# Default output_dir: ./packages/desktop/release
#
# Examples:
#   ./join-chunks.sh mac
#   ./join-chunks.sh win
#   ./join-chunks.sh mac ~/Desktop/packages
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
BINARIES_DIR="$PROJECT_ROOT/binaries"

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

show_usage() {
    echo "Chunk Joiner - Reassemble chunked packages"
    echo ""
    echo "Usage:"
    echo "  $0 <platform> [output_dir]"
    echo ""
    echo "Platforms:"
    echo "  mac, macos       - Reassemble Mac package"
    echo "  win, windows     - Reassemble Windows package"
    echo ""
    echo "Options:"
    echo "  output_dir       - Directory to save reassembled package"
    echo "                     (default: packages/desktop/release)"
    echo ""
    echo "Examples:"
    echo "  $0 mac"
    echo "  $0 win"
    echo "  $0 mac ~/Desktop/packages"
}

# Join chunks
join_chunks() {
    local chunks_dir="$1"
    local output_file="$2"
    
    log_header "Reassembling Package"
    
    # Check if chunks directory exists
    if [[ ! -d "$chunks_dir" ]]; then
        log_error "Chunks directory not found: $chunks_dir"
        exit 1
    fi
    
    # Read metadata
    local metadata_file="$chunks_dir/metadata.json"
    if [[ ! -f "$metadata_file" ]]; then
        log_error "Metadata file not found: $metadata_file"
        log_warn "This directory may not contain valid chunks"
        exit 1
    fi
    
    log_info "Reading metadata..."
    
    # Parse metadata (using grep and basic tools for portability)
    local package_name=$(grep -o '"package_name"[^,]*' "$metadata_file" | cut -d'"' -f4)
    local expected_checksum=$(grep -o '"checksum"[^,]*' "$metadata_file" | cut -d'"' -f4)
    local chunk_count=$(grep -o '"chunk_count"[^,]*' "$metadata_file" | cut -d':' -f2 | tr -d ' ,')
    local total_size=$(grep -o '"total_size"[^,]*' "$metadata_file" | cut -d':' -f2 | tr -d ' ,')
    local platform=$(grep -o '"platform"[^,]*' "$metadata_file" | cut -d'"' -f4)
    
    log_info "Package: $package_name"
    log_info "Platform: $platform"
    log_info "Expected size: $(format_bytes $total_size)"
    log_info "Expected MD5: $expected_checksum"
    log_info "Chunk count: $chunk_count"
    echo ""
    
    # Find all chunk files
    local chunk_files=("$chunks_dir"/${package_name}.part*)
    local actual_chunk_count=${#chunk_files[@]}
    
    log_info "Found $actual_chunk_count chunk files"
    
    if [[ $actual_chunk_count -ne $chunk_count ]]; then
        log_error "Chunk count mismatch!"
        log_error "Expected: $chunk_count, Found: $actual_chunk_count"
        log_warn "Some chunks may be missing"
        exit 1
    fi
    
    # Create output directory if it doesn't exist
    local output_dir=$(dirname "$output_file")
    mkdir -p "$output_dir"
    
    # Remove old output file if it exists
    if [[ -f "$output_file" ]]; then
        log_warn "Removing existing file: $output_file"
        rm "$output_file"
    fi
    
    # Join chunks
    log_info "Joining chunks..."
    cat "${chunk_files[@]}" > "$output_file"
    
    # Verify file size
    local actual_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
    if [[ $actual_size -ne $total_size ]]; then
        log_error "Size mismatch!"
        log_error "Expected: $(format_bytes $total_size), Got: $(format_bytes $actual_size)"
        rm "$output_file"
        exit 1
    fi
    
    log_success "Size verified: $(format_bytes $actual_size)"
    
    # Verify checksum
    log_info "Verifying checksum..."
    local actual_checksum=$(get_md5 "$output_file")
    
    if [[ "$actual_checksum" != "$expected_checksum" ]]; then
        log_error "Checksum mismatch!"
        log_error "Expected: $expected_checksum"
        log_error "Got: $actual_checksum"
        log_error "The reassembled file may be corrupted"
        rm "$output_file"
        exit 1
    fi
    
    log_success "Checksum verified: $actual_checksum"
    echo ""
    
    log_header "Package Reassembled Successfully!"
    
    echo "Output file: $output_file"
    echo "Size: $(format_bytes $actual_size)"
    echo "MD5: $actual_checksum"
    echo ""
    echo "You can now extract and use the package:"
    echo "  unzip \"$output_file\" -d ./output"
    echo ""
}

# Main execution
main() {
    local platform="${1:-}"
    local output_dir="${2:-$PROJECT_ROOT/packages/desktop/release}"
    
    # Validate platform argument
    if [[ -z "$platform" ]]; then
        log_error "Platform argument required"
        echo ""
        show_usage
        exit 1
    fi
    
    # Normalize platform name and set paths
    local chunks_dir=""
    local package_name=""
    local platform_lower=$(echo "$platform" | tr '[:upper:]' '[:lower:]')
    
    case "$platform_lower" in
        mac|macos)
            chunks_dir="$BINARIES_DIR/mac-jarvis-app-chunks"
            package_name="Promptwright-1.0.0-arm64-mac.zip"
            platform="Mac"
            ;;
        win|windows)
            chunks_dir="$BINARIES_DIR/win-jarvis-app-chunks"
            package_name="Promptwright-1.0.0-win-x64-portable.zip"
            platform="Windows"
            ;;
        *)
            log_error "Invalid platform: $platform"
            log_warn "Valid platforms: mac, win"
            echo ""
            show_usage
            exit 1
            ;;
    esac
    
    local output_file="$output_dir/$package_name"
    
    log_header "Promptwright Chunk Joiner - $platform"
    
    log_info "Chunks directory: $chunks_dir"
    log_info "Output directory: $output_dir"
    log_info "Output file: $package_name"
    echo ""
    
    # Join the chunks
    join_chunks "$chunks_dir" "$output_file"
}

# Show usage on -h or --help
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    show_usage
    exit 0
fi

# Run main
main "$@"
