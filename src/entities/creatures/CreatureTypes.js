// Original creature roster. Data-driven so Mob.js and EntityManager stay
// generic; every species here is unique to MineBlock.
export const CREATURES = {
  // --- Overworld: passive ---
  grazer: {
    id: 'grazer', displayName: 'Grazer', bodyType: 'quad', shape: 'grazer', skin: 'hide', color: 0xc9a86a, accentColor: 0x8a6a3f,
    hostile: false, maxHealth: 10, speed: 2.0, damage: 0, aggroRange: 0,
    drops: [{ id: 'raw_meat', count: [1, 2] }, { id: 'fiber', count: [0, 1] }], xp: 2
  },
  plodder: {
    id: 'plodder', displayName: 'Plodder', bodyType: 'quad', shape: 'plodder', skin: 'fur', color: 0x7a8a6a, accentColor: 0x5c6a4f,
    hostile: false, maxHealth: 16, speed: 1.2, damage: 0, aggroRange: 0,
    drops: [{ id: 'raw_meat', count: [2, 3] }], xp: 3
  },
  // --- Overworld: hostile ---
  skitterling: {
    id: 'skitterling', displayName: 'Skitterling', bodyType: 'quad', shape: 'crawler', skin: 'chitin', features: { mandibles: true, glowEyes: true }, color: 0x3a2f3f, accentColor: 0xb060e8,
    hostile: true, maxHealth: 8, speed: 3.2, damage: 2, aggroRange: 14,
    drops: [{ id: 'fiber', count: [1, 2] }], xp: 4
  },
  frostfang: {
    id: 'frostfang', displayName: 'Frostfang', bodyType: 'quad', shape: 'beast', skin: 'frost', color: 0xdbe8f2, accentColor: 0x8fa9c4,
    hostile: true, maxHealth: 14, speed: 3.6, damage: 3, aggroRange: 16,
    drops: [{ id: 'raw_meat', count: [1, 2] }], xp: 5
  },
  sandcrawler: {
    id: 'sandcrawler', displayName: 'Sandcrawler', bodyType: 'quad', shape: 'crawler', skin: 'chitin', features: { plates: true, stinger: true, tall: true }, color: 0xd8b878, accentColor: 0x9a7a3f,
    hostile: true, maxHealth: 12, speed: 2.6, damage: 3, aggroRange: 12,
    drops: [{ id: 'char_lump', count: [0, 1] }], xp: 4
  },
  bogcrawler: {
    id: 'bogcrawler', displayName: 'Bogcrawler', bodyType: 'quad', shape: 'crawler', skin: 'chitin', features: { moss: true, mandibles: true }, color: 0x4a5c3f, accentColor: 0x93c24f,
    hostile: true, maxHealth: 13, speed: 2.4, damage: 3, aggroRange: 13,
    drops: [{ id: 'fiber', count: [1, 3] }], xp: 4
  },
  // --- Cave dwellers (spawn underground, in the dark) ---
  gloomlurker: {
    id: 'gloomlurker', displayName: 'Gloomlurker', bodyType: 'blob', shape: 'floater', skin: 'slime', color: 0x2b2438, accentColor: 0x8f6fd0,
    hostile: true, maxHealth: 12, speed: 3.0, damage: 3, aggroRange: 15,
    drops: [{ id: 'fiber', count: [1, 2] }, { id: 'infusion_dust', count: [0, 1], chance: 0.25 }], xp: 6
  },
  rockjaw: {
    id: 'rockjaw', displayName: 'Rockjaw', bodyType: 'quad', shape: 'brute', skin: 'stone', color: 0x6e6e73, accentColor: 0xc97a3a,
    hostile: true, maxHealth: 26, speed: 1.7, damage: 5, aggroRange: 12,
    drops: [{ id: 'cobbled_stone', count: [2, 4] }, { id: 'ruddle_chunk', count: [0, 2] }], xp: 8
  },
  palegrub: {
    id: 'palegrub', displayName: 'Palegrub', bodyType: 'blob', shape: 'grub', skin: 'grub', color: 0xd8cfc0, accentColor: 0x9a8f80,
    hostile: false, maxHealth: 8, speed: 1.4, damage: 0, aggroRange: 0,
    drops: [{ id: 'raw_meat', count: [1, 2] }], xp: 2
  },

  // --- Ember Expanse ---
  emberling: {
    id: 'emberling', displayName: 'Emberling', bodyType: 'blob', shape: 'ember', skin: 'molten', color: 0xd8531f, accentColor: 0xffcf5c,
    hostile: true, maxHealth: 9, speed: 2.8, damage: 3, aggroRange: 14,
    drops: [{ id: 'sulfur_shard', count: [0, 1] }], xp: 5, lightEmission: 6
  },
  cindermaw: {
    id: 'cindermaw', displayName: 'Cindermaw', bodyType: 'biped', shape: 'biped', skin: 'molten', color: 0x5c2a1f, accentColor: 0xe0451f,
    hostile: true, maxHealth: 22, speed: 2.2, damage: 5, aggroRange: 16,
    drops: [{ id: 'sulfur_shard', count: [1, 2] }, { id: 'ember_dust', count: [1, 3] }], xp: 9, lightEmission: 4
  },
  // --- Boss ---
  cinder_warden: {
    id: 'cinder_warden', displayName: 'The Cinder Warden', bodyType: 'boss', shape: 'boss', skin: 'molten', color: 0x2a1a18, accentColor: 0xff6a2f,
    hostile: true, maxHealth: 220, speed: 2.4, damage: 9, aggroRange: 30, boss: true,
    drops: [{ id: 'warden_core', count: [1, 1] }, { id: 'voidshard', count: [2, 4] }, { id: 'sulfur_shard', count: [4, 8] }],
    xp: 120, lightEmission: 10
  }
};

export function creatureList() { return Object.values(CREATURES); }
