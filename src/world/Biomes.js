// Biome catalog. Biomes are selected per-column from two independent noise
// fields (temperature, moisture) plus the terrain height itself (mountains
// are height-driven, not just temperature/moisture like the others) — see
// TerrainGenerator.pickBiome().
export const BIOMES = {
  plains: {
    id: 'plains', displayName: 'Sunlit Plains',
    baseHeight: 68, heightVariance: 6,
    surface: 'grassy_sod', subsurface: 'loam', subsurfaceDepth: 4,
    treeType: null, treeDensity: 0.002,
    plants: ['tall_grass', 'emberbloom'], plantDensity: 0.05,
    weather: ['clear', 'rain'],
    mobs: ['grazer', 'plodder'],
    fogColor: 0xbfd6e8
  },
  forest: {
    id: 'forest', displayName: 'Duskwood Forest',
    baseHeight: 70, heightVariance: 8,
    surface: 'grassy_sod', subsurface: 'loam', subsurfaceDepth: 4,
    treeType: 'duskwood', treeDensity: 0.02,
    plants: ['tall_grass'], plantDensity: 0.06,
    weather: ['clear', 'rain'],
    mobs: ['grazer', 'skitterling'],
    fogColor: 0xa9c9a0
  },
  desert: {
    id: 'desert', displayName: 'Sunbaked Desert',
    baseHeight: 66, heightVariance: 4,
    surface: 'sand', subsurface: 'sand', subsurfaceDepth: 5,
    treeType: null, treeDensity: 0,
    plants: ['spinepad'], plantDensity: 0.01,
    weather: ['clear'],
    mobs: ['sandcrawler'],
    fogColor: 0xe8d9a0
  },
  mountains: {
    id: 'mountains', displayName: 'Craggy Peaks',
    baseHeight: 92, heightVariance: 34,
    surface: 'stone', subsurface: 'stone', subsurfaceDepth: 6,
    treeType: 'frostpine', treeDensity: 0.004,
    plants: [], plantDensity: 0,
    weather: ['clear', 'snow'],
    mobs: ['plodder', 'skitterling'],
    fogColor: 0xc7d4e0,
    snowCap: 100
  },
  snow: {
    id: 'snow', displayName: 'Frostbound Tundra',
    baseHeight: 70, heightVariance: 7,
    surface: 'snowcap', subsurface: 'frozen_loam', subsurfaceDepth: 4,
    treeType: 'frostpine', treeDensity: 0.008,
    plants: ['frostbell'], plantDensity: 0.02,
    weather: ['snow'],
    mobs: ['frostfang'],
    fogColor: 0xe6f0f7
  },
  swamp: {
    id: 'swamp', displayName: 'Murkroot Swamp',
    baseHeight: 63, heightVariance: 3,
    surface: 'bog_mud', subsurface: 'bog_mud', subsurfaceDepth: 5,
    treeType: 'sablewood', treeDensity: 0.012,
    plants: ['tall_grass'], plantDensity: 0.08,
    weather: ['rain'],
    mobs: ['bogcrawler', 'skitterling'],
    fogColor: 0x7a8f6f,
    waterlogged: true
  }
};

// Ember Expanse (the alternate dimension) has its own small biome set.
export const EMBER_BIOMES = {
  ashfields: {
    id: 'ashfields', displayName: 'Ashfields',
    baseHeight: 40, heightVariance: 10,
    surface: 'ashstone', subsurface: 'ashstone', subsurfaceDepth: 6,
    treeType: null, treeDensity: 0,
    plants: [], plantDensity: 0,
    weather: ['clear'],
    mobs: ['emberling', 'cindermaw'],
    fogColor: 0x4a2a1f
  },
  cinderwood: {
    id: 'cinderwood', displayName: 'Cinderwood Barrens',
    baseHeight: 44, heightVariance: 14,
    surface: 'ember_dust', subsurface: 'ashstone', subsurfaceDepth: 5,
    treeType: 'cinder', treeDensity: 0.01,
    plants: [], plantDensity: 0,
    weather: ['clear'],
    mobs: ['emberling'],
    fogColor: 0x5c2a1f
  }
};

// The Eternal Rift. Three biomes, all of them variations on the same idea:
// a place that was inhabited a very long time ago and is not any more. There
// is no sun and no sea; the light comes out of the ground.
export const RIFT_BIOMES = {
  barrens: {
    id: 'barrens', displayName: 'The Pale Barrens',
    baseHeight: 46, heightVariance: 9,
    surface: 'pale_turf', subsurface: 'rift_shale', subsurfaceDepth: 4,
    treeType: 'riftwood', treeDensity: 0.006,
    plants: ['gloomfern', 'voidbloom'], plantDensity: 0.05,
    weather: ['clear'],
    mobs: ['riftstalker', 'hollow_one'],
    fogColor: 0x2b2740
  },
  crystal_hollows: {
    id: 'crystal_hollows', displayName: 'The Crystal Hollows',
    baseHeight: 42, heightVariance: 16,
    surface: 'ashen_silt', subsurface: 'voidstone', subsurfaceDepth: 5,
    treeType: null, treeDensity: 0,
    plants: ['voidbloom'], plantDensity: 0.04,
    weather: ['clear'],
    mobs: ['shardling', 'riftstalker'],
    fogColor: 0x1f2b3f
  },
  sunken_causeway: {
    id: 'sunken_causeway', displayName: 'The Sunken Causeway',
    baseHeight: 38, heightVariance: 5,
    surface: 'voidstone', subsurface: 'voidstone', subsurfaceDepth: 6,
    treeType: null, treeDensity: 0,
    plants: ['gloomfern'], plantDensity: 0.02,
    weather: ['clear'],
    mobs: ['hollow_one', 'shardling'],
    fogColor: 0x241f36
  }
};

export function biomeList() { return Object.values(BIOMES); }
export function emberBiomeList() { return Object.values(EMBER_BIOMES); }
export function riftBiomeList() { return Object.values(RIFT_BIOMES); }
