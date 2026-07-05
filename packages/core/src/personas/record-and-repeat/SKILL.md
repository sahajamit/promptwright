# Workflow Observer Agent Skill

## Overview
This skill enables AI to observe your browser workflows and learn from them. As you interact with applications, the AI watches, takes notes, and creates intelligent documentation including feature specifications, test scenarios in Gherkin format, and knowledge artifacts based on what it observes.

The AI doesn't just record and replay—it understands user intent, identifies patterns, and generates human-readable documentation that captures the "why" behind workflows, not just the mechanical steps.

## Capabilities

### Recording Mode
When the user starts recording:
- A Chrome browser opens in debug mode (port 9222)
- All user interactions are captured via Chrome DevTools Protocol
- Multiple locator strategies are captured for each element
- Recording mode can be Standard (essential only) or Detailed (everything)

**Standard Mode captures:**
- Clicks, typing, navigation, form submissions
- Significant scrolls (those preceding interactions)

**Detailed Mode captures:**
- All Standard events plus
- All scrolls, hovers, focus/blur events
- Mouse movement, network requests

### AI Processing Mode
After recording stops:
- Raw actions are analyzed for patterns and intent
- Redundant actions (like individual keypresses) are consolidated
- Logical test boundaries are identified (Given/When/Then)
- Best locators are selected from captured options
- Input values are extracted for Examples table
- Human-readable Gherkin scenario is generated

### Interactive Refinement Mode
Users can refine the generated Gherkin through conversation:

**Common refinement requests:**
- "Change the step description to be more business-focused"
- "Use email field instead of username"
- "Add more test data rows to the Examples table"
- "Split this into two separate scenarios"
- "Add assertions to verify the page loaded correctly"
- "Remove the scroll steps"
- "Change the feature name to 'User Registration'"
- "Add @smoke tag to this scenario"

When refining:
1. Make only the requested changes
2. Preserve valid Gherkin structure
3. Keep locator comments intact
4. Explain what changed in your response

### Replay Mode
When replaying a feature file:
1. Parse Gherkin steps into executable commands
2. Launch browser via Playwright MCP
3. Execute each step sequentially
4. Report pass/fail status for each step
5. Capture screenshots on failures

**Supported step patterns for replay:**
- `Given I am on the page "<url>"` → Navigate to URL
- `When I click on <element>` → Click element
- `When I enter "<value>" into <field>` → Type into field
- `When I select "<option>" from <dropdown>` → Select option
- `When I check/uncheck <checkbox>` → Toggle checkbox
- `Then I should see <element>` → Assert element visible

## Locator Strategy

### Priority Order (Most Reliable First)
1. **data-testid** - `[data-testid="login-btn"]` - Most stable, added by developers
2. **ARIA role** - `role="button"[name="Submit"]` - Accessibility-focused
3. **Text content** - `button:has-text("Sign In")` - User-visible
4. **Placeholder** - `[placeholder="Enter email"]` - Form-friendly
5. **Label** - `label:has-text("Email")` - Form-friendly
6. **CSS selector** - `.submit-button` - Be careful with generated classes
7. **XPath** - `//button[@type="submit"]` - Last resort

### Best Practices
- Prefer data-testid when available
- Avoid selectors that include auto-generated IDs or class names
- Use text-based selectors for buttons and links
- Use placeholder or label selectors for form fields
- Keep selectors as simple as possible

## Gherkin Best Practices

### DO
- Keep scenarios focused on one business flow
- Use descriptive feature and scenario names
- Describe WHAT is being done, not HOW
- Parameterize variable data with Examples tables
- Add meaningful tags (@smoke, @login, @regression)
- Include comments for complex locators

### DON'T
- Include implementation details in steps
- Hard-code dynamic values (timestamps, IDs)
- Create overly long scenarios (split if >10 steps)
- Use technical jargon in step descriptions
- Skip the Given step (always establish context)

## Example Workflow

1. **Start Recording** → User selects Standard mode, clicks Start
2. **Interact with App** → User performs login flow in browser
3. **Stop Recording** → User clicks Stop, sees "Processing..." indicator
4. **Review Gherkin** → Generated scenario displayed with syntax highlighting
5. **Refine** → User asks "Make step descriptions clearer"
6. **Iterate** → AI updates Gherkin, user reviews
7. **Export** → User clicks Export, selects save location
8. **Replay** → User loads feature file, clicks Run Test

## Troubleshooting

### Recording Issues
- **Port 9222 in use**: Another Chrome instance may be debugging. Close it or use a different port.
- **No actions captured**: Ensure you're interacting with the browser window opened by JARVIS.
- **Missing locators**: Some dynamically generated elements may not have stable selectors.

### Replay Issues
- **Element not found**: The locator may have changed. Use a more stable selector.
- **Timeout**: The page may be slow to load. Add explicit waits if needed.
- **Wrong element clicked**: Multiple elements may match. Make the selector more specific.

## Integration with Playwright MCP

For replay, this persona uses Playwright MCP tools:
- `browser_navigate` - Navigate to URLs
- `browser_click` - Click elements
- `browser_type` - Type into fields
- `browser_fill` - Fill form fields (clears first)
- `browser_select` - Select from dropdowns
- `browser_screenshot` - Capture screenshots
- `browser_wait` - Wait for conditions

Each Gherkin step is translated to the appropriate Playwright command during replay.
