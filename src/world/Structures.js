// Generated structures and their loot. All designs and names are original to
// MineBlock.
//
// Each structure is placed by TerrainGenerator._placeStructures(), which picks
// at most one per chunk and hands `build()` a small API:
//   api.set(dx, dy, dz, blockName)  place a block, relative to the origin
//   api.air(dx, dy, dz)             clear a block
//   api.crate(dx, dy, dz, lootId)   a Storage Crate pre-filled from a table
//   api.rng()                       deterministic 0..1
//   api.groundY                     terrain height at the origin column
//
// Offsets are clipped to the owning chunk, so keep every structure within
// ±4 blocks horizontally: the generator only ever places origins at local
// 4..11, which makes that range fit inside one chunk with no cross-chunk
// bookkeeping.

const SURFACE = 'surface';
const UNDERGROUND = 'underground';

// ---------------------------------------------------------------------- //
// Loot tables. `chance` is the probability the entry appears at all; count is
// rolled uniformly in [min, max]. Every id must be a registered item — see
// tests/structures.test.js.
// ---------------------------------------------------------------------- //
export const LOOT_TABLES = {
  wayside_shrine: [
    { id: 'baked_loaf', min: 1, max: 3, chance: 0.8 },
    { id: 'wild_berries', min: 2, max: 5, chance: 0.6 },
    { id: 'stick', min: 2, max: 6, chance: 0.7 },
    { id: 'ruddle_ingot', min: 1, max: 3, chance: 0.5 },
    { id: 'torch', min: 2, max: 6, chance: 0.6 }
  ],
  watchtower: [
    { id: 'ruddle_sword', min: 1, max: 1, chance: 0.35 },
    { id: 'ferrite_helmet', min: 1, max: 1, chance: 0.2 },
    { id: 'ferrite_ingot', min: 1, max: 3, chance: 0.5 },
    { id: 'char_lump', min: 2, max: 6, chance: 0.7 },
    { id: 'cooked_meat', min: 1, max: 3, chance: 0.5 }
  ],
  desert_cistern: [
    { id: 'aurum_ingot', min: 1, max: 3, chance: 0.45 },
    { id: 'glass_pane', min: 2, max: 6, chance: 0.5 },
    { id: 'sunbaked_brick', min: 4, max: 10, chance: 0.6 },
    { id: 'roasted_tuber', min: 1, max: 4, chance: 0.6 },
    { id: 'woven_cloth_gold', min: 1, max: 3, chance: 0.3 }
  ],
  bog_hut: [
    { id: 'fiber', min: 3, max: 8, chance: 0.8 },
    { id: 'tuber', min: 2, max: 5, chance: 0.7 },
    { id: 'sablewood_sapling', min: 1, max: 3, chance: 0.5 },
    { id: 'barley_grain', min: 2, max: 5, chance: 0.6 },
    { id: 'flint_striker', min: 1, max: 1, chance: 0.25 }
  ],
  frost_camp: [
    { id: 'cooked_meat', min: 2, max: 4, chance: 0.7 },
    { id: 'char_lump', min: 3, max: 8, chance: 0.7 },
    { id: 'ferrite_boots', min: 1, max: 1, chance: 0.25 },
    { id: 'frostpine_sapling', min: 1, max: 3, chance: 0.5 },
    { id: 'woven_cloth_blue', min: 1, max: 3, chance: 0.4 }
  ],
  buried_cache: [
    { id: 'ferrite_chunk', min: 2, max: 5, chance: 0.7 },
    { id: 'glint_chunk', min: 1, max: 3, chance: 0.6 },
    { id: 'infusion_dust', min: 1, max: 2, chance: 0.35 },
    { id: 'baked_loaf', min: 1, max: 3, chance: 0.5 },
    { id: 'aurum_chunk', min: 1, max: 2, chance: 0.25 }
  ],
  miners_rest: [
    { id: 'ruddle_pickaxe', min: 1, max: 1, chance: 0.4 },
    { id: 'torch', min: 4, max: 12, chance: 0.85 },
    { id: 'char_lump', min: 4, max: 10, chance: 0.7 },
    { id: 'ferrite_ingot', min: 1, max: 3, chance: 0.45 },
    { id: 'cobbled_stone', min: 8, max: 20, chance: 0.6 }
  ],
  crystal_hollow: [
    { id: 'glimmer_shard', min: 1, max: 3, chance: 0.6 },
    { id: 'aurum_ingot', min: 1, max: 3, chance: 0.5 },
    { id: 'rune_shard', min: 1, max: 2, chance: 0.3 },
    { id: 'infusion_dust', min: 1, max: 3, chance: 0.45 },
    { id: 'glow_lantern', min: 1, max: 2, chance: 0.4 }
  ],
  ember_shrine: [
    { id: 'sulfur_shard', min: 2, max: 5, chance: 0.8 },
    { id: 'infusion_dust', min: 1, max: 3, chance: 0.5 },
    { id: 'voidshard', min: 1, max: 2, chance: 0.25 },
    { id: 'ember_dust', min: 3, max: 8, chance: 0.6 },
    { id: 'elixir_of_mending', min: 1, max: 2, chance: 0.3 }
  ],
  cinder_vault: [
    { id: 'voidshard', min: 2, max: 4, chance: 0.6 },
    { id: 'glimmer_shard', min: 1, max: 3, chance: 0.5 },
    { id: 'rune_shard', min: 1, max: 3, chance: 0.45 },
    { id: 'voidshard_sword', min: 1, max: 1, chance: 0.15 },
    { id: 'elixir_of_haste', min: 1, max: 2, chance: 0.35 },
    { id: 'warding_amulet', min: 1, max: 1, chance: 0.12 }
  ]
};

