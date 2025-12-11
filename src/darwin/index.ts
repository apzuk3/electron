import { AddonLoader } from "./addon-loader";
import type { AxEvent } from "./types";
import { BrowserURLFetcher } from "./browser-url-fetcher";
import { EventThrottler } from "./event-throttler";

export type { AxEvent };

export type EventCallback = (event: AxEvent & { url: string | null }) => void;

export class AXObserverService {
  private addonLoader: AddonLoader;
  private urlFetcher: BrowserURLFetcher;
  private throttler: EventThrottler | null = null;
  private isRunning = false;
  private eventCallback: EventCallback | null = null;

  constructor() {
    this.addonLoader = new AddonLoader();
    this.urlFetcher = new BrowserURLFetcher();
  }

  public initialize(callback: EventCallback): void {
    this.eventCallback = callback;
    // Re-create throttler if initialized again to ensure fresh callback
    this.throttler = new EventThrottler(async (evt) => {
      await this.handleEvent(evt);
    });
  }

  public start(): boolean {
    if (this.isRunning) {
      console.log("AX events already running");
      return true;
    }

    const ax = this.addonLoader.load();
    if (!ax || !ax.start) {
      console.warn(
        "AX observer not available. Make sure to build the native addon."
      );
      return false;
    }

    try {
      ax.start((evt: AxEvent) => {
        if (this.throttler) {
            this.throttler.schedule(evt);
        }
      });
      this.isRunning = true;
      console.log("AX events started");
      return true;
    } catch (error) {
      console.error("Failed to start AX events:", error);
      return false;
    }
  }

  public stop(): boolean {
    if (!this.isRunning) {
      console.log("AX events not running");
      return true;
    }

    const ax = this.addonLoader.getAddon();
    if (!ax || !ax.stop) {
      console.warn("AX observer not available");
      return false;
    }

    try {
      ax.stop();
      this.isRunning = false;
      if (this.throttler) {
        this.throttler.clear();
      }
      console.log("AX events stopped");
      return true;
    } catch (error) {
      console.error("Failed to stop AX events:", error);
      return false;
    }
  }

  public getStatus(): boolean {
    return this.isRunning;
  }

  private async handleEvent(evt: AxEvent): Promise<void> {
    let url: string | null = null;
    try {
      url = await this.urlFetcher.getActiveTabURL(evt.bundleId);
    } catch {
      url = null;
    }
    
    if (this.eventCallback) {
      this.eventCallback({
        ...evt,
        url: url,
      });
    }
  }
}

// Singleton instance to maintain backward compatibility with module-level state
const service = new AXObserverService();

// Backward compatibility exports
export const initializeAXObserver = (callback: EventCallback): void => {
  service.initialize(callback);
};

export const startAXEvents = (): boolean => {
  return service.start();
};

export const stopAXEvents = (): boolean => {
  return service.stop();
};

export const getAXEventsStatus = (): boolean => {
  return service.getStatus();
};
