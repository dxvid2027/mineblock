// Original creature roster. Data-driven so Mob.js and EntityManager stay
// generic; every species here is unique to MineBlock.
export const CREATURES = {
  // --- Overworld: passive ---
  grazer: {
    id: 'grazer', displayName: 'Grazer', bodyType: 'quad', color: 0xc9a86a, accentColor: 0x8a6a3f,
    hostile: false, maxHealth: 10, speed: 2.0, damage: 0, aggroRange: 0,
    drops: [{ id: 'raw_meat', count: [1, 2] }, { id: 'fiber', count: [0, 1] }], xp: 2
  },
  plodder: {
    id: 'plodder', displayName: 'Plodder', bodyType: 'quad', color: 0x7a8a6a, accentColor: 0x5c6a4f,
    hostile: false, maxHealth: 16, speed: 1.2, damage: 0, aggroRange: 0,
    drops: [{ id: 'raw_meat', count: [2, 3] }], xp: 3
  },
  // --- Overworld: hostile ---
  skitterling: {
    id: 'skitterling', displayName: 'Skitterling', bodyType: 'quad', color: 0x3a2f3f, accentColor: 0x6a2f6a,
    hostile: true, maxHealth: 8, speed: 3.2, damage: 2, aggroRange: 14,
    drops: [{ id: 'fiber', count: [1, 2] }], xp: 4
  },
  frostfang: {
    id: 'frostfang', displayName: 'Frostfang', bodyType: 'quad', color: 0xdbe8f2, accentColor: 0x8fa9c4,
    hostile: true, maxHealth: 14, speed: 3.6, damage: 3, aggroRange: 16,
    drops: [{ id: 'raw_meat', count: [1, 2] }], xp: 5
  },
  sandcrawler: {
    id: 'sandcrawler', displayName: 'Sandcrawler', bodyType: 'quad', color: 0xd8b878, accentColor: 0x9a7a3f,
    hostile: true, maxHealth: 12, speed: 2.6, damage: 3, aggroRange: 12,
    drops: [{ id: 'char_lump', count: [0, 1] }], xp: 4
  },
  bogcrawler: {
    id: 'bogcrawler', displayName: 'Bogcrawler', bodyType: 'quad', color: 0x4a5c3f, accentColor: 0x2f3a27,
    hostile: true, maxHealth: 13, speed: 2.4, damage: 3, aggroRange: 13,
    drops: [{ id: 'fiber', count: [1, 3] }], xp: 4
  },
  // --- Ember Expanse ---
  emberling: {
    id: 'emberling', displayName: 'Emberling', bodyType: 'blob', color: 0xd8531f, accentColor: 0xffcf5c,
    hostile: true, maxHealth: 9, speed: 2.8, damage: 3, aggroRange: 14,
    drops: [{ id: 'sulfur_shard', count: [0, 1] }], xp: 5, lightEmission: 6
  },
  cindermaw: {
    id: 'cindermaw', displayName: 'Cindermaw', bodyType: 'biped', color: 0x5c2a1f, accentColor: 0xe0451f,
    hostile: true, maxHealth: 22, speed: 2.2, damage: 5, aggroRange: 16,
    drops: [{ id: 'sulfur_shard', count: [1, 2] }, { id: 'ember_dust', count: [1, 3] }], xp: 9, lightEmission: 4
  },
  // --- Boss ---
  cinder_warden: {
    id: 'cinder_warden', displayName: 'The Cinder Warden', bodyType: 'boss', color: 0x2a1a18, accentColor: 0xff6a2f,
    hostile: true, maxHealth: 220, speed: 2.4, damage: 9, aggroRange: 30, boss: true,
    drops: [{ id: 'warden_core', count: [1, 1] }, { id: 'voidshard', count: [2, 4] }, { id: 'sulfur_shard', count: [4, 8] }],
    xp: 120, lightEmission: 10
  }
};

export function creatureList() { return Object.values(CREATURES); }
