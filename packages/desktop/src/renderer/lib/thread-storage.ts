import type { Thread, Message } from "../types";

const THREADS_KEY = "jarvis-threads";
const ACTIVE_THREAD_KEY = "jarvis-active-thread";

/**
 * Get all stored threads
 */
export function getThreads(): Thread[] {
  try {
    const data = localStorage.getItem(THREADS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Get a specific thread by ID
 */
export function getThread(threadId: string): Thread | null {
  const threads = getThreads();
  return threads.find((t) => t.id === threadId) ?? null;
}

/**
 * Create a new thread
 */
export function createThread(title?: string): Thread {
  const thread: Thread = {
    id: `thread-${Date.now()}`,
    title: title || "New Conversation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };

  const threads = getThreads();
  threads.unshift(thread);
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));

  return thread;
}

/**
 * Update an existing thread
 */
export function updateThread(
  threadId: string,
  updates: Partial<Omit<Thread, "id" | "createdAt">>
): Thread | null {
  const threads = getThreads();
  const index = threads.findIndex((t) => t.id === threadId);

  if (index === -1) return null;

  threads[index] = {
    ...threads[index],
    ...updates,
    updatedAt: Date.now(),
  };

  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  return threads[index];
}

/**
 * Add a message to a thread
 */
export function addMessageToThread(threadId: string, message: Message): Thread | null {
  const thread = getThread(threadId);
  if (!thread) return null;

  const messages = [...thread.messages, message];

  // Auto-generate title from first user message if not set
  let title = thread.title;
  if (title === "New Conversation" && message.role === "user") {
    title = message.content.substring(0, 50) + (message.content.length > 50 ? "..." : "");
  }

  return updateThread(threadId, { messages, title });
}

/**
 * Delete a thread
 */
export function deleteThread(threadId: string): boolean {
  const threads = getThreads();
  const filtered = threads.filter((t) => t.id !== threadId);

  if (filtered.length === threads.length) return false;

  localStorage.setItem(THREADS_KEY, JSON.stringify(filtered));

  // Clear active thread if it was deleted
  if (getActiveThreadId() === threadId) {
    setActiveThreadId(null);
  }

  return true;
}

/**
 * Get the active thread ID
 */
export function getActiveThreadId(): string | null {
  return localStorage.getItem(ACTIVE_THREAD_KEY);
}

/**
 * Set the active thread ID
 */
export function setActiveThreadId(threadId: string | null): void {
  if (threadId) {
    localStorage.setItem(ACTIVE_THREAD_KEY, threadId);
  } else {
    localStorage.removeItem(ACTIVE_THREAD_KEY);
  }
}

/**
 * Get or create the active thread
 */
export function getOrCreateActiveThread(): Thread {
  const activeId = getActiveThreadId();

  if (activeId) {
    const thread = getThread(activeId);
    if (thread) return thread;
  }

  // Create new thread if none active
  const thread = createThread();
  setActiveThreadId(thread.id);
  return thread;
}

/**
 * Clear all threads
 */
export function clearAllThreads(): void {
  localStorage.removeItem(THREADS_KEY);
  localStorage.removeItem(ACTIVE_THREAD_KEY);
}
