import { TerrainGenerator } from '../world/TerrainGenerator.js';
import { BIOMES, EMBER_BIOMES } from '../world/Biomes.js';

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
      isEmber: false
    }),
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
      isEmber: true
    }),
    spawnMobCap: 16
  }
};

export function getDimension(id) {
  return DIMENSIONS[id] ?? DIMENSIONS.overworld;
}
