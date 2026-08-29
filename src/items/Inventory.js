import { ItemRegistry } from './ItemRegistry.js';
import { globalEvents } from '../core/EventBus.js';

const MAIN_SLOTS = 36; // slots 0-8 double as the hotbar
const HOTBAR_SIZE = 9;
const EQUIP_SLOTS = ['helmet', 'chest', 'legs', 'boots', 'amulet'];

// A single inventory slot: null when empty, otherwise { id, count, durability }.
function emptySlot() { return null; }

export class Inventory {
  constructor() {
    this.slots = new Array(MAIN_SLOTS).fill(null).map(emptySlot);
    this.equipment = { helmet: null, chest: null, legs: null, boots: null, amulet: null };
    this.selectedHotbar = 0;
    this.craftingGrid = new Array(9).fill(null);
  }

  get hotbar() {
    return this.slots.slice(0, HOTBAR_SIZE);
  }

  getSelected() {
    return this.slots[this.selectedHotbar];
  }

  selectHotbar(index) {
    this.selectedHotbar = Math.max(0, Math.min(HOTBAR_SIZE - 1, index));
    globalEvents.emit('inventory:changed');
  }

  /** Adds an item, stacking with existing slots first, then filling empties. Returns leftover count. */
  addItem(id, count = 1, durability = undefined, infusions = undefined) {
    const def = ItemRegistry.get(id);
    const stackSize = def?.stackSize ?? 64;
    let remaining = count;

    if (durability === undefined) {
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.id === id && slot.count < stackSize) {
          const add = Math.min(stackSize - slot.count, remaining);
          slot.count += add;
          remaining -= add;
        }
      }
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(stackSize, remaining);
        this.slots[i] = { id, count: add, durability, infusions };
        remaining -= add;
      }
    }
    globalEvents.emit('inventory:changed');
    return remaining;
  }

  removeFromSlot(index, count = 1) {
    const slot = this.slots[index];
    if (!slot) return 0;
    const removed = Math.min(slot.count, count);
    slot.count -= removed;
    if (slot.count <= 0) this.slots[index] = null;
    globalEvents.emit('inventory:changed');
    return removed;
  }

  countOf(id) {
    return this.slots.reduce((sum, s) => sum + (s?.id === id ? s.count : 0), 0);
  }

  /** Removes up to `count` total of item id across the inventory. Returns amount actually removed. */
  consume(id, count) {
    let remaining = count;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot?.id === id) {
        const take = Math.min(slot.count, remaining);
        this.removeFromSlot(i, take);
        remaining -= take;
      }
    }
    return count - remaining;
  }

  swapSlots(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    globalEvents.emit('inventory:changed');
  }

  equip(itemId, slotIndex) {
    const def = ItemRegistry.get(itemId);
    if (!def?.armor) return false;
    const slot = def.armor.slot;
    if (!EQUIP_SLOTS.includes(slot)) return false;
    const stack = this.slots[slotIndex];
    if (!stack || stack.id !== itemId) return false;
    const previous = this.equipment[slot];
    this.equipment[slot] = { id: itemId, durability: stack.durability ?? def.armor.durability, infusions: stack.infusions };
    this.removeFromSlot(slotIndex, 1);
    if (previous) this.addItem(previous.id, 1, previous.durability, previous.infusions);
    globalEvents.emit('inventory:changed');
    return true;
  }

  unequip(slot) {
    const item = this.equipment[slot];
    if (!item) return;
    this.equipment[slot] = null;
    this.addItem(item.id, 1, item.durability);
    globalEvents.emit('inventory:changed');
  }

  totalDefense() {
    let defense = 0, toughness = 0;
    for (const slot of Object.keys(this.equipment)) {
      const item = this.equipment[slot];
      if (!item) continue;
      const def = ItemRegistry.get(item.id);
      if (def?.armor) {
        defense += def.armor.defense;
        toughness += def.armor.toughness;
        const wardTier = item.infusions?.find((i) => i.id === 'vitality_ward')?.tier ?? 0;
        defense += wardTier;
      }
    }
    return { defense, toughness };
  }

  /** Sum of Thorned Ward tiers across all worn armor, for melee damage reflection. */
  thornedWardTier() {
    let total = 0;
    for (const slot of Object.values(this.equipment)) {
      total += slot?.infusions?.find((i) => i.id === 'thornedward')?.tier ?? 0;
    }
    return total;
  }

  serialize() {
    return {
      slots: this.slots,
      equipment: this.equipment,
      selectedHotbar: this.selectedHotbar
    };
  }

  deserialize(data) {
    if (!data) return;
    this.slots = (data.slots ?? []).concat(new Array(MAIN_SLOTS)).slice(0, MAIN_SLOTS).map((s) => s ?? null);
    this.equipment = { helmet: null, chest: null, legs: null, boots: null, amulet: null, ...(data.equipment ?? {}) };
    this.selectedHotbar = data.selectedHotbar ?? 0;
    globalEvents.emit('inventory:changed');
  }
}

export { EQUIP_SLOTS, HOTBAR_SIZE };
