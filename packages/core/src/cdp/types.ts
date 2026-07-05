/**
 * Chrome DevTools Protocol Types
 *
 * Types for CDP communication and event handling
 */

/**
 * CDP WebSocket message structure
 */
export interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * CDP target information returned by /json endpoint
 */
export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl?: string;
}

/**
 * CDP Domain enable/disable options
 */
export type CDPDomain = "Page" | "DOM" | "Input" | "Network" | "Runtime" | "Overlay";

/**
 * Mouse button types for Input domain
 */
export type MouseButton = "none" | "left" | "middle" | "right";

/**
 * Input event types
 */
export type MouseEventType = "mousePressed" | "mouseReleased" | "mouseMoved";
export type KeyEventType = "keyDown" | "keyUp" | "char";

/**
 * CDP Page events
 */
export interface PageLoadEventFiredParams {
  timestamp: number;
}

export interface PageFrameNavigatedParams {
  frame: {
    id: string;
    url: string;
    securityOrigin: string;
    mimeType: string;
  };
}

export interface PageDomContentEventFiredParams {
  timestamp: number;
}

/**
 * CDP DOM events
 */
export interface DOMDocumentUpdatedParams {
  // No params
}

export interface DOMAttributeModifiedParams {
  nodeId: number;
  name: string;
  value: string;
}

/**
 * CDP Input events (for recording)
 */
export interface InputDispatchMouseEventParams {
  type: MouseEventType;
  x: number;
  y: number;
  button?: MouseButton;
  clickCount?: number;
  modifiers?: number;
  timestamp?: number;
}

export interface InputDispatchKeyEventParams {
  type: KeyEventType;
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
  timestamp?: number;
}

/**
 * CDP Runtime events
 */
export interface RuntimeConsoleAPICalledParams {
  type: string;
  args: Array<{
    type: string;
    value?: unknown;
    description?: string;
  }>;
  timestamp: number;
}

/**
 * DOM node structure from CDP
 */
export interface CDPNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  attributes?: string[];
  children?: CDPNode[];
  parentId?: number;
  frameId?: string;
}

/**
 * Box model for element positioning
 */
export interface BoxModel {
  content: number[];
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;
}

/**
 * Result of DOM.getDocument
 */
export interface GetDocumentResult {
  root: CDPNode;
}

/**
 * Result of DOM.querySelector
 */
export interface QuerySelectorResult {
  nodeId: number;
}

/**
 * Result of DOM.getBoxModel
 */
export interface GetBoxModelResult {
  model: BoxModel;
}

/**
 * Result of DOM.getOuterHTML
 */
export interface GetOuterHTMLResult {
  outerHTML: string;
}

/**
 * Result of Runtime.evaluate
 */
export interface RuntimeEvaluateResult {
  result: {
    type: string;
    value?: unknown;
    objectId?: string;
    description?: string;
  };
  exceptionDetails?: {
    exceptionId: number;
    text: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * CDP event handler type
 */
export type CDPEventHandler<T = unknown> = (params: T) => void;

/**
 * CDP connection options
 */
export interface CDPConnectionOptions {
  host?: string;
  port?: number;
  targetId?: string;
}

/**
 * CDP client state
 */
export type CDPClientState = "disconnected" | "connecting" | "connected" | "error";

/**
 * CDP client events
 */
export type CDPClientEvent =
  | { type: "connected"; targetId: string }
  | { type: "disconnected"; reason?: string }
  | { type: "error"; error: Error }
  | { type: "event"; method: string; params: unknown };
