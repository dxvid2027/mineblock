import { ItemRegistry } from '../items/ItemRegistry.js';
import { EQUIP_SLOTS } from '../items/Inventory.js';
import { matchRecipe, consumeGridForCraft } from '../items/CraftingSystem.js';
import { RECIPES } from '../items/CraftingRecipes.js';
import { renderSlotContent, attachTooltip, hideTooltip, makeSlotEl } from './slotHelpers.js';
import { getItemIconCanvas } from '../render/ItemIcons.js';
import { globalEvents } from '../core/EventBus.js';

const EQUIP_ICONS = { helmet: '⛑', chest: '👕', legs: '👖', boots: '👢', amulet: '📿' };

/**
 * A configurable inventory panel: the player's 36 slots + 5 equipment slots
 * always present, plus an optional NxN crafting grid (2 for the personal
 * inventory, 3 at a Workbench) and/or an external container (a Storage
 * Crate). One implementation covers all three screens to avoid duplicating
 * the click/drag/merge logic three times.
 */
export class InventoryScreen {
  constructor(root, player, { craftSize = 0, showRecipes = false, externalContainer = null, title = 'Inventory' } = {}) {
    this.root = root;
    this.player = player;
    this.inv = player.inventory;
    this.craftSize = craftSize;
    this.showRecipes = showRecipes;
    this.external = externalContainer; // { name, slots: Array(N)|null-filled, onChange }
    this.title = title;
    this.cursor = null; // stack currently held by the mouse
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'mb-modal-backdrop interactive';
    const panel = document.createElement('div');
    panel.className = 'mb-panel';
    panel.style.maxWidth = '760px';
    panel.style.position = 'relative';
    panel.innerHTML = `<div class="mb-modal-title">${this.title}</div>`;
    const close = document.createElement('button');
    close.className = 'mb-close'; close.textContent = '✕';
    close.onclick = () => globalEvents.emit('ui:closeWorkstation');
    panel.appendChild(close);

    const body = document.createElement('div');
    body.style.display = 'flex';
    body.style.gap = '28px';
    body.style.flexWrap = 'wrap';

    const leftCol = document.createElement('div');

    if (this.external) {
      const extLabel = document.createElement('div');
      extLabel.textContent = this.external.name;
      extLabel.style.cssText = 'font-size:13px;color:var(--mb-text-dim);margin-bottom:6px;';
      leftCol.appendChild(extLabel);
      leftCol.appendChild(this._buildExternalGrid());
      leftCol.style.marginBottom = '18px';
    }

    if (this.craftSize > 0) {
      const craftLabel = document.createElement('div');
      craftLabel.textContent = this.craftSize === 3 ? 'Workbench' : 'Crafting';
      craftLabel.style.cssText = 'font-size:13px;color:var(--mb-text-dim);margin-bottom:6px;';
      leftCol.appendChild(craftLabel);
      leftCol.appendChild(this._buildCraftingSection());
    }

    leftCol.appendChild(this._buildEquipmentRow());
    leftCol.appendChild(this._buildMainGrid());

    body.appendChild(leftCol);

    if (this.showRecipes) {
      body.appendChild(this._buildRecipeList());
    }

    panel.appendChild(body);
    this.el.appendChild(panel);
    this.root.appendChild(this.el);

    this._cursorEl = document.createElement('div');
    this._cursorEl.style.cssText = 'position:fixed;pointer-events:none;width:36px;height:36px;z-index:50;';
    this.root.appendChild(this._cursorEl);
    this._onMouseMove = (e) => { this._cursorEl.style.left = `${e.clientX - 18}px`; this._cursorEl.style.top = `${e.clientY - 18}px`; };
    window.addEventListener('mousemove', this._onMouseMove);

    this.refresh();
  }

