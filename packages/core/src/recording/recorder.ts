/**
 * Recorder
 *
 * Records browser interactions via CDP
 */

import { EventEmitter } from "events";
import { CDPClient } from "../cdp/client.js";
import { ChromeLauncher } from "../cdp/chrome-launcher.js";
import type {
  RecordedAction,
  RecordedSession,
  RecordingMode,
  RecordingEvent,
} from "./types.js";
import { getModeConfig } from "./mode-config.js";
import { EventFilter } from "./event-filter.js";
import { EventProcessor } from "./event-processor.js";

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Recorder
 *
 * Records browser interactions using CDP
 */
export class Recorder extends EventEmitter {
  private cdp: CDPClient;
  private chrome: ChromeLauncher;
  private filter: EventFilter;
  private processor: EventProcessor | null = null;
  private session: RecordedSession | null = null;
  private isRecording = false;
  private startTime = 0;
  private currentMode: RecordingMode = "standard";
  private eventUnsubscribers: Array<() => void> = [];

  constructor(cdp?: CDPClient, chrome?: ChromeLauncher) {
    super();
    this.cdp = cdp || new CDPClient();
    this.chrome = chrome || new ChromeLauncher();
    this.filter = new EventFilter(getModeConfig("standard"));
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get the current session
   */
  getSession(): RecordedSession | null {
    return this.session;
  }

  /**
   * Get the current recording mode
   */
  getMode(): RecordingMode {
    return this.currentMode;
  }

  /**
   * Get elapsed recording time in milliseconds
   */
  getElapsedTime(): number {
    if (!this.isRecording || !this.startTime) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Start recording
   */
  async start(
    mode: RecordingMode = "standard",
    startUrl?: string
  ): Promise<void> {
    if (this.isRecording) {
      throw new Error("Already recording");
    }

    this.currentMode = mode;
    this.filter = new EventFilter(getModeConfig(mode));

    try {
      // Defensive cleanup: if a previous persona/session left Chrome on the
      // debug port, reclaim it before launching a fresh recorder browser.
      const debugPort = this.chrome.getPort();
      await this.chrome.killExistingOnPort(debugPort);

      // Launch Chrome
      await this.chrome.launch({
        port: debugPort,
        startingUrl: startUrl || "about:blank",
      });

      // Wait a bit for Chrome to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Connect CDP
      await this.cdp.connect({ port: this.chrome.getPort() });

      // Initialize processor
      this.processor = new EventProcessor(this.cdp);

      // Enable required CDP domains
      // Note: Input domain doesn't have an enable method - it's always available
      await this.cdp.enableDomain("Page");
      await this.cdp.enableDomain("DOM");
      await this.cdp.enableDomain("Runtime");

      if (getModeConfig(mode).captureNetworkRequests) {
        await this.cdp.enableDomain("Network");
      }

      // Get current URL and title
      const pageInfo = await this.cdp.send<{
        frameTree: { frame: { url: string } };
      }>("Page.getFrameTree");

      // Create session
      this.session = {
        id: generateSessionId(),
        startTime: Date.now(),
        startUrl: pageInfo?.frameTree?.frame?.url || startUrl || "about:blank",
        mode,
        actions: [],
      };

      this.startTime = Date.now();
      this.isRecording = true;

      // Set up event listeners
      this.setupEventListeners();

      this.emitEvent({
        type: "state_changed",
        status: {
          state: "recording",
          mode,
          actionCount: 0,
          elapsedTime: 0,
        },
      });
    } catch (error) {
      // Cleanup on error
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Set up CDP event listeners for recording
   */
  private setupEventListeners(): void {
    // Inject recording script that will auto-inject on every page
    this.injectRecordingScript();

    // Page navigation
    const navHandler = (rawParams: unknown) => {
      const params = rawParams as { frame?: { url?: string }; url?: string };
      const url = params?.frame?.url || params?.url;
      if (url && this.filter.shouldCapture("navigation")) {
        console.log("[Recorder] Navigation detected:", url);
        const action = this.processor!.processNavigation(url);
        this.recordAction(action);
      }
    };
    this.cdp.on("Page.frameNavigated", navHandler);
    this.eventUnsubscribers.push(() =>
      this.cdp.off("Page.frameNavigated", navHandler)
    );

    // Listen for console messages from injected script
    const consoleHandler = async (rawParams: unknown) => {
      const params = rawParams as {
        type: string;
        args: Array<{ 
          type: string; 
          value?: unknown; 
          preview?: {
            properties: Array<{ name: string; type: string; value: string }>;
          };
        }>;
      };
      if (params.type !== "debug") return;

      const firstArg = params.args[0];
      if (firstArg?.type !== "string" || firstArg.value !== "__JARVIS_RECORD__") {
        return;
      }

      const secondArg = params.args[1];
      if (!secondArg) {
        console.warn("[Recorder] No second argument in __JARVIS_RECORD__");
        return;
      }

      // Parse event data from CDP's preview.properties structure
      let eventData: {
        type: string;
        x?: number;
        y?: number;
        key?: string;
        text?: string;
        scrollX?: number;
        scrollY?: number;
        value?: string;
      } | undefined;

      // If data is in the 'value' property (directly serialized)
      if (secondArg.value && typeof secondArg.value === 'object') {
        eventData = secondArg.value as any;
      }
      // If data is in preview.properties (object structure from CDP)
      else if (secondArg.preview?.properties) {
        // Convert preview.properties array to object
        eventData = {} as any;
        for (const prop of secondArg.preview.properties) {
          const propValue = prop.value;
          // Convert string numbers to actual numbers
          if (prop.type === 'number') {
            (eventData as any)[prop.name] = parseFloat(propValue);
          } else {
            (eventData as any)[prop.name] = propValue;
          }
        }
      }

      if (!eventData || !eventData.type) {
        console.warn("[Recorder] Could not extract event data from:", JSON.stringify(secondArg, null, 2));
        return;
      }

      console.log(`[Recorder] Parsed event: ${eventData.type}`, eventData);
      await this.handleInjectedEvent(eventData);
    };

    this.cdp.on("Runtime.consoleAPICalled", consoleHandler);
    this.eventUnsubscribers.push(() =>
      this.cdp.off("Runtime.consoleAPICalled", consoleHandler)
    );
  }

  /**
   * Handle events from injected script
   */
  private async handleInjectedEvent(event: {
    type: string;
    x?: number;
    y?: number;
    key?: string;
    text?: string;
    scrollX?: number;
    scrollY?: number;
    value?: string;
  }): Promise<void> {
    if (!this.processor || !this.isRecording) return;

    let action: RecordedAction | null = null;

    // Flush any pending input before clicks or other non-input events
    if (event.type !== "input" && this.processor) {
      const pendingAction = this.processor.flushPendingInput();
      if (pendingAction) {
        this.recordAction(pendingAction);
      }
    }

    switch (event.type) {
      case "click":
        if (this.filter.shouldCapture("click")) {
          action = await this.processor.processClick(
            event.x || 0,
            event.y || 0,
            "left",
            1
          );
        }
        break;

      case "input":
        if (this.filter.shouldCapture("input")) {
          // For input events, use the x/y coordinates to extract the target element
          action = await this.processor.processKeyInput(
            event.key || "",
            event.text || "",
            event.value || "",
            event.x || 0,
            event.y || 0
          );
          // processKeyInput may return an action if it flushed previous input
          // The current input is held in pendingInput and will be null
        }
        break;

      case "scroll":
        if (this.filter.shouldCapture("scroll")) {
          const scrollAction = await this.processor.processScroll(
            event.scrollX || 0,
            event.scrollY || 0
          );
          action = this.filter.processScroll(scrollAction);
        }
        break;

      case "hover":
        if (this.filter.shouldCapture("hover")) {
          action = await this.processor.processHover(
            event.x || 0,
            event.y || 0
          );
        }
        break;
    }

    // For interactions, check for significant scrolls
    if (action && ["click", "input", "submit"].includes(event.type)) {
      const significantScrolls = this.filter.processInteraction(action);
      for (const scroll of significantScrolls) {
        this.recordAction(scroll);
      }
    }

    if (action) {
      this.recordAction(action);
    }
  }

  /**
   * Inject recording script into page using addScriptToEvaluateOnNewDocument
   * This ensures the script is injected automatically into every page/frame/navigation
   */
  private async injectRecordingScript(): Promise<void> {
    const script = `
      (function() {
        if (window.__jarvisRecording) {
          console.log('[JARVIS] Recording script already injected, skipping');
          return;
        }
        window.__jarvisRecording = true;

        function emit(type, data) {
          console.debug('__JARVIS_RECORD__', { type, ...data });
        }

        // Test emission immediately to verify it works
        console.log('[JARVIS] Recording script initialized at', new Date().toISOString());
        emit('test', { message: 'Script injection successful' });

        // Click events
        document.addEventListener('click', (e) => {
          console.log('[JARVIS] Click detected at', e.clientX, e.clientY);
          emit('click', { x: e.clientX, y: e.clientY });
        }, true);

        // Input events
        document.addEventListener('input', (e) => {
          const target = e.target;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            const inputData = e.data || e.inputType || '';
            const finalValue = target.value || '';
            
            // Get element position for locator extraction
            const rect = target.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            console.log('[JARVIS] Input detected on', target.tagName, 'data:', inputData, 'value:', finalValue, 'pos:', x, y);
            emit('input', { 
              key: inputData,
              text: inputData,
              value: finalValue,
              x: x,
              y: y
            });
          }
        }, true);

        // Scroll events (debounced)
        let scrollTimeout;
        document.addEventListener('scroll', () => {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
            console.log('[JARVIS] Scroll detected', window.scrollX, window.scrollY);
            emit('scroll', { 
              scrollX: window.scrollX, 
              scrollY: window.scrollY 
            });
          }, 100);
        }, true);

        // Hover events (debounced)
        let hoverTimeout;
        document.addEventListener('mousemove', (e) => {
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            emit('hover', { x: e.clientX, y: e.clientY });
          }, 200);
        }, true);

        console.log('[JARVIS] Recording script ready - all event listeners registered');
      })();
    `;

    try {
      // Use Page.addScriptToEvaluateOnNewDocument instead of Runtime.evaluate
      // This automatically injects into every new page/frame before any other scripts
      await this.cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: script,
      });
      console.log("[Recorder] Recording script registered with Page.addScriptToEvaluateOnNewDocument");
      
      // Also inject into current page immediately
      await this.cdp.send("Runtime.evaluate", {
        expression: script,
        awaitPromise: false,
        returnByValue: true,
      });
      console.log("[Recorder] Recording script also injected into current page");
    } catch (error) {
      console.error("[Recorder] Failed to inject recording script:", error);
      throw error;
    }
  }

  /**
   * Record an action to the session
   */
  private recordAction(action: RecordedAction): void {
    if (!this.session || !this.isRecording) {
      console.warn("[Recorder] Attempted to record action but no active session");
      return;
    }

    this.session.actions.push(action);
    console.log(`[Recorder] Recorded action ${this.session.actions.length}: ${action.type}`);

    this.emitEvent({
      type: "action_recorded",
      action,
      count: this.session.actions.length,
    });
  }

  /**
   * Stop recording
   */
  async stop(): Promise<RecordedSession> {
    if (!this.isRecording || !this.session) {
      throw new Error("Not recording");
    }

    console.log("[Recorder] Stopping recording...");
    console.log(`[Recorder] Current action count: ${this.session.actions.length}`);

    // Flush any pending input
    if (this.processor) {
      console.log("[Recorder] Flushing pending input before stop...");
      const pendingAction = this.processor.flushPendingInput();
      if (pendingAction) {
        console.log(`[Recorder] Found pending action to flush: ${pendingAction.type}`);
        this.recordAction(pendingAction);
      } else {
        console.log("[Recorder] No pending input to flush");
      }
    }

    this.isRecording = false;
    this.session.endTime = Date.now();

    console.log(`[Recorder] Recording stopped with ${this.session.actions.length} actions`);

    const session = this.session;

    // Cleanup
    await this.cleanup();

    this.emitEvent({
      type: "state_changed",
      status: {
        state: "idle",
        actionCount: session.actions.length,
      },
    });

    return session;
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Unsubscribe from events
    for (const unsub of this.eventUnsubscribers) {
      unsub();
    }
    this.eventUnsubscribers = [];

    // Disconnect CDP
    try {
      await this.cdp.disconnect();
    } catch {
      // Ignore
    }

    // Kill Chrome
    try {
      await this.chrome.kill();
    } catch {
      // Ignore
    }

    this.processor?.reset();
    this.filter.reset();
  }

  /**
   * Emit a recording event
   */
  private emitEvent(event: RecordingEvent): void {
    this.emit("recording-event", event);
  }

  /**
   * Subscribe to recording events
   */
  onEvent(handler: (event: RecordingEvent) => void): () => void {
    this.on("recording-event", handler);
    return () => this.off("recording-event", handler);
  }
}
