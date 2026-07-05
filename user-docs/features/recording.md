# Recording & Gherkin Generation

The Recording feature lets you capture browser interactions and have AI automatically generate Gherkin/BDD test scenarios from them.

## How It Works

1. **Record** — A Chrome browser opens and captures your interactions
2. **Review** — See a summary of all captured actions
3. **Generate** — AI converts your workflow into Gherkin `.feature` files
4. **Refine** — Iterate on the generated scenarios through conversation
5. **Export** — Save the final `.feature` file

## Starting a Recording

1. Click the **Video icon** in the left toolbar
2. Optionally enter a **starting URL**
3. Choose a **recording mode**:
   - **Standard** (recommended) — Captures clicks, typing, navigation, and form submissions
   - **Detailed** — Also captures hovers, focus events, mouse movement, and network requests
4. Click **Start Recording**

A Chrome browser window will open. Interact with the application as you would during a manual test.

## During Recording

While recording is active, the panel shows:

- **Recording status** with elapsed time
- **Action count** — Number of interactions captured so far
- **Live action feed** — Each interaction as it's captured (click, type, navigate, etc.)

Captured action types include:
- Clicks and double-clicks
- Text input and form submissions
- Page navigation and URL changes
- Dropdown selections
- Checkbox interactions
- Scroll events

## Stopping & Generating Tests

1. Click **Stop Recording** when your workflow is complete
2. A summary of recorded actions appears
3. Optionally provide **custom instructions** for the AI, such as:
   - "Create multiple scenarios including edge cases"
   - "Focus on validation and error handling"
   - "Use specific step definitions from our framework"
4. Click **Generate** to create Gherkin scenarios

## Reviewing & Refining

The generated `.feature` file is displayed with full Gherkin syntax highlighting. You can:

- **Refine** — Provide instructions like "Change the login step to use email instead of username"
- **View refinement history** — See all modifications made
- **Discard** — Start over if the output isn't useful
- **Export to File** — Save the `.feature` file to your computer
