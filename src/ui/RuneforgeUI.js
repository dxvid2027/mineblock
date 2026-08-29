import { ItemRegistry } from '../items/ItemRegistry.js';
import { availableInfusions, infusionCost, getInfusionLevel, applyInfusion } from '../magic/InfusionSystem.js';
import { renderSlotContent, attachTooltip, hideTooltip, makeSlotEl } from './slotHelpers.js';
import { globalEvents } from '../core/EventBus.js';

/**
 * The Runeforge screen: pick an equipped-capable item from your inventory,
 * then spend XP levels + Rune Shards/Infusion Dust to apply or upgrade one
 * of its available Infusions.
 */
export class RuneforgeUI {
  constructor(root, player) {
    this.root = root;
    this.player = player;
    this.inv = player.inventory;
    this.selectedIndex = null;
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'mb-modal-backdrop interactive';
    const panel = document.createElement('div');
    panel.className = 'mb-panel';
    panel.style.cssText = 'max-width:820px;position:relative;';
    panel.innerHTML = `<div class="mb-modal-title">Runeforge</div>`;
    const close = document.createElement('button');
    close.className = 'mb-close'; close.textContent = '✕';
    close.onclick = () => globalEvents.emit('ui:closeWorkstation');
    panel.appendChild(close);

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;gap:28px;';

    const left = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'Select an item';
    label.style.cssText = 'font-size:13px;color:var(--mb-text-dim);margin-bottom:6px;';
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    this._mainEls = [];
    for (let i = 0; i < this.inv.slots.length; i++) {
      const el = makeSlotEl();
      el.addEventListener('click', () => { this.selectedIndex = i; this.refresh(); });
      attachTooltip(el, () => this.inv.slots[i]);
      grid.appendChild(el);
      this._mainEls.push(el);
    }
    left.append(label, grid);

    this.right = document.createElement('div');
    this.right.style.cssText = 'width:320px;';

    body.append(left, this.right);
    panel.appendChild(body);
    this.el.appendChild(panel);
    this.root.appendChild(this.el);
    this.refresh();
  }

  refresh() {
    for (let i = 0; i < this._mainEls.length; i++) {
      renderSlotContent(this._mainEls[i], this.inv.slots[i]);
      this._mainEls[i].style.borderColor = i === this.selectedIndex ? 'var(--mb-accent)' : '';
    }

    this.right.innerHTML = '';
    const stack = this.selectedIndex !== null ? this.inv.slots[this.selectedIndex] : null;
    const def = stack ? ItemRegistry.get(stack.id) : null;

    const xpLine = document.createElement('div');
    xpLine.style.cssText = 'margin-bottom:14px;color:var(--mb-text-dim);font-size:13px;';
    xpLine.textContent = `Your level: ${this.player.level}`;
    this.right.appendChild(xpLine);

    if (!def || (!def.tool && !def.armor)) {
      const hint = document.createElement('div');
      hint.style.color = 'var(--mb-text-dim)';
      hint.textContent = 'Select a tool, weapon, or piece of armor to infuse.';
      this.right.appendChild(hint);
      return;
    }

    for (const infusion of availableInfusions(def)) {
      const currentTier = getInfusionLevel(stack, infusion.id);
      const nextTier = Math.min(infusion.maxTier, currentTier + 1);
      const maxed = currentTier >= infusion.maxTier;
      const cost = infusionCost(infusion.id, nextTier);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--mb-border);';
      const info = document.createElement('div');
      info.innerHTML = `<div style="font-weight:600;">${infusion.displayName} ${maxed ? '(MAX)' : `→ Tier ${nextTier}`}</div>
        <div style="font-size:12px;color:var(--mb-text-dim);">${infusion.description(nextTier)}</div>
        ${maxed ? '' : `<div style="font-size:11px;color:var(--mb-accent);">Cost: ${cost.levels} levels, ${cost.runeShards} Rune Shard(s), ${cost.infusionDust} Infusion Dust</div>`}`;
      row.appendChild(info);

      if (!maxed) {
        const btn = document.createElement('button');
        btn.className = 'mb-btn';
        btn.style.cssText = 'padding:8px 14px;font-size:13px;';
        btn.textContent = 'Apply';
        const canAfford = this.player.level >= cost.levels && this.inv.countOf('rune_shard') >= cost.runeShards && this.inv.countOf('infusion_dust') >= cost.infusionDust;
        btn.disabled = !canAfford;
        btn.onclick = () => this._apply(stack, infusion.id, nextTier, cost);
        row.appendChild(btn);
      }
      this.right.appendChild(row);
    }
  }

  _apply(stack, infusionId, tier, cost) {
    if (!this.player.spendXpLevels(cost.levels)) return;
    this.inv.consume('rune_shard', cost.runeShards);
    this.inv.consume('infusion_dust', cost.infusionDust);
    applyInfusion(stack, infusionId, tier);
    globalEvents.emit('ui:toast', 'Infusion applied!');
    globalEvents.emit('inventory:changed');
    this.refresh();
  }

  destroy() {
    hideTooltip();
    this.el.remove();
  }
}
