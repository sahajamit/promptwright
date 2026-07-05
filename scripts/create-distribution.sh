#!/bin/bash
# Creates distribution packages for Mac and Windows
# Run this after building packages with: pnpm build && pnpm pkg:all

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$PROJECT_ROOT/packages/desktop/release"
DIST_DIR="$PROJECT_ROOT/dist"
VERSION=$(node -p "require('./packages/desktop/package.json').version" 2>/dev/null || echo "0.0.1")

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================="
echo -e "  Promptwright Distribution Builder"
echo -e "==========================================${NC}"
echo ""

# Check if release packages exist
if [[ ! -f "$RELEASE_DIR/Promptwright-${VERSION}-arm64-mac.zip" ]]; then
    echo -e "${YELLOW}Error: Mac package not found${NC}"
    echo "Please run: pnpm build && pnpm pkg:mac"
    exit 1
fi

if [[ ! -f "$RELEASE_DIR/Promptwright-${VERSION}-win-x64-portable.zip" ]]; then
    echo -e "${YELLOW}Error: Windows package not found${NC}"
    echo "Please run: pnpm build && pnpm pkg:win"
    exit 1
fi

# Create dist directory
echo "Creating distribution directory..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/mac" "$DIST_DIR/win"

# Mac distribution
echo ""
echo "Building Mac distribution..."
cp "$RELEASE_DIR/Promptwright-${VERSION}-arm64-mac.zip" "$DIST_DIR/mac/"
cp "$PROJECT_ROOT/packages/desktop/scripts/installers/install-mac.sh" "$DIST_DIR/mac/install.sh"
chmod +x "$DIST_DIR/mac/install.sh"
mkdir -p "$DIST_DIR/mac/scripts"
cp "$PROJECT_ROOT/packages/desktop/scripts/launchers/promptwright-mac.sh" "$DIST_DIR/mac/scripts/promptwright.sh"
chmod +x "$DIST_DIR/mac/scripts/promptwright.sh"
cp "$PROJECT_ROOT/packages/desktop/scripts/installers/README-mac.txt" "$DIST_DIR/mac/README.txt"

cd "$DIST_DIR"
zip -r "Promptwright-Mac-v$VERSION.zip" mac/ > /dev/null
echo -e "${GREEN}✓ Mac distribution created${NC}"

# Windows distribution
echo ""
echo "Building Windows distribution..."
cp "$RELEASE_DIR/Promptwright-${VERSION}-win-x64-portable.zip" "$DIST_DIR/win/"
cp "$PROJECT_ROOT/packages/desktop/scripts/installers/install-win.bat" "$DIST_DIR/win/install.bat"
cp "$PROJECT_ROOT/packages/desktop/scripts/installers/install-win.ps1" "$DIST_DIR/win/install.ps1"
mkdir -p "$DIST_DIR/win/scripts"
cp "$PROJECT_ROOT/packages/desktop/scripts/launchers/promptwright-win.bat" "$DIST_DIR/win/scripts/promptwright.bat"
cp "$PROJECT_ROOT/packages/desktop/scripts/launchers/promptwright-win.ps1" "$DIST_DIR/win/scripts/promptwright.ps1"
cp "$PROJECT_ROOT/packages/desktop/scripts/installers/README-win.txt" "$DIST_DIR/win/README.txt"

cd "$DIST_DIR"
zip -r "Promptwright-Windows-v$VERSION.zip" win/ > /dev/null
echo -e "${GREEN}✓ Windows distribution created${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo -e "  Distribution Complete!"
echo -e "==========================================${NC}"
echo ""
echo "Distribution packages created in: $DIST_DIR"
echo ""
ls -lh "$DIST_DIR"/*.zip
echo ""
echo "Contents:"
echo "  - Promptwright-Mac-v$VERSION.zip (~170MB)"
echo "  - Promptwright-Windows-v$VERSION.zip (~200MB)"
echo ""
echo "These are ready to distribute to users!"
echo ""
