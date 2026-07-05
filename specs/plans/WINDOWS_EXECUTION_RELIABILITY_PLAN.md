# Windows Execution Reliability Plan (Orchestrator Branch)

## Problem summary
Windows packaged users are hitting execution failures that do not appear on macOS. From the provided logs and current-branch code analysis, the blockers are:

1. **Shell/tool mismatch on Windows**
   - Agent execution attempts use the `powershell` tool, which requires `pwsh` (PowerShell 6+).
   - Many Windows machines only have Windows PowerShell 5.1, causing immediate execution failure for web CLI and API tasks.

2. **Packaged Playwright CLI entry resolution issue (dev-branch evidence)**
   - `node ...\\resources\\app.asar\\node_modules\\@playwright\\cli\\playwright-cli.js install --skills`
   - This fails with `MODULE_NOT_FOUND` in packaged mode because plain Node subprocess execution against paths inside `app.asar` is brittle/non-portable.

3. **Current branch architecture gap for CLI mode bootstrap**
   - Current orchestrator flow routes to `pw-cli-agent` by preference, but does not yet provide a robust Windows-safe CLI bootstrap path equivalent to earlier persona flow (skill/config/runtime setup and diagnostics).

4. **Out of scope (explicitly excluded)**
   - `No frames captured` screencast/recording issue is tracked separately and is not included in this plan.

## Agreed assumptions
- We will **not require PowerShell 7 (`pwsh`) installation** for Windows users.
- Scope is strictly execution blockers (web MCP/CLI + API execution reliability), not recording pipeline issues.

## Proposed approach
Implement a **Windows-safe execution substrate** for orchestrator agents and a **packaged-safe Playwright CLI bootstrap**, so execution does not depend on pwsh and packaged paths inside `app.asar`.

### Design direction
1. Introduce a **cross-platform command-execution path** (custom tool) that can run commands via `cmd.exe` on Windows and shell on Unix.
2. Make `playwright-cli` runtime resolution packaged-aware (prefer unpacked/runtime-safe paths).
3. Wire CLI bootstrap into orchestrator-session spawning for `pw-cli-agent` (config + env + diagnostics).
4. Update agent prompts to be shell-tool neutral (not “via bash”).
5. Add fail-fast Windows packaging validation for Playwright CLI runtime artifact(s).

## Implementation todos
1. **Add packaged-safe Playwright CLI resolver/launcher in core**
   - File: `packages/core/src/mcp/playwright-cli-manager.ts`
   - Add helper(s) to resolve CLI entry for dev vs packaged mode.
   - Avoid direct `node <app.asar/...>` execution path assumptions.
   - Ensure install/cleanup flows use the same resolver to avoid path drift.

2. **Add cross-platform command execution tool for agent sessions**
   - Files: `packages/core/src/agents/session-manager.ts`, `packages/core/src/agents/tools/*` (new), and related types.
   - Provide a custom command tool that executes:
     - Windows: `cmd.exe /d /s /c ...`
     - macOS/Linux: standard shell execution path.
   - Return stdout/stderr/exit status with deterministic formatting.

3. **Inject the command tool into sub-agent sessions (especially pw-cli + api-test)**
   - Files: `packages/core/src/agents/orchestrator.ts`, `packages/core/src/agents/tools/route-to-agent.ts`, `packages/core/src/agents/session-manager.ts`.
   - Extend spawn/config override plumbing so sub-agent sessions receive required custom tools and per-agent runtime context.

4. **Wire Windows-safe CLI bootstrap into orchestrator runtime flow**
   - Files: `packages/desktop/src/main/index.ts` (+ possibly core helpers).
   - Before/while using `pw-cli-agent`, ensure:
     - Playwright CLI entry resolves correctly in packaged mode.
     - `playwright-cli.json` is written to active workDir with CDP endpoint.
     - Mode-specific diagnostics are surfaced if bootstrap fails.
   - Avoid “healthy CLI mode” state when bootstrap prerequisites fail.

