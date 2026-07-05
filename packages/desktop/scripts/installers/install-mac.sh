#!/bin/bash
# Promptwright Installer for macOS
# Checks prerequisites, installs the app, and sets up PATH

set -e

echo "=========================================="
echo "  Promptwright Installer"
echo "=========================================="

PROMPTWRIGHT_HOME="$HOME/.promptwright"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIN_NODE_VERSION=22
MIN_COPILOT_VERSION="0.0.400"

# 1. Check Node.js >= 22
echo ""
echo "[1/5] Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -ge "$MIN_NODE_VERSION" ]; then
        echo "      ✓ Node.js v$(node -v | sed 's/v//') found"
    else
        echo "      ✗ Node.js v$MIN_NODE_VERSION+ required (found v$(node -v))"
        echo "      Please install from: https://nodejs.org/"
        exit 1
    fi
else
    echo "      ✗ Node.js not found"
    echo "      Please install Node.js v$MIN_NODE_VERSION+ from: https://nodejs.org/"
    exit 1
fi

# 2. Check/Install GitHub Copilot CLI
echo ""
echo "[2/5] Checking GitHub Copilot CLI..."
if command -v copilot &> /dev/null; then
    COPILOT_VERSION=$(copilot --version 2>/dev/null | head -1 || echo "unknown")
    echo "      ✓ Copilot CLI found: $COPILOT_VERSION"
else
    echo "      Copilot CLI not found. Installing..."
    npm install -g @github/copilot
    echo "      ✓ Copilot CLI installed"
fi
echo ""
echo "      ⚠️  IMPORTANT: Make sure you are logged in to Copilot CLI!"
echo "         Run 'copilot auth login' if you haven't already."

# 3. Create/recreate ~/.promptwright directory
echo ""
echo "[3/5] Setting up installation directory..."
if [ -d "$PROMPTWRIGHT_HOME" ]; then
    echo "      Removing existing installation..."
    rm -rf "$PROMPTWRIGHT_HOME"
fi
mkdir -p "$PROMPTWRIGHT_HOME"
echo "      ✓ Created $PROMPTWRIGHT_HOME"

# 4. Extract and install app
echo ""
echo "[4/5] Installing Promptwright app..."
unzip -q "$SCRIPT_DIR/Promptwright-1.0.0-arm64-mac.zip" -d "$PROMPTWRIGHT_HOME/"
cp "$SCRIPT_DIR/scripts/promptwright.sh" "$PROMPTWRIGHT_HOME/"
chmod +x "$PROMPTWRIGHT_HOME/promptwright.sh"
echo "      ✓ App installed to $PROMPTWRIGHT_HOME"

# 5. Add to PATH
echo ""
echo "[5/5] Adding to PATH..."
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    # Remove old Promptwright entries and add new one
    grep -v "Promptwright" "$SHELL_RC" > "$SHELL_RC.tmp" || true
    mv "$SHELL_RC.tmp" "$SHELL_RC"
    echo "" >> "$SHELL_RC"
    echo "# Promptwright" >> "$SHELL_RC"
    echo "export PATH=\"\$HOME/.promptwright:\$PATH\"" >> "$SHELL_RC"
    echo "alias promptwright=\"\$HOME/.promptwright/promptwright.sh\"" >> "$SHELL_RC"
    echo "      ✓ Added to $SHELL_RC"
else
    echo "      ⚠️  Could not find .zshrc or .bashrc"
    echo "         Add manually: export PATH=\"\$HOME/.promptwright:\$PATH\""
fi

echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""
echo "To start Promptwright:"
echo "  1. Open a new terminal (to load PATH changes)"
echo "  2. Run: promptwright"
echo ""
echo "Or double-click: ~/.promptwright/promptwright.sh"
echo ""
