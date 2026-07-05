# Desktop App Development Guide

## Features

- **Chat Interface**: Interact with JARVIS AI in a native desktop application
- **Session Management**: Automatically save and restore chat sessions
- **Session History**: Browse and switch between previous conversations
- **Activity Logs**: Monitor tool executions and AI reasoning in real-time
- **Working Directory**: Select a folder for JARVIS to work in
- **Persistent Storage**: Chat sessions are saved to `~/.jarvis/` directory

## Running the Desktop App

The JARVIS AI desktop app is an Electron application that requires running in the Electron environment, not a regular browser.

### Development Mode

To run the app in development mode:

```bash
cd packages/desktop
pnpm dev
```

This command will:
1. Start the TypeScript compiler for the main process (watch mode)
2. Start the TypeScript compiler for the preload script (watch mode)
3. Start the Vite development server for the renderer
4. Wait for Vite to be ready, then launch Electron

The Electron window will open automatically with:
- Hot Module Replacement (HMR) for the renderer
- DevTools opened automatically
- File watchers for auto-recompilation

### Why You Can't Test in a Browser

The app uses Electron's IPC (Inter-Process Communication) to expose the `window.jarvis` API through a preload script. This API is only available when running inside Electron, not in a regular browser.

If you open `http://localhost:5173` in a browser, you'll see a black screen or errors because:
- The `window.jarvis` API doesn't exist
- Electron-specific features aren't available

### Building for Production

```bash
pnpm build
pnpm start
```

Or to package the app:

```bash
pnpm package
```

## Architecture

- **Main Process** (`src/main/index.ts`): Electron main process, manages windows and IPC
- **Preload Script** (`src/preload.ts`): Bridges main and renderer processes securely
- **Renderer Process** (`src/renderer/`): React app that runs in the Electron window
  - **Components**: UI components (Header, ChatInterface, SessionSidebar, ActivityLogs)
  - **Hooks**: React hooks for state management (useChat, useSession)
  - **Services**: Business logic (session-storage, thread-storage)

## Data Storage

Chat sessions are automatically saved to `~/.jarvis/` in your home directory:
- Each session is stored as a separate JSON file
- Sessions include messages, timestamps, and titles
- Data persists across app restarts

## Troubleshooting

### Black Screen in Electron

1. Check the DevTools console for errors
2. Ensure all dependencies are installed: `pnpm install`
3. Clean and rebuild: `pnpm clean && pnpm dev`

### Port Already in Use

If port 5173 is already in use, kill the process:

```bash
lsof -ti:5173 | xargs kill -9
```

### Preload Script Not Loading

Make sure the preload TypeScript compiler is running. You should see output from `dev:preload` in the console.
