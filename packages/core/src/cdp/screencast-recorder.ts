/**
 * Screencast Recorder
 *
 * Records browser screencast using CDP and saves as animated HTML
 */

import fs from "fs/promises";
import path from "path";
import type { CDPClient } from "./client.js";

/**
 * Screencast frame data from CDP
 */
interface ScreencastFrame {
  data: string; // base64 encoded image
  metadata: {
    timestamp: number;
    deviceWidth?: number;
    deviceHeight?: number;
  };
  sessionId: number;
}

/**
 * Screencast recorder options
 */
export interface ScreencastRecorderOptions {
  /** Output directory for recordings */
  outputDir: string;
  /** Maximum width of screencast */
  maxWidth?: number;
  /** Maximum height of screencast */
  maxHeight?: number;
  /** Capture every Nth frame (1 = all frames) */
  everyNthFrame?: number;
  /** JPEG quality (0-100) */
  quality?: number;
  /** Frame delay between frames in ms */
  frameDelay?: number;
  /** Optional callback for real-time frame streaming */
  frameCallback?: (frame: { data: string; metadata: any; timestamp: number }) => void;
}

/**
 * Screencast recorder state
 */
export type ScreencastRecorderState = "idle" | "recording" | "processing" | "error";

/**
 * Screencast Recorder
 *
 * Captures browser screencast via CDP and generates animated HTML
 */
export class ScreencastRecorder {
  private state: ScreencastRecorderState = "idle";
  private cdpClient: CDPClient | null = null;
  private frames: ScreencastFrame[] = [];
  private options: Omit<Required<ScreencastRecorderOptions>, 'frameCallback'> & { frameCallback?: (frame: { data: string; metadata: any; timestamp: number }) => void };
  private frameCount = 0;

  constructor(options: ScreencastRecorderOptions) {
    this.options = {
      outputDir: options.outputDir,
      maxWidth: options.maxWidth || 640,
      maxHeight: options.maxHeight || 480,
      everyNthFrame: options.everyNthFrame || 3,
      quality: options.quality || 50,
      frameDelay: options.frameDelay || 100,
      frameCallback: options.frameCallback,
    };
  }

  /**
   * Get current state
   */
  getState(): ScreencastRecorderState {
    return this.state;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.state === "recording";
  }

