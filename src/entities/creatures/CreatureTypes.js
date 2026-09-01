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
  },

  // --- The Eternal Rift ---
  // Nothing here is alive in the way an Overworld animal is: the Riftstalker
  // is grown crystal, the Hollow One is what is left of whoever built the
  // ruins, and the Shardling is the Hollows breaking off in pieces.
  riftstalker: {
    id: 'riftstalker', displayName: 'Riftstalker', bodyType: 'quad', shape: 'beast', skin: 'crystal', color: 0x4a3f7a, accentColor: 0xb79bff,
    hostile: true, maxHealth: 34, speed: 4.4, damage: 7, aggroRange: 22,
    drops: [{ id: 'aether_dust', count: [1, 2] }, { id: 'rift_shale', count: [1, 3] }], xp: 16, lightEmission: 3
  },
  hollow_one: {
    id: 'hollow_one', displayName: 'Hollow One', bodyType: 'biped', shape: 'biped', skin: 'runic', color: 0x9c93b8, accentColor: 0x7fe6d8,
    hostile: true, maxHealth: 46, speed: 2.6, damage: 9, aggroRange: 20,
    drops: [{ id: 'aether_dust', count: [1, 3] }, { id: 'voidshard', count: [0, 1], chance: 0.2 }], xp: 20, lightEmission: 4
  },
  shardling: {
    id: 'shardling', displayName: 'Shardling', bodyType: 'quad', shape: 'crawler', skin: 'crystal', features: { plates: true, glowEyes: true }, color: 0x2f2a4a, accentColor: 0x6fe8ff,
    hostile: true, maxHealth: 22, speed: 3.6, damage: 5, aggroRange: 18,
    drops: [{ id: 'aether_dust', count: [1, 2] }], xp: 12, lightEmission: 5
  },

  // --- Artifact guardians ---
  // One per existing dimension, each standing on top of that dimension's
  // landmark. They are the gate to the Eternal Rift: without what they carry
  // the Rift Core cannot be made.
  spire_sentinel: {
    id: 'spire_sentinel', displayName: 'The Spire Sentinel', bodyType: 'biped', shape: 'brute', skin: 'stone', color: 0x6d7484, accentColor: 0xc9d6d6,
    hostile: true, maxHealth: 140, speed: 3.0, damage: 8, aggroRange: 26, miniBoss: true,
    drops: [{ id: 'sentinel_heart', count: [1, 1] }, { id: 'glimmer_shard', count: [2, 4] }, { id: 'glint_ingot', count: [2, 5] }],
    xp: 70, lightEmission: 6
  },
  // Stands over the Rift's Boss Outposts. Killing one is the other way to
  // find the Titan: it carries a shard of the Riftfinder's needle.
  riftbound_colossus: {
    id: 'riftbound_colossus', displayName: 'Riftbound Colossus', bodyType: 'biped', shape: 'brute', skin: 'runic', color: 0x3a3352, accentColor: 0xffd98a,
    hostile: true, maxHealth: 260, speed: 2.9, damage: 13, aggroRange: 28, miniBoss: true,
    drops: [
      { id: 'titanite_chunk', count: [1, 3] },
      { id: 'aether_dust', count: [3, 6] },
      { id: 'rift_compass', count: [1, 1], chance: 0.5 }
    ],
    xp: 140, lightEmission: 8
  },

  // --- Final boss ---
  // Three phases, each with something new in it. The numbers live here so the
  // fight can be balanced without touching the code that runs it — see
  // entities/BossBehaviour.js.
  eternal_titan: {
    id: 'eternal_titan', displayName: 'The Eternal Titan', bodyType: 'boss', shape: 'boss', skin: 'runic', color: 0x2b2740, accentColor: 0xffd98a,
    hostile: true, maxHealth: 900, speed: 2.6, damage: 12, aggroRange: 40, boss: true, finalBoss: true,
    drops: [
      { id: 'titan_trophy', count: [1, 1] },
      { id: 'titan_heart', count: [1, 1] },
      { id: 'titanite_chunk', count: [6, 10] },
      { id: 'aether_dust', count: [8, 14] },
      { id: 'voidshard', count: [4, 8] }
    ],
    xp: 600, lightEmission: 12,
    phases: [
      {
        name: 'The Waking', from: 1.0,
        speed: 2.4, damage: 12, attackCooldown: 1.6,
        summon: { species: 'hollow_one', count: 2, every: 14 },
        announce: 'The Eternal Titan opens its eyes.'
      },
      {
        name: 'The Sundering', from: 0.66,
        speed: 3.2, damage: 15, attackCooldown: 1.2,
        // A ring of force centred on the Titan. Standing still inside it is
        // the mistake; the ground is safe once you are outside, and a jump
        // carries you over it.
        shockwave: { every: 7, radius: 11, damage: 11 },
        summon: { species: 'shardling', count: 3, every: 16 },
        announce: 'The Titan tears the ground open — keep moving.'
      },
      {
        name: 'The Last Age', from: 0.33,
        speed: 4.0, damage: 18, attackCooldown: 0.85,
        shockwave: { every: 4, radius: 14, damage: 14 },
        summon: { species: 'riftstalker', count: 3, every: 11 },
        announce: 'The Titan stops holding back.'
      }
    ]
  }
};

export function creatureList() { return Object.values(CREATURES); }
