import type { ExecutionMessage } from "../components/execution/types";
import type { LogEntry, Thread } from "../types";

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Derive a short agent badge label and CSS class from agent metadata.
 * Returns an HTML string for the badge, or "" if no badge should be shown.
 */
function agentBadgeHtml(agentName?: string, agentDisplayName?: string, agentTag?: string): string {
    if (!agentName) return "";

    // Use explicit tag if provided, otherwise fall back to heuristic derivation
    let label: string;
    if (agentTag) {
        label = agentTag;
    } else if (agentName === "orchestrator") {
        label = "Orca";
    } else if (agentDisplayName) {
        const words = agentDisplayName.split(/\s+/);
        label = words.slice(0, 2).join(" ");
    } else {
        label = agentName;
    }

    const cssClass = agentName === "orchestrator" ? "agent-badge-orca" : "agent-badge-subagent";
    return `<span class="agent-badge ${cssClass}">${escapeHtml(label)}</span>`;
}

/**
 * Simple markdown-like formatting for log content
 * Handles bold text (**text**) and preserves line breaks
 */
function formatLogContent(text: string): string {
    // First escape HTML
    let formatted = escapeHtml(text);
    
    // Convert **bold** to <strong>
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

/**
 * Format logs as HTML
 */
function formatLogsAsHtml(logs: LogEntry[]): string {
    if (logs.length === 0) {
        return '<p class="no-data">No execution logs available</p>';
    }

    return logs
        .filter((log) => log.content.trim() !== "")
        .map((log) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const statusBadge = log.status
                ? `<span class="status-badge status-${log.status}">${log.status}</span>`
                : "";

            // Check if this is a final verdict message (TEST PASSED/TEST FAILED)
            const isVerdict = log.content.includes('TEST PASSED:') || log.content.includes('TEST FAILED:');
            const verdictClass = isVerdict ? 'verdict-message' : '';

            // Extract verdict type and format accordingly
            let verdictIcon = '';
            if (log.content.includes('TEST PASSED:')) {
                verdictIcon = '<span class="verdict-icon verdict-pass">✓</span>';
            } else if (log.content.includes('TEST FAILED:')) {
                verdictIcon = '<span class="verdict-icon verdict-fail">✗</span>';
            }

            const badge = agentBadgeHtml(log.agentName, log.agentDisplayName, log.agentTag);

            return `
      <div class="log-entry log-${log.type} ${verdictClass}">
        <div class="log-header">
          ${verdictIcon}
          ${badge}
          <span class="log-time">${time}</span>
          <span class="log-type">${log.type.toUpperCase()}</span>
          ${statusBadge}
        </div>
        <div class="log-content">${formatLogContent(log.content)}</div>
        ${log.toolName ? `<div class="log-tool">Tool: ${escapeHtml(log.toolName)}</div>` : ""}
      </div>
    `;
        })
        .join("");
}

/**
 * Get recording HTML based on recording path
 */
async function getRecordingHtml(recordingPath: string): Promise<string> {
    try {
        const { type, data } = await window.jarvis.execution.getRecordingData(recordingPath);

        if (type === "url") {
            // In packaged mode, we got a file:// URL - read the actual file content
            try {
                const response = await fetch(data);
                const htmlContent = await response.text();
                
                // Embed the HTML content directly
                return `
        <div class="recording-embed">
          <iframe srcdoc="${escapeHtml(htmlContent)}" style="width: 100%; height: 600px; border: 1px solid #e2e8f0; border-radius: 8px;"></iframe>
          <p class="recording-note"><em>Screencast recording from test execution</em></p>
        </div>
      `;
            } catch (fetchError) {
                console.error('[export-service] Failed to fetch recording file:', fetchError);
                return `
        <div class="recording-note error">
          <p>❌ Recording not available: ${escapeHtml(recordingPath)}</p>
          <p><em>The recording file could not be loaded.</em></p>
        </div>
      `;
            }
        }

        // If we have HTML content directly (dev mode), include it
        return `
      <div class="recording-embed">
        <iframe srcdoc="${escapeHtml(data)}" style="width: 100%; height: 600px; border: 1px solid #e2e8f0; border-radius: 8px;"></iframe>
        <p class="recording-note"><em>Screencast recording from test execution</em></p>
      </div>
    `;
    } catch (error) {
        return `
      <div class="recording-note error">
        <p>❌ Recording not available: ${escapeHtml(recordingPath)}</p>
        <p><em>The recording file may have been moved or deleted.</em></p>
      </div>
    `;
    }
}

/**
 * Generate HTML export for a manual test execution session
 */
