# Quick Start

## First Launch

When JARVIS-AI starts, it checks that all prerequisites are in place:

- **Node.js 22+** — Required for the automation runtime
- **GitHub Copilot CLI** — Required for AI model access
- **Copilot Authentication** — Advisory check (recommended but non-blocking)

If any required check fails, you'll see a **Prerequisite Blocker** screen with instructions and copy-to-clipboard fix commands. You can also use the "Select Executable File" button to manually locate the Copilot CLI if it's not in your system PATH.

Click **Re-check** after resolving any issues.

## The Interface

Once prerequisites pass, you'll see the main interface:

### Left Toolbar

| Icon | View | Description |
|------|------|-------------|
| Chat bubble | **Chat** | Main testing interface — run tests here |
| Bot | **Agents & Skills** | View available AI agents and their capabilities |
| Video | **Recording** | Record browser workflows and generate test scenarios |
| Gear | **Settings** | Configure AI provider, model, browser behavior |
| Help | **Documentation** | You are here |

The bottom of the toolbar shows:
- **Activity Logs** toggle — Show/hide the real-time execution log panel
- **App version** and **connection status** (green = connected, red = disconnected)

### Chat Sidebar

Toggle the Chat icon to show/hide your **session history** on the left. Each session preserves your full conversation and test results.

## Your First Test

1. Type a test description in the chat input, for example:

   ```
   Navigate to https://example.com and verify the page title contains "Example Domain"
   ```

2. Click **Run Test** (or press `Ctrl+Enter` / `Cmd+Enter`)

3. Watch the AI execute your test — you'll see:
   - A live browser screencast (for web tests)
   - Real-time execution logs
   - A final **TEST PASSED** or **TEST FAILED** verdict

4. After completion, you can **Run Again**, start a **New Test**, or export the results.
