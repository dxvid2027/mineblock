import { renderSlotContent, makeSlotEl } from './slotHelpers.js';
import { heartIconMarkup, drumstickIconMarkup, shieldIconMarkup } from './icons.js';
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
      <div class="objective-tag" id="hud-objective" style="display:none;"></div>
      <div class="clock" id="hud-clock"></div>
      <div class="boss-bar" id="hud-bossbar" style="display:none;">
        <div class="boss-name" id="hud-boss-name"></div>
        <div class="boss-track"><div class="boss-fill" id="hud-boss-fill"></div></div>
      </div>
      <div class="interact-hint interactive" id="hud-hint" style="display:none;"></div>
      <div class="toast-log" id="hud-toasts"></div>
      <div class="hud-dock">
        <div class="vitals">
          <div class="armor-row" id="hud-armor"></div>
          <div class="vitals-main">
            <div class="hearts-row" id="hud-hearts"></div>
            <div class="hunger-row" id="hud-hunger"></div>
          </div>
        </div>
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
    this.el.querySelector('#hud-objective').style.visibility = visible ? '' : 'hidden';
    this.el.querySelector('#hud-dimension').style.display = visible ? '' : 'none';
    this.el.querySelector('#hud-biome').style.display = visible ? '' : 'none';
  }

  /**
   * Health, hunger and armour. Rebuilt only when one of the values it shows
   * actually moves — at sixty frames a second, throwing away and re-parsing
   * thirty icons' worth of markup for an unchanged bar is pure waste.
   */
  _renderVitals(p, armorPoints) {
    const signature = `${Math.ceil(p.health)}/${p.maxHealth}|${Math.ceil(p.hunger)}/${p.maxHunger}|${armorPoints}`;
    if (signature === this._vitalsSignature) return;
    this._vitalsSignature = signature;

    const hearts = this.el.querySelector('#hud-hearts');
    let heartsHtml = '';
    for (let i = 0; i < Math.ceil(p.maxHealth / 2); i++) {
      const filled = p.health >= (i + 1) * 2;
      const half = !filled && p.health > i * 2;
      heartsHtml += heartIconMarkup(filled ? 'full' : half ? 'half' : 'empty');
    }
    // The exact number, in front of the icons rather than behind them, so the
    // two rows stay anchored to the outer edges of the band.
    hearts.innerHTML = `<span class="bar-value">${Math.ceil(p.health)}/${p.maxHealth}</span>` + heartsHtml;
    // Under 30% the remaining hearts beat (see main.css).
    hearts.classList.toggle('low', p.health > 0 && p.health <= p.maxHealth * 0.3);

    const hunger = this.el.querySelector('#hud-hunger');
    let hungerHtml = '';
    for (let i = 0; i < Math.ceil(p.maxHunger / 2); i++) {
      const filled = p.hunger >= (i + 1) * 2;
      const half = !filled && p.hunger > i * 2;
      hungerHtml += drumstickIconMarkup(filled ? 'full' : half ? 'half' : 'empty');
    }
    hunger.innerHTML = hungerHtml + `<span class="bar-value after">${Math.ceil(p.hunger)}/${p.maxHunger}</span>`;

    // Armour sits above the other two, one shield per two points, and is not
    // there at all when nothing is worn.
    const armorRow = this.el.querySelector('#hud-armor');
    if (armorPoints <= 0) {
      armorRow.innerHTML = '';
      armorRow.style.display = 'none';
      return;
    }
    armorRow.style.display = '';
    let armorHtml = '';
    for (let i = 0; i < Math.ceil(armorPoints / 2); i++) {
      armorHtml += shieldIconMarkup(armorPoints >= (i + 1) * 2 ? 'full' : 'half');
    }
    armorRow.innerHTML = `<span class="bar-value">${armorPoints}</span>` + armorHtml;
  }

  /**
   * A standing signpost for the one place the player currently needs to
   * reach. The Ember Expanse fogs out at 90 blocks and the Emberforge is
   * usually further off than that, so without a bearing there is nothing to
   * walk toward — you would be searching a featureless plain by luck.
   */
  _updateObjective(objective) {
    const el = this.el.querySelector('#hud-objective');
    if (!objective) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = `${objective.label} · ${Math.round(objective.distance)}m ${objective.cardinal}`;
  }

  _refreshHotbar() {
    const inv = this.player.inventory;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      renderSlotContent(this._hotbarSlots[i], inv.slots[i]);
      this._hotbarSlots[i].classList.toggle('active', i === inv.selectedHotbar);
    }
    renderSlotContent(this.offhandEl, inv.offhand);
  }

  update(world, dayNight, interaction, boss = null, objective = null) {
    const p = this.player;
    const { defense, toughness } = p.inventory.totalDefense();
    // These rows are a few hundred elements between them and change only when
    // a number does, so they are rebuilt on change rather than every frame.
    this._renderVitals(p, defense + toughness);

    if (this._lastSelected !== p.inventory.selectedHotbar) {
      this._lastSelected = p.inventory.selectedHotbar;
      this._refreshHotbar();
    }

    this.el.querySelector('#hud-dimension').textContent = world.dimension.displayName;
    const biome = world.getBiomeAt(Math.floor(p.position.x), Math.floor(p.position.z));
    this.el.querySelector('#hud-biome').textContent = biome.displayName;
    this.el.querySelector('#hud-clock').textContent = `${dayNight.formattedClock()} · Day ${dayNight.day}`;

    this._updateBossBar(boss);
    this._updateObjective(objective);

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
    // A phased fight names the phase it is in, so the rules changing is
    // legible rather than something the player has to infer from being hit
    // harder — see entities/BossBehaviour.js.
    const phase = boss.boss?.phase;
    const total = boss.boss?.phases?.length ?? 0;
    this.el.querySelector('#hud-boss-name').textContent = phase
      ? `${boss.species.displayName} — ${phase.name} (${boss.boss.index + 1}/${total})`
      : boss.species.displayName;
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
