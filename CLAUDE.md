# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a macOS Electron application called "focusd-electron" that runs as a menu bar app (LSUIElement: true). The app monitors window focus and title changes using native macOS Accessibility APIs and stores activity data in a SQLite database.

## Development Commands

```bash
# Start development server
npm start

# Build native addon (macOS AX observer)
npm run build-addon

# Rebuild native modules for Electron
npm run rebuild

# Rebuild native addon after changes
npm run rebuild-addon

# Lint code
npm run lint

# Package app for distribution
npm run package

# Create distribution builds
npm run make
```

## Architecture

### Process Architecture
- **Main Process** (`src/main.ts`): Electron main process managing app lifecycle, window, tray, and global shortcuts
- **Renderer Process** (`src/renderer/`): React app with TanStack Router for UI
- **Preload Script** (`src/preload.ts`): Secure IPC bridge between main and renderer using contextBridge

### Key Components

#### Native macOS Integration (`src/darwin/`)
- **ax_observer.mm**: Native Node.js addon (Objective-C++) that monitors macOS Accessibility events
  - Watches for window focus changes and title changes
  - Uses AXObserver API with NSWorkspace notifications
  - Built with node-gyp using `binding.gyp` configuration
- **addon-loader.ts**: Loads the native addon differently in dev vs production
  - Dev: `build/Release/ax_observer.node`
  - Production: `app.asar.unpacked/.vite/build/darwin/ax_observer.node`
- **browser-url-fetcher.ts**: Fetches active tab URLs from browsers using AppleScript
  - Supports Chrome-based browsers and Safari
- **event-throttler.ts**: Throttles high-frequency AX events to avoid overwhelming the event loop
- **index.ts**: Main service class (AXObserverService) that orchestrates the above components

#### Database (`src/database/`)
- **db.ts**: SQLite database service using better-sqlite3
  - Database stored in Electron's userData directory
  - Singleton service pattern (dbService)
  - Migrations system (not yet implemented)

#### Main Process
- **Window Management**: Single BrowserWindow that hides on blur, toggles with tray icon or global shortcut (Shift+Option+Space)
- **Onboarding State**: Persisted in `onboarded.json` in userData directory
- **Tray Icon**: Menu bar icon with click to toggle window, right-click for context menu
- **Assets**: Icons loaded from `assets/` directory, resolved differently in dev vs production
- **Static File Server** (`src/utils/static-file-server.ts`): In production mode, serves renderer files via HTTP
  - Finds available port in range 12000-12010
  - Serves from renderer dist directory
  - Prevents directory traversal attacks
  - Supports SPA routing (falls back to index.html)

#### Renderer Process
- **Framework**: React 19 + TanStack Router + Tailwind CSS v4
- **Routing**: File-based routing in `src/renderer/src/routes/`
- **Styling**: Tailwind CSS with `@tailwindcss/vite` plugin
- **Dev Tools**: TanStack DevTools and Router DevTools enabled
- **UI Components**: Uses shadcn components (see `src/renderer/.cursorrules` for installation command)

### Build Configuration

#### Electron Forge
- **Packaging**: Configured in `forge.config.ts`
  - Bundle ID: `app.focusd.work`
  - App configured as LSUIElement (menu bar app, never shows in Dock)
  - ASAR with unpacked native modules: `{better-sqlite3,bindings,file-uri-to-path}`
  - Assets directory copied to resources for production icon access
  - Custom `packageAfterPrune` hook copies runtime dependencies
- **Makers**: ZIP (macOS), Squirrel (Windows), Deb, RPM

#### Vite
- **Main Process** (`vite.main.config.ts`): Externalizes better-sqlite3
- **Preload** (`vite.preload.config.ts`): Standard preload build
- **Renderer** (`src/renderer/vite.config.ts`): React + Tailwind + TanStack Router plugins with alias `@` → `src`

#### Native Addon
- **binding.gyp**: Builds ax_observer.node for macOS
  - Links AppKit and ApplicationServices frameworks
  - Uses node-addon-api
  - Enables ARC and C++ exceptions

### IPC API

The preload script exposes these methods via `window.electronAPI`:
- `setWindowBounds(payload)`: Resize/reposition window with bounds clamping
- `setOnboarded()`: Mark user as onboarded
- `unsetOnboarded()`: Clear onboarding state

## Important Notes

### Native Module Handling
- After `npm install`, run `npm run rebuild` to rebuild better-sqlite3 for Electron
- After modifying `ax_observer.mm`, run `npm run build-addon && npm run rebuild-addon`
- Native modules must be unpacked from ASAR in production (configured in forge.config.ts)

### Asset Path Resolution
- Dev mode: Assets loaded from `process.cwd()/assets/`
- Production: Assets loaded from `process.resourcesPath/assets/`
- Use the `resolveAssetPath()` helper in main.ts

### Renderer Loading Strategy
- Dev mode: Loads from Vite dev server (MAIN_WINDOW_VITE_DEV_SERVER_URL)
- Production: Starts StaticFileServer on localhost:12000-12010 and loads via HTTP
  - **Important**: Does NOT use `file://` protocol or `loadFile()` in production
  - Server automatically finds first available port in range
  - Server is stopped on app quit

### Platform-Specific Code
- AX observer functionality is macOS-only (src/darwin/)
- Wrapped in `process.platform === 'darwin'` checks
- Native addon uses macOS-specific Accessibility APIs and NSWorkspace

### shadcn Components
To add new shadcn components in the renderer:
```bash
cd src/renderer
pnpm dlx shadcn@latest add <component-name>
```
