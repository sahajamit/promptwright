# Playwright Browser Automation Skill

## MCP Server
This persona uses Microsoft's @playwright/mcp server for browser automation.

## Available Tools
- browser_navigate: Navigate to a URL
- browser_click: Click an element
- browser_type: Type text into an element  
- browser_fill: Fill a form field (clears existing content)
- browser_select: Select dropdown option
- browser_hover: Hover over an element
- browser_screenshot: Capture screenshot
- browser_wait: Wait for element or condition
- browser_get_text: Get text content of element
- browser_get_attribute: Get element attribute value

## Best Practices

### Locator Strategies
1. **Prefer semantic locators:**
   - `getByRole('button', { name: 'Submit' })`
   - `getByLabel('Email address')`
   - `getByPlaceholder('Enter your email')`
   - `getByText('Welcome back')`

2. **Use data-testid for dynamic content:**
   - `getByTestId('user-profile-menu')`

3. **Avoid fragile selectors:**
   - Don't use: `.btn-primary`, `#submit-btn`, `div > span:nth-child(2)`
   - These break easily with UI changes

### Waiting Strategies
- Always wait for elements before interacting
- Use `waitForSelector` with appropriate timeout
- Check for loading states before assertions

### Error Recovery
- If click fails, try scrolling element into view
- If element not visible, check for modals/overlays
- If text input fails, verify field is enabled and not readonly

### Assertions
- Verify page title or URL after navigation
- Check for expected text content
- Validate element visibility for UI state

## Test Execution Flow
1. Announce what you're about to do
2. Execute the action using appropriate Playwright tool
3. Wait for the result
4. Verify the expected outcome
5. Move to the next step

## Error Reporting
When a step fails:
1. Take a screenshot of the current state
2. Explain what was expected vs what happened
3. Suggest possible fixes (e.g., "The element might not be visible, try scrolling")
4. Mark the test as FAILED with the failing step number
