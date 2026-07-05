import type { JarvisEvent } from "@promptwright/core";

declare global {
  interface Window {
    jarvis: {
      sendMessage: (prompt: string) => Promise<string>;
      abort: () => Promise<void>;
      getState: () => Promise<string>;
      setWorkDir: (path: string) => Promise<string>;
      pickFolder: () => Promise<string | null>;
      getWorkDir: () => Promise<string>;
      getSystemPrompt: () => Promise<string | null>;
      getPath: (name: string) => Promise<string | null>;
      getScreenshotsDir: () => Promise<string>;
      onEvent: (callback: (event: JarvisEvent) => void) => () => void;
      
      dialog: {
        showMessage: (options: {
          type?: "none" | "info" | "error" | "question" | "warning";
          title?: string;
          message: string;
          detail?: string;
          buttons?: string[];
        }) => Promise<{ response: number }>;
      };

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
      
      persona: {
        list: () => Promise<any[]>;
        getActive: () => Promise<any | null>;
        select: (personaId: string) => Promise<any>;
        onEvent: (callback: (event: any) => void) => () => void;
      };
      
      playwright: {
        checkInstalled: () => Promise<boolean>;
        install: () => Promise<boolean>;
        checkBrowser: () => Promise<boolean>;
        getStatus: () => Promise<string>;
        onEvent: (callback: (event: any) => void) => () => void;
      };

      recording: {
        getModes: () => Promise<Array<{
          mode: string;
          name: string;
          description: string;
          isDefault: boolean;
        }>>;
        getDefaultMode: () => Promise<string>;
        start: (mode: string, startUrl?: string) => Promise<{ success: boolean }>;
        stop: () => Promise<any>;
        generateGherkin: () => Promise<{
          gherkin: string;
          summary: string;
          suggestions?: string[];
        }>;
        refineGherkin: (instruction: string) => Promise<{
          gherkin: string;
          summary: string;
          suggestions?: string[];
        }>;
        getStatus: () => Promise<any>;
        getGherkin: () => Promise<string | null>;
        discard: () => Promise<{ success: boolean }>;
        export: (gherkin: string, filePath: string) => Promise<{ success: boolean; path: string }>;
        pickExportPath: () => Promise<string | null>;
        loadFeature: () => Promise<{ path: string; content: string } | null>;
        cleanupTemp: () => Promise<{ success: boolean }>;
        onEvent: (callback: (event: any) => void) => () => void;
      };

      executionReport: {
        loadScreenshot: (screenshotPath: string) => Promise<string>;
        cleanup: () => Promise<{ success: boolean }>;
        processWithAI: (rawData: any) => Promise<any>;
      };

      execution: {
        startRecording: () => Promise<{ success: boolean; port: number }>;
        stopRecording: () => Promise<{ success: boolean; path: string }>;
        getRecordingPath: () => Promise<string | null>;
        readRecording: (filePath: string) => Promise<string>;
        cancelRecording: () => Promise<{ success: boolean }>;
        closeBrowser: () => Promise<{ success: boolean }>;
        onScreencastFrame: (callback: (frame: { data: string; timestamp: number }) => void) => () => void;
      };
    };
  }
}

export {};
