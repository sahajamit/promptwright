# Playwright CLI — Connecting to an Existing Chrome Session via CDP

This document records a hands-on test of using `playwright-cli` (from `@playwright/cli`) to hook into an already-running Chrome browser using the Chrome DevTools Protocol (CDP).

---

## Objective

Verify that `playwright-cli` can connect to a Chrome instance launched independently (not by Playwright) via a CDP WebSocket URL, and perform full browser automation through that connection.

---

## Prerequisites

- Google Chrome installed (tested with Chrome 145.0.7632.46)
- `playwright-cli` installed globally via `npm install -g @playwright/cli@latest`
- macOS (Darwin 24.6.0) — commands shown are macOS-specific but the approach is cross-platform

---

## Step 1: Launch Chrome with Remote Debugging

Chrome must be started with the `--remote-debugging-port` flag to expose the CDP endpoint.

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check &
```

### Flags explained

| Flag | Purpose |
|------|---------|
| `--remote-debugging-port=9222` | Opens a WebSocket server on port 9222 for CDP connections |
| `--no-first-run` | Skips the "Welcome to Chrome" dialog |
| `--no-default-browser-check` | Suppresses the default browser prompt |

### On other platforms

```bash
# Linux
google-chrome --remote-debugging-port=9222 &

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

---

## Step 2: Retrieve the CDP WebSocket URL

Chrome exposes a JSON endpoint at `http://localhost:9222/json/version` that returns connection details.

```bash
curl -s http://localhost:9222/json/version | python3 -m json.tool
```

### Response received

```json
{
    "Browser": "Chrome/145.0.7632.46",
    "Protocol-Version": "1.3",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...",
    "V8-Version": "14.5.201.7",
    "WebKit-Version": "537.36 (@9b899469dedfaf361cc58bf677a62bd930371853)",
    "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/56879616-0bca-4049-bc9d-e743c73318ec"
}
```

The key field is **`webSocketDebuggerUrl`** — this is the CDP WebSocket URL that `playwright-cli` will connect to.

---

## Step 3: Create a CDP Config File

`playwright-cli` accepts a `--config` flag pointing to a JSON file. The config schema supports a `browser.cdpEndpoint` field for connecting to an existing browser.

### `cdp-config.json`

```json
{
  "browser": {
    "cdpEndpoint": "ws://localhost:9222/devtools/browser/56879616-0bca-4049-bc9d-e743c73318ec"
  }
}
```

### Additional config options available

```json
{
  "browser": {
    "cdpEndpoint": "ws://...",
    "cdpHeaders": { "Authorization": "Bearer token" },
    "cdpTimeout": 30000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cdpEndpoint` | `string` | WebSocket URL from Chrome's `/json/version` endpoint |
| `cdpHeaders` | `Record<string, string>` | Optional headers for authenticated CDP connections (e.g., remote browsers) |
| `cdpTimeout` | `number` | Connection timeout in ms (default: 30000, set to 0 to disable) |

---

## Step 4: Connect playwright-cli to the Running Chrome

```bash
playwright-cli -s=cdp-test open --config=cdp-config.json
```

### Output

```
### Browser `cdp-test` opened with pid 58129.
- cdp-test:
  - browser-type: chrome
  - user-data-dir: <in-memory>
  - headed: false
---
### Ran Playwright code
await page.goto('about:blank');

### Page
- Page URL: about:blank
### Snapshot
- [Snapshot](.playwright-cli/page-2026-02-14T10-42-18-755Z.yml)
```

The `-s=cdp-test` flag creates a named session, allowing multiple concurrent browser connections.

---

## Step 5: Run a Web Automation Workflow

### 5a. Navigate to example.com

```bash
playwright-cli -s=cdp-test goto https://example.com
```

**Result:**
```
Page URL: https://example.com/
Page Title: Example Domain
```

### 5b. Take a snapshot (accessibility tree)

```bash
playwright-cli -s=cdp-test snapshot
```

**Result** — structured accessibility tree of the page:
```yaml
- generic [ref=e2]:
  - heading "Example Domain" [level=1] [ref=e3]
  - paragraph [ref=e4]: This domain is for use in documentation examples...
  - paragraph [ref=e5]:
    - link "Learn more" [ref=e6] [cursor=pointer]
```

Each element gets a `ref` identifier (e.g., `e3`, `e6`) that can be used for subsequent interactions like `click`, `fill`, etc.

### 5c. Navigate to Hacker News

```bash
playwright-cli -s=cdp-test goto https://news.ycombinator.com
```

**Result:**
```
Page URL: https://news.ycombinator.com/
Page Title: Hacker News
```

Full page loaded with all 30 front-page stories visible in the snapshot, including headlines, points, authors, and comment counts.

### 5d. Click a story link

```bash
playwright-cli -s=cdp-test click e40
```

This clicked the first story ("Zig — io_uring and Grand Central Dispatch std.Io implementations landed") using the element reference from the snapshot.

**Result:**
```
Page URL: https://ziglang.org/devlog/2026/#2026-02-13
Page Title: Devlog ⚡ Zig Programming Language
```

The browser navigated to the external article — proving that full page interaction works through the CDP connection.

### 5e. Take a screenshot

```bash
playwright-cli -s=cdp-test screenshot --filename=cdp-demo-ziglang.png
```

A PNG screenshot was captured showing the Zig devlog article rendered in the browser.

### 5f. Close the session

```bash
playwright-cli -s=cdp-test close
```

```
Browser 'cdp-test' closed
```

---

## Complete Command Sequence (Copy-Paste Ready)

```bash
# 1. Launch Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --no-first-run --no-default-browser-check &

# 2. Wait a moment, then get the CDP URL
sleep 3
CDP_URL=$(curl -s http://localhost:9222/json/version | python3 -c "import sys,json; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
echo "CDP URL: $CDP_URL"

# 3. Create config file
cat > cdp-config.json << EOF
{
  "browser": {
    "cdpEndpoint": "$CDP_URL"
  }
}
EOF

# 4. Connect playwright-cli
playwright-cli -s=cdp-test open --config=cdp-config.json

# 5. Automate
playwright-cli -s=cdp-test goto https://example.com
playwright-cli -s=cdp-test snapshot
playwright-cli -s=cdp-test screenshot --filename=page.png

# 6. Cleanup
playwright-cli -s=cdp-test close
rm cdp-config.json
```

---

## Summary of Findings

| Aspect | Result |
|--------|--------|
| CDP connection to external Chrome | Works |
| Navigation (`goto`) | Works |
| Page snapshots (accessibility tree) | Works |
| Element interaction (`click`) | Works |
| Screenshots | Works |
| Named sessions (`-s=`) | Works |
| Session cleanup (`close`) | Works |

### What this enables

- **Attach to a user's existing browsing session** — automate within tabs they already have open
- **Reuse authenticated sessions** — connect to a Chrome that's already logged into services
- **Debug automation visually** — since the Chrome is a normal headed browser, you can watch actions happen in real-time
- **Connect to remote browsers** — use `cdpEndpoint` with a remote WebSocket URL (e.g., Browserless, Chrome running on another machine) along with `cdpHeaders` for auth

### Limitations observed

- The `headed: false` label in the output is misleading — the actual Chrome window is headed (visible), but playwright-cli reports `false` because it didn't launch the browser itself
- The CDP URL contains a unique browser ID that changes every time Chrome restarts, so the config file must be regenerated per session

---

*Tested on 2026-02-14 with Chrome 145.0.7632.46 and playwright-cli on macOS Darwin 24.6.0.*