/** Rolls a loot table into inventory stacks. Never exceeds a crate's 27 slots. */
export function rollLoot(tableId, rng = Math.random) {
  const table = LOOT_TABLES[tableId];
  if (!table) return [];
  const out = [];
  for (const entry of table) {
    if (rng() > entry.chance) continue;
    const count = entry.min + Math.floor(rng() * (entry.max - entry.min + 1));
    if (count > 0) out.push({ id: entry.id, count });
  }
  return out.slice(0, 27);
}

// ---------------------------------------------------------------------- //
// Building helpers
// ---------------------------------------------------------------------- //
function hollowBox(api, x0, y0, z0, x1, y1, z1, wall, floor = wall) {
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++) {
        const shell = x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1;
        if (!shell) { api.air(x, y, z); continue; }
        api.set(x, y, z, y === y0 ? floor : wall);
      }
}

function pillar(api, x, z, y0, y1, block) {
  for (let y = y0; y <= y1; y++) api.set(x, y, z, block);
}

function slab(api, x0, z0, x1, z1, y, block) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) api.set(x, y, z, block);
}

/** Randomly knocks holes in a structure so ruins read as ruined. */
function erode(api, x0, y0, z0, x1, y1, z1, amount) {
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        if (api.rng() < amount) api.air(x, y, z);
}

