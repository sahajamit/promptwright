import { useState, useEffect, useCallback } from "react";
import type { JarvisEvent } from "@promptwright/core";
import type { Message, LogEntry } from "../types";

interface UseChatOptions {
  onLog?: (log: LogEntry) => void;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
}

interface UseChatReturn {
  messages: Message[];
  currentResponse: string;
  isLoading: boolean;
  isConnected: boolean;
  sendMessage: (prompt: string) => Promise<void>;
  clearMessages: () => void;
  setMessages: (messages: Message[]) => void;
}

export function useChat({ 
  onLog, 
  initialMessages = [],
  onMessagesChange,
}: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [currentResponse, setCurrentResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Update messages when initialMessages change (only on mount or explicit reset)
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages.length]);

  // Subscribe to JARVIS events
  useEffect(() => {
    const unsubscribe = window.jarvis.onEvent((event: JarvisEvent) => {
      handleEvent(event);
    });

    // Check initial connection state
    window.jarvis.getState().then((state) => {
      setIsConnected(state === "connected");
    });

    return unsubscribe;
  }, []);

  const handleEvent = useCallback(
    (event: JarvisEvent) => {
      switch (event.type) {
        case "message_delta":
          setCurrentResponse((prev) => prev + event.content);
          break;

        case "message_complete":
          // Finalize the assistant message using functional update to avoid stale closure
          // Only add message if it has content
          if (event.content && event.content.trim()) {
            setMessages((prevMessages) => {
              const newMessages: Message[] = [
                ...prevMessages,
                {
                  id: event.id,
                  role: "assistant" as const,
                  content: event.content,
                  timestamp: Date.now(),
                },
              ];
              // Call onMessagesChange with the new messages
              onMessagesChange?.(newMessages);
              return newMessages;
            });
          }
          setCurrentResponse("");
          setIsLoading(false);
          break;

        case "reasoning_delta":
          // Add thinking log delta
          onLog?.({
            id: `thinking-delta`,
            type: "thinking",
            content: event.content,
            timestamp: Date.now(),
          });
          break;

        case "reasoning_complete":
          // Reasoning is complete, no action needed as deltas were already logged
          break;

        case "tool_start":
          onLog?.({
            id: event.toolCallId,
            type: "tool",
            content: `Executing ${event.toolName}...`,
            toolName: event.toolName,
            toolArgs: event.args ? (typeof event.args === 'string' ? event.args : JSON.stringify(event.args, null, 2)) : undefined,
            status: "running",
            timestamp: Date.now(),
          });
          break;

        case "tool_complete":
          const resultContent = typeof event.result === 'string' 
            ? event.result.substring(0, 100) 
            : event.result 
              ? JSON.stringify(event.result).substring(0, 100)
              : "Completed";
          onLog?.({
            id: `${event.toolCallId}-complete`,
            type: "tool",
            content: resultContent,
            toolResult: typeof event.result === 'string' ? event.result : JSON.stringify(event.result, null, 2),
            status: "completed",
            timestamp: Date.now(),
          });
          break;

        case "session_idle":
          setIsLoading(false);
          break;

        case "session_error":
          setIsLoading(false);
          onLog?.({
            id: `error-${Date.now()}`,
            type: "error",
            content: event.error,
            timestamp: Date.now(),
          });
          break;

        case "connected":
          setIsConnected(true);
          onLog?.({
            id: `connected-${Date.now()}`,
            type: "info",
            content: "Connected to Copilot",
            timestamp: Date.now(),
          });
          break;

        case "disconnected":
          setIsConnected(false);
          onLog?.({
            id: `disconnected-${Date.now()}`,
            type: "info",
            content: "Disconnected from Copilot",
            timestamp: Date.now(),
          });
          break;

        case "connecting":
          onLog?.({
            id: `connecting-${Date.now()}`,
            type: "info",
            content: "Connecting to Copilot...",
            timestamp: Date.now(),
          });
          break;

        case "info":
          onLog?.({
            id: `info-${Date.now()}`,
            type: "info",
            content: (event as any).message || "Info",
            timestamp: Date.now(),
          });
          break;
      }
    },
    [onLog]
  );

  const sendMessage = useCallback(async (prompt: string) => {
    // Add user message immediately using functional update
    setMessages((prevMessages) => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      const newMessages = [...prevMessages, userMessage];
      onMessagesChange?.(newMessages);
      return newMessages;
    });
    
    setIsLoading(true);
    setCurrentResponse("");

    try {
      await window.jarvis.sendMessage(prompt);
    } catch (error) {
      setIsLoading(false);
      const errorMsg = error instanceof Error ? error.message : String(error);
      onLog?.({
        id: `error-${Date.now()}`,
        type: "error",
        content: `Failed to send message: ${errorMsg}`,
        timestamp: Date.now(),
      });
    }
  }, [onMessagesChange, onLog]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    onMessagesChange?.([]);
    setCurrentResponse("");
    setIsLoading(false);
  }, [onMessagesChange]);

  const updateMessages = useCallback((newMessages: Message[]) => {
    setMessages(newMessages);
    onMessagesChange?.(newMessages);
  }, [onMessagesChange]);

  return {
    messages,
    currentResponse,
    isLoading,
    isConnected,
    sendMessage,
    clearMessages,
    setMessages: updateMessages,
  };
}