  /**
   * Start recording screencast
   */
  async start(cdpClient: CDPClient): Promise<void> {
    if (this.state === "recording") {
      throw new Error("Already recording");
    }

    if (cdpClient.getState() !== "connected") {
      throw new Error("CDP client not connected");
    }

    this.state = "recording";
    this.cdpClient = cdpClient;
    this.frames = [];
    this.frameCount = 0;

    try {
      // Enable Page domain
      await this.cdpClient.enableDomain("Page");

      // Register screencast frame handler
      this.cdpClient.on("Page.screencastFrame", this.handleScreencastFrame.bind(this));

      // Start screencast
      await this.cdpClient.send("Page.startScreencast", {
        format: "jpeg",
        quality: this.options.quality,
        maxWidth: this.options.maxWidth,
        maxHeight: this.options.maxHeight,
        everyNthFrame: this.options.everyNthFrame,
      });

      console.log("[ScreencastRecorder] Started recording");
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }

  /**
   * Handle screencast frame event from CDP
   */
  private async handleScreencastFrame(params: any): Promise<void> {
    if (this.state !== "recording" || !this.cdpClient) {
      return;
    }

    try {
      // Store frame data
      const frame: ScreencastFrame = {
        data: params.data,
        metadata: params.metadata,
        sessionId: params.sessionId,
      };

      this.frames.push(frame);
      this.frameCount++;

      // Emit frame in real-time if callback is provided
      if (this.options.frameCallback) {
        this.options.frameCallback({
          data: params.data,
          metadata: params.metadata,
          timestamp: Date.now(),
        });
      }

      // Acknowledge frame
      await this.cdpClient.send("Page.screencastFrameAck", {
        sessionId: params.sessionId,
      });
    } catch (error) {
      console.error("[ScreencastRecorder] Failed to handle frame:", error);
    }
  }

  /**
   * Stop recording and save as animated HTML
   */
  async stop(): Promise<string> {
    if (this.state !== "recording" || !this.cdpClient) {
      throw new Error("Not recording");
    }

    this.state = "processing";

    try {
      // Stop screencast
      await this.cdpClient.send("Page.stopScreencast");

      // Remove event handler
      this.cdpClient.off("Page.screencastFrame", this.handleScreencastFrame.bind(this));

      console.log(`[ScreencastRecorder] Stopped recording with ${this.frames.length} frames`);

      // Generate animated HTML
      const htmlPath = await this.generateAnimatedHTML();

      this.state = "idle";
      this.cdpClient = null;
      this.frames = [];

      return htmlPath;
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }

  /**
   * Generate animated HTML from captured frames
   */
  private async generateAnimatedHTML(): Promise<string> {
    if (this.frames.length === 0) {
      throw new Error("No frames captured");
    }

    // Create output directory if it doesn't exist
    await fs.mkdir(this.options.outputDir, { recursive: true });

    // Generate output filename
    const timestamp = Date.now();
    const filename = `execution-${timestamp}.html`;
    const outputPath = path.join(this.options.outputDir, filename);

    console.log(`[ScreencastRecorder] Generating animated HTML with ${this.frames.length} frames...`);

    // Build HTML content with embedded frames
    const framesJson = JSON.stringify(this.frames.map(f => `data:image/jpeg;base64,${f.data}`));

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
    <title>Test Execution Recording</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            overflow: hidden;
        }
        .container {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: white;
        }
        h1 {
            margin: 0;
            padding: 15px 20px;
            font-size: 16px;
            color: #333;
            text-align: center;
            background: #f9f9f9;
            border-bottom: 1px solid #e0e0e0;
        }
        #canvas-container {
            flex: 1;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            overflow: hidden;
        }
        #frame {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
        }
        .controls-wrapper {
            background: white;
            border-top: 1px solid #e0e0e0;
            padding: 15px 20px;
        }
        .seekbar-container {
            margin-bottom: 15px;
            padding: 0 5px;
        }
        .seekbar {
            width: 100%;
            height: 6px;
            -webkit-appearance: none;
            appearance: none;
            background: #ddd;
            outline: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .seekbar::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            background: #007AFF;
            border-radius: 50%;
            cursor: pointer;
            transition: background 0.2s;
        }
        .seekbar::-webkit-slider-thumb:hover {
            background: #0051D5;
        }
        .seekbar::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: #007AFF;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            transition: background 0.2s;
        }
        .seekbar::-moz-range-thumb:hover {
            background: #0051D5;
        }
        .controls {
            display: flex;
            gap: 10px;
            justify-content: center;
            align-items: center;
            margin-bottom: 10px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background: #007AFF;
            color: white;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
        }
        button:hover {
            background: #0051D5;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .info {
            font-size: 12px;
            color: #666;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📹 Test Execution Recording</h1>
        <div id="canvas-container">
            <img id="frame" alt="Recording frame">
        </div>
        <div class="controls-wrapper">
            <div class="seekbar-container">
                <input type="range" id="seekbar" class="seekbar" min="0" max="0" value="0">
            </div>
            <div class="controls">
                <button id="play-btn">▶️ Play</button>
                <button id="pause-btn" disabled>⏸️ Pause</button>
                <button id="restart-btn">🔄 Restart</button>
            </div>
            <div class="info" id="info">
                Frame: <span id="current-frame">0</span> / <span id="total-frames">0</span>
            </div>
        </div>
    </div>

    <script>
        const frames = ${framesJson};
        const frameDelay = ${this.options.frameDelay * 2}; // Slower playback (double the delay)
        let currentFrame = 0;
        let playing = false;
        let animationInterval = null;

        const frameImg = document.getElementById('frame');
        const playBtn = document.getElementById('play-btn');
        const pauseBtn = document.getElementById('pause-btn');
        const restartBtn = document.getElementById('restart-btn');
        const seekbar = document.getElementById('seekbar');
        const currentFrameSpan = document.getElementById('current-frame');
        const totalFramesSpan = document.getElementById('total-frames');

        // Initialize seekbar
        seekbar.max = frames.length - 1;
        totalFramesSpan.textContent = frames.length;

        function showFrame(index) {
            if (index >= 0 && index < frames.length) {
                frameImg.src = frames[index];
                currentFrame = index;
                currentFrameSpan.textContent = index + 1;
                seekbar.value = index;
            }
        }

        function play() {
            if (playing) return;
            playing = true;
            playBtn.disabled = true;
            pauseBtn.disabled = false;

            animationInterval = setInterval(() => {
                currentFrame++;
                if (currentFrame >= frames.length) {
                    // Stop at the end instead of looping
                    pause();
                    return;
                }
                showFrame(currentFrame);
            }, frameDelay);
        }

        function pause() {
            playing = false;
            playBtn.disabled = false;
            pauseBtn.disabled = true;
            if (animationInterval) {
                clearInterval(animationInterval);
                animationInterval = null;
            }
        }

        function restart() {
            pause();
            currentFrame = 0;
            showFrame(0);
        }

        function seek(frameIndex) {
            const wasPlaying = playing;
            if (wasPlaying) {
                pause();
            }
            showFrame(frameIndex);
            if (wasPlaying) {
                play();
            }
        }

        playBtn.addEventListener('click', play);
        pauseBtn.addEventListener('click', pause);
        restartBtn.addEventListener('click', restart);
        
        // Seekbar event handlers
        seekbar.addEventListener('input', (e) => {
            const frameIndex = parseInt(e.target.value);
            showFrame(frameIndex);
        });
        
        seekbar.addEventListener('mousedown', () => {
            if (playing) {
                pause();
                seekbar.dataset.wasPlaying = 'true';
            }
        });
        
        seekbar.addEventListener('mouseup', () => {
            if (seekbar.dataset.wasPlaying === 'true') {
                delete seekbar.dataset.wasPlaying;
                play();
            }
        });

        // Show first frame (but don't auto-play)
        showFrame(0);
    </script>
</body>
</html>`;

    await fs.writeFile(outputPath, htmlContent, "utf-8");

    console.log(`[ScreencastRecorder] Animated HTML saved to: ${outputPath}`);

    return outputPath;
  }

  /**
   * Cancel recording without saving
   */
  async cancel(): Promise<void> {
    if (this.state !== "recording" || !this.cdpClient) {
      return;
    }

    try {
      await this.cdpClient.send("Page.stopScreencast");
      this.cdpClient.off("Page.screencastFrame", this.handleScreencastFrame.bind(this));
    } catch (error) {
      console.error("[ScreencastRecorder] Failed to cancel recording:", error);
    }

    this.state = "idle";
    this.cdpClient = null;
    this.frames = [];
  }

  /**
   * Get recording statistics
   */
  getStats(): {
    frameCount: number;
    framesCollected: number;
    state: ScreencastRecorderState;
  } {
    return {
      frameCount: this.frameCount,
      framesCollected: this.frames.length,
      state: this.state,
    };
  }
}
