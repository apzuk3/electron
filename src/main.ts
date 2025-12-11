import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
} from "electron";
import path from "node:path";
import fs from "fs";
import started from "electron-squirrel-startup";
import {
  initializeAXObserver,
  startAXEvents,
  stopAXEvents,
} from "./darwin/index";
import { dbService } from "./database/db";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Store window reference globally for IPC handlers
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Detect dev mode
const isDev =
  process.env.ELECTRON_RENDERER_URL ||
  process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL ||
  !app.isPackaged;

// Resolve asset paths for dev vs production
const resolveAssetPath = (fileName: string): string => {
  if (isDev) {
    // In dev, use assets directly from the project root
    // Use process.cwd() since __dirname points to .vite/build in Vite output
    return path.join(process.cwd(), "assets", fileName);
  }
  // In prod, Electron Forge copies assets to resources/assets
  return path.join(process.resourcesPath, "assets", fileName);
};

// Window bounds constants
const DEFAULT_WINDOW_BOUNDS = {
  width: 900,
  height: 600,
};

type WindowBoundsPayload = {
  width: number;
  height: number;
  center?: boolean;
  minimumWidth?: number;
  minimumHeight?: number;
};

const clampBounds = (bounds: WindowBoundsPayload) => {
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 320;
  const MAX_WIDTH = 1920;
  const MAX_HEIGHT = 1440;

  const toInt = (value: number | undefined, fallback: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fallback;
    }
    return Math.round(value);
  };

  const width = Math.min(
    Math.max(toInt(bounds.width, DEFAULT_WINDOW_BOUNDS.width), MIN_WIDTH),
    MAX_WIDTH
  );
  const height = Math.min(
    Math.max(toInt(bounds.height, DEFAULT_WINDOW_BOUNDS.height), MIN_HEIGHT),
    MAX_HEIGHT
  );

  const minimumWidth = Math.min(
    Math.max(toInt(bounds.minimumWidth, MIN_WIDTH), MIN_WIDTH),
    width
  );
  const minimumHeight = Math.min(
    Math.max(toInt(bounds.minimumHeight, MIN_HEIGHT), MIN_HEIGHT),
    height
  );

  return {
    width,
    height,
    center: Boolean(bounds.center),
    minimumWidth,
    minimumHeight,
  };
};

// Onboarding state management
const getOnboardedStatePath = (): string => {
  return path.join(app.getPath("userData"), "onboarded.json");
};

const getOnboardedState = (): boolean => {
  const statePath = getOnboardedStatePath();
  try {
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, "utf-8");
      const parsed = JSON.parse(data);
      return parsed.onboarded === true;
    }
  } catch (error) {
    console.error("Error reading onboarded state:", error);
  }
  return false;
};

const setOnboardedState = (value: boolean): void => {
  const statePath = getOnboardedStatePath();
  try {
    const data = JSON.stringify({ onboarded: value });
    fs.writeFileSync(statePath, data, "utf-8");
  } catch (error) {
    console.error("Error writing onboarded state:", error);
  }
};

const createWindow = () => {
  // Don't create if window already exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_BOUNDS.width,
    height: DEFAULT_WINDOW_BOUNDS.height,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Hide window when it loses focus
  mainWindow.on("blur", () => {
    mainWindow?.hide();
  });

  // Clean up reference when window is closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Hide window initially
  mainWindow.hide();

  return mainWindow;
};

const toggleMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  mainWindow.show();
  mainWindow.moveTop();
};