  _buildMainGrid() {
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    grid.style.marginTop = '10px';
    this._mainEls = [];
    for (let i = 0; i < this.inv.slots.length; i++) {
      const el = makeSlotEl();
      el.addEventListener('click', () => this._clickMain(i));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this._clickMain(i, true); });
      attachTooltip(el, () => this.inv.slots[i]);
      grid.appendChild(el);
      this._mainEls.push(el);
    }
    return grid;
  }

  _buildEquipmentRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;';
    this._equipEls = {};
    for (const slot of EQUIP_SLOTS) {
      const el = makeSlotEl();
      el.title = slot;
      el.innerHTML = `<span style="opacity:.35;font-size:20px;position:absolute;">${EQUIP_ICONS[slot]}</span>`;
      el.addEventListener('click', () => this._clickEquipment(slot));
      attachTooltip(el, () => this.inv.equipment[slot]);
      row.appendChild(el);
      this._equipEls[slot] = el;
    }

    // Offhand: a spacer then its own slot, set apart from the armor slots
    // since it holds any item (not just armor).
    const spacer = document.createElement('div');
    spacer.style.cssText = 'width:14px;';
    row.appendChild(spacer);

    this._offhandEl = makeSlotEl();
    this._offhandEl.title = 'offhand';
    this._offhandEl.innerHTML = '<span style="opacity:.35;font-size:20px;position:absolute;">✋</span>';
    this._offhandEl.addEventListener('click', () => this._clickOffhand());
    attachTooltip(this._offhandEl, () => this.inv.offhand);
    row.appendChild(this._offhandEl);

    return row;
  }

  _buildCraftingSection() {
    const wrap = document.createElement('div');
    wrap.className = 'craft-section';
    wrap.style.marginBottom = '16px';

    const grid = document.createElement('div');
    grid.className = 'craft-grid';
    this._craftEls = [];
    for (let i = 0; i < 9; i++) {
      const el = makeSlotEl();
      const inCraftArea = (i % 3) < this.craftSize && Math.floor(i / 3) < this.craftSize;
      if (!inCraftArea) el.style.visibility = 'hidden';
      else {
        el.addEventListener('click', () => this._clickCraftGrid(i));
        attachTooltip(el, () => this.inv.craftingGrid[i]);
      }
      grid.appendChild(el);
      this._craftEls.push(el);
    }

    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '→';

    const outWrap = document.createElement('div');
    outWrap.className = 'craft-output';
    this._outputEl = makeSlotEl();
    this._outputEl.addEventListener('click', () => this._clickCraftOutput());
    outWrap.appendChild(this._outputEl);

    wrap.append(grid, arrow, outWrap);
    return wrap;
  }

  _buildRecipeList() {
    const wrap = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'Known Recipes';
    label.style.cssText = 'font-size:13px;color:var(--mb-text-dim);margin-bottom:6px;';
    const list = document.createElement('div');
    list.className = 'recipe-list';
    for (const recipe of RECIPES) {
      const def = ItemRegistry.get(recipe.result.id);
      if (!def) continue;
      const row = document.createElement('div');
      row.className = 'recipe-item';
      const c = document.createElement('canvas');
      c.width = 28; c.height = 28;
      c.getContext('2d').drawImage(getItemIconCanvas(recipe.result.id), 0, 0, 28, 28);
      row.appendChild(c);
      const name = document.createElement('span');
      name.textContent = `${def.displayName} x${recipe.result.count}`;
      row.appendChild(name);
      row.addEventListener('click', () => this._tryQuickFill(recipe));
      list.appendChild(row);
    }
    wrap.append(label, list);
    return wrap;
  }

  _buildExternalGrid() {
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    this._externalEls = [];
    for (let i = 0; i < this.external.slots.length; i++) {
      const el = makeSlotEl();
      el.addEventListener('click', () => this._clickExternal(i));
      attachTooltip(el, () => this.external.slots[i]);
      grid.appendChild(el);
      this._externalEls.push(el);
    }
    return grid;
  }

  // ------------------------------------------------------------- clicking
  _clickMain(i, half = false) {
    this._genericClick(() => this.inv.slots[i], (v) => { this.inv.slots[i] = v; }, half);
  }

  _clickExternal(i) {
    this._genericClick(() => this.external.slots[i], (v) => { this.external.slots[i] = v; this.external.onChange?.(); });
  }

  _clickCraftGrid(i) {
    this._genericClick(() => this.inv.craftingGrid[i], (v) => { this.inv.craftingGrid[i] = v; });
  }

  _clickEquipment(slot) {
    const current = this.inv.equipment[slot];
    if (!this.cursor && current) {
      this.cursor = current;
      this.inv.equipment[slot] = null;
    } else if (this.cursor && !current) {
      const def = ItemRegistry.get(this.cursor.id);
      if (def?.armor?.slot === slot) {
        this.inv.equipment[slot] = { id: this.cursor.id, durability: this.cursor.durability ?? def.armor.durability, infusions: this.cursor.infusions };
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      }
    } else if (this.cursor && current && this.cursor.id === current.id) {
      // swap
      this.inv.equipment[slot] = { id: this.cursor.id, durability: this.cursor.durability, infusions: this.cursor.infusions };
      this.cursor = current;
    }
    this.refresh();
  }

  _clickOffhand() {
    // Unlike the armor slots, the offhand accepts any item.
    this._genericClick(() => this.inv.offhand, (v) => { this.inv.offhand = v; });
  }

  _genericClick(get, set, half = false) {
    const slot = get();
    if (!this.cursor) {
      if (slot) {
        if (half && slot.count > 1) {
          const take = Math.ceil(slot.count / 2);
          this.cursor = { ...slot, count: take };
          set({ ...slot, count: slot.count - take });
        } else {
          this.cursor = slot;
          set(null);
        }
      }
    } else if (!slot) {
      if (half) {
        set({ ...this.cursor, count: 1 });
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      } else {
        set(this.cursor);
        this.cursor = null;
      }
    } else if (slot.id === this.cursor.id && slot.durability === undefined) {
      const def = ItemRegistry.get(slot.id);
      const room = (def?.stackSize ?? 64) - slot.count;
      const move = Math.min(room, this.cursor.count);
      set({ ...slot, count: slot.count + move });
      this.cursor.count -= move;
      if (this.cursor.count <= 0) this.cursor = null;
    } else {
      set(this.cursor);
      this.cursor = slot;
    }
    this._afterChange();
  }

  _clickCraftOutput() {
    const match = matchRecipe(this.inv.craftingGrid);
    if (!match) return;
    const def = ItemRegistry.get(match.recipe.result.id);
    if (this.cursor && (this.cursor.id !== match.recipe.result.id)) return;

    consumeGridForCraft(this.inv.craftingGrid, match.recipe);
    const gained = match.recipe.result.count;
    if (this.cursor) this.cursor.count += gained;
    else this.cursor = { id: match.recipe.result.id, count: gained, durability: def.tool || def.armor ? (def.tool?.durability ?? def.armor?.durability) : undefined };
    this._afterChange();
  }

  _tryQuickFill(recipe) {
    // Convenience: attempt to move matching ingredients from the main
    // inventory into the crafting grid so the player doesn't hand-place them.
    if (recipe.type !== 'shapeless') return;
    for (const ing of recipe.ingredients) {
      let need = ing.count ?? 1;
      for (let i = 0; i < this.inv.slots.length && need > 0; i++) {
        const s = this.inv.slots[i];
        if (!s) continue;
        const matches = ing.id ? s.id === ing.id : (ing.tag && s.id.endsWith(`_${ing.tag}`));
        if (!matches) continue;
        for (let g = 0; g < this.craftSize * this.craftSize && need > 0; g++) {
          if (this.inv.craftingGrid[g]) continue;
          const take = Math.min(1, s.count, need);
          this.inv.craftingGrid[g] = { id: s.id, count: take };
          s.count -= take; need -= take;
          if (s.count <= 0) this.inv.slots[i] = null;
        }
      }
    }
    this._afterChange();
  }

  _afterChange() {
    globalEvents.emit('inventory:changed');
    this.refresh();
  }

  refresh() {
    for (let i = 0; i < this._mainEls.length; i++) renderSlotContent(this._mainEls[i], this.inv.slots[i]);
    for (const slot of EQUIP_SLOTS) {
      const el = this._equipEls[slot];
      const item = this.inv.equipment[slot];
      renderSlotContent(el, item);
      if (!item) el.innerHTML = `<span style="opacity:.35;font-size:20px;position:absolute;">${EQUIP_ICONS[slot]}</span>`;
    }
    renderSlotContent(this._offhandEl, this.inv.offhand);
    if (!this.inv.offhand) this._offhandEl.innerHTML = '<span style="opacity:.35;font-size:20px;position:absolute;">✋</span>';
    if (this.craftSize > 0) {
      for (let i = 0; i < 9; i++) renderSlotContent(this._craftEls[i], this.inv.craftingGrid[i]);
      const match = matchRecipe(this.inv.craftingGrid);
      renderSlotContent(this._outputEl, match ? { id: match.recipe.result.id, count: match.recipe.result.count } : null);
    }
    if (this.external) {
      for (let i = 0; i < this._externalEls.length; i++) renderSlotContent(this._externalEls[i], this.external.slots[i]);
    }
    renderSlotContent(this._cursorEl, this.cursor);
  }

  destroy() {
    // Dropping held ingredients/cursor item back to the player rather than deleting it.
    if (this.cursor) this.player.inventory.addItem(this.cursor.id, this.cursor.count, this.cursor.durability, this.cursor.infusions);
    if (this.craftSize > 0) {
      for (let i = 0; i < this.inv.craftingGrid.length; i++) {
        const s = this.inv.craftingGrid[i];
        if (s) { this.player.inventory.addItem(s.id, s.count, s.durability, s.infusions); this.inv.craftingGrid[i] = null; }
      }
    }
    window.removeEventListener('mousemove', this._onMouseMove);
    hideTooltip();
    this.el.remove();
    globalEvents.emit('inventory:changed');
  }
}
