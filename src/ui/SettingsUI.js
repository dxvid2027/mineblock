import { settings } from '../core/Settings.js';

const REBINDABLE = [
  ['forward', 'Move Forward'], ['back', 'Move Backward'], ['left', 'Move Left'], ['right', 'Move Right'],
  ['jump', 'Jump'], ['sprint', 'Sprint'], ['crouch', 'Crouch'], ['inventory', 'Inventory'], ['drop', 'Drop Item']
];

/** Reusable settings panel: graphics/audio sliders + a handful of rebindable keys. Used from both the main menu and the in-game pause menu. */
export class SettingsUI {
  constructor(root, { onClose } = {}) {
    this.root = root;
    this.onClose = onClose;
    this._build();
  }

  _row(labelText, controlEl) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    row.append(label, controlEl);
    return row;
  }

  _slider(key, min, max, step, format) {
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step;
    input.value = settings.get(key);
    const valueLabel = document.createElement('span');
    valueLabel.style.cssText = 'color:var(--mb-text-dim);font-size:12px;margin-left:8px;width:40px;display:inline-block;text-align:right;';
    const sync = () => { valueLabel.textContent = format ? format(input.value) : input.value; };
    sync();
    input.addEventListener('input', () => { sync(); settings.set(key, Number(input.value)); });
    const wrap = document.createElement('span');
    wrap.append(input, valueLabel);
    return wrap;
  }

  _checkbox(key) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!settings.get(key);
    input.addEventListener('change', () => settings.set(key, input.checked));
    return input;
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'mb-modal-backdrop interactive';
    const panel = document.createElement('div');
    panel.className = 'mb-panel';
    panel.style.cssText = 'width:460px; position:relative; max-height:85vh; overflow-y:auto;';
    panel.innerHTML = `<div class="mb-modal-title">Settings</div>`;

    const close = document.createElement('button');
    close.className = 'mb-close'; close.textContent = '✕';
    close.onclick = () => this._close();
    panel.appendChild(close);

    const sub = (text) => { const h = document.createElement('div'); h.textContent = text; h.style.cssText = 'margin:16px 0 4px;font-weight:700;font-size:13px;color:var(--mb-accent);'; panel.appendChild(h); };

    sub('Graphics');
    panel.appendChild(this._row('Render Distance (chunks)', this._slider('renderDistance', 4, 16, 1)));
    panel.appendChild(this._row('Field of View', this._slider('fov', 60, 110, 1)));
    panel.appendChild(this._row('Fullscreen', this._checkbox('fullscreen')));
    panel.appendChild(this._row('V-Sync', this._checkbox('vsync')));
    panel.appendChild(this._row('Show FPS', this._checkbox('showFps')));

    sub('Audio');
    panel.appendChild(this._row('Master Volume', this._slider('masterVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)));
    panel.appendChild(this._row('Music Volume', this._slider('musicVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)));

    sub('Controls');
    panel.appendChild(this._row('Mouse Sensitivity', this._slider('mouseSensitivity', 0.1, 2, 0.05, (v) => Number(v).toFixed(2))));
    panel.appendChild(this._row('Invert Y Axis', this._checkbox('invertY')));

    sub('Keybinds (click, then press a key)');
    for (const [action, label] of REBINDABLE) {
      const btn = document.createElement('button');
      btn.className = 'mb-btn';
      btn.style.cssText = 'padding:6px 12px;font-size:12px;min-width:110px;';
      btn.textContent = settings.get('keybinds')[action];
      btn.onclick = () => {
        btn.textContent = 'Press a key…';
        const handler = (e) => {
          e.preventDefault();
          const binds = { ...settings.get('keybinds'), [action]: e.code };
          settings.set('keybinds', binds);
          btn.textContent = e.code;
          window.removeEventListener('keydown', handler, true);
        };
        window.addEventListener('keydown', handler, true);
      };
      panel.appendChild(this._row(label, btn));
    }

    const resetBtn = document.createElement('button');
    resetBtn.className = 'mb-btn danger';
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.style.marginTop = '18px';
    resetBtn.onclick = async () => { await settings.resetToDefaults(); this._close(); this.onClose?.(true); };
    panel.appendChild(resetBtn);

    this.el.appendChild(panel);
    this.root.appendChild(this.el);
  }

  _close() {
    this.el.remove();
    this.onClose?.();
  }
}
