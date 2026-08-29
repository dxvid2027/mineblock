/** Shown while the spawn chunks generate for a new/loaded world. */
export class LoadingScreen {
  constructor(root, label = 'Generating world…') {
    this.el = document.createElement('div');
    this.el.id = 'loading-screen';
    this.el.innerHTML = `<div class="spinner"></div><div class="progress" id="loading-label">${label}</div>`;
    root.appendChild(this.el);
  }
  setLabel(text) { this.el.querySelector('#loading-label').textContent = text; }
  destroy() { this.el.remove(); }
}
