# Plan: Unified AI QA Assistant with Intent-Based Routing

## Context

JARVIS-AI currently uses separate personas (Manual Test Execution, Record & Repeat) selected via a startup modal. We want to:
1. **Unify into a single "AI QA Assistant"** persona that handles both web UI testing and REST API testing
2. **Add LLM-based intent detection** — classify user request as "web" or "api" before execution, then configure the appropriate workflow
3. **Redesign the home screen** — clean input box, examples gallery, no persona modal on startup
4. **Adapt UI dynamically** — browser preview for web tests, terminal-style API logs for API tests
5. **Move persona modal to Settings** — Record & Repeat and future personas accessible via gear icon, not blocking startup
6. **Keep extensible** for future protocols (FIX, GraphQL, gRPC)

---

## Architecture Overview

```
User enters task → LLM Classification (~2-3s) → Route to workflow
                                                    ├─ "web" → Playwright MCP session + browser preview UI
                                                    └─ "api" → Bash-only session + API terminal UI
```

---

## Implementation Steps

### Phase 1: API Test Execution Backend (3 new files, 2 modified)

Create the API testing skill that the LLM will use when routed to API workflow.

#### New files: `packages/core/src/personas/api-test-execution/`

**`system-prompt.ts`** — System prompt for API test execution:
```typescript
export const API_TEST_EXECUTION_SYSTEM_PROMPT = `Execute API test steps using bash commands (curl, node -e, or temp scripts).

Rules:
- Use Node.js native fetch() via "node -e" or curl for HTTP requests
- Show request details and full response (status, headers, body)
- Validate response status codes, body content, and headers as specified
- For multi-step flows, chain requests and pass data between them (use temp .mjs files)
- Never hardcode secrets — use environment variables
- After completing all test steps, provide final verdict:
  SUCCESS: "TEST PASSED: [summary of what was verified]"
  FAILURE: "TEST FAILED: [which step failed and why]"
`;
```

**`SKILL.md`** — Comprehensive API testing skill guide. Sections:
- Quick reference (curl, `node -e`, jq patterns)
- HTTP methods: GET, POST, PUT, PATCH, DELETE with examples
- Authentication: Bearer, Basic, API key, OAuth2 token flow
- Request patterns: JSON body, form-data, multipart, file upload
- Response validation: status codes, JSON field assertions via jq, response time
- Multi-step test flows: temp `.mjs` scripts for chaining requests
- Environment variables for secrets
- Verdict format: `TEST PASSED:` / `TEST FAILED:`

**`index.ts`** — Exports system prompt and skill path.

**Modified: `packages/core/src/index.ts`** — Export API test execution system prompt and skill path.

**Modified: `packages/desktop/src/main/index.ts`** — Add intent classification + session routing logic.

### Phase 2: Intent Classification Layer

#### Classification flow in main process (`packages/desktop/src/main/index.ts`)

When user submits a task:

1. **Create a lightweight classifier session** (no MCP, no tools, minimal prompt):
```typescript
async function classifyIntent(userInput: string): Promise<"web" | "api"> {
  const classifierClient = new CopilotClient({ cwd: workDir });
  await classifierClient.start();

  const session = await classifierClient.createSession({
    streaming: false,
    systemMessage: {
      type: "replace",
      content: `You are a classifier. Given a QA testing task, respond with ONLY one word: "web" or "api".

"web" = Browser/UI testing: navigating pages, clicking buttons, filling forms, visual verification, end-to-end web flows
"api" = API testing: HTTP requests, REST endpoints, status codes, response body/header validation, CRUD operations

Respond with ONLY "web" or "api". Nothing else.`
    }
  });

  const result = await session.send({ prompt: userInput });
  await classifierClient.stop();

  return result.trim().toLowerCase().includes("api") ? "api" : "web";
}
```

2. **Route to appropriate session config based on classification**:
```typescript
// After classification:
if (detectedIntent === "web") {
  // Configure with Playwright MCP + web system prompt (existing flow)
  mcpServers = buildMCPServersConfig(persona.requiredMCPs);
  systemPrompt = MANUAL_TEST_EXECUTION_SYSTEM_PROMPT;
} else {
  // Configure with bash-only + API system prompt + SKILL.md
  mcpServers = undefined;  // No MCP needed
  systemPrompt = API_TEST_EXECUTION_SYSTEM_PROMPT;
  agentSkill = loadApiSkill();
}
```

3. **Emit intent event to renderer** so UI can adapt:
```typescript
// New event type
mainWindow.webContents.send("jarvis-event", {
  type: "intent_classified",
  intent: "web" | "api"
});
```

#### New IPC handler: `jarvis:classify-intent`

```typescript
ipcMain.handle("jarvis:classify-intent", async (_, userInput: string) => {
  return await classifyIntent(userInput);
});
```

