import { useState, useEffect, useCallback } from "react";
import type { Thread, Message } from "../types";
import {
  getThreads,
  getOrCreateActiveThread,
  setActiveThreadId,
  addMessageToThread,
  deleteThread,
  createThread,
} from "../lib/thread-storage";

interface UseThreadStorageReturn {
  threads: Thread[];
  activeThread: Thread;
  selectThread: (threadId: string) => void;
  createNewThread: () => Thread;
  deleteCurrentThread: () => void;
  addMessage: (message: Message) => void;
  refreshThreads: () => void;
}

export function useThreadStorage(): UseThreadStorageReturn {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread>(() =>
    getOrCreateActiveThread()
  );

  // Load threads on mount
  useEffect(() => {
    refreshThreads();
  }, []);

  const refreshThreads = useCallback(() => {
    setThreads(getThreads());
  }, []);

  const selectThread = useCallback((threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    if (thread) {
      setActiveThread(thread);
      setActiveThreadId(threadId);
    }
  }, [threads]);

  const createNewThread = useCallback(() => {
    const thread = createThread();
    setActiveThread(thread);
    setActiveThreadId(thread.id);
    refreshThreads();
    return thread;
  }, [refreshThreads]);

  const deleteCurrentThread = useCallback(() => {
    deleteThread(activeThread.id);
    
    // Get remaining threads or create new one
    const remaining = getThreads();
    if (remaining.length > 0) {
      setActiveThread(remaining[0]);
      setActiveThreadId(remaining[0].id);
    } else {
      const newThread = createThread();
      setActiveThread(newThread);
      setActiveThreadId(newThread.id);
    }
    
    refreshThreads();
  }, [activeThread.id, refreshThreads]);

  const addMessage = useCallback(
    (message: Message) => {
      const updated = addMessageToThread(activeThread.id, message);
      if (updated) {
        setActiveThread(updated);
        refreshThreads();
      }
    },
    [activeThread.id, refreshThreads]
  );

  return {
    threads,
    activeThread,
    selectThread,
    createNewThread,
    deleteCurrentThread,
    addMessage,
    refreshThreads,
  };
}
