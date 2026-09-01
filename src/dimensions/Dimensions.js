import { TerrainGenerator } from '../world/TerrainGenerator.js';
import { BIOMES, EMBER_BIOMES, RIFT_BIOMES } from '../world/Biomes.js';

// Registry of dimensions/worlds. Each has its own terrain generator config,
// sky/fog treatment, and whether a day/night cycle applies (Ember Expanse
// is a perpetual-twilight realm with no sun).
export const DIMENSIONS = {
  overworld: {
    id: 'overworld',
    displayName: 'The Overworld',
    hasSkylight: true,
    hasWeather: true,
    skyTop: 0x4a90d9,
    skyBottom: 0xbfe3f2,
    ambientNight: 0x0e1420,
    fogNear: 40,
    fogFar: 140,
    createGenerator: (seed) => new TerrainGenerator(seed, {
      biomes: BIOMES,
      seaLevel: 62,
      liquidBlock: 'water',
      isEmber: false,
      dimensionId: 'overworld'
    }),
    // Species that spawn underground in the dark, independent of biome.
    caveMobs: ['gloomlurker', 'rockjaw', 'palegrub', 'skitterling'],
    spawnMobCap: 24
  },
  ember_expanse: {
    id: 'ember_expanse',
    displayName: 'The Ember Expanse',
    hasSkylight: false,
    hasWeather: false,
    skyTop: 0x2a0f0a,
    skyBottom: 0x5c1f12,
    ambientNight: 0x2a0f0a,
    fogNear: 20,
    fogFar: 90,
    createGenerator: (seed) => new TerrainGenerator(seed, {
      biomes: EMBER_BIOMES,
      seaLevel: 0,
      liquidBlock: 'magma',
      isEmber: true,
      dimensionId: 'ember_expanse'
    }),
    caveMobs: ['emberling', 'cindermaw'],
    spawnMobCap: 16
  },
  // The endgame. No sun, no weather, no sea — the light comes out of the
  // ground and off the floating islands overhead. Reachable only through a
  // Rift Gate, which needs an artifact from each of the other two worlds.
  eternal_rift: {
    id: 'eternal_rift',
    displayName: 'The Eternal Rift',
    hasSkylight: false,
    hasWeather: false,
    // Not pure black overhead: the floating islands are the best thing to
    // look at here and they need something to be silhouetted against.
    skyTop: 0x1b1436,
    skyBottom: 0x453573,
    ambientNight: 0x1b1436,
    // Further than the Ember Expanse deliberately: the islands overhead and
    // the ruins on the horizon are the reason to walk anywhere here, and a
    // 90-block wall would hide all of it.
    fogNear: 45,
    fogFar: 190,
    createGenerator: (seed) => new TerrainGenerator(seed, {
      biomes: RIFT_BIOMES,
      seaLevel: 0,
      floodMaxY: 0, // nothing floods; there is no sea and no magma here
      liquidBlock: 'water',
      stoneBlock: 'voidstone',
      caveFlora: { floor: ['voidbloom', 'gloomfern'], ceiling: [] },
      floatingIslands: { minY: 74, maxY: 116, threshold: 0.14 },
      isEmber: false,
      isRift: true,
      dimensionId: 'eternal_rift'
    }),
    caveMobs: ['shardling', 'hollow_one', 'riftstalker'],
    spawnMobCap: 20
  }
};

export function getDimension(id) {
  return DIMENSIONS[id] ?? DIMENSIONS.overworld;
}