#### Preload API addition (`packages/desktop/src/preload.ts`):
```typescript
classifyIntent: (input: string) => ipcRenderer.invoke("jarvis:classify-intent", input),
```

### Phase 3: Home Screen Redesign

#### 3a. Replace PersonaModal with Settings Access

**`packages/desktop/src/renderer/App.tsx`** changes:
- Remove `showPersonaModal` blocking state on startup
- Default to "AI QA Assistant" persona (internally maps to `manual-test-execution` with routing)
- Auto-create session on app launch (no persona selection required)
- Add gear icon in Header that opens a Settings panel/modal for persona switching

**New default flow:**
```
App launches → Prerequisites check → Auto-init "AI QA Assistant" → Show home screen
```

#### 3b. New Home Screen (`ExecutionPanel.tsx` idle state redesign)

Replace the current idle state (textarea + "Run Test" button) with a cleaner design:

```
┌──────────────────────────────────────────────┐
│  🤖 AI QA Assistant                         │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Describe your testing task...          │  │
│  │                                        │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [▶ Run]                    [📋 Examples]    │
│                                              │
│  ○ GPT-4o  ○ MCP Mode                       │
│                                              │
└──────────────────────────────────────────────┘
```

Key elements:
- **Clean textarea** with placeholder "Describe your testing task..."
- **Run button** — triggers classification → routing → execution
- **Examples button** — opens examples gallery modal
- **Small labels** — model name, execution mode (for web tests)

#### 3c. Examples Gallery Modal (New Component)

**`packages/desktop/src/renderer/components/ExamplesGallery.tsx`**

A modal/drawer with example tasks grouped by capability:

```
┌────────────────────────────────────────────┐
│  📋 Example Tasks                    [✕]   │
│                                            │
│  🌐 Web UI Testing                         │
│  ┌──────────────────────────────────────┐  │
│  │ "Navigate to example.com/login,     │  │
│  │  fill email and password, click     │  │
│  │  Login, verify dashboard loads"     │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ "Search for 'laptop' on amazon.com  │  │
│  │  and verify results contain prices" │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  🔌 API Testing                            │
│  ┌──────────────────────────────────────┐  │
│  │ "Send GET to httpbin.org/get and    │  │
│  │  verify status 200"                 │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ "Create a post on jsonplaceholder,  │  │
│  │  fetch it back, verify fields"      │  │
│  └──────────────────────────────────────┘  │
│                                            │
└────────────────────────────────────────────┘
```

- Clicking an example fills the textarea
- Grouped by capability type (web, API, future: FIX, GraphQL)
- Each example is a card with the task text

### Phase 4: Dynamic UI Adaptation (Web vs API Execution)

#### 4a. New Event Type

Add to `packages/core/src/types.ts`:
```typescript
| { type: "intent_classified"; intent: "web" | "api" }
```

#### 4b. ExecutionPanel Conditional Rendering

**`packages/desktop/src/renderer/components/ExecutionPanel.tsx`**:

Add `detectedIntent` state. During execution:

```typescript
// Web test execution → existing behavior
{detectedIntent === "web" && (
  <LiveExecutionLog ... />  // Includes browser preview
)}

// API test execution → new terminal-style log
{detectedIntent === "api" && (
  <APIExecutionLog ... />  // New component
)}
```

#### 4c. New Component: `APIExecutionLog.tsx`

Terminal-style dark theme container for API test execution:

```
┌──────────────────────────────────────────────┐
│  📡 API Execution Log           [Expand ▼]   │
│ ┌──────────────────────────────────────────┐ │
│ │ $ curl -s https://httpbin.org/get        │ │
│ │                                          │ │
│ │ → Status: 200 OK                         │ │
│ │ → Headers:                               │ │
│ │   Content-Type: application/json         │ │
│ │ → Body:                                  │ │
│ │   {                                      │ │
│ │     "url": "https://httpbin.org/get",    │ │
│ │     "origin": "1.2.3.4"                  │ │
│ │   }                                      │ │
│ │                                          │ │
│ │ ✅ Assertion: status === 200 → PASSED    │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│  TEST PASSED: GET /get returns 200 with URL  │
└──────────────────────────────────────────────┘
```

- Dark background (`bg-gray-900 text-green-400` or similar terminal aesthetic)
- Monospace font
- Auto-scroll during execution
- Collapsible request/response detail sections
- Streams execution log messages in real-time (same event system as web)
- The data comes from the same `message_delta` and `tool_start`/`tool_complete` events — just styled differently

#### 4d. LiveExecutionLog.tsx Changes

In `LiveExecutionLog.tsx`, hide the browser preview section when intent is "api":
- Pass `testType: "web" | "api"` prop
- Conditionally render Live Browser View section (only when `testType === "web"`)
- Skip screencast subscription when `testType === "api"`

### Phase 5: Settings Panel for Persona Access

