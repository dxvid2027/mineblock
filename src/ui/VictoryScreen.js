/**
 * Shown once the Cinder Warden is defeated — the end of MineBlock's intended
 * progression. The world is not ended: the player returns to it and keeps
 * their gear, so building and exploring continue afterwards.
 */
export class VictoryScreen {
  constructor(root, { onContinue, stats } = {}) {
    this.el = document.createElement('div');
    this.el.className = 'mb-modal-backdrop interactive';
    this.el.style.background = 'rgba(255, 246, 228, 0.78)';

    const panel = document.createElement('div');
    panel.className = 'mb-panel center-panel';
    panel.innerHTML = `
      <div class="mb-modal-title" style="color:var(--mb-accent-dark);font-size:26px;">The Warden Falls</div>
      <div style="color:var(--mb-text-dim);font-size:13px;line-height:1.6;margin-bottom:6px;">
        The Ember Expanse grows quiet. You have carried the Warden Core out of
        the dark — MineBlock's deepest challenge is behind you.
      </div>
      <div style="font-size:12px;color:var(--mb-text-dim);">
        Survived ${stats?.days ?? 1} day(s) · Level ${stats?.level ?? 0}
      </div>`;

    const menuList = document.createElement('div');
    menuList.className = 'menu-list';
    const btn = document.createElement('button');
    btn.className = 'mb-btn primary';
    btn.textContent = 'Keep Playing';
    btn.onclick = onContinue;
    menuList.appendChild(btn);
    panel.appendChild(menuList);

    this.el.appendChild(panel);
    root.appendChild(this.el);
  }

  destroy() { this.el.remove(); }
}
