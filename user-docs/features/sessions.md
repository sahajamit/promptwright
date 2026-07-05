# Sessions & Export

JARVIS-AI automatically manages test sessions to keep your work organized and accessible.

## Session Sidebar

Toggle the **Chat icon** in the toolbar to show/hide the session sidebar. Each session shows:

- **Title** — Derived from the first message (first 50 characters)
- **Time** — How long ago the session was last active (e.g., "2h ago")
- **Message count** — Number of messages in the conversation

The currently active session is highlighted with a blue border.

## Managing Sessions

### Creating a New Session

Click the **New Test** button in the header. This:

- Creates a fresh session with a clean state
- Closes any open browser from the previous session
- Clears the activity logs

A new session is also created automatically on first launch.

### Switching Sessions

Click any session in the sidebar to load it. Your full conversation history and test results are preserved.

### Deleting Sessions

Hover over a session and click the delete icon. A confirmation dialog appears before deletion.

## Exporting Results

### Session Export

Hover over a session with execution data and click the **export icon** to save it as a formatted HTML report. The report includes:

- All conversation messages
- Test verdict (PASS/FAIL)
- Execution details

### API Conversation Export

For API tests, use the **Export Conversation** button within the execution view. This creates an HTML file with:

- All request/response turns
- Formatted JSON
- Test verdicts

### Gherkin Export

After recording and generating a Gherkin scenario, use **Export to File** to save the `.feature` file.

## Activity Logs

Click the **Activity Logs** toggle at the bottom of the toolbar to show the log panel on the right side. Logs include:

| Log Type | Icon | Shows |
|----------|------|-------|
| **Tool Execution** | Wrench (blue) | Playwright/API tool calls with arguments and results |
| **AI Reasoning** | Brain (purple) | Model's thinking process (when using reasoning models) |
| **Errors** | Alert (red) | Execution errors with details |
| **Recording Events** | Video (green) | Recording start/stop and action counts |
| **Prompt Info** | Message (amber) | Model used, test input, system prompt |

You can **expand** any log entry for full details, **copy all logs as JSON** for debugging, or **clear** the log.
