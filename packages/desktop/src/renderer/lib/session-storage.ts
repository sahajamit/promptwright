import type { Message, Thread } from "../types";

/**
 * Session storage service for persisting chat history
 */
export class SessionStorage {
  /**
   * Save a chat session
   */
  static async saveSession(thread: Thread): Promise<void> {
    const data = JSON.stringify(thread, null, 2);
    await window.jarvis.session.save(thread.id, data);
  }

  /**
   * Load a chat session
   */
  static async loadSession(sessionId: string): Promise<Thread | null> {
    const data = await window.jarvis.session.load(sessionId);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * List all chat sessions
   */
  static async listSessions(): Promise<Thread[]> {
    return await window.jarvis.session.list();
  }

  /**
   * Delete a chat session
   */
  static async deleteSession(sessionId: string): Promise<boolean> {
    return await window.jarvis.session.delete(sessionId);
  }

  /**
   * Create a new session
   */
  static createNewSession(title: string = "New Chat", personaId?: string): Thread {
    const now = Date.now();
    return {
      id: `session-${now}`,
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      personaId,
    };
  }

  /**
   * Update session title based on first message
   * For manual testing persona, extracts first test step for meaningful titles
   */
  static generateTitle(messages: Message[], personaId?: string): string {
    if (messages.length === 0) return "New Chat";

    const firstUserMessage = messages.find((m) => m.role === "user");
    if (!firstUserMessage) return "New Chat";

    const content = firstUserMessage.content;

    // For manual testing persona, extract first step/action
    if (personaId === "manual-test-execution") {
      // Split by newlines and get first non-empty line
      const lines = content.split('\n').filter(l => l.trim());
      const firstStep = lines[0]?.trim() || content;

      // Take first 40 characters for concise titles
      const title = firstStep.slice(0, 40);
      return title.length < firstStep.length ? `${title}...` : title;
    }

    // Default behavior for other personas - first 50 characters
    const title = content.slice(0, 50);
    return title.length < content.length
      ? `${title}...`
      : title;
  }
}
