#!/bin/bash
# Promptwright Launcher with Auto-Cleanup
# This script automatically cleans up stale processes before launching the app

PROMPTWRIGHT_HOME="${PROMPTWRIGHT_HOME:-$HOME/.promptwright}"
APP_PATH="$PROMPTWRIGHT_HOME/Promptwright.app"

# Kill existing Promptwright app if running
pkill -f "Promptwright" 2>/dev/null

# Kill Chrome debug session on port 9222
lsof -ti:9222 2>/dev/null | xargs kill -9 2>/dev/null

# Kill Playwright Chrome processes
pkill -9 -f "remote-debugging-port=9222" 2>/dev/null

# Kill MCP server processes
pkill -9 -f "@playwright/mcp" 2>/dev/null

# Brief pause for cleanup
sleep 0.5

# Launch the app
if [[ -d "$APP_PATH" ]]; then
    open "$APP_PATH"
else
    echo "Error: Promptwright.app not found at $APP_PATH"
    echo "Please run the installer again."
    exit 1
fi
