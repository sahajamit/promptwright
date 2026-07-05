// Windows MCP Diagnostic Script
// Run this in the packaged app's Console to capture all diagnostics

console.log("=".repeat(80));
console.log("JARVIS-AI WINDOWS MCP DIAGNOSTIC REPORT");
console.log("=".repeat(80));
console.log("");

// 1. Platform info
console.log("1. PLATFORM INFORMATION:");
console.log(`   OS: ${navigator.platform}`);
console.log(`   User Agent: ${navigator.userAgent}`);
console.log("");

// 2. Check if window.electron is available
console.log("2. ELECTRON API:");
console.log(`   window.electron available: ${typeof window.electron !== 'undefined'}`);
console.log(`   window.jarvis available: ${typeof window.jarvis !== 'undefined'}`);
console.log("");

// 3. Instructions for main process logs
console.log("3. REQUIRED: MAIN PROCESS LOGS");
console.log("   Open: View → Toggle Developer Tools → Console tab");
console.log("   Look for lines starting with:");
console.log("     - [JARVIS MCP] - MCP configuration logs");
console.log("     - [JARVIS WINDOWS] - Windows-specific diagnostics");
console.log("     - [JARVIS SDK] - SDK/session logs");
console.log("");
console.log("   CRITICAL ERRORS to look for:");
console.log("     - '✗✗✗ CRITICAL ERROR: Failed to resolve @playwright/mcp path'");
console.log("     - 'MCP CLI file does not exist at resolved path'");
console.log("     - '@playwright folder does not exist'");
console.log("");

// 4. Check execution logs for tool usage
console.log("4. EXECUTION LOG CHECK:");
console.log("   After running a test, check execution logs for:");
console.log("     ✓ GOOD: toolName starts with 'playwright_' (playwright_navigate, playwright_click, etc.)");
console.log("     ✗ BAD: toolName is 'bash' or 'task' (fallback - MCP not working)");
console.log("");

// 5. Export instructions
console.log("5. HOW TO EXPORT LOGS:");
console.log("   Right-click in Console → Save as... → Save to 'jarvis-windows-logs.txt'");
console.log("   Send this file along with:");
console.log("     - Screenshot of execution logs showing tool names");
console.log("     - Any error popups/dialogs");
console.log("");

console.log("=".repeat(80));
console.log("Run this script, then execute a test and capture all logs");
console.log("=".repeat(80));
