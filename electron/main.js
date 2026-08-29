// MineBlock — Electron main process.
//
// Responsible for creating the application window and providing the
// renderer with a safe, minimal file-system bridge (via preload.js + IPC)
// so world saves can be written to the user's data directory. All game
// logic lives entirely in the renderer (src/); this file only owns window
// and OS-level concerns.

import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

const SAVES_DIR = path.join(app.getPath('userData'), 'saves');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

let mainWindow = null;

async function ensureSavesDir() {
  await fs.mkdir(SAVES_DIR, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#eef1f7',
    title: 'MineBlock',
    icon: path.join(__dirname, isDev ? '../src/public/icons/icon-512.png' : '../dist/icons/icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await ensureSavesDir();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// Save/load IPC. World data is stored as one JSON file per save slot under
// the OS-specific userData directory, e.g.
//   Linux:   ~/.config/MineBlock/saves/<name>.json
//   macOS:   ~/Library/Application Support/MineBlock/saves/<name>.json
//   Windows: %APPDATA%/MineBlock/saves/<name>.json
// ---------------------------------------------------------------------------

function safeSlotName(name) {
  return String(name).replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 64) || 'world';
}

ipcMain.handle('saves:list', async () => {
  await ensureSavesDir();
  const files = await fs.readdir(SAVES_DIR);
  const slots = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const full = path.join(SAVES_DIR, file);
      const stat = await fs.stat(full);
      const raw = await fs.readFile(full, 'utf-8');
      const data = JSON.parse(raw);
      slots.push({
        name: file.replace(/\.json$/, ''),
        modified: stat.mtimeMs,
        seed: data.seed,
        playedTime: data.playedTime ?? 0,
        dimension: data.player?.dimension ?? 'overworld'
      });
    } catch {
      // Ignore corrupt save files rather than crashing the list.
    }
  }
  slots.sort((a, b) => b.modified - a.modified);
  return slots;
});

ipcMain.handle('saves:load', async (_evt, name) => {
  await ensureSavesDir();
  const full = path.join(SAVES_DIR, `${safeSlotName(name)}.json`);
  const raw = await fs.readFile(full, 'utf-8');
  return JSON.parse(raw);
});

ipcMain.handle('saves:write', async (_evt, name, data) => {
  await ensureSavesDir();
  const full = path.join(SAVES_DIR, `${safeSlotName(name)}.json`);
  const tmp = `${full}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, full);
  return true;
});

ipcMain.handle('saves:delete', async (_evt, name) => {
  await ensureSavesDir();
  const full = path.join(SAVES_DIR, `${safeSlotName(name)}.json`);
  await fs.rm(full, { force: true });
  return true;
});

ipcMain.handle('settings:load', async () => {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('settings:save', async (_evt, settings) => {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return true;
});
