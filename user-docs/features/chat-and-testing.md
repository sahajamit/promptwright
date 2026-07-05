# Chat & Test Execution

The Chat view is the main interface for running tests. It shows a conversational view of your interactions with the AI and provides real-time feedback during test execution.

## Test Execution Flow

1. **Input** — Type your test description or upload a `.feature` file
2. **Orchestration** — The AI orchestrator classifies your request and routes it to the appropriate agent
3. **Execution** — The agent runs your test (browser automation for web tests, HTTP requests for API tests)
4. **Results** — A final verdict of **TEST PASSED** or **TEST FAILED** is displayed

## Live Execution View (Web Tests)

During web test execution, you'll see:

- **Browser Screencast** — Live video frames from the browser as the test runs
- **Execution Logs** — Step-by-step progress showing what the AI is doing
- **Elapsed Timer** — How long the test has been running

After completion, additional sections become available:

- **Test Input** — The original test steps (expandable)
- **Browser Recording** — Playback of the full test execution (click to expand, maximize for full-screen)
- **Usage Metrics** — Token count and cost information (expandable)

## API Test Conversation View

API tests display results in a turn-based conversation format:

- Each turn shows the instruction and the AI's response
- JSON responses are automatically pretty-printed
- You can send **follow-up questions** to refine assertions or test additional endpoints
- Use **Export Conversation** to save the full API test exchange as HTML

## Runtime Indicators

The header shows:
- **Current model** — Which AI model is being used (e.g., "Claude Sonnet 4.5")
- **Automation mode** — Playwright MCP or Playwright CLI
- **Active agent** — Which agent is currently executing (e.g., "API Test Agent")
- **Connection status** — Green dot = connected to Copilot backend

## Post-Execution Actions

| Action | Description |
|--------|-------------|
| **Run Again** | Re-execute the same test |
| **New Test** | Start a fresh session (closes the browser) |
| **Export** | Save results as an HTML report |
