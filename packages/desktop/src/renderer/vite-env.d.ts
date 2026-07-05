/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

import type { JarvisEvent } from "@promptwright/core";

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

// Window API from preload script
declare global {
  interface Window {
    jarvis: {
      sendMessage: (prompt: string) => Promise<string>;
      abort: () => Promise<void>;
      getState: () => Promise<string>;
      setWorkDir: (path: string) => Promise<string>;
      pickFolder: () => Promise<string | null>;
      getWorkDir: () => Promise<string>;
      onEvent: (callback: (event: JarvisEvent) => void) => (() => void);
      prerequisites: {
        getStatus: () => Promise<any>;
        runCheck: () => Promise<any>;
      };
      session: {
        save: (sessionId: string, data: string) => Promise<string>;
        load: (sessionId: string) => Promise<string | null>;
        list: () => Promise<any[]>;
        delete: (sessionId: string) => Promise<boolean>;
      };
    };
  }
}
