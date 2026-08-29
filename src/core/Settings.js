// Persistent, configurable game settings. Reads/writes through the Electron
// bridge (window.mineblock.settings) when available, and transparently falls
// back to localStorage when running the renderer standalone in a browser
// (e.g. during `vite dev` without Electron), so the game never crashes on
// missing IPC.

const DEFAULTS = {
  renderDistance: 8, // chunks
  fov: 75,
  mouseSensitivity: 0.6,
  masterVolume: 0.7,
  musicVolume: 0.5,
  fullscreen: false,
  vsync: true,
  showFps: false,
  invertY: false,
  keybinds: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    sprint: 'ShiftLeft',
    crouch: 'ControlLeft',
    inventory: 'KeyE',
    drop: 'KeyQ',
    hotbar1: 'Digit1',
    hotbar2: 'Digit2',
    hotbar3: 'Digit3',
    hotbar4: 'Digit4',
    hotbar5: 'Digit5',
    hotbar6: 'Digit6',
    hotbar7: 'Digit7',
    hotbar8: 'Digit8',
    hotbar9: 'Digit9',
    pause: 'Escape'
  }
};

class SettingsStore {
  constructor() {
    this.values = structuredClone(DEFAULTS);
    this._loaded = false;
  }

  async load() {
    let stored = null;
    if (window.mineblock?.settings) {
      stored = await window.mineblock.settings.load();
    } else {
      const raw = localStorage.getItem('mineblock.settings');
      stored = raw ? JSON.parse(raw) : null;
    }
    if (stored) {
      this.values = { ...structuredClone(DEFAULTS), ...stored, keybinds: { ...DEFAULTS.keybinds, ...(stored.keybinds || {}) } };
    }
    this._loaded = true;
    return this.values;
  }

  async save() {
    if (window.mineblock?.settings) {
      await window.mineblock.settings.save(this.values);
    } else {
      localStorage.setItem('mineblock.settings', JSON.stringify(this.values));
    }
  }

  get(key) {
    return this.values[key];
  }

  async set(key, value) {
    this.values[key] = value;
    await this.save();
  }

  resetToDefaults() {
    this.values = structuredClone(DEFAULTS);
    return this.save();
  }
}

export const settings = new SettingsStore();
export const DEFAULT_SETTINGS = DEFAULTS;
