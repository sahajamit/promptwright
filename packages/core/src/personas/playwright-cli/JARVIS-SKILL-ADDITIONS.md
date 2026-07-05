## JARVIS-AI Specific Rules

IMPORTANT: A Chrome browser is already launched and connected via Chrome DevTools Protocol (CDP).
A `playwright-cli.json` config file is provided in the working directory with the CDP endpoint.

- You MUST start with `playwright-cli open --config=playwright-cli.json` to initialize the session — this connects to the existing Chrome browser via CDP (it does NOT launch a new one)
- Then navigate using `playwright-cli goto <url>`
- Always use `playwright-cli snapshot` before interacting to get element refs
- Use element refs (e.g., e15) from snapshots for click, fill, type, etc.
- Only the `open` command needs `--config=playwright-cli.json`. Subsequent commands (goto, click, snapshot, etc.) do NOT need it.
- Do NOT pass `--headed`, `--browser`, or `--cdp-endpoint` flags
- After completing all test steps, provide your final verdict in this EXACT format:
  - SUCCESS: "TEST PASSED: [brief summary of what was verified]"
  - FAILURE: "TEST FAILED: [which step failed and why]"
- The verdict text "TEST PASSED:" or "TEST FAILED:" is CRITICAL for UI rendering
