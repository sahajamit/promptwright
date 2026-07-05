#!/bin/bash
# clean-fresh.sh — Reset Promptwright to a fresh-install state
# Usage: ./scripts/clean-fresh.sh [--all]
#   --all  Also removes build outputs (dist/, release/) and node_modules

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

removed=0

remove_path() {
  local target="$1"
  local label="$2"
  if [ -e "$target" ]; then
    rm -rf "$target"
    echo -e "  ${RED}✗${NC} Removed: ${label} (${target})"
    removed=$((removed + 1))
  else
    echo -e "  ${GREEN}✓${NC} Already clean: ${label}"
  fi
}

echo ""
echo "=== Promptwright Fresh Install Cleanup ==="
echo ""

# ── 1. Electron app data (sessions, config, recordings, process registry) ──
echo "App data (Electron userData):"
remove_path "$HOME/Library/Application Support/Promptwright" "~/Library/Application Support/Promptwright"

# ── 2. Global skills directory ──
echo ""
echo "Global skills & temp:"
remove_path "$HOME/.promptwright" "~/.promptwright"

# ── 3. Temporary recordings in system temp dirs ──
echo ""
echo "Temporary recordings:"
# macOS /var/folders temp
for d in /var/folders/*/*/T/promptwright-recordings; do
  [ -d "$d" ] && remove_path "$d" "$d"
done
remove_path "/tmp/promptwright-recordings" "/tmp/promptwright-recordings"

# ── 4. Playwright CLI dev cache ──
echo ""
echo "Playwright CLI dev cache:"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
remove_path "$PROJECT_DIR/packages/desktop/.playwright-cli" "packages/desktop/.playwright-cli"

# ── 5. Playwright CLI config files that may have been written to home dir ──
echo ""
echo "Playwright CLI config:"
remove_path "$HOME/playwright-cli.json" "~/playwright-cli.json"

# ── 6. Kill any running Chrome debug or MCP server processes ──
echo ""
echo "Stale processes:"
chrome_pids=$(lsof -ti :9222 2>/dev/null || true)
if [ -n "$chrome_pids" ]; then
  echo "$chrome_pids" | xargs kill -9 2>/dev/null || true
  echo -e "  ${RED}✗${NC} Killed Chrome debug processes on port 9222"
  removed=$((removed + 1))
else
  echo -e "  ${GREEN}✓${NC} No Chrome debug process on port 9222"
fi

# ── 7. Build outputs (only with --all) ──
if [ "${1:-}" = "--all" ]; then
  echo ""
  echo "Build outputs:"
  remove_path "$PROJECT_DIR/packages/core/dist" "packages/core/dist"
  remove_path "$PROJECT_DIR/packages/cli/dist" "packages/cli/dist"
  remove_path "$PROJECT_DIR/packages/desktop/dist" "packages/desktop/dist"
  remove_path "$PROJECT_DIR/packages/desktop/release" "packages/desktop/release"

  echo ""
  echo "Node modules:"
  remove_path "$PROJECT_DIR/node_modules" "node_modules (root)"
  remove_path "$PROJECT_DIR/packages/core/node_modules" "packages/core/node_modules"
  remove_path "$PROJECT_DIR/packages/cli/node_modules" "packages/cli/node_modules"
  remove_path "$PROJECT_DIR/packages/desktop/node_modules" "packages/desktop/node_modules"
  echo ""
  echo -e "${YELLOW}Run 'pnpm install && pnpm build' to rebuild.${NC}"
fi

echo ""
echo -e "${GREEN}Done.${NC} Removed ${removed} item(s). App will start as fresh install."
echo ""
