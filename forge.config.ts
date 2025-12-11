import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import path from "node:path";
import fs from "fs-extra";

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "app.focusd.work",
    // Set the packaged app's icon
    icon: path.resolve(__dirname, "assets/app_icon.png"),
    protocols: [
      {
        name: "Focusd Work",
        schemes: ["focusd"],
      },
    ],
    // Make this a menu bar app (agent app) - never shows in Dock
    extendInfo: {
      LSUIElement: true,
    },
    asar: {
      unpack:
        "{**/node_modules/{better-sqlite3,bindings,file-uri-to-path}/**/*,**/*.node}",
    },
    // Include assets directory so tray icons are available in production
    extraResource: [
      path.resolve(__dirname, "assets"),
    ],
    // Don't ignore node_modules for dependencies needed at runtime
    ignore: (path: string) => {
      if (!path) return false;

      // Keep these essential runtime dependencies
      // better-sqlite3: native database module
      // bindings: dependency of better-sqlite3
      // file-uri-to-path: dependency of bindings
      // electron-squirrel-startup: used in main.ts for Windows installer
      if (
        path.match(
          /node_modules\/(better-sqlite3|bindings|electron-squirrel-startup|file-uri-to-path)/
        )
      ) {
        return false;
      }

      // Ignore all other node_modules during copy (Vite already bundled everything else)
      if (path.includes("/node_modules/") || path === "/node_modules") {
        return true;
      }

      return false;
    },
  },
  rebuildConfig: {},
  hooks: {
    packageAfterPrune: async (_config: unknown, buildPath: string) => {
      // Manually copy native dependencies that need to be available at runtime
      const nodeModulesPath = path.join(buildPath, "node_modules");
      await fs.ensureDir(nodeModulesPath);

      // Only copy dependencies that are actually needed at runtime:
      // - better-sqlite3: native database module (direct dependency)
      // - bindings: required by better-sqlite3
      // - file-uri-to-path: required by bindings
      // - electron-squirrel-startup: used in main.ts for Windows installer
      const dependencies = [
        "better-sqlite3",
        "bindings",
        "electron-squirrel-startup",
        "file-uri-to-path",
      ];

      for (const dep of dependencies) {
        const srcPath = path.resolve(__dirname, "node_modules", dep);
        const destPath = path.join(nodeModulesPath, dep);

        if (await fs.pathExists(srcPath)) {
          await fs.copy(srcPath, destPath);
          console.log(`Copied ${dep} to ${destPath}`);
        }
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: false, // Must be false to allow unpacked native modules
    }),
  ],
};

export default config;