const createTray = () => {
  // Load tray icon using resolveAssetPath
  const iconPath =
    process.platform === "darwin"
      ? resolveAssetPath("tray_icon_22.png")
      : resolveAssetPath("tray_icon.png");

  console.log("Tray icon path:", iconPath);
  console.log("Tray icon exists:", fs.existsSync(iconPath));

  // Try to load the icon, fallback to empty image if not found
  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      console.warn("Tray icon is empty, using fallback");
      trayIcon = nativeImage.createEmpty();
    } else {
      console.log("Tray icon loaded successfully");
    }
  } catch (error) {
    console.error("Failed to load tray icon:", error);
    trayIcon = nativeImage.createEmpty();
  }

  // If icon is empty, create a simple visible icon as fallback
  if (trayIcon.isEmpty()) {
    const size = process.platform === "darwin" ? 22 : 16;
    const canvas = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    trayIcon = nativeImage.createFromBuffer(canvas);
    trayIcon = trayIcon.resize({ width: size, height: size });
  }

  // Set template image on macOS for proper light/dark mode rendering
  if (process.platform === "darwin") {
    trayIcon.setTemplateImage(true);
  }

  tray = new Tray(trayIcon);

  // Ensure single-click behavior is consistent
  tray.setIgnoreDoubleClickEvents(true);

  // Left click: toggle window
  tray.on("click", () => {
    toggleMainWindow();
  });

  // Build context menu
  const contextMenu = Menu.buildFromTemplate([
    { label: "Open", click: () => toggleMainWindow() },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);

  // Right click: show context menu
  if (process.platform === "darwin") {
    tray.on("right-click", () => {
      tray?.popUpContextMenu(contextMenu);
    });
  } else {
    tray.setContextMenu(contextMenu);
  }

  tray.setToolTip("Focusd");
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  // Initialize database
  dbService.initialize();

  // Create window but keep it hidden initially
  mainWindow = createWindow();

  // Set Dock icon from assets if provided (macOS)
  if (process.platform === "darwin" && app.dock) {
    const appIconPath = resolveAssetPath("app_icon.png");
    console.log("App icon path:", appIconPath);
    console.log("App icon exists:", fs.existsSync(appIconPath));
    if (fs.existsSync(appIconPath)) {
      const appIcon = nativeImage.createFromPath(appIconPath);
      if (!appIcon.isEmpty()) {
        app.dock.setIcon(appIcon);
        console.log("App icon set successfully");
      } else {
        console.warn("App icon is empty");
      }
    } else {
      console.warn("App icon file not found at:", appIconPath);
    }
    app.dock.hide();
  }

  // Create system tray
  createTray();

  // Register global shortcut to toggle window: Shift + Option + Space (macOS only)
  if (process.platform === "darwin") {
    const accelerator = "Shift+Option+Space";
    const registered = globalShortcut.register(accelerator, () => {
      toggleMainWindow();
    });
    if (!registered) {
      console.warn("Failed to register global shortcut:", accelerator);
    }
  }

  // Check onboarding state - only show window if not onboarded
  const isOnboarded = getOnboardedState();
  if (!isOnboarded) {
    // createWindow();
  }

  // Initialize and start AX observer
  if (process.platform === "darwin") {
    initializeAXObserver((event) => {
      console.log("AX Event:", event);
    });

    startAXEvents();
  }

  // Setup IPC handlers
  setupIpcHandlers();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  // Unregister all shortcuts when windows are closed
  try {
    globalShortcut.unregisterAll();
  } catch (error) {
    console.warn(
      "Failed to unregister global shortcuts on window-all-closed:",
      error
    );
  }
  stopAXEvents();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  // Ensure all shortcuts are unregistered on app quit
  try {
    globalShortcut.unregisterAll();
  } catch (error) {
    console.warn("Failed to unregister global shortcuts on will-quit:", error);
  }
  // Clean up tray
  if (tray) {
    tray.destroy();
    tray = null;
  }
  dbService.close();
});

app.on("activate", () => {
  // Check onboarding state - only show window if not onboarded
  const isOnboarded = getOnboardedState();
  if (!isOnboarded) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createWindow();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.moveTop();
  }
});

// Setup IPC handlers
const setupIpcHandlers = () => {
  // Set window bounds handler
  ipcMain.handle(
    "set-window-bounds",
    (_event, payload: WindowBoundsPayload) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return false;
      }

      const { width, height, center, minimumHeight, minimumWidth } =
        clampBounds(payload);

      const currentBounds = mainWindow.getBounds();
      const [currentMinWidth, currentMinHeight] = mainWindow.getMinimumSize();

      const sizeChanged =
        currentBounds.width !== width || currentBounds.height !== height;

      const minChanged =
        currentMinWidth !== minimumWidth || currentMinHeight !== minimumHeight;

      if (minChanged) {
        mainWindow.setMinimumSize(minimumWidth, minimumHeight);
      }

      if (sizeChanged) {
        mainWindow.setBounds({ ...currentBounds, width, height });
        if (center) {
          mainWindow.center();
        }
      }

      return true;
    }
  );

  // Set onboarded flag handler
  ipcMain.handle("set-onboarded", () => {
    setOnboardedState(true);
  });

  // Unset onboarded flag handler
  ipcMain.handle("unset-onboarded", () => {
    setOnboardedState(false);
  });
};

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
