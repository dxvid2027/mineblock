/** Shown when the player's health hits zero. */
export class DeathScreen {
  constructor(root, { onRespawn } = {}) {
    this.el = document.createElement('div');
    this.el.className = 'mb-modal-backdrop interactive';
    this.el.style.background = 'rgba(60,8,8,0.55)';
    const panel = document.createElement('div');
    panel.className = 'mb-panel center-panel';
    panel.innerHTML = `<div class="mb-modal-title" style="color:var(--mb-bad);font-size:26px;">You Perished</div>
      <div style="color:var(--mb-text-dim);font-size:13px;margin-bottom:8px;">The world continues without you... for now.</div>`;
    const menuList = document.createElement('div');
    menuList.className = 'menu-list';
    const btn = document.createElement('button'); btn.className = 'mb-btn primary'; btn.textContent = 'Respawn';
    btn.onclick = onRespawn;
    menuList.appendChild(btn);
    panel.appendChild(menuList);
    this.el.appendChild(panel);
    root.appendChild(this.el);
  }
  destroy() { this.el.remove(); }
}
