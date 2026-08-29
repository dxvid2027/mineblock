import { ItemRegistry } from '../items/ItemRegistry.js';
import { findSmeltingRecipe } from '../items/CraftingRecipes.js';
import { renderSlotContent, attachTooltip, hideTooltip, makeSlotEl } from './slotHelpers.js';
import { globalEvents } from '../core/EventBus.js';

/**
 * The Smelter screen: an input + fuel slot feed a real-time smelting
 * timer (see update()), producing output the player extracts by hand.
 * Progress is intentionally simple — it only advances while this screen
 * is open, standing in front of the block, rather than simulating
 * furnaces across the whole loaded world every frame.
 */
export class SmelterUI {
  constructor(root, player, blockEntity, onPersist) {
    this.root = root;
    this.player = player;
    this.inv = player.inventory;
    this.state = blockEntity;
    this.onPersist = onPersist;
    this.state.input ??= null;
    this.state.fuel ??= null;
    this.state.output ??= null;
    this.state.progress ??= 0;
    this.state.burnRemaining ??= 0;
    this.state.burnTotal ??= 0;
    this.cursor = null;
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'mb-modal-backdrop interactive';
    const panel = document.createElement('div');
    panel.className = 'mb-panel';
    panel.style.position = 'relative';
    panel.innerHTML = `<div class="mb-modal-title">Smelter</div>`;
    const close = document.createElement('button');
    close.className = 'mb-close'; close.textContent = '✕';
    close.onclick = () => globalEvents.emit('ui:closeWorkstation');
    panel.appendChild(close);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:14px;margin-bottom:20px;';
    const col = document.createElement('div');
    this.inputEl = makeSlotEl(); this.inputEl.addEventListener('click', () => this._click('input'));
    attachTooltip(this.inputEl, () => this.state.input);
    this.fuelEl = makeSlotEl(); this.fuelEl.addEventListener('click', () => this._click('fuel'));
    attachTooltip(this.fuelEl, () => this.state.fuel);
    col.append(this.inputEl, this.fuelEl);
    col.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    this.progressWrap = document.createElement('div');
    this.progressWrap.style.cssText = 'width:64px;height:8px;background:var(--mb-slot-bg);border-radius:4px;overflow:hidden;';
    this.progressFill = document.createElement('div');
    this.progressFill.style.cssText = 'height:100%;width:0%;background:var(--mb-accent);';
    this.progressWrap.appendChild(this.progressFill);

    this.outputEl = makeSlotEl(); this.outputEl.style.width = '60px'; this.outputEl.style.height = '60px';
    this.outputEl.addEventListener('click', () => this._clickOutput());
    attachTooltip(this.outputEl, () => this.state.output);

    row.append(col, this.progressWrap, this.outputEl);
    panel.appendChild(row);

    const label = document.createElement('div');
    label.textContent = 'Inventory';
    label.style.cssText = 'font-size:13px;color:var(--mb-text-dim);margin-bottom:6px;';
    panel.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    this._mainEls = [];
    for (let i = 0; i < this.inv.slots.length; i++) {
      const el = makeSlotEl();
      el.addEventListener('click', () => this._click(i));
      attachTooltip(el, () => this.inv.slots[i]);
      grid.appendChild(el);
      this._mainEls.push(el);
    }
    panel.appendChild(grid);

    this.el.appendChild(panel);
    this.root.appendChild(this.el);

    this._cursorEl = document.createElement('div');
    this._cursorEl.style.cssText = 'position:fixed;pointer-events:none;width:36px;height:36px;z-index:50;';
    this.root.appendChild(this._cursorEl);
    this._onMouseMove = (e) => { this._cursorEl.style.left = `${e.clientX - 18}px`; this._cursorEl.style.top = `${e.clientY - 18}px`; };
    window.addEventListener('mousemove', this._onMouseMove);

    this.refresh();
  }

  _get(ref) { return ref === 'input' ? this.state.input : ref === 'fuel' ? this.state.fuel : this.inv.slots[ref]; }
  _set(ref, v) { if (ref === 'input') this.state.input = v; else if (ref === 'fuel') this.state.fuel = v; else this.inv.slots[ref] = v; }

  _click(ref) {
    const slot = this._get(ref);
    if (!this.cursor) {
      if (slot) { this.cursor = slot; this._set(ref, null); }
    } else if (!slot) {
      this._set(ref, this.cursor); this.cursor = null;
    } else if (slot.id === this.cursor.id) {
      const room = (ItemRegistry.get(slot.id)?.stackSize ?? 64) - slot.count;
      const move = Math.min(room, this.cursor.count);
      slot.count += move; this.cursor.count -= move;
      if (this.cursor.count <= 0) this.cursor = null;
    } else {
      this._set(ref, this.cursor); this.cursor = slot;
    }
    globalEvents.emit('inventory:changed');
    this.refresh();
  }

  _clickOutput() {
    if (!this.state.output) return;
    if (this.cursor && this.cursor.id !== this.state.output.id) return;
    if (this.cursor) this.cursor.count += this.state.output.count;
    else this.cursor = this.state.output;
    this.state.output = null;
    this.refresh();
  }

  update(dt) {
    const recipe = this.state.input ? findSmeltingRecipe(this.state.input.id) : null;
    const outputOk = recipe && (!this.state.output || (this.state.output.id === recipe.output && this.state.output.count < (ItemRegistry.get(recipe.output)?.stackSize ?? 64)));

    if (recipe && outputOk) {
      if (this.state.burnRemaining <= 0) {
        const fuelDef = this.state.fuel ? ItemRegistry.get(this.state.fuel.id) : null;
        if (fuelDef?.fuel > 0) {
          this.state.burnTotal = fuelDef.fuel / 20;
          this.state.burnRemaining = this.state.burnTotal;
          this.state.fuel.count -= 1;
          if (this.state.fuel.count <= 0) this.state.fuel = null;
        }
      }
      if (this.state.burnRemaining > 0) {
        this.state.burnRemaining -= dt;
        this.state.progress += dt;
        if (this.state.progress >= recipe.time) {
          this.state.progress = 0;
          const consume = recipe.extraInput?.count ?? 1;
          this.state.input.count -= consume;
          if (this.state.input.count <= 0) this.state.input = null;
          if (this.state.output) this.state.output.count += recipe.count;
          else this.state.output = { id: recipe.output, count: recipe.count };
        }
      }
    } else {
      this.state.progress = 0;
    }
    this.progressFill.style.width = recipe ? `${Math.min(100, (this.state.progress / recipe.time) * 100)}%` : '0%';
  }

  refresh() {
    renderSlotContent(this.inputEl, this.state.input);
    renderSlotContent(this.fuelEl, this.state.fuel);
    renderSlotContent(this.outputEl, this.state.output);
    for (let i = 0; i < this._mainEls.length; i++) renderSlotContent(this._mainEls[i], this.inv.slots[i]);
    renderSlotContent(this._cursorEl, this.cursor);
  }

  destroy() {
    if (this.cursor) this.player.inventory.addItem(this.cursor.id, this.cursor.count, this.cursor.durability);
    this.onPersist?.(this.state);
    window.removeEventListener('mousemove', this._onMouseMove);
    hideTooltip();
    this.el.remove();
    globalEvents.emit('inventory:changed');
  }
}