export async function exportSessionAsHtml(session: Thread): Promise<string> {
    const { title, createdAt, updatedAt, executionData, messages } = session;

    // Get test input from executionData or first user message
    const testInput =
        executionData?.testInput ||
        messages.find((m) => m.role === "user")?.content ||
        "No test steps provided";

    // Format logs
    const logsHtml = formatLogsAsHtml(executionData?.logs || []);

    // Get recording HTML if available
    const recordingHtml = executionData?.recordingPath
        ? await getRecordingHtml(executionData.recordingPath)
        : '<p class="no-data">No recording available</p>';

    // Determine status color
    const statusClass = executionData?.status || "unknown";
    const statusDisplay = executionData?.status?.toUpperCase() || "N/A";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Promptwright Test Report</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a202c;
      background: #f7fafc;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    header {
      background: linear-gradient(135deg, #001eff, #3347ff);
      color: white;
      padding: 32px;
    }

    .header-brand {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      opacity: 0.9;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    h1 {
      font-size: 28px;
      margin-bottom: 12px;
      font-weight: 600;
    }

    .meta {
      display: flex;
      gap: 20px;
      font-size: 14px;
      opacity: 0.9;
      flex-wrap: wrap;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-badge.status-completed {
      background: #c6f6d5;
      color: #22543d;
    }

    .status-badge.status-failed {
      background: #fed7d7;
      color: #742a2a;
    }

    .status-badge.status-cancelled {
      background: #feebc8;
      color: #744210;
    }

    .status-badge.status-unknown {
      background: #e2e8f0;
      color: #4a5568;
    }

    section {
      border-bottom: 1px solid #e2e8f0;
    }

    section:last-of-type {
      border-bottom: none;
    }

    .section-header {
      padding: 24px 32px;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background-color 0.2s;
    }

    .section-header:hover {
      background: #f8fafc;
    }

    .section-title {
      color: #001eff;
      font-size: 20px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-toggle {
      color: #718096;
      font-size: 20px;
      transition: transform 0.3s;
    }

    .section-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .section-content {
      padding: 0 32px 32px 32px;
      max-height: 10000px;
      overflow: hidden;
      transition: max-height 0.3s ease-out, padding 0.3s ease-out;
    }

    .section-content.collapsed {
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    .test-steps {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #001eff;
      white-space: pre-wrap;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 14px;
      line-height: 1.8;
    }

    .log-entry {
      background: #f8fafc;
      padding: 16px;
      margin-bottom: 12px;
      border-radius: 8px;
      border-left: 4px solid #cbd5e0;
    }

    .log-entry.log-tool {
      border-left-color: #001eff;
    }

    .log-entry.log-thinking {
      border-left-color: #805ad5;
      background: #faf5ff;
    }

    .log-entry.log-error {
      border-left-color: #e53e3e;
      background: #fff5f5;
    }

    .log-entry.log-info {
      border-left-color: #38a169;
      background: #f0fff4;
    }

    /* Verdict message styling */
    .log-entry.verdict-message {
      background: #e6f7ff;
      border-left-width: 6px;
      padding: 20px;
    }

    .log-entry.verdict-message .log-content {
      font-size: 15px;
      font-weight: 500;
      line-height: 1.8;
    }

    .verdict-icon {
      font-size: 24px;
      font-weight: bold;
      margin-right: 8px;
    }

    .verdict-icon.verdict-pass {
      color: #22543d;
      background: #c6f6d5;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .verdict-icon.verdict-fail {
      color: #742a2a;
      background: #fed7d7;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .log-header {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .agent-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
      border: 1px solid;
      white-space: nowrap;
    }

    .agent-badge-orca {
      background: #e2e8f0;
      color: #4a5568;
      border-color: #cbd5e0;
    }

    .agent-badge-subagent {
      background: #e0e7ff;
      color: #4338ca;
      border-color: #c7d2fe;
    }

    .log-time {
      font-size: 12px;
      color: #718096;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    }

    .log-type {
      font-size: 11px;
      font-weight: 600;
      color: #4a5568;
      letter-spacing: 0.5px;
    }

    .log-content {
      color: #2d3748;
      font-size: 14px;
      line-height: 1.6;
    }

    .log-tool {
      margin-top: 8px;
      font-size: 12px;
      color: #4a5568;
      font-style: italic;
    }

    .no-data {
      color: #718096;
      font-style: italic;
      text-align: center;
      padding: 20px;
    }

    .recording-note {
      background: #edf2f7;
      padding: 16px;
      border-radius: 8px;
      margin-top: 12px;
      text-align: center;
    }

    .recording-note.error {
      background: #fff5f5;
      border: 1px solid #feb2b2;
    }

    .recording-note code {
      background: #e2e8f0;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
    }

    .recording-embed {
      margin-top: 12px;
    }

    footer {
      padding: 20px 32px;
      background: #f8fafc;
      text-align: center;
      color: #718096;
      font-size: 12px;
      border-top: 1px solid #e2e8f0;
    }

    footer strong {
      color: #001eff;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        box-shadow: none;
      }

      .section-header {
        cursor: default;
      }

      .section-toggle {
        display: none;
      }

      .section-content {
        max-height: none !important;
        padding: 0 32px 32px 32px !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-brand">
        <span>🤖</span>
        <span>Promptwright - Test Execution Report</span>
      </div>
      <h1>🧪 ${escapeHtml(title)}</h1>
      <div class="meta">
        <div class="meta-item">
          <span>📅</span>
          <span>Created: ${new Date(createdAt).toLocaleString()}</span>
        </div>
        <div class="meta-item">
          <span>🔄</span>
          <span>Updated: ${new Date(updatedAt).toLocaleString()}</span>
        </div>
        <div class="meta-item">
          <span>Status:</span>
          <span class="status-badge status-${statusClass}">${statusDisplay}</span>
        </div>
      </div>
    </header>

    <section>
      <div class="section-header" onclick="toggleSection('test-steps')">
        <h2 class="section-title">📋 Test Steps</h2>
        <span class="section-toggle" id="toggle-test-steps">▼</span>
      </div>
      <div class="section-content" id="content-test-steps">
        <div class="test-steps">${escapeHtml(testInput)}</div>
      </div>
    </section>

    <section>
      <div class="section-header" onclick="toggleSection('execution-logs')">
        <h2 class="section-title">📊 Execution Logs</h2>
        <span class="section-toggle" id="toggle-execution-logs">▼</span>
      </div>
      <div class="section-content" id="content-execution-logs">
        <div class="logs-container">
          ${logsHtml}
        </div>
      </div>
    </section>

    <section>
      <div class="section-header" onclick="toggleSection('recording')">
        <h2 class="section-title">🎬 Execution Recording</h2>
        <span class="section-toggle" id="toggle-recording">▼</span>
      </div>
      <div class="section-content" id="content-recording">
        <div class="recording-container">
          ${recordingHtml}
        </div>
      </div>
    </section>

    <footer>
      <p>Generated by <strong>Promptwright</strong> • ${new Date().toLocaleString()}</p>
      <p style="margin-top: 4px; font-size: 11px;">Automated Test Execution Report</p>
    </footer>
  </div>

  <script>
    function toggleSection(sectionId) {
      const content = document.getElementById('content-' + sectionId);
      const toggle = document.getElementById('toggle-' + sectionId);
      
      if (content && toggle) {
        content.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Generate HTML export for an API test conversation with multi-turn support
 */
export function exportApiConversationAsHtml(
    messages: ExecutionMessage[],
    testInput: string
): string {
    // Group messages by turn
    const turns: { turnNumber: number; userPrompt: string; messages: ExecutionMessage[] }[] = [];
    let currentTurn = { turnNumber: 1, userPrompt: testInput, messages: [] as ExecutionMessage[] };

    for (const msg of messages) {
        if (msg.isTurnSeparator) {
            turns.push(currentTurn);
            currentTurn = {
                turnNumber: msg.turnNumber || turns.length + 2,
                userPrompt: msg.content,
                messages: [],
            };
        } else {
            currentTurn.messages.push(msg);
        }
    }
    turns.push(currentTurn);

    const renderTurnMessages = (msgs: ExecutionMessage[]): string => {
        return msgs
            .map((msg) => {
                if (msg.isToolCall) {
                    return `
            <div class="tool-call">
              <div class="tool-header"><span class="tool-badge">${escapeHtml(msg.toolName || "tool")}</span></div>
              <pre class="tool-content"><span class="prompt-char">$ </span>${escapeHtml(msg.toolArgs || "")}</pre>
            </div>`;
                }
                if (msg.isToolResult) {
                    let content = msg.toolArgs || "";
                    // Try to format JSON
                    try {
                        const trimmed = content.trim();
                        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
                            content = JSON.stringify(JSON.parse(trimmed), null, 2);
                        }
                    } catch { /* keep as-is */ }
                    return `
            <div class="tool-result">
              <div class="tool-header"><span class="result-badge">Response</span></div>
              <pre class="tool-content">${escapeHtml(content)}</pre>
            </div>`;
                }
                if (msg.isVerdict) {
                    const isPass = msg.verdictType === "pass";
                    return `
            <div class="verdict ${isPass ? "verdict-pass" : "verdict-fail"}">
              <span class="verdict-label">${isPass ? "TEST PASSED" : "TEST FAILED"}</span>
              <div class="verdict-content">${formatLogContent(msg.content)}</div>
            </div>`;
                }
                // Regular text — skip if content is empty
                if (!msg.content.trim()) return "";
                const badge = agentBadgeHtml(msg.agentName, msg.agentDisplayName, msg.agentTag);
                return `
          <div class="message">
            <div class="msg-header">
              ${badge}
              <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="msg-content">${formatLogContent(msg.content)}</div>
          </div>`;
            })
            .join("");
    };

    const turnsHtml = turns
        .map(
            (turn) => `
        <div class="turn">
          <div class="turn-header">
            <span class="turn-label">Turn ${turn.turnNumber}</span>
            <span class="turn-time">${turn.messages[0] ? new Date(turn.messages[0].timestamp).toLocaleTimeString() : ""}</span>
          </div>
          <div class="user-prompt">
            <span class="user-label">User:</span>
            <p>${escapeHtml(turn.userPrompt)}</p>
          </div>
          <div class="turn-messages">
            ${renderTurnMessages(turn.messages)}
          </div>
        </div>`
        )
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Promptwright - API Test Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f7fafc; color: #1a202c; line-height: 1.6; padding: 20px;
    }
    .container {
      max-width: 1200px; margin: 0 auto; background: white;
      border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;
    }
    header {
      background: linear-gradient(135deg, #001eff, #3347ff);
      color: white; padding: 32px;
    }
    .brand {
      font-size: 14px; font-weight: 600; letter-spacing: 1px;
      text-transform: uppercase; opacity: 0.9; margin-bottom: 8px;
      display: flex; align-items: center; gap: 8px;
    }
    h1 { font-size: 28px; font-weight: 600; margin-bottom: 12px; }
    .timestamp { font-size: 14px; opacity: 0.9; }
    .turn {
      border-bottom: 1px solid #e2e8f0; padding: 0;
    }
    .turn:last-child { border-bottom: none; }
    .turn-header {
      padding: 16px 32px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .turn-label { font-size: 13px; font-weight: 600; color: #001eff; text-transform: uppercase; letter-spacing: 0.5px; }
    .turn-time { font-size: 12px; color: #718096; }
    .user-prompt {
      padding: 16px 32px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    }
    .user-label { font-size: 11px; color: #001eff; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .user-prompt p { font-size: 14px; color: #2d3748; margin-top: 4px; white-space: pre-wrap; }
    .turn-messages { padding: 16px 32px; }
    .message { margin-bottom: 12px; }
    .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .msg-time { font-size: 12px; color: #718096; font-family: 'Monaco', 'Menlo', 'Consolas', monospace; }
    .msg-content { font-size: 14px; color: #2d3748; margin-top: 2px; }
    .agent-badge {
      display: inline-block; font-size: 11px; font-weight: 600;
      padding: 2px 8px; border-radius: 9999px; border: 1px solid; white-space: nowrap;
    }
    .agent-badge-orca { background: #e2e8f0; color: #4a5568; border-color: #cbd5e0; }
    .agent-badge-subagent { background: #e0e7ff; color: #4338ca; border-color: #c7d2fe; }
    .tool-call, .tool-result {
      margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
    }
    .tool-call { border-color: #bfdbfe; }
    .tool-header {
      padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    }
    .tool-call .tool-header { background: #eff6ff; border-bottom-color: #bfdbfe; }
    .tool-badge { font-size: 12px; font-weight: 600; color: #001eff; }
    .result-badge { font-size: 12px; font-weight: 600; color: #4a5568; }
    .tool-content {
      padding: 10px 12px; font-size: 12px; white-space: pre-wrap;
      word-break: break-word; color: #4a5568; background: white;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    }
    .prompt-char { color: #001eff; font-weight: 600; }
    .verdict {
      margin: 12px 0; padding: 16px 20px; border-radius: 8px; border: 1px solid;
    }
    .verdict-pass { background: #f0fff4; border-color: #c6f6d5; }
    .verdict-fail { background: #fff5f5; border-color: #fed7d7; }
    .verdict-label { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .verdict-pass .verdict-label { color: #22543d; }
    .verdict-fail .verdict-label { color: #742a2a; }
    .verdict-pass .verdict-label::before { content: "\\2713"; background: #c6f6d5; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
    .verdict-fail .verdict-label::before { content: "\\2717"; background: #fed7d7; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
    .verdict-content { font-size: 14px; margin-top: 8px; line-height: 1.6; }
    .verdict-pass .verdict-content { color: #276749; }
    .verdict-fail .verdict-content { color: #9b2c2c; }
    footer {
      padding: 20px 32px; background: #f8fafc; text-align: center;
      color: #718096; font-size: 12px; border-top: 1px solid #e2e8f0;
    }
    footer strong { color: #001eff; }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand"><span>&#129302;</span> Promptwright - API Test Report</div>
      <h1>&#129514; API Test Conversation</h1>
      <div class="timestamp">Generated: ${new Date().toLocaleString()}</div>
    </header>
    ${turnsHtml}
    <footer>
      <p>Generated by <strong>Promptwright</strong> &bull; ${new Date().toLocaleString()}</p>
      <p style="margin-top: 4px; font-size: 11px;">Automated API Test Execution Report</p>
    </footer>
  </div>
</body>
</html>`;
}
