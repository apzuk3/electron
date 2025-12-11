import type { AxEvent } from "./types";

export type ThrottledCallback = (event: AxEvent) => Promise<void> | void;

export class EventThrottler {
  private lastEvent: AxEvent | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly delay: number;
  private readonly callback: ThrottledCallback;

  constructor(callback: ThrottledCallback, delay = 200) {
    this.callback = callback;
    this.delay = delay;
  }

  public schedule(event: AxEvent): void {
    this.lastEvent = event;
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => this.processEvent(), this.delay);
  }

  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lastEvent = null;
    this.isProcessing = false;
  }

  private async processEvent(): Promise<void> {
    this.timer = null;

    if (this.isProcessing || !this.lastEvent) {
      // Try again on next tick if busy or if we have a new event waiting
      if (this.lastEvent) {
         this.schedule(this.lastEvent);
      }
      return;
    }

    const currentEvt = this.lastEvent;
    this.lastEvent = null;
    this.isProcessing = true;

    try {
      await this.callback(currentEvt);
    } catch (error) {
      console.error("Error processing throttled event:", error);
    } finally {
      this.isProcessing = false;
      // If a new event arrived while processing, schedule it immediately
      if (this.lastEvent) {
        this.schedule(this.lastEvent);
      }
    }
  }
}