5. **Make prompts/tooling language shell-neutral and Windows-safe**
   - Files:
     - `packages/core/src/agents/built-in/pw-cli.agent.md`
     - `packages/core/src/personas/manual-test-execution/system-prompt.ts`
     - `packages/core/src/personas/record-and-repeat/system-prompt.ts`
     - `packages/core/src/agents/built-in/api-test.agent.md` (if needed for explicit command-tool guidance)
   - Replace “via bash” phrasing with neutral “use command execution tool” instructions.
   - Keep Node-first guidance for API tests.

6. **Add Windows packaging verification guardrails for Playwright CLI**
   - File: `scripts/build-win-portable.sh`
   - Add explicit checks for required Playwright CLI runtime artifact(s) needed by packaged execution path.
   - Fail build early with actionable error if missing.

7. **Validate with Windows execution matrix (packaged app)**
   - Playwright MCP mode web test succeeds.
   - Playwright CLI mode web test executes commands without `pwsh` blocker.
   - API test execution succeeds using node/curl flow without `pwsh` dependency.
   - Confirm no `MODULE_NOT_FOUND` for Playwright CLI runtime entry in packaged logs.

## Notes / considerations
- Current branch is orchestrator-first; port behavior semantically rather than reintroducing legacy persona plumbing verbatim.
- Keep error handling explicit: surface actionable diagnostics to UI/logs instead of silent fallbacks.
- Preserve existing macOS behavior while adding Windows-specific safeguards.

## Progress update
- ✅ Added packaged-safe Playwright CLI resolver/launcher helpers in `packages/core/src/mcp/playwright-cli-manager.ts`:
  - `resolvePlaywrightCLIEntry(...)`
  - `ensurePlaywrightCLICommandInWorkDir(...)`
  - install/kill flows now support packaged context options.
- ✅ Added cross-platform command tool `run_command` in `packages/core/src/agents/tools/run-command.ts` (cmd.exe on Windows, /bin/sh on Unix).
- ✅ Injected runtime command tool into sub-agent sessions through orchestrator route/session plumbing (`session-manager.ts`, `route-to-agent.ts`, `orchestrator.ts`, `client.ts`, `types.ts`).
- ✅ Wired CLI bootstrap in desktop orchestrator init (`packages/desktop/src/main/index.ts`):
  - resolves packaged Playwright CLI entry
  - creates local `playwright-cli` launcher in workDir
  - writes `playwright-cli.json` with CDP endpoint
  - seeds per-agent runtime env/context for `pw-cli-agent` and `api-test-agent`.
- ✅ Updated shell wording to tool-neutral + explicit `run_command` usage:
  - `packages/core/src/agents/built-in/pw-cli.agent.md`
  - `packages/core/src/agents/built-in/api-test.agent.md`
  - `packages/core/src/personas/manual-test-execution/system-prompt.ts`
  - `packages/core/src/personas/record-and-repeat/system-prompt.ts`
- ✅ Added Windows packaging guardrail in `scripts/build-win-portable.sh` for Playwright CLI runtime artifact:
  - `resources/app.asar.unpacked/node_modules/@playwright/cli/playwright-cli.js`

## Validation run
- ✅ `pnpm --filter @jarvis-ai/core typecheck`
- ✅ `pnpm --filter @jarvis-ai/core build`
- ✅ `pnpm --filter @jarvis-ai/desktop exec tsc -p tsconfig.main.json --noEmit`
- ✅ `pnpm --filter @jarvis-ai/desktop exec tsc -p tsconfig.preload.json --noEmit`
- ✅ `pnpm --filter @jarvis-ai/desktop build:main`
- ✅ `pnpm --filter @jarvis-ai/desktop build:preload`
- ✅ `bash -n scripts/build-win-portable.sh`
- ⛔ Windows packaged runtime matrix (MCP/CLI/API) remains pending manual verification on a Windows machine.
