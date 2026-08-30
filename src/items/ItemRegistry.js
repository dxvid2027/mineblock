// Registry for every non-block-only concept the player can hold: tools,
// weapons, armor, food, crafting materials, and magic items. Block items
// (the placeable form of each block) are registered automatically by
// registerBlockItems() below so every block is implicitly an item too.
class ItemRegistryClass {
  constructor() {
    this._byId = new Map();
  }

  register(def) {
    const item = {
      id: def.id,
      displayName: def.displayName,
      category: def.category ?? 'material',
      description: def.description ?? '',
      stackSize: def.stackSize ?? 64,
      texture: def.texture ?? null,
      blockName: def.blockName ?? null,
      tool: def.tool ?? null, // { type, tier, tierIndex, durability, miningSpeed, miningLevel, damage }
      armor: def.armor ?? null, // { slot, defense, toughness }
      food: def.food ?? null, // { hunger, saturation }
      fuel: def.fuel ?? 0, // burn ticks in the Smelter
      equipSlot: def.equipSlot ?? null, // 'amulet' etc for non-armor equipables
      shield: def.shield ?? null, // { block, durability } — held in the offhand
      totem: def.totem ?? null // { reviveHealth } — spent to survive a killing blow
    };
    this._byId.set(def.id, item);
    return item;
  }

  get(id) {
    return this._byId.get(id) ?? null;
  }

  all() {
    return [...this._byId.values()];
  }
}

export const ItemRegistry = new ItemRegistryClass();

/**
 * How much durability a fresh copy of this item carries, or undefined for
 * items that have none. Anything with durability is stored per-item rather
 * than stacked, so this is also what decides whether two copies merge.
 */
export function itemDurability(def) {
  return def?.tool?.durability ?? def?.armor?.durability ?? def?.shield?.durability;
}
