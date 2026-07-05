---
globs: ["**/*.ts", "**/*.tsx"]
---

# TypeScript Conventions

- **ESM only**: All packages use `"type": "module"`. ALWAYS use `.js` extension in imports (`import { Foo } from "./foo.js"`)
- **Module resolution**: `"moduleResolution": "NodeNext"` — no path aliases
- **Strict mode**: Base config in `tsconfig.base.json`, all packages extend it
- **Event-driven**: Major components extend `EventEmitter` for streaming/progress (events: `chunk`, `tool_start`, `chunk_complete`, `state_change`, `action_recorded`)

## Security — Logging Hygiene

- Never log full MCP server configs (contain merged `env` values)
- Never log full Copilot SDK session config/status payloads
- Prefer sanitized summaries (counts, server names, booleans)
- Treat PATH/home/profile values as sensitive in app logs
