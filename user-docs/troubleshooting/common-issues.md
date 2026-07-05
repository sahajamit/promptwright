# Common Issues

## Startup Problems

### Prerequisite check fails

The app requires Node.js 22+ and GitHub Copilot CLI to function.

**Solutions:**
- Check the error messages on the Prerequisite Blocker screen for specific instructions
- Use the **copy button** next to each fix command to copy it to your clipboard
- If Copilot CLI is installed but not detected, use **Select Executable File** to point to it manually
- Click **Re-check** after making changes

### Connection status shows red ("Off")

The app cannot reach the Copilot backend.

**Solutions:**
- Check your internet connection
- Verify Copilot authentication is still valid
- Click **Retry Connection** if the option appears in the banner
- Restart the app

## Test Execution Issues

### Browser doesn't launch

The Playwright MCP server may not have started correctly.

**Solutions:**
- Check the Activity Logs panel for MCP-related errors
- Restart the app to reinitialize MCP servers
- Try switching to **Playwright CLI** mode in Settings as a fallback

### Web test fails unexpectedly

**Common causes and fixes:**

- **Stale browser state** — Click "New Test" to get a fresh browser session
- **Page didn't finish loading** — Add an explicit wait step: "Wait for the page to fully load before proceeding"
- **Ambiguous element reference** — Be more specific: "Click the blue Submit button at the bottom of the form" instead of "Click Submit"
- **Dynamic/changing content** — Reference stable attributes like IDs or unique text rather than position
- **Authentication required** — Include login steps at the beginning of your test

### API test returns unexpected results

- Verify the endpoint URL is correct and accessible
- Check that required headers (authentication, content-type) are specified
- Use the **follow-up question** feature to refine assertions
- Review the full response in the conversation view

### "Stream destroyed" error

The AI response stream was interrupted during execution.

**Fix:** Start a new session and retry your test.

## Recording Issues

### Actions not being captured

- Confirm recording is active (check the Recording panel status indicator)
- Only direct interactions are captured — hovering alone may not register
- Check Activity Logs for real-time action updates
- Try **Detailed** recording mode if Standard mode misses interactions

### Gherkin generation produces poor results

- Provide **custom instructions** before generation to guide the AI
- Use the **refinement** feature to iteratively improve the output
- Record shorter, more focused workflows for better results

## Performance

### App feels slow or unresponsive

- Close unused browser sessions by clicking **New Test**
- Delete old sessions you no longer need
- Set **Reasoning Effort** to Low or Medium in Settings
- Close the Activity Logs panel when not actively debugging
- Enable **Headless Mode** in Settings for faster browser execution
