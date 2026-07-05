# Agents & Skills

Click the **Bot icon** in the left toolbar to view all available AI agents and their capabilities.

## What Are Agents?

Agents are specialized AI personas, each with their own tools and instructions optimized for a specific type of testing task. The **Orchestrator** automatically selects the right agent based on your request — you don't need to choose one manually.

## Built-in Agents

### Orchestrator

The central router that receives every request. It classifies your task (web UI test, API test, recording) and dispatches it to the right specialized agent. Uses high-capability reasoning models for accurate intent classification.

### Playwright MCP Agent

Executes web UI tests using the Playwright browser automation framework via the Model Context Protocol (MCP). This provides rich tool integration for:

- Navigating to URLs
- Clicking elements, filling forms, selecting options
- Taking screenshots
- Handling dialogs and file uploads
- Running JavaScript on the page
- Managing browser tabs

### Playwright CLI Agent

A token-efficient alternative to the MCP agent. Uses command-line Playwright operations instead of the full MCP protocol, reducing token usage and cost for simpler tests.

### API Test Agent

Specialized for REST API testing. Performs HTTP requests, parses responses, and validates results. Supports:

- All HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Authentication (Bearer, Basic, API key, OAuth2)
- Request body formats (JSON, form-data, multipart)
- Response assertions (status codes, JSON fields, timing)
- Multi-step test flows with data passing

### Workflow Observer

Records browser interactions via Chrome DevTools Protocol (CDP) and generates intelligent Gherkin/BDD test specifications from the recorded workflow.

## Agent Cards

Each agent is displayed as a card showing:

- **Name and description**
- **Category** — Color-coded: blue (Web UI), green (API), purple (Recording), gray (Orchestration)
- **Status** — Active indicator and model info
- **Tags** — Quick identifiers like "PW MCP", "Orca"
- **Tools** — Count and list of available capabilities
