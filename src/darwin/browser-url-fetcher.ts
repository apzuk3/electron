import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isChromeBasedBrowser, isSafariBrowser } from "./config";

const execFileAsync = promisify(execFile);

export class BrowserURLFetcher {
  private timeout: number;
  private maxBuffer: number;

  constructor(timeout = 3000, maxBuffer = 256 * 1024) {
    this.timeout = timeout;
    this.maxBuffer = maxBuffer;
  }

  public async getActiveTabURL(appId: string): Promise<string | null> {
    const appleScriptCommand = this.getAppleScriptCommand(appId);

    if (!appleScriptCommand) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(
        "osascript",
        ["-e", appleScriptCommand],
        {
          timeout: this.timeout,
          encoding: "utf-8",
          maxBuffer: this.maxBuffer,
        }
      );
      return stdout.trim();
    } catch (error) {
      // Swallow errors to avoid impacting event loop responsiveness
      // We could log debug info here if needed
      return null;
    }
  }

  private getAppleScriptCommand(appId: string): string | null {
    if (isChromeBasedBrowser(appId)) {
      return `tell app id "${appId}" to get the URL of active tab of front window`;
    } else if (isSafariBrowser(appId)) {
      return `tell app id "${appId}" to get URL of front document`;
    }
    return null;
  }
}

