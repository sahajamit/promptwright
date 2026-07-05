#!/bin/bash
# Generate icon files from PNG source

set -e

echo "🎨 Generating desktop app icons..."

cd "$(dirname "$0")/.."

# Check if png2icons is installed
if ! command -v png2icons &> /dev/null; then
    echo "Installing png2icons..."
    npm install -g png2icons
fi

# Generate icons
echo "📦 Converting PNG to ICNS (macOS)..."
png2icons assets/icon.png assets/icon -icns

echo "📦 Converting PNG to ICO (Windows)..."
png2icons assets/icon.png assets/icon -ico

echo "✅ Icons generated successfully!"
echo ""
echo "Generated files:"
ls -lh assets/icon.icns assets/icon.ico assets/icon.png

echo ""
echo "✨ Done! Restart the app to see the new icon."
