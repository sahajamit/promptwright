# New Features - Desktop App

## What's New

### 1. **JARVIS AI Logo**
- Logo displayed in the header
- Set as the desktop app icon for all platforms (macOS, Windows, Linux)

### 2. **New Chat Button**
- Bright cyan button in the header to start a fresh chat session
- Automatically saves the current session before creating a new one
- Clears activity logs for a clean start

### 3. **Session History Sidebar**
- **Location**: Left side panel (collapsible)
- **Toggle**: Click the panel icon in the header to show/hide
- **Features**:
  - View all past chat sessions
  - Session titles auto-generated from first message
  - Timestamps showing when each session was last updated
  - Message count for each session
  - Click any session to load it
  - Hover over a session to reveal delete button
  - Current session highlighted in cyan

### 4. **Persistent Storage**
- All chat sessions automatically saved to `~/.jarvis/` directory
- Sessions persist across app restarts
- Each session stored as a JSON file
- Automatic saving after each message
- Session titles update automatically

## How to Use

### Starting a New Chat
1. Click the **"New Chat"** button in the header (cyan button with + icon)
2. Your current session will be saved automatically
3. Activity logs will be cleared
4. Start typing your new conversation

### Accessing Session History
1. Click the **panel icon** on the left side of the header to open/close the sidebar
2. Browse your previous chat sessions
3. Click any session to load it
4. Your messages and conversation will be restored

### Deleting a Session
1. Open the session history sidebar
2. Hover over the session you want to delete
3. Click the **trash icon** that appears
4. Confirm the deletion

### Session Titles
- New sessions start with "New Chat" as the title
- After sending the first message, the title automatically updates to the first 50 characters
- Titles are truncated with "..." if longer than 50 characters

## Storage Location

All your chat data is stored in:
```
~/.jarvis/
```

Each session is a JSON file named `session-{timestamp}.json` containing:
- Session ID
- Title
- Creation timestamp
- Last update timestamp
- All messages in the conversation

## Tips

- Sessions are sorted by most recently updated at the top
- The sidebar remembers whether it was open or closed
- Activity logs are specific to the current session
- Switching sessions clears activity logs but preserves chat history

## Keyboard Shortcuts

(To be implemented in future versions)
- `Cmd/Ctrl + N`: New chat
- `Cmd/Ctrl + B`: Toggle sidebar
- `Cmd/Ctrl + L`: Toggle activity logs
