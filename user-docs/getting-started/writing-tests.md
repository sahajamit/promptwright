# Writing Tests

JARVIS-AI accepts test descriptions in natural language. The AI orchestrator automatically determines whether your test is a web UI test or an API test and routes it to the right agent.

## Web UI Tests

Describe browser interactions step by step:

```
1. Navigate to https://demo.playwright.dev/todomvc
2. Add a new todo item "Buy groceries"
3. Add another todo item "Walk the dog"
4. Verify both items appear in the list
5. Mark "Buy groceries" as complete
6. Click the "Active" filter
7. Verify only "Walk the dog" is visible
```

### Tips for Web Tests

- **Be specific about elements** — "Click the Submit button" is better than "Click the button"
- **Include URLs** — Always specify where to navigate
- **Use numbered steps** — Helps the AI follow a clear sequence
- **State expectations** — "Verify the page shows 'Welcome back'" tells the AI what to check
- **Mention waits when needed** — "Wait for the page to fully load" for slow pages

## API Tests

Describe HTTP requests and expected responses:

```
Send a GET request to https://jsonplaceholder.typicode.com/posts/1
Verify the response status is 200
Verify the response body has a "title" field
```

### API Test Capabilities

- **HTTP methods**: GET, POST, PUT, PATCH, DELETE
- **Authentication**: Bearer tokens, Basic auth, API keys, OAuth2
- **Request bodies**: JSON, form-data, multipart, file uploads
- **Validations**: Status codes, JSON field assertions, response timing
- **Multi-step flows**: Chain requests and pass data between them

You can ask **follow-up questions** during API test execution to refine assertions or test edge cases.

## Uploading Feature Files

Instead of typing test steps, you can upload a `.feature` file (Gherkin/BDD format):

1. Click the **Upload File** button next to the input area
2. Select a `.feature` file from your computer
3. The file contents appear as a preview
4. Click **Run Test** to execute

## Examples Gallery

Click the **Examples** button on the home screen to browse template test scenarios. Select one to pre-fill the input area and customize it before running.
