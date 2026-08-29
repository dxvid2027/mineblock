import { SettingsUI } from './SettingsUI.js';

/** In-game pause overlay: Resume / Settings / Save & Quit to Menu. */
export class PauseMenu {
  constructor(root, { onResume, onSaveQuit }) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = 'mb-modal-backdrop interactive';
    const panel = document.createElement('div');
    panel.className = 'mb-panel center-panel';
    panel.innerHTML = `<div class="mb-modal-title">Paused</div>`;
    const menuList = document.createElement('div');
    menuList.className = 'menu-list';

    const resumeBtn = document.createElement('button'); resumeBtn.className = 'mb-btn primary'; resumeBtn.textContent = 'Resume';
    resumeBtn.onclick = onResume;
    const settingsBtn = document.createElement('button'); settingsBtn.className = 'mb-btn'; settingsBtn.textContent = 'Settings';
    settingsBtn.onclick = () => new SettingsUI(this.el, {});
    const quitBtn = document.createElement('button'); quitBtn.className = 'mb-btn danger'; quitBtn.textContent = 'Save & Quit to Menu';
    quitBtn.onclick = onSaveQuit;

    menuList.append(resumeBtn, settingsBtn, quitBtn);
    panel.appendChild(menuList);
    this.el.appendChild(panel);
    root.appendChild(this.el);
  }

  destroy() { this.el.remove(); }
}
