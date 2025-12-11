// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

type WindowBoundsPayload = {
  width: number;
  height: number;
  center?: boolean;
  minimumWidth?: number;
  minimumHeight?: number;
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  setWindowBounds: (payload: WindowBoundsPayload): Promise<boolean> => {
    return ipcRenderer.invoke('set-window-bounds', payload);
  },
  setOnboarded: (): Promise<void> => {
    return ipcRenderer.invoke('set-onboarded');
  },
  unsetOnboarded: (): Promise<void> => {
    return ipcRenderer.invoke('unset-onboarded');
  },
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      setWindowBounds: (payload: WindowBoundsPayload) => Promise<boolean>;
      setOnboarded: () => Promise<void>;
      unsetOnboarded: () => Promise<void>;
    };
  }
}
