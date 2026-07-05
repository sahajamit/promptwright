---
globs: ["**/*.test.ts", "**/e2e/**"]
---

# Testing Rules

## E2E Tests (packages/desktop/e2e/)

- Launch Electron via Playwright `_electron.launch()` from fixtures (`e2e/fixtures/electron-app.ts`)
- Use shared helpers from `e2e/fixtures/jarvis-helpers.ts` for persona selection, config changes, execution waiting
- After UI changes: run `pnpm build && pnpm test:e2e:smoke` (~6 seconds)
- View report: `pnpm --filter @jarvis-ai/desktop exec playwright show-report`

## Key Selectors (keep in sync if UI text changes)

- Persona modal: `h1:has-text('Choose Your Persona')` (PersonaModal.tsx:129)
- Test input: `textarea[placeholder="Enter your test steps here..."]` (ExecutionPanel.tsx:511)
- Run button: `button:has-text('Run Test')` (ExecutionPanel.tsx:537)
- Activity panel toggle: `button[title="Show activity logs"]` (Header.tsx:107)
- Verdict: text matching `TEST (PASSED|FAILED)` (LiveExecutionLog.tsx:637)
