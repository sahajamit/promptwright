#!/bin/bash
# ============================================================================
# File Chunker Utility
# ============================================================================
# This utility splits large files (or .app bundles) into smaller chunks for 
# GitHub check-in and reassembles them on checkout.
#
# Usage:
#   Split:      ./file-chunker.sh split <file_or_app> [chunk_size_mb]
#   Join:       ./file-chunker.sh join <output_file>
#   Join Path:  ./file-chunker.sh join-path   (interactive - asks for chunk dir)
#
# Examples:
#   ./file-chunker.sh split binaries/Promptwright.app 19
#   ./file-chunker.sh join binaries/Promptwright.app
#   ./file-chunker.sh join-path
# ============================================================================

set -euo pipefail

CHUNK_SIZE_MB="${3:-19}"  # Default 19MB to stay under 20MB limit
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$PROJECT_ROOT/binaries"

show_usage() {
    echo "File Chunker Utility - Split/Join large files for GitHub"
    echo ""
    echo "Usage:"
    echo "  $0 split <file_or_app> [chunk_size_mb]  - Split file/app into chunks"
    echo "  $0 join <output_file>                   - Join chunks back into file"
    echo "  $0 join-path                            - Interactive join (asks for chunk dir)"
    echo ""
    echo "Options:"
    echo "  chunk_size_mb  - Size of each chunk in MB (default: 19)"
    echo ""
    echo "Examples:"
    echo "  $0 split binaries/Promptwright.app 19"
    echo "  $0 join binaries/Promptwright.app"
    echo "  $0 join-path"
    echo ""
    echo "For .app bundles:"
    echo "  The script will automatically compress the bundle to .tar.gz before splitting."
    echo "  When joining, it will decompress back to the original .app bundle."
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

split_file() {
    local input_path="$1"
    local chunk_size_mb="${2:-19}"
    local chunk_size_bytes=$((chunk_size_mb * 1024 * 1024))
    local is_app_bundle=false
    local temp_archive=""
    local input_file=""
    local original_name=""
    local original_ext=""
    
    # Check if input exists
    if [[ ! -e "$input_path" ]]; then
        echo "❌ Error: Path not found: $input_path"
        exit 1
    fi
    
    # Handle .app bundles (directories)
    if [[ -d "$input_path" && "$input_path" == *.app ]]; then
        is_app_bundle=true
        original_name=$(basename "$input_path")
        original_ext=".app"
        
        echo "📦 Detected macOS app bundle: $original_name"
        echo "🗜️  Compressing to tar.gz first..."
        
        # Create temp archive
        temp_archive="${input_path}.tar.gz"
        tar -czf "$temp_archive" -C "$(dirname "$input_path")" "$(basename "$input_path")"
        
        input_file="$temp_archive"
        echo "✅ Compressed to: $temp_archive"
    else
        input_file="$input_path"
        original_name=$(basename "$input_file")
        original_ext=""
        # Extract extension if present
        if [[ "$original_name" == *.* ]]; then
            original_ext=".${original_name##*.}"
        fi
    fi
    
    local filename=$(basename "$input_file")
    local input_dir=$(dirname "$input_file")
    local chunk_dir="${input_dir}/${filename%.tar.gz}-chunks"
    
    # For .app bundles, use a cleaner chunk dir name
    if [[ "$is_app_bundle" == true ]]; then
        chunk_dir="${input_dir}/$(basename "$input_path" .app)-app-chunks"
    fi
    
    local file_size=$(get_file_size "$input_file")
    local file_size_mb=$((file_size / 1024 / 1024))
    
    echo ""
    echo "📁 Splitting: $input_file"
    echo "📊 File size: ${file_size_mb}MB"
    echo "✂️  Chunk size: ${chunk_size_mb}MB"
    echo "📂 Chunks dir: $chunk_dir"
    
    # Create chunks directory
    mkdir -p "$chunk_dir"
    
    # Remove any existing chunks
    rm -f "$chunk_dir/"*.part* 2>/dev/null || true
    rm -f "$chunk_dir/"*.manifest 2>/dev/null || true
    rm -f "$chunk_dir/"*.metadata 2>/dev/null || true
    
    # Split the file
    split -b "${chunk_size_bytes}" "$input_file" "$chunk_dir/${filename}.part"
    
    # Count and list the chunks
    local chunk_count=$(ls -1 "$chunk_dir/${filename}.part"* 2>/dev/null | wc -l | tr -d ' ')
    
    echo ""
    echo "✅ Split into $chunk_count chunks:"
    echo ""
    ls -lh "$chunk_dir/${filename}.part"* | awk '{print "   " $9 " (" $5 ")"}'
    
    # Create a manifest file for verification
    local checksum=$(get_md5 "$input_file")
    echo "$filename|$checksum|$chunk_count|$file_size" > "$chunk_dir/${filename}.manifest"
    
    # Create metadata file with original file info
    cat > "$chunk_dir/metadata.json" << EOF
{
    "original_name": "$original_name",
    "original_extension": "$original_ext",
    "is_app_bundle": $is_app_bundle,
    "archive_name": "$filename",
    "checksum": "$checksum",
    "chunk_count": $chunk_count,
    "total_size": $file_size,
    "chunk_size_mb": $chunk_size_mb,
    "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    
    echo ""
    echo "📝 Manifest created: $chunk_dir/${filename}.manifest"
    echo "📋 Metadata created: $chunk_dir/metadata.json"
    echo "🔐 Original MD5: $checksum"
    
    # Clean up temp archive if we created one
    if [[ "$is_app_bundle" == true && -f "$temp_archive" ]]; then
        rm -f "$temp_archive"
        echo "🧹 Cleaned up temporary archive"
    fi
    
    echo ""
    echo "📌 Next steps:"
    echo "   1. Optionally delete the original: rm -rf \"$input_path\""
    echo "   2. Add chunks to git: git add \"$chunk_dir/\""
    echo "   3. Commit and push to GitHub"
    echo ""
    echo "   On the target machine, run:"
    echo "   ./scripts/file-chunker.sh join-path"
    echo "   (and enter: $chunk_dir)"
}

join_file() {
    local input_path="$1"
    local chunk_dir=""
    local output_file=""
    local filename=""
    local archive_name=""
    local is_app_bundle="false"
    local original_name=""
    
    # Check if input is a directory (chunks dir) or file path
    if [[ -d "$input_path" ]]; then
        # Input is the chunks directory itself
        chunk_dir="$input_path"
        
        # Check for metadata.json to get actual archive name
        local metadata_file="$chunk_dir/metadata.json"
        if [[ -f "$metadata_file" ]]; then
            # Parse metadata to get the actual archive name
            archive_name=$(grep '"archive_name"' "$metadata_file" | sed 's/.*: *"\([^"]*\)".*/\1/')
            original_name=$(grep '"original_name"' "$metadata_file" | sed 's/.*: *"\([^"]*\)".*/\1/')
            is_app_bundle=$(grep '"is_app_bundle"' "$metadata_file" | sed 's/.*: *\([^,}]*\).*/\1/' | tr -d ' ')
            filename="$archive_name"
        else
            # Fallback to directory name if no metadata
            filename=$(basename "$input_path")
            archive_name="$filename"
            original_name="$filename"
        fi
        
        output_file="$(dirname "$input_path")/${original_name}"
    else
        # Input is the desired output file path
        filename=$(basename "$input_path")
        archive_name="$filename"
        original_name="$filename"
        local output_dir=$(dirname "$input_path")
        chunk_dir="${output_dir}/${filename}"
        output_file="$input_path"
        
        # If chunks dir exists at same level, output goes to parent
        if [[ -d "$chunk_dir" ]]; then
            output_file="${output_dir}/${filename}"
            # Resolve if it's a directory
            if [[ -d "$output_file" ]]; then
                output_file="$(dirname "$output_dir")/${filename}"
            fi
        fi
    fi
    
    if [[ ! -d "$chunk_dir" ]]; then
        echo "❌ Error: Chunks directory not found: $chunk_dir"
        exit 1
    fi
    
    local manifest_file="$chunk_dir/${archive_name}.manifest"
    if [[ ! -f "$manifest_file" ]]; then
        echo "❌ Error: Manifest not found: $manifest_file"
        exit 1
    fi
    
    # Read manifest
    IFS='|' read -r orig_filename orig_checksum orig_count orig_size < "$manifest_file"
    
    echo "🔗 Joining chunks for: $original_name"
    echo "📊 Expected chunks: $orig_count"
    echo "🔐 Expected MD5: $orig_checksum"
    
    # Count available chunks
    local chunk_count=$(ls -1 "$chunk_dir/${archive_name}.part"* 2>/dev/null | wc -l | tr -d ' ')
    
    if [[ "$chunk_count" -ne "$orig_count" ]]; then
        echo "❌ Error: Expected $orig_count chunks but found $chunk_count"
        exit 1
    fi
    
    echo "✅ Found $chunk_count chunks"
    
    # Determine temp file for archive (if app bundle) or final output
    local temp_archive=""
    local final_output="$output_file"
    
    if [[ "$is_app_bundle" == "true" ]]; then
        temp_archive="$(dirname "$output_file")/${archive_name}"
        final_output="$(dirname "$output_file")/${original_name}"
        echo "📂 Output: $final_output"
    else
        echo "📂 Output: $output_file"
    fi
    
    # Remove existing output file if present (only if it's a file, not directory)
    if [[ -f "$output_file" ]]; then
        rm -f "$output_file"
    fi
    
    echo ""
    echo "🔗 Joining chunks..."
    
    # Join the chunks (they are named with alphabetic suffixes by 'split')
    if [[ "$is_app_bundle" == "true" ]]; then
        cat "$chunk_dir/${archive_name}.part"* > "$temp_archive"
    else
        cat "$chunk_dir/${archive_name}.part"* > "$output_file"
    fi
    
    # Verify checksum
    local file_to_check="$output_file"
    if [[ "$is_app_bundle" == "true" ]]; then
        file_to_check="$temp_archive"
    fi
    
    local new_checksum=$(get_md5 "$file_to_check")
    
    echo ""
    if [[ "$new_checksum" == "$orig_checksum" ]]; then
        echo "✅ Chunks joined successfully!"
        echo "🔐 MD5 verified: $new_checksum"
        
        # If it's an app bundle, extract it
        if [[ "$is_app_bundle" == "true" ]]; then
            echo ""
            echo "📦 Extracting app bundle..."
            
            # Remove existing app bundle if present
            if [[ -d "$final_output" ]]; then
                echo "🗑️  Removing existing: $final_output"
                rm -rf "$final_output"
            fi
            
            # Extract to output directory
            tar -xzf "$temp_archive" -C "$(dirname "$final_output")"
            
            # Clean up the tar.gz
            rm -f "$temp_archive"
            
            echo "✅ App bundle extracted: $final_output"
            ls -ldh "$final_output" | awk '{print "📁 Size: " $5}'
        else
            ls -lh "$output_file" | awk '{print "📁 File size: " $5}'
        fi
    else
        echo "❌ Error: Checksum mismatch!"
        echo "   Expected: $orig_checksum"
        echo "   Got:      $new_checksum"
        if [[ "$is_app_bundle" == "true" ]]; then
            rm -f "$temp_archive"
        fi
        exit 1
    fi
    
    echo ""
    echo "🎉 Done! File restored to: $final_output"
    echo ""
    echo "📌 Optionally clean up chunks:"
    echo "   rm -rf \"$chunk_dir\""
}

join_from_path() {
    echo "🔗 Join Chunks from Path"
    echo "========================"
    echo ""
    
    # Ask for chunk directory
    echo "Enter the path to the chunks directory:"
    echo "(You can use relative or absolute paths)"
    echo ""
    read -r -p "Chunks directory: " chunk_dir_input
    
    # Expand ~ and resolve path
    chunk_dir_input="${chunk_dir_input/#\~/$HOME}"
    
    # Make absolute if relative
    if [[ ! "$chunk_dir_input" = /* ]]; then
        chunk_dir_input="$(pwd)/$chunk_dir_input"
    fi
    
    # Normalize the path
    chunk_dir=$(cd "$chunk_dir_input" 2>/dev/null && pwd) || {
        echo "❌ Error: Directory not found: $chunk_dir_input"
        exit 1
    }
    
    echo ""
    echo "📂 Using chunks from: $chunk_dir"
    
    # Check for metadata file
    local metadata_file="$chunk_dir/metadata.json"
    if [[ ! -f "$metadata_file" ]]; then
        echo "❌ Error: metadata.json not found in $chunk_dir"
        exit 1
    fi
    
    # Parse metadata (simple parsing without jq dependency)
    local original_name=$(grep '"original_name"' "$metadata_file" | sed 's/.*: *"\([^"]*\)".*/\1/')
    local original_ext=$(grep '"original_extension"' "$metadata_file" | sed 's/.*: *"\([^"]*\)".*/\1/')
    local is_app_bundle=$(grep '"is_app_bundle"' "$metadata_file" | sed 's/.*: *\([^,}]*\).*/\1/' | tr -d ' ')
    local archive_name=$(grep '"archive_name"' "$metadata_file" | sed 's/.*: *"\([^"]*\)".*/\1/')
    local expected_checksum=$(grep '"checksum"' "$metadata_file" | sed 's/.*: *"\([^"]*\)".*/\1/')
    local expected_count=$(grep '"chunk_count"' "$metadata_file" | sed 's/.*: *\([0-9]*\).*/\1/')
    
    echo ""
    echo "📋 Metadata:"
    echo "   Original name: $original_name"
    echo "   Is app bundle: $is_app_bundle"
    echo "   Archive name: $archive_name"
    echo "   Expected chunks: $expected_count"
    echo "   Expected MD5: $expected_checksum"
    echo ""
    
    # Count available chunks
    local chunk_count=$(ls -1 "$chunk_dir/${archive_name}.part"* 2>/dev/null | wc -l | tr -d ' ')
    
    if [[ "$chunk_count" -ne "$expected_count" ]]; then
        echo "❌ Error: Expected $expected_count chunks but found $chunk_count"
        exit 1
    fi
    
    echo "✅ Found $chunk_count chunks"
    echo ""
    
    # Determine output location (binaries folder)
    local output_dir="$BINARIES_DIR"
    local output_file="$output_dir/$archive_name"
    local final_output="$output_dir/$original_name"
    
    echo "📂 Output will be saved to: $final_output"
    echo ""
    read -r -p "Continue? [Y/n]: " confirm
    confirm="${confirm:-Y}"
    
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "❌ Cancelled"
        exit 0
    fi
    
    # Create binaries dir if it doesn't exist
    mkdir -p "$output_dir"
    
    echo ""
    echo "🔗 Joining chunks..."
    
    # Join the chunks
    cat "$chunk_dir/${archive_name}.part"* > "$output_file"
    
    # Verify checksum
    local new_checksum=$(get_md5 "$output_file")
    
    if [[ "$new_checksum" != "$expected_checksum" ]]; then
        echo "❌ Error: Checksum mismatch!"
        echo "   Expected: $expected_checksum"
        echo "   Got:      $new_checksum"
        rm -f "$output_file"
        exit 1
    fi
    
    echo "✅ Chunks joined successfully!"
    echo "🔐 MD5 verified: $new_checksum"
    
    # If it's an app bundle, extract the tar.gz
    if [[ "$is_app_bundle" == "true" ]]; then
        echo ""
        echo "📦 Extracting app bundle..."
        
        # Remove existing app bundle if present
        if [[ -d "$final_output" ]]; then
            echo "🗑️  Removing existing: $final_output"
            rm -rf "$final_output"
        fi
        
        # Extract to binaries directory
        tar -xzf "$output_file" -C "$output_dir"
        
        # Clean up the tar.gz
        rm -f "$output_file"
        
        echo "✅ App bundle extracted: $final_output"
    fi
    
    echo ""
    echo "🎉 Done! File restored to: $final_output"
    ls -lh "$final_output" 2>/dev/null || ls -ldh "$final_output"
}

# Main script
case "${1:-}" in
    split)
        if [[ -z "${2:-}" ]]; then
            echo "❌ Error: No file specified"
            show_usage
            exit 1
        fi
        split_file "$2" "${3:-19}"
        ;;
    join)
        if [[ -z "${2:-}" ]]; then
            echo "❌ Error: No output file specified"
            show_usage
            exit 1
        fi
        join_file "$2"
        ;;
    join-path)
        join_from_path
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
