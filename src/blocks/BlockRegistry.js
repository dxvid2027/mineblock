// Central registry mapping numeric block IDs (as stored in chunk arrays) to
// their gameplay data. IDs are assigned in registration order starting at 1
// (0 is reserved for air) so save files just need to store the id list
// order stable — new blocks must always be appended, never inserted.

class BlockRegistryClass {
  constructor() {
    this._byId = [null]; // index 0 = air
    this._byName = new Map();
  }

  register(def) {
    const id = this._byId.length;
    const block = {
      id,
      name: def.name,
      displayName: def.displayName,
      category: def.category ?? 'natural',
      solid: def.solid ?? true,
      transparent: def.transparent ?? false,
      liquid: def.liquid ?? false,
      plant: def.plant ?? false,
      gravity: def.gravity ?? false,
      hardness: def.hardness ?? 1,
      toolType: def.toolType ?? 'none',
      minToolTier: def.minToolTier ?? 0,
      lightEmission: def.lightEmission ?? 0,
      drops: def.drops ?? def.name,
      dropCount: def.dropCount ?? [1, 1],
      texture: def.texture ?? { all: { pattern: 'solid', color: '#ff00ff' } },
      interactive: def.interactive ?? null // 'craftingTable' | 'furnace' | 'runeforge' | 'chest'
    };
    this._byId.push(block);
    this._byName.set(def.name, block);
    return block;
  }

  get(id) {
    return this._byId[id] ?? null;
  }

  byName(name) {
    return this._byName.get(name) ?? null;
  }

  idOf(name) {
    return this._byName.get(name)?.id ?? 0;
  }

  isSolid(id) {
    return id > 0 && !!this._byId[id]?.solid;
  }

  isTransparent(id) {
    if (id === 0) return true;
    return !!this._byId[id]?.transparent;
  }

  all() {
    return this._byId.slice(1);
  }
}

export const BlockRegistry = new BlockRegistryClass();
export const AIR = 0;
