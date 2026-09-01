/**
 * Shown once the Eternal Titan is defeated — the end of MineBlock's intended
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
      <div class="mb-modal-title" style="color:var(--mb-accent-dark);font-size:26px;">The Titan Falls</div>
      <div style="color:var(--mb-text-dim);font-size:13px;line-height:1.6;margin-bottom:6px;">
        The Eternal Rift goes quiet for the first time in its history. You came
        through two worlds to get here, and the oldest thing in any of them is
        behind you. Its Trophy is yours — there is no other way to hold one.
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
