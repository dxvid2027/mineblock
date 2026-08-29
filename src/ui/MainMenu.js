import { SaveManager } from '../core/SaveManager.js';
import { SettingsUI } from './SettingsUI.js';

/** The startup screen: Play / Settings / Quit, plus the world select/create flow under Play. */
export class MainMenu {
  constructor(root, { onPlay }) {
    this.root = root;
    this.onPlay = onPlay;
    this.el = document.createElement('div');
    this.el.id = 'main-menu';
    this.root.appendChild(this.el);
    this._showRoot();
  }

  _clear() { this.el.innerHTML = ''; }

  _showRoot() {
    this._clear();
    this.el.innerHTML = `
      <div class="logo">Mine<span>Block</span></div>
      <div class="tagline">An Original Voxel Sandbox</div>
      <div class="menu-list">
        <button class="mb-btn primary" id="btn-play">Play</button>
        <button class="mb-btn" id="btn-settings">Settings</button>
        <button class="mb-btn" id="btn-quit">Quit</button>
      </div>
      <div class="version-tag">MineBlock v0.1.0</div>
    `;
    this.el.querySelector('#btn-play').onclick = () => this._showWorldSelect();
    this.el.querySelector('#btn-settings').onclick = () => new SettingsUI(this.el, {});
    this.el.querySelector('#btn-quit').onclick = () => {
      if (window.mineblock) window.close();
      else this.el.querySelector('#btn-quit').textContent = 'Close the window to quit';
    };
  }

  async _showWorldSelect() {
    this._clear();
    const wrap = document.createElement('div');
    wrap.className = 'mb-panel center-panel';
    wrap.innerHTML = `<div class="mb-modal-title">Select World</div><div id="world-list" style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;"></div>`;
    const menuList = document.createElement('div');
    menuList.className = 'menu-list';
    const newBtn = document.createElement('button'); newBtn.className = 'mb-btn primary'; newBtn.textContent = 'Create New World';
    newBtn.onclick = () => this._showNewWorld();
    const backBtn = document.createElement('button'); backBtn.className = 'mb-btn'; backBtn.textContent = 'Back';
    backBtn.onclick = () => this._showRoot();
    menuList.append(newBtn, backBtn);
    wrap.appendChild(menuList);
    this.el.appendChild(wrap);

    const list = wrap.querySelector('#world-list');
    const saves = await SaveManager.listSaves();
    if (!saves.length) {
      list.innerHTML = '<div style="color:var(--mb-text-dim);font-size:13px;">No worlds yet — create one below.</div>';
    }
    for (const save of saves) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--mb-panel-light);padding:8px 12px;border-radius:6px;';
      const info = document.createElement('div');
      info.innerHTML = `<div style="font-weight:600;">${save.name}</div><div style="font-size:11px;color:var(--mb-text-dim);">Seed ${save.seed} · ${new Date(save.modified).toLocaleString()}</div>`;
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:6px;';
      const load = document.createElement('button'); load.className = 'mb-btn'; load.style.cssText = 'padding:6px 12px;font-size:12px;'; load.textContent = 'Load';
      load.onclick = () => this.onPlay({ mode: 'load', name: save.name });
      const del = document.createElement('button'); del.className = 'mb-btn danger'; del.style.cssText = 'padding:6px 12px;font-size:12px;'; del.textContent = 'Delete';
      del.onclick = async () => { await SaveManager.delete(save.name); this._showWorldSelect(); };
      btns.append(load, del);
      row.append(info, btns);
      list.appendChild(row);
    }
  }

  _showNewWorld() {
    this._clear();
    const wrap = document.createElement('div');
    wrap.className = 'mb-panel center-panel';
    wrap.innerHTML = `
      <div class="mb-modal-title">Create New World</div>
      <input id="world-name" placeholder="World name" value="New World" style="width:100%;padding:10px;margin-bottom:10px;background:var(--mb-panel-light);border:1px solid var(--mb-border);border-radius:6px;color:var(--mb-text);" />
      <input id="world-seed" placeholder="Seed (optional)" style="width:100%;padding:10px;margin-bottom:16px;background:var(--mb-panel-light);border:1px solid var(--mb-border);border-radius:6px;color:var(--mb-text);" />
    `;
    const menuList = document.createElement('div');
    menuList.className = 'menu-list';
    const createBtn = document.createElement('button'); createBtn.className = 'mb-btn primary'; createBtn.textContent = 'Create & Play';
    createBtn.onclick = () => {
      const name = wrap.querySelector('#world-name').value.trim() || 'New World';
      const seedText = wrap.querySelector('#world-seed').value.trim();
      const seed = seedText ? hashSeed(seedText) : Math.floor(Math.random() * 2 ** 31);
      this.onPlay({ mode: 'new', name, seed });
    };
    const backBtn = document.createElement('button'); backBtn.className = 'mb-btn'; backBtn.textContent = 'Back';
    backBtn.onclick = () => this._showWorldSelect();
    menuList.append(createBtn, backBtn);
    wrap.appendChild(menuList);
    this.el.appendChild(wrap);
  }

  hide() { this.el.style.display = 'none'; }
  show() { this.el.style.display = 'flex'; this._showRoot(); }
  destroy() { this.el.remove(); }
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
