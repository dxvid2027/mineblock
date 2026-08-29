// Procedural terrain generation. Each dimension gets its own generator
// instance (see dimensions/Dimensions.js) built from this shared toolkit:
// biome selection from noise fields, column filling, cave carving via a
// "thin sheet" 3D noise technique, ore vein scattering, and flora/structure
// scatter. Everything is seeded, so a given world seed always regenerates
// identically.
import { Noise, hash2D } from './noise/Noise.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './Chunk.js';

const SEA_LEVEL = 62;

const ORE_VEINS = [
  { block: 'char_seam', minY: 5, maxY: 100, chance: 0.02, size: [4, 9] },
  { block: 'ruddle_ore', minY: 5, maxY: 70, chance: 0.012, size: [3, 6] },
  { block: 'glint_ore', minY: 5, maxY: 55, chance: 0.008, size: [2, 5] },
  { block: 'ferrite_ore', minY: 5, maxY: 50, chance: 0.01, size: [3, 6] },
  { block: 'aurum_ore', minY: 5, maxY: 32, chance: 0.006, size: [2, 4] },
  { block: 'glimmerstone_ore', minY: 5, maxY: 20, chance: 0.003, size: [1, 3] },
  { block: 'voidshard_ore', minY: 5, maxY: 12, chance: 0.0012, size: [1, 2] }
];
const EMBER_ORE_VEINS = [
  { block: 'sulfur_crystal', minY: 5, maxY: 60, chance: 0.02, size: [3, 7] },
  { block: 'voidshard_ore', minY: 5, maxY: 30, chance: 0.003, size: [1, 3] }
];

function mulberrySeed(seed, salt) {
  return (Math.imul(seed ^ salt, 2654435761) >>> 0);
}

export class TerrainGenerator {
  constructor(seed, { biomes, biomeIds, oreVeins, seaLevel = SEA_LEVEL, liquidBlock = 'water', isEmber = false }) {
    this.seed = seed;
    this.biomes = biomes;
    this.biomeIds = biomeIds;
    this.oreVeins = oreVeins ?? (isEmber ? EMBER_ORE_VEINS : ORE_VEINS);
    this.seaLevel = seaLevel;
    this.liquidBlock = liquidBlock;
    this.isEmber = isEmber;

    this.heightNoise = new Noise(mulberrySeed(seed, 1));
    this.tempNoise = new Noise(mulberrySeed(seed, 2));
    this.moistNoise = new Noise(mulberrySeed(seed, 3));
    this.caveNoise = new Noise(mulberrySeed(seed, 4));
    this.detailNoise = new Noise(mulberrySeed(seed, 5));
  }

  pickBiome(wx, wz) {
    if (this.isEmber) {
      // Single warped noise picks between the two Ember biomes.
      const n = this.tempNoise.fbm2D(wx * 0.004, wz * 0.004, { octaves: 3 });
      return n > 0 ? this.biomes.ashfields : this.biomes.cinderwood;
    }
    const t = this.tempNoise.fbm2D(wx * 0.0025, wz * 0.0025, { octaves: 3 }); // -1..1
    const m = this.moistNoise.fbm2D(wz * 0.0025 + 500, wx * 0.0025 + 500, { octaves: 3 });
    const roughness = this.heightNoise.fbm2D(wx * 0.0015, wz * 0.0015, { octaves: 2 });

    if (roughness > 0.45) return this.biomes.mountains;
    if (t < -0.35) return this.biomes.snow;
    if (t > 0.4 && m < -0.1) return this.biomes.desert;
    if (m > 0.35 && t > -0.2) return this.biomes.swamp;
    if (m > 0.05) return this.biomes.forest;
    return this.biomes.plains;
  }

  heightAt(wx, wz, biome) {
    const n = this.heightNoise.fbm2D(wx * 0.01, wz * 0.01, { octaves: 5, lacunarity: 2.1, gain: 0.5 });
    const detail = this.detailNoise.fbm2D(wx * 0.04, wz * 0.04, { octaves: 2 }) * 3;
    return Math.round(biome.baseHeight + n * biome.heightVariance + detail);
  }

  isCave(wx, wy, wz) {
    if (wy < 4 || wy > 110) return false;
    const n = this.caveNoise.fbm3D(wx * 0.045, wy * 0.07, wz * 0.045, { octaves: 3, gain: 0.5 });
    return Math.abs(n) < 0.045;
  }

  generateChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE_X;
    const baseZ = chunk.cz * CHUNK_SIZE_Z;
    const airId = 0;
    const liquidId = BlockRegistry.idOf(this.liquidBlock);
    const stoneId = BlockRegistry.idOf(this.isEmber ? 'ashstone' : 'stone');

    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const wx = baseX + lx, wz = baseZ + lz;
        const biome = this.pickBiome(wx, wz);
        let height = this.heightAt(wx, wz, biome);
        height = Math.max(3, Math.min(CHUNK_HEIGHT - 20, height));

