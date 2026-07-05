---
name: build-and-test
description: Build all packages and run smoke tests to validate the app
user_invocable: true
---

# Build and Test

Build all JARVIS-AI packages and run E2E smoke tests.

## Steps

1. Run `pnpm build` to compile all packages (core, cli, desktop)
2. Run `pnpm test:e2e:smoke` to validate the desktop app launches and renders correctly
3. Report build and test results, including any failures
