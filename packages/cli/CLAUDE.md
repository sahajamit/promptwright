# packages/cli

Terminal interface for JARVIS-AI using `commander` (CLI framework) and `chalk` (colored output).

## Development

```bash
pnpm dev:cli          # Run in dev mode (uses tsx)
```

- Entry point: `src/index.ts` → registered as `jarvis` bin command
- Verbose mode: `jarvis -v` for debug logging
- Depends on `@jarvis-ai/core` — rebuild core first if making changes there