        const surfaceBlock = biome.snowCap && height > biome.snowCap ? 'snowcap' : biome.surface;
        const surfaceId = BlockRegistry.idOf(surfaceBlock);
        const subsurfaceId = BlockRegistry.idOf(biome.subsurface);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id = airId;
          if (y === 0) id = stoneId;
          else if (y < height - biome.subsurfaceDepth) id = stoneId;
          else if (y < height) id = subsurfaceId;
          else if (y === height) id = surfaceId;
          else if (y <= this.seaLevel && !this.isEmber) id = liquidId;
          else if (this.isEmber && y <= 24 && y > height) id = liquidId; // magma seas in low basins

          if (id === stoneId && this.isCave(wx, y, wz)) id = airId;
          chunk.setBlock(lx, y, lz, id, { recordDiff: false });
        }

        this._scatterColumn(chunk, lx, lz, wx, wz, height, biome);
      }
    }

    this._scatterOres(chunk, baseX, baseZ, stoneId);
    this._maybeStructure(chunk, baseX, baseZ);
    chunk.generated = true;
  }

  _scatterColumn(chunk, lx, lz, wx, wz, height, biome) {
    if (height <= this.seaLevel && !this.isEmber) return; // no plants/trees underwater
    const h1 = hash2D(wx, wz, this.seed ^ 0x51ed270b);
    if (biome.treeType && h1 < biome.treeDensity) {
      this._placeTree(chunk, lx, height + 1, lz, biome.treeType);
      return;
    }
    const h2 = hash2D(wx, wz, this.seed ^ 0x27d4eb2f);
    if (biome.plants?.length && h2 < biome.plantDensity) {
      const plant = biome.plants[Math.floor(hash2D(wz, wx, this.seed) * biome.plants.length)];
      chunk.setBlock(lx, height + 1, lz, BlockRegistry.idOf(plant), { recordDiff: false });
    }
  }

  _placeTree(chunk, lx, baseY, lz, treeType) {
    const logId = BlockRegistry.idOf(`${treeType}_log`);
    const leavesId = BlockRegistry.idOf(`${treeType}_leaves`);
    if (!logId) return;
    const trunkHeight = 4 + Math.floor(hash2D(lx, baseY, this.seed) * 3);
    for (let i = 0; i < trunkHeight; i++) {
      chunk.setBlock(lx, baseY + i, lz, logId, { recordDiff: false });
    }
    const topY = baseY + trunkHeight;
    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy <= -1 ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius === 2) continue;
          const x = lx + dx, z = lz + dz, y = topY + dy;
          if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_Z || y >= CHUNK_HEIGHT) continue;
          if (chunk.getBlock(x, y, z) === 0) chunk.setBlock(x, y, z, leavesId, { recordDiff: false });
        }
      }
    }
  }

  _scatterOres(chunk, baseX, baseZ, stoneId) {
    for (const vein of this.oreVeins) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
          for (let y = vein.minY; y <= Math.min(vein.maxY, CHUNK_HEIGHT - 1); y++) {
            const wx = baseX + lx, wz = baseZ + lz;
            const h = hash2D(wx * 3 + y, wz * 7 + y, this.seed ^ mulberrySeed(1, vein.block.length + y));
            if (h > vein.chance) continue;
            if (chunk.getBlock(lx, y, lz) !== stoneId) continue;
            this._growVein(chunk, lx, y, lz, vein, stoneId);
          }
        }
      }
    }
  }

  _growVein(chunk, x, y, z, vein, stoneId) {
    const id = BlockRegistry.idOf(vein.block);
    const size = vein.size[0] + Math.floor(hash2D(x, z, this.seed + y) * (vein.size[1] - vein.size[0] + 1));
    let cx = x, cy = y, cz = z;
    for (let i = 0; i < size; i++) {
      if (chunk.inBounds(cx, cy, cz) && chunk.getBlock(cx, cy, cz) === stoneId) {
        chunk.setBlock(cx, cy, cz, id, { recordDiff: false });
      }
      const r = hash2D(cx + i, cz - i, this.seed);
      cx += Math.floor(r * 3) - 1;
      cy += Math.floor(hash2D(cy, i, this.seed) * 3) - 1;
      cz += Math.floor(hash2D(cz, i + 1, this.seed) * 3) - 1;
    }
  }

  /** Rare underground "Buried Cache": a small hollow room with a loot crate. */
  _maybeStructure(chunk, baseX, baseZ) {
    const h = hash2D(chunk.cx, chunk.cz, this.seed ^ 0x1234abcd);
    if (h > 0.02) return;
    const cx = 4 + Math.floor(hash2D(chunk.cx, 1, this.seed) * 8);
    const cz = 4 + Math.floor(hash2D(chunk.cz, 2, this.seed) * 8);
    const cy = 10 + Math.floor(hash2D(chunk.cx, chunk.cz, this.seed) * 30);
    const wallId = BlockRegistry.idOf(this.isEmber ? 'ashstone' : 'mossy_stone');
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 3; dy++) {
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (!chunk.inBounds(x, y, z)) continue;
          const isShell = Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 0 || dy === 3;
          chunk.setBlock(x, y, z, isShell ? wallId : 0, { recordDiff: false });
        }
      }
    }
    if (chunk.inBounds(cx, cy + 1, cz)) {
      chunk.setBlock(cx, cy + 1, cz, BlockRegistry.idOf('storage_crate'), { recordDiff: false });
      chunk.blockEntities.set(`${cx},${cy + 1},${cz}`, { type: 'storage', loot: 'buried_cache' });
    }
  }
}
