// MineBlock — preload script.
//
// Exposes a narrow, explicit bridge between the sandboxed renderer and the
// main process. The renderer never touches Node/fs directly; it only ever
// sees window.mineblock.* below, which forwards to IPC handlers in main.js.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mineblock', {
  platform: process.platform,
  saves: {
    list: () => ipcRenderer.invoke('saves:list'),
    load: (name) => ipcRenderer.invoke('saves:load', name),
    write: (name, data) => ipcRenderer.invoke('saves:write', name, data),
    delete: (name) => ipcRenderer.invoke('saves:delete', name)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings)
  }
});
