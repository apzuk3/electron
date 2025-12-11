import path from "node:path";
import { app } from "electron";
import type { AxObserver } from "./types";

export interface AddonLoaderOptions {
  isDev?: boolean;
  resourcesPath?: string;
  devBuildPath?: string;
  prodBuildPath?: string;
}

export class AddonLoader {
  private addon: AxObserver | null = null;

  constructor(private options: AddonLoaderOptions = {}) {}

  public load(): AxObserver | null {
    if (this.addon) {
      return this.addon;
    }

    try {
      const addonPath = this.resolveAddonPath();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.addon = require(addonPath) as AxObserver;
      console.log("Successfully loaded ax_observer addon from:", addonPath);
      return this.addon;
    } catch (error) {
      console.warn("Failed to load ax_observer addon:", error);
      console.warn(
        "Make sure to run: npm run build-addon && npm run rebuild-addon"
      );
      return null;
    }
  }

  public getAddon(): AxObserver | null {
    return this.addon;
  }

  private resolveAddonPath(): string {
    // Use app.isPackaged to detect dev mode (false = dev, true = production)
    const isDev = this.options.isDev ?? (app?.isPackaged === false);
    
    if (isDev) {
      // In development, use the built addon from the build directory
      // Use process.cwd() since __dirname points to .vite/build in Vite output
      return this.options.devBuildPath ?? path.join(process.cwd(), "build/Release/ax_observer.node");
    } else {
      // In production, the addon should be in app.asar.unpacked
      const resourcesPath = this.options.resourcesPath ?? process.resourcesPath;
      return this.options.prodBuildPath ?? path.join(resourcesPath, "app.asar.unpacked/.vite/build/darwin/ax_observer.node");
    }
  }
}

