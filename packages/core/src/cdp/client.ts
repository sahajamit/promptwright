/**
 * Chrome DevTools Protocol Client
 *
 * WebSocket client for CDP communication with Chrome
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import type {
  CDPMessage,
  CDPTarget,
  CDPDomain,
  CDPClientState,
  CDPClientEvent,
  CDPConnectionOptions,
  CDPEventHandler,
} from "./types.js";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 9222;

/**
 * CDP Client for communicating with Chrome via WebSocket
 */
export class CDPClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private state: CDPClientState = "disconnected";
  private messageId = 0;
  private pendingMessages: Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private eventHandlers: Map<string, Set<CDPEventHandler>> = new Map();
  private targetId: string | null = null;

  /**
   * Get current connection state
   */
  getState(): CDPClientState {
    return this.state;
  }

  /**
   * Get connected target ID
   */
  getTargetId(): string | null {
    return this.targetId;
  }

  /**
   * List available CDP targets
   */
  async listTargets(
    host = DEFAULT_HOST,
    port = DEFAULT_PORT
  ): Promise<CDPTarget[]> {
    const response = await fetch(`http://${host}:${port}/json`);
    if (!response.ok) {
      throw new Error(`Failed to list targets: ${response.statusText}`);
    }
    return response.json() as Promise<CDPTarget[]>;
  }

  /**
   * Get the first page target
   */
  async getPageTarget(
    host = DEFAULT_HOST,
    port = DEFAULT_PORT
  ): Promise<CDPTarget | null> {
    const targets = await this.listTargets(host, port);
    return targets.find((t) => t.type === "page") || null;
  }

  /**
   * Connect to a CDP target
   */
  async connect(options: CDPConnectionOptions = {}): Promise<void> {
    const host = options.host || DEFAULT_HOST;
    const port = options.port || DEFAULT_PORT;

    if (this.state === "connected") {
      throw new Error("Already connected");
    }

    this.state = "connecting";

    try {
      // Get target to connect to
      let wsUrl: string;

      if (options.targetId) {
        wsUrl = `ws://${host}:${port}/devtools/page/${options.targetId}`;
        this.targetId = options.targetId;
      } else {
        // Find the first page target
        const target = await this.getPageTarget(host, port);
        if (!target) {
          throw new Error("No page target found");
        }
        wsUrl = target.webSocketDebuggerUrl;
        this.targetId = target.id;
      }

      // Connect WebSocket
      await this.connectWebSocket(wsUrl);

      this.state = "connected";
      this.emitEvent({ type: "connected", targetId: this.targetId! });
    } catch (error) {
      this.state = "error";
      this.emitEvent({
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Connect WebSocket to the given URL
   */
  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", () => {
        this.handleDisconnect();
      });

      this.ws.on("error", (error) => {
        if (this.state === "connecting") {
          reject(error);
        } else {
          this.emitEvent({ type: "error", error });
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: CDPMessage = JSON.parse(data);

      // Check if this is a response to a pending request
      if (message.id !== undefined) {
        const pending = this.pendingMessages.get(message.id);
        if (pending) {
          this.pendingMessages.delete(message.id);
          if (message.error) {
            pending.reject(
              new Error(`CDP Error: ${message.error.message} (${message.error.code})`)
            );
          } else {
            pending.resolve(message.result);
          }
        }
      }

      // Check if this is an event
      if (message.method) {
        this.emitEvent({
          type: "event",
          method: message.method,
          params: message.params,
        });

        // Call registered handlers
        const handlers = this.eventHandlers.get(message.method);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(message.params);
            } catch (error) {
              console.error(`Error in CDP event handler for ${message.method}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to parse CDP message:", error);
    }
  }

  /**
   * Handle WebSocket disconnect
   */
  private handleDisconnect(): void {
    const wasConnected = this.state === "connected";
    this.state = "disconnected";
    this.ws = null;
    this.targetId = null;

    // Reject all pending messages
    for (const [id, pending] of this.pendingMessages) {
      pending.reject(new Error("Connection closed"));
      this.pendingMessages.delete(id);
    }

    if (wasConnected) {
      this.emitEvent({ type: "disconnected", reason: "Connection closed" });
    }
  }

  /**
   * Emit a client event
   */
  private emitEvent(event: CDPClientEvent): void {
    this.emit("cdp-event", event);
  }

  /**
   * Subscribe to client events
   */
  onEvent(handler: (event: CDPClientEvent) => void): () => void {
    const wrappedHandler = (event: unknown) => handler(event as CDPClientEvent);
    this.on("cdp-event", wrappedHandler);
    return () => this.off("cdp-event", wrappedHandler);
  }

  /**
   * Send a CDP command and wait for response
   */
  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (this.state !== "connected" || !this.ws) {
      throw new Error("Not connected");
    }

    const id = ++this.messageId;
    const message: CDPMessage = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      this.ws!.send(JSON.stringify(message), (error) => {
        if (error) {
          this.pendingMessages.delete(id);
          reject(error);
        }
      });
    });
  }

  /**
   * Enable a CDP domain
   */
  async enableDomain(domain: CDPDomain): Promise<void> {
    await this.send(`${domain}.enable`);
  }

  /**
   * Disable a CDP domain
   */
  async disableDomain(domain: CDPDomain): Promise<void> {
    await this.send(`${domain}.disable`);
  }

  /**
   * Register an event handler for a specific CDP event
   */
  on(event: string, handler: CDPEventHandler): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return super.on(event, handler);
  }

  /**
   * Remove an event handler
   */
  off(event: string, handler: CDPEventHandler): this {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
    return super.off(event, handler);
  }

  /**
   * Disconnect from the target
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = "disconnected";
    this.targetId = null;
  }
}