// ---------------------------------------------------------------------- //
// Structure catalog
// ---------------------------------------------------------------------- //
export const STRUCTURES = [
  // ---------------- Overworld surface ----------------
  {
    id: 'wayside_shrine',
    placement: SURFACE,
    dimensions: ['overworld'],
    biomes: ['plains', 'forest', 'snow'],
    chance: 0.016,
    loot: 'wayside_shrine',
    build(api) {
      slab(api, -2, -2, 2, 2, 0, 'stone_bricks');
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        pillar(api, dx, dz, 1, 3, 'stone_bricks');
      }
      slab(api, -2, -2, 2, 2, 4, 'polished_stone');
      api.set(0, 4, 0, 'glow_lantern');
      api.crate(0, 1, 0, 'wayside_shrine');
      api.set(-1, 1, 1, 'torch');
      api.set(1, 1, -1, 'torch');
    }
  },
  {
    id: 'collapsed_watchtower',
    placement: SURFACE,
    dimensions: ['overworld'],
    biomes: ['plains', 'forest', 'desert', 'mountains'],
    chance: 0.012,
    loot: 'watchtower',
    build(api) {
      const height = 6 + Math.floor(api.rng() * 3);
      hollowBox(api, -2, 0, -2, 2, height, 2, 'stone_bricks', 'cobbled_stone');
      // Doorway
      api.air(0, 1, -2); api.air(0, 2, -2);
      // Ladder up the inside wall
      for (let y = 1; y < height; y++) api.set(1, y, 1, 'ladder');
      // Time has not been kind to it.
      erode(api, -2, height - 2, -2, 2, height, 2, 0.55);
      erode(api, -2, 1, -2, 2, height - 3, 2, 0.08);
      api.crate(-1, 1, 1, 'watchtower');
      api.set(0, 1, 0, 'torch');
    }
  },
  {
    id: 'desert_cistern',
    placement: SURFACE,
    dimensions: ['overworld'],
    biomes: ['desert'],
    chance: 0.02,
    loot: 'desert_cistern',
    build(api) {
      // Sunk into the dune, so it reads as half-buried.
      hollowBox(api, -3, -4, -3, 3, 1, 3, 'sunbaked_brick');
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++) api.set(x, -3, z, 'water');
      // Open roof with a rim
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) api.air(x, 1, z);
      api.crate(2, -2, 2, 'desert_cistern');
      api.set(-2, 0, -2, 'glow_lantern');
    }
  },
  {
    id: 'bog_hut',
    placement: SURFACE,
    dimensions: ['overworld'],
    biomes: ['swamp'],
    chance: 0.022,
    loot: 'bog_hut',
    build(api) {
      // Stilts lift the hut clear of the mud.
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        pillar(api, dx, dz, 0, 2, 'sablewood_log');
      }
      slab(api, -2, -2, 2, 2, 3, 'sablewood_planks');
      hollowBox(api, -2, 3, -2, 2, 6, 2, 'sablewood_planks');
      api.air(0, 4, -2); api.air(0, 5, -2); // doorway
      api.set(-1, 4, 1, 'bedroll');
      api.crate(1, 4, 1, 'bog_hut');
      api.set(1, 4, -1, 'torch');
    }
  },
  {
    id: 'frostwatch_camp',
    placement: SURFACE,
    dimensions: ['overworld'],
    biomes: ['snow', 'mountains'],
    chance: 0.018,
    loot: 'frost_camp',
    build(api) {
      slab(api, -2, -2, 2, 2, 0, 'frostpine_planks');
      // A lean-to: one tall wall, one low, roofed across.
      for (let x = -2; x <= 2; x++) pillar(api, x, -2, 1, 3, 'frostpine_planks');
      for (let x = -2; x <= 2; x++) api.set(x, 1, 2, 'frostpine_planks');
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++) api.set(x, 4, z, 'frostpine_planks');
      api.set(-1, 1, 0, 'smelter');
      api.crate(1, 1, 0, 'frost_camp');
      api.set(0, 1, 1, 'bedroll');
      api.set(2, 2, -1, 'torch');
    }
  },

  // ---------------- Underground ----------------
  {
    id: 'buried_cache',
    placement: UNDERGROUND,
    dimensions: ['overworld'],
    chance: 0.022,
    minY: 12,
    maxY: 44,
    loot: 'buried_cache',
    build(api) {
      hollowBox(api, -2, 0, -2, 2, 4, 2, 'mossy_stone', 'cobbled_stone');
      api.crate(0, 1, 0, 'buried_cache');
      api.set(-1, 1, -1, 'torch');
      api.set(1, 1, 1, 'torch');
    }
  },
  {
    id: 'miners_rest',
    placement: UNDERGROUND,
    dimensions: ['overworld'],
    chance: 0.018,
    minY: 14,
    maxY: 48,
    loot: 'miners_rest',
    build(api) {
      hollowBox(api, -3, 0, -3, 3, 4, 3, 'cobbled_stone');
      api.set(-2, 1, -2, 'workbench');
      api.set(-2, 1, 0, 'smelter');
      api.set(2, 1, 2, 'bedroll');
      api.crate(2, 1, -2, 'miners_rest');
      api.set(0, 3, -3, 'torch');
      api.set(0, 3, 3, 'torch');
      api.set(-3, 3, 0, 'torch');
    }
  },
  {
    id: 'crystal_hollow',
    placement: UNDERGROUND,
    dimensions: ['overworld'],
    chance: 0.01,
    minY: 10,
    maxY: 26,
    loot: 'crystal_hollow',
    build(api) {
      // A rounded pocket veined with glimmerstone.
      const r = 3;
      for (let x = -r; x <= r; x++)
        for (let z = -r; z <= r; z++)
          for (let y = 0; y <= 5; y++) {
            const d = Math.hypot(x, (y - 2.5) * 1.3, z);
            if (d < r - 0.4) api.air(x, y, z);
            else if (d < r + 0.5) {
              api.set(x, y, z, api.rng() < 0.28 ? 'glimmerstone_ore' : 'stone');
            }
          }
      api.set(0, 0, 0, 'polished_stone');
      api.crate(0, 1, 0, 'crystal_hollow');
      api.set(-2, 1, -2, 'glow_lantern');
      api.set(2, 1, 2, 'glow_lantern');
    }
  },

  // ---------------- Ember Expanse ----------------
  {
    id: 'ember_shrine',
    placement: SURFACE,
    dimensions: ['ember_expanse'],
    chance: 0.03,
    loot: 'ember_shrine',
    build(api) {
      slab(api, -2, -2, 2, 2, 0, 'ashstone');
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        pillar(api, dx, dz, 1, 2, 'cinder_log');
      }
      pillar(api, 0, 0, 1, 3, 'riftstone');
      api.set(-1, 1, 1, 'sulfur_crystal');
      api.set(1, 1, -1, 'sulfur_crystal');
      api.crate(1, 1, 1, 'ember_shrine');
    }
  },
  {
    id: 'cinder_vault',
    placement: UNDERGROUND,
    dimensions: ['ember_expanse'],
    chance: 0.024,
    minY: 10,
    maxY: 38,
    loot: 'cinder_vault',
    build(api) {
      hollowBox(api, -3, 0, -3, 3, 5, 3, 'ashstone');
      // Molten channels in the floor, walled off from the walkway.
      for (let x = -2; x <= 2; x++) {
        api.set(x, 0, -2, 'magma');
        api.set(x, 0, 2, 'magma');
      }
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        pillar(api, dx, dz, 1, 4, 'cinder_log');
      }
      api.set(0, 1, 0, 'riftstone');
      api.crate(1, 1, 0, 'cinder_vault');
      api.set(-1, 1, 0, 'sulfur_crystal');
    }
  }
];

export function structuresFor(dimensionId) {
  return STRUCTURES.filter((s) => s.dimensions.includes(dimensionId));
}
