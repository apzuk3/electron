export type AxEvent = { bundleId: string } & Record<string, unknown>;

export interface AxObserver {
  start?: (cb: (evt: AxEvent) => void) => void;
  stop?: () => void;
}

