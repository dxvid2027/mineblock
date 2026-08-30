import { ItemRegistry, itemDurability } from '../items/ItemRegistry.js';
import { EQUIP_SLOTS, HOTBAR_SIZE, insertIntoSlots } from '../items/Inventory.js';
import { matchRecipe, consumeGridForCraft } from '../items/CraftingSystem.js';
import { RECIPES } from '../items/CraftingRecipes.js';
import { renderSlotContent, attachTooltip, hideTooltip, makeSlotEl, bindSlotClicks } from './slotHelpers.js';
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
    // Wide enough for the 9-slot grid and the recipe column side by side
    // (516 + 220 + gaps); narrower windows wrap the recipe list underneath.
    panel.style.maxWidth = 'min(900px, 100%)';
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
      bindSlotClicks(el, (mods) => this._clickMain(i, mods));
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
      bindSlotClicks(el, (mods) => this._clickEquipment(slot, mods));
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
    bindSlotClicks(this._offhandEl, (mods) => this._clickOffhand(mods));
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
        bindSlotClicks(el, (mods) => this._clickCraftGrid(i, mods));
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
    bindSlotClicks(this._outputEl, (mods) => this._clickCraftOutput(mods));
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
      bindSlotClicks(el, (mods) => this._clickExternal(i, mods));
      attachTooltip(el, () => this.external.slots[i]);
      grid.appendChild(el);
      this._externalEls.push(el);
    }
    return grid;
  }

  // ------------------------------------------------------------- clicking
  _clickMain(i, { half = false, shift = false } = {}) {
    if (shift) { this._quickMoveFromMain(i); return; }
    this._genericClick(() => this.inv.slots[i], (v) => { this.inv.slots[i] = v; }, half);
  }

  _clickExternal(i, { half = false, shift = false } = {}) {
    if (shift) { this._quickMoveToPlayer(() => this.external.slots[i], (v) => { this.external.slots[i] = v; this.external.onChange?.(); }); return; }
    this._genericClick(() => this.external.slots[i], (v) => { this.external.slots[i] = v; this.external.onChange?.(); }, half);
  }

  _clickCraftGrid(i, { half = false, shift = false } = {}) {
    if (shift) { this._quickMoveToPlayer(() => this.inv.craftingGrid[i], (v) => { this.inv.craftingGrid[i] = v; }); return; }
    this._genericClick(() => this.inv.craftingGrid[i], (v) => { this.inv.craftingGrid[i] = v; }, half);
  }

  _clickEquipment(slot, { shift = false } = {}) {
    if (shift) { this._quickMoveToPlayer(() => this.inv.equipment[slot], (v) => { this.inv.equipment[slot] = v; }); return; }
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

  _clickOffhand({ half = false, shift = false } = {}) {
    // Unlike the armor slots, the offhand accepts any item.
    if (shift) { this._quickMoveToPlayer(() => this.inv.offhand, (v) => { this.inv.offhand = v; }); return; }
    this._genericClick(() => this.inv.offhand, (v) => { this.inv.offhand = v; }, half);
  }

  // --------------------------------------------------------- quick moving
  /**
   * Shift + left click on a slot outside the player's grid (a crate, the
   * crafting grid, a worn item): send it straight to the inventory without
   * having to pick it up and drop it.
   */
  _quickMoveToPlayer(get, set) {
    const stack = get();
    if (!stack) return;
    const leftover = insertIntoSlots(this.inv.slots, stack);
    set(leftover);
    this._afterChange();
  }

  /**
   * Shift + left click inside the player's own grid. With a container open
   * the stack goes there; otherwise it jumps between the hotbar and the
   * storage rows, which is how the same gesture behaves in the genre.
   */
  _quickMoveFromMain(i) {
    const stack = this.inv.slots[i];
    if (!stack) return;
    this.inv.slots[i] = null;
    let leftover;
    if (this.external) {
      leftover = insertIntoSlots(this.external.slots, stack);
      this.external.onChange?.();
    } else if (i < HOTBAR_SIZE) {
      leftover = insertIntoSlots(this.inv.slots, stack, HOTBAR_SIZE, this.inv.slots.length);
    } else {
      leftover = insertIntoSlots(this.inv.slots, stack, 0, HOTBAR_SIZE);
    }
    this.inv.slots[i] = leftover; // whatever did not fit stays where it was
    this._afterChange();
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
      // Right click tops the slot up one item at a time, so a held stack can
      // be dealt out evenly across the crafting grid.
      const def = ItemRegistry.get(slot.id);
      const room = (def?.stackSize ?? 64) - slot.count;
      const move = Math.min(room, this.cursor.count, half ? 1 : Infinity);
      set({ ...slot, count: slot.count + move });
      this.cursor.count -= move;
      if (this.cursor.count <= 0) this.cursor = null;
    } else {
      set(this.cursor);
      this.cursor = slot;
    }
    this._afterChange();
  }

  _clickCraftOutput({ shift = false } = {}) {
    if (shift) { this._craftAll(); return; }
    const match = matchRecipe(this.inv.craftingGrid);
    if (!match) return;
    const def = ItemRegistry.get(match.recipe.result.id);
    if (this.cursor && (this.cursor.id !== match.recipe.result.id)) return;

    consumeGridForCraft(this.inv.craftingGrid, match.recipe);
    const gained = match.recipe.result.count;
    if (this.cursor) this.cursor.count += gained;
    else this.cursor = { id: match.recipe.result.id, count: gained, durability: itemDurability(def) };
    this._afterChange();
  }

  /**
   * Shift + click on the result: craft repeatedly, straight into the
   * inventory, until the ingredients run out or there is no room left. The
   * room check happens before each craft so ingredients are never consumed
   * for an item that would then be dropped on the floor.
   */
  _craftAll() {
    for (let guard = 0; guard < 512; guard++) {
      const match = matchRecipe(this.inv.craftingGrid);
      if (!match) break;
      const { id, count } = match.recipe.result;
      if (!this._hasRoomFor(id, count)) break;
      const def = ItemRegistry.get(id);
      consumeGridForCraft(this.inv.craftingGrid, match.recipe);
      this.inv.addItem(id, count, itemDurability(def));
    }
    this._afterChange();
  }

  /** Whether `count` of `id` still fits in the player's main slots. */
  _hasRoomFor(id, count) {
    const stackSize = ItemRegistry.get(id)?.stackSize ?? 64;
    let room = 0;
    for (const slot of this.inv.slots) {
      if (!slot) room += stackSize;
      else if (slot.id === id && slot.durability == null) room += stackSize - slot.count;
      if (room >= count) return true;
    }
    return false;
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
    this._cursorEl.remove(); // lives outside the panel, so it needs removing too
    globalEvents.emit('inventory:changed');
  }
}
