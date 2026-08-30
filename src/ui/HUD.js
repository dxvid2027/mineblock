import { renderSlotContent, makeSlotEl } from './slotHelpers.js';
import { heartIconMarkup, drumstickIconMarkup } from './icons.js';
import { globalEvents } from '../core/EventBus.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';

const HOTBAR_SIZE = 9;

/** The always-on in-game overlay: crosshair, vitals, hotbar, clock, toasts. */
export class HUD {
  constructor(root, player) {
    this.player = player;
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div class="crosshair" id="hud-crosshair"></div>
      <div class="dimension-tag" id="hud-dimension"></div>
      <div class="biome-tag" id="hud-biome"></div>
      <div class="clock" id="hud-clock"></div>
      <div class="boss-bar" id="hud-bossbar" style="display:none;">
        <div class="boss-name" id="hud-boss-name"></div>
        <div class="boss-track"><div class="boss-fill" id="hud-boss-fill"></div></div>
      </div>
      <div class="interact-hint interactive" id="hud-hint" style="display:none;"></div>
      <div class="toast-log" id="hud-toasts"></div>
      <div class="hud-dock">
        <div class="hearts-row" id="hud-hearts"></div>
        <div class="hunger-row" id="hud-hunger"></div>
        <div class="hotbar" id="hud-hotbar"></div>
      </div>
    `;
    root.appendChild(this.el);

    this.hotbarEl = this.el.querySelector('#hud-hotbar');
    this._hotbarSlots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.addEventListener('click', () => player.inventory.selectHotbar(i));
      this.hotbarEl.appendChild(slot);
      this._hotbarSlots.push(slot);
    }

    // Offhand: shown just left of the hotbar, mirroring the classic layout.
    // Display-only here — it's edited from the full Inventory screen.
    this.offhandEl = makeSlotEl('hotbar-slot offhand-slot');
    this.offhandEl.title = 'Offhand';
    this.hotbarEl.parentElement.appendChild(this.offhandEl);

    this._offToast = globalEvents.on('ui:toast', (msg) => this._pushToast(msg));
    this._offInv = globalEvents.on('inventory:changed', () => this._refreshHotbar());
    this._offBreak = globalEvents.on('interact:breakProgress', (info) => this._setBreakProgress(info));
    this._refreshHotbar();
  }

  _pushToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.el.querySelector('#hud-toasts').appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  _setBreakProgress(info) {
    const crosshair = this.el.querySelector('#hud-crosshair');
    if (!info) { crosshair.style.transform = 'scale(1)'; crosshair.style.opacity = '1'; return; }
    crosshair.style.transform = `scale(${1 + info.progress * 0.4})`;
  }

  /** Hides the small dimension/biome tags while the fuller debug overlay (O) covers the same corner. */
  setTagsVisible(visible) {
    this.el.querySelector('#hud-dimension').style.display = visible ? '' : 'none';
    this.el.querySelector('#hud-biome').style.display = visible ? '' : 'none';
  }

  _refreshHotbar() {
    const inv = this.player.inventory;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      renderSlotContent(this._hotbarSlots[i], inv.slots[i]);
      this._hotbarSlots[i].classList.toggle('active', i === inv.selectedHotbar);
    }
    renderSlotContent(this.offhandEl, inv.offhand);
  }

  update(world, dayNight, interaction, boss = null) {
    const p = this.player;
    const hearts = this.el.querySelector('#hud-hearts');
    const hunger = this.el.querySelector('#hud-hunger');
    const heartCount = Math.ceil(p.maxHealth / 2);
    let heartsHtml = '';
    for (let i = 0; i < heartCount; i++) {
      const filled = p.health >= (i + 1) * 2;
      const half = !filled && p.health > i * 2;
      heartsHtml += heartIconMarkup(filled ? 'full' : half ? 'half' : 'empty');
    }
    hearts.innerHTML = heartsHtml;

    const hungerCount = Math.ceil(p.maxHunger / 2);
    let hungerHtml = '';
    for (let i = 0; i < hungerCount; i++) {
      const filled = p.hunger >= (i + 1) * 2;
      hungerHtml += drumstickIconMarkup(filled ? 'full' : 'empty');
    }
    hunger.innerHTML = hungerHtml;

    if (this._lastSelected !== p.inventory.selectedHotbar) {
      this._lastSelected = p.inventory.selectedHotbar;
      this._refreshHotbar();
    }

    this.el.querySelector('#hud-dimension').textContent = world.dimension.displayName;
    const biome = world.getBiomeAt(Math.floor(p.position.x), Math.floor(p.position.z));
    this.el.querySelector('#hud-biome').textContent = biome.displayName;
    this.el.querySelector('#hud-clock').textContent = `${dayNight.formattedClock()} · Day ${dayNight.day}`;

    this._updateBossBar(boss);

    const hint = this.el.querySelector('#hud-hint');
    if (interaction.target) {
      const block = BlockRegistry.get(interaction.target.blockId);
      if (block?.interactive) {
        hint.style.display = 'block';
        hint.textContent = `Right-click to open ${block.displayName}`;
      } else hint.style.display = 'none';
    } else hint.style.display = 'none';
  }

  /**
   * The wide bar across the top, shown only while a boss is alive. It is
   * driven by the live mob rather than an event so it cannot get stuck
   * showing a boss that has already fallen.
   */
  _updateBossBar(boss) {
    const bar = this.el.querySelector('#hud-bossbar');
    if (!boss || !boss.alive) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    this.el.querySelector('#hud-boss-name').textContent = boss.species.displayName;
    const fraction = Math.max(0, boss.health / boss.maxHealth);
    const fill = this.el.querySelector('#hud-boss-fill');
    fill.style.width = `${fraction * 100}%`;
    fill.classList.toggle('low', fraction < 0.3);
  }

  dispose() {
    this._offToast?.(); this._offInv?.(); this._offBreak?.();
    this.el.remove();
  }
}
