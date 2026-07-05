# Welcome to JARVIS-AI

JARVIS-AI is an AI-powered QA Assistant that helps you test web applications and APIs using natural language. Describe what you want to test, and JARVIS-AI takes care of the rest — launching browsers, executing steps, and reporting results.

## What You Can Do

- **Test Web UIs** — Describe test scenarios in plain English and watch them execute in a real browser with live screencast
- **Test APIs** — Send HTTP requests, validate responses, and run multi-step API test flows
- **Record Workflows** — Capture browser interactions and let AI generate Gherkin/BDD test scenarios from them
- **Upload Feature Files** — Import `.feature` files and execute them directly
- **Export Reports** — Save test results as HTML reports for sharing with your team

## How It Works

JARVIS-AI uses an intelligent **orchestrator** that automatically routes your request to the right agent:

| Your Request | Agent Used | What Happens |
|---|---|---|
| "Test the login page at..." | Playwright Agent | Browser launches and executes UI steps |
| "Send a GET request to..." | API Test Agent | HTTP requests are made and responses validated |
| Record a workflow | Workflow Observer | Browser opens for you to interact with, then AI generates tests |

## Getting Started

Use the **left toolbar** to navigate between views. Start with the **Quick Start** guide in the sidebar to learn the basics.
