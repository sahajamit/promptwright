#!/bin/bash
# Promptwright Cleanup Script for macOS
# Safely kills only the Chrome debug session on port 9222
# Does NOT affect your regular Chrome browser windows

echo "=========================================="
echo "  Promptwright Cleanup Script"
echo "=========================================="
echo ""

KILLED_SOMETHING=false

# 1. Kill only the process listening on port 9222
# This is the specific Chrome instance spawned for debugging
echo "[1/3] Checking for Chrome debug session on port 9222..."
DEBUG_PID=$(lsof -ti:9222 2>/dev/null)
if [ -n "$DEBUG_PID" ]; then
  echo "      Found debug Chrome (PID: $DEBUG_PID) - killing..."
  kill -9 $DEBUG_PID 2>/dev/null
  KILLED_SOMETHING=true
  echo "      Done."
else
  echo "      No Chrome debug session found on port 9222."
fi

# 2. Kill only Chrome/Chromium processes that were started with --remote-debugging-port=9222
# This targets Playwright-launched browsers specifically, NOT regular Chrome
echo ""
echo "[2/3] Checking for Playwright Chrome processes..."
PLAYWRIGHT_PIDS=$(pgrep -f "remote-debugging-port=9222" 2>/dev/null)
if [ -n "$PLAYWRIGHT_PIDS" ]; then
  echo "      Found Playwright Chrome processes: $PLAYWRIGHT_PIDS"
  for PID in $PLAYWRIGHT_PIDS; do
    kill -9 $PID 2>/dev/null
    KILLED_SOMETHING=true
  done
  echo "      Done."
else
  echo "      No Playwright Chrome processes found."
fi

# 3. Kill any @playwright/mcp server processes
echo ""
echo "[3/3] Checking for MCP server processes..."
MCP_PIDS=$(pgrep -f "@playwright/mcp" 2>/dev/null)
if [ -n "$MCP_PIDS" ]; then
  echo "      Found MCP server processes: $MCP_PIDS"
  for PID in $MCP_PIDS; do
    kill -9 $PID 2>/dev/null
    KILLED_SOMETHING=true
  done
  echo "      Done."
else
  echo "      No MCP server processes found."
fi

echo ""
echo "=========================================="
if [ "$KILLED_SOMETHING" = true ]; then
  echo "  Cleanup complete!"
else
  echo "  Nothing to clean up - all clear!"
fi
echo "  You can now launch Promptwright."
echo "=========================================="
