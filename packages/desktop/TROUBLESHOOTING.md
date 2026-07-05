# Troubleshooting Guide

## Common Issues

### Port 5173 Already in Use

If you see `Error: Port 5173 is already in use`, kill the existing process:

```bash
# macOS/Linux
lsof -ti:5173 | xargs kill -9

# Or use the npm script
pnpm clean:port
```

### TypeScript Compilation Errors

If you see TypeScript errors related to type conflicts between Electron and Node:

1. Make sure `skipLibCheck: true` is set in all tsconfig files
2. Clean and rebuild:
   ```bash
   pnpm clean
   pnpm dev
   ```

### Preload Script Not Loading

If the preload script isn't working:

1. Check that `src/preload.js` exists
2. Compile it manually:
   ```bash
   pnpm build:preload
   ```
3. Restart the dev server

### Electron Window Opens but Shows Black Screen

1. Check the DevTools console for errors
2. Verify Vite is running on http://localhost:5173
3. Check that CSP isn't blocking resources
4. Clear browser cache: `Cmd+Shift+R` (macOS) or `Ctrl+Shift+R` (Windows/Linux)

### Sessions Not Saving

1. Check that `~/.jarvis/` directory exists and is writable
2. Check DevTools console for errors
3. Verify IPC handlers are registered in main process

### Clean Slate

To start fresh:

```bash
pnpm clean
rm -rf node_modules
rm -rf ~/.jarvis/*  # WARNING: This deletes all your saved sessions!
pnpm install
pnpm dev
```

## Development Tips

### Viewing Saved Sessions

Your chat sessions are saved in:
```
~/.jarvis/
```

Each file is named `session-{timestamp}.json` and can be viewed with any text editor.

### DevTools

The Electron DevTools open automatically in development mode. Use them to:
- Debug renderer process issues
- View network requests
- Inspect React components (with React DevTools extension)
- Monitor console logs

### Hot Reload

- **Renderer**: Changes to React components hot reload automatically
- **Main Process**: Requires restarting Electron (Ctrl+C and restart `pnpm dev`)
- **Preload**: Requires restarting Electron

## Error Messages

### "Cannot find module 'electron'"

Make sure dependencies are installed:
```bash
pnpm install
```

### "window.jarvis is undefined"

The preload script isn't loading. Check:
1. Preload script compiled: `ls src/preload.js`
2. Path in main process is correct
3. Electron is running (not just Vite in browser)

### CSP Errors in Console

If you see Content Security Policy errors, check that:
1. CSP meta tag is removed from `index.html`
2. CSP is configured in main process for development mode
