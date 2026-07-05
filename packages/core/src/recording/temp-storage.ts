import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { RecordedSession } from "./types.js";

/**
 * Service for managing temporary storage of recorded sessions
 */
export class RecordingTempStorage {
  private readonly tempDir: string;

  constructor() {
    // Use system temp directory with promptwright-recordings subdirectory
    this.tempDir = path.join(os.tmpdir(), "promptwright-recordings");
  }

  /**
   * Ensure the temp directory exists
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        console.error("[TempStorage] Failed to create temp directory:", error);
        throw new Error(
          `Failed to create temp directory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Save a recorded session to a temp file
   * @param session The recorded session to save
   * @returns The absolute path to the saved file
   */
  async saveSession(session: RecordedSession): Promise<string> {
    try {
      await this.ensureDirectory();

      // Generate filename with session ID and timestamp
      const timestamp = new Date(session.startTime).toISOString().replace(/[:.]/g, "-");
      const filename = `jarvis-recording-${session.id}-${timestamp}.json`;
      const filePath = path.join(this.tempDir, filename);

      // Serialize session to JSON
      const content = JSON.stringify(session, null, 2);

      // Write to file
      await fs.writeFile(filePath, content, "utf-8");

      console.log(`[TempStorage] Saved recording session to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("[TempStorage] Failed to save session:", error);
      throw new Error(
        `Failed to save recording session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Load a recorded session from a temp file
   * @param filePath The path to the temp file
   * @returns The loaded session
   */
  async loadSession(filePath: string): Promise<RecordedSession> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const session = JSON.parse(content) as RecordedSession;
      return session;
    } catch (error) {
      console.error("[TempStorage] Failed to load session:", error);
      throw new Error(
        `Failed to load recording session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all temp recording files
   * @returns Array of absolute file paths
   */
  async listFiles(): Promise<string[]> {
    try {
      await this.ensureDirectory();

      const files = await fs.readdir(this.tempDir);
      const recordingFiles = files
        .filter((file) => file.startsWith("jarvis-recording-") && file.endsWith(".json"))
        .map((file) => path.join(this.tempDir, file));

      return recordingFiles;
    } catch (error) {
      console.error("[TempStorage] Failed to list files:", error);
      return [];
    }
  }

  /**
   * Delete a specific temp file
   * @param filePath The path to the file to delete
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      console.log(`[TempStorage] Deleted temp file: ${filePath}`);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[TempStorage] Failed to delete file:", error);
        throw new Error(
          `Failed to delete temp file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Clean up old temp files (for session-based retention)
   * This can be called on app startup to remove leftover files from previous sessions
   */
  async cleanup(): Promise<void> {
    try {
      const files = await this.listFiles();

      for (const file of files) {
        try {
          await this.deleteFile(file);
        } catch (error) {
          console.error(`[TempStorage] Failed to delete file during cleanup: ${file}`, error);
          // Continue with other files
        }
      }

      console.log(`[TempStorage] Cleaned up ${files.length} temp file(s)`);
    } catch (error) {
      console.error("[TempStorage] Failed to cleanup temp files:", error);
    }
  }

  /**
   * Get the temp directory path
   */
  getTempDirectory(): string {
    return this.tempDir;
  }
}