**`packages/desktop/src/renderer/components/SettingsPanel.tsx`** (or extend existing settings):

- Accessible via gear icon in Header
- Shows current persona: "AI QA Assistant (default)"
- Option to switch to "Record & Repeat" or other future personas
- Switching persona triggers full session recreation (existing `persona:select` IPC)

---

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/personas/api-test-execution/index.ts` | API system prompt + skill path exports |
| `packages/core/src/personas/api-test-execution/system-prompt.ts` | API execution system prompt |
| `packages/core/src/personas/api-test-execution/SKILL.md` | Comprehensive API testing skill guide |
| `packages/desktop/src/renderer/components/ExamplesGallery.tsx` | Examples gallery modal grouped by capability |
| `packages/desktop/src/renderer/components/APIExecutionLog.tsx` | Terminal-style API execution log component |

### Modified Files
| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Export API test execution prompt + skill path |
| `packages/core/src/types.ts` | Add `intent_classified` event type |
| `packages/desktop/src/main/index.ts` | Add `classifyIntent()`, new IPC handler, routing logic, move persona init to auto-default |
| `packages/desktop/src/preload.ts` | Add `classifyIntent` IPC bridge |
| `packages/desktop/src/renderer/App.tsx` | Remove blocking persona modal, auto-init AI QA Assistant, add settings gear icon |
| `packages/desktop/src/renderer/components/ExecutionPanel.tsx` | Add intent state, conditional rendering (web vs API), cleaner idle screen |
| `packages/desktop/src/renderer/components/LiveExecutionLog.tsx` | Accept `testType` prop, hide browser preview for API tests |
| `packages/desktop/src/renderer/components/Header.tsx` | Add gear icon for settings/persona switching |
| `packages/desktop/src/renderer/components/ChatInterface.tsx` | Update routing — AI QA Assistant uses ExecutionPanel |

### Potentially Modified
| File | Change |
|------|--------|
| `packages/desktop/src/renderer/hooks/useTestExecution.ts` | Add `detectedIntent` state, handle `intent_classified` event |
| `packages/core/src/personas/types.ts` | Add optional `tools` field for future extensibility |
| `packages/core/src/client.ts` | Pass `tools` to session config |

---

## Future Protocol Extensibility

When adding FIX, GraphQL, gRPC:
1. Add new skill files: `packages/core/src/personas/<protocol>-test-execution/SKILL.md`
2. Add new intent classification category (extend the classifier prompt)
3. Add protocol-specific section to ExamplesGallery
4. Route to appropriate system prompt + skill
5. Each protocol reuses the same API terminal log UI (or gets its own if needed)
6. For stateful protocols (FIX), add custom `defineTool()` tools via Persona `tools` field

---

## Testing Strategy

### Public APIs for E2E Tests (free, no auth required)

| API | URL | Use Case |
|-----|-----|----------|
| **httpbin.org** | `/get`, `/post`, `/status/{code}`, `/headers` | Simple echo service, predictable |
| **JSONPlaceholder** | `jsonplaceholder.typicode.com/posts` | CRUD tests, multi-step flows |
| **ReqRes** | `reqres.in/api/users`, `/api/login` | Auth simulation, pagination |

### E2E Tests

#### 1. Smoke test update (`packages/desktop/e2e/smoke/dev-mode.spec.ts`)
- Verify app launches directly to AI QA Assistant home screen (no persona modal)
- Verify input box, Run button, Examples button visible
- Verify gear icon accessible for settings

#### 2. New test: `packages/desktop/e2e/execution/api-execution.spec.ts`

**Test 1 — Simple GET** (timeout: 300s):
- Enter: "GET https://httpbin.org/get, verify status 200"
- Assert: intent classified as "api", bash tool used, no playwright tools, verdict pass/fail

**Test 2 — Multi-step CRUD** (timeout: 420s):
- Enter: "POST to jsonplaceholder /posts with JSON, verify 201. Then GET /posts/1, verify 200"
- Assert: multiple bash calls (>= 2), verdict pass/fail

**Test 3 — Web test still works** (timeout: 420s):
- Enter: "Navigate to example.com and verify the page title"
- Assert: intent classified as "web", playwright tools used, browser preview visible

#### Tool Assertions
| Test Type | `bash` present | `playwright_*` present |
|-----------|---------------|----------------------|
| API | `true` | `false` |
| Web | may be present | `true` |

### Test Commands
```bash
pnpm build
pnpm test:e2e:smoke
pnpm --filter @jarvis-ai/desktop exec playwright test e2e/execution/api-execution.spec.ts
```

### Manual Verification
1. Launch app → verify clean home screen, no persona modal
2. Enter API task → verify classification indicator → verify terminal-style logs
3. Enter web task → verify browser preview appears
4. Click Examples → verify gallery with web + API examples
5. Click gear → verify can switch to Record & Repeat
