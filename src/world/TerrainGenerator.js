// Procedural terrain generation. Each dimension gets its own generator
// instance (see dimensions/Dimensions.js) built from this shared toolkit:
// biome selection from noise fields, column filling, cave carving via a
// "thin sheet" 3D noise technique, ore vein scattering, and flora/structure
// scatter. Everything is seeded, so a given world seed always regenerates
// identically.
import { Noise, hash2D } from './noise/Noise.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './Chunk.js';
import { structuresFor } from './Structures.js';
import { REGION_SIZE, megaStructureForRegion } from './MegaStructures.js';

const SEA_LEVEL = 62;
const CAVE_THRESHOLD = 0.045; // tunnels: ~3% of the underground — see isCave()

// Large chambers, carved on top of the tunnel network. The low frequency
// (~90-block noise cells) makes wide rounded caverns rather than more
// corridors. Measured over 2000-block samples across 5 seeds: tunnels carve
// ~3.0% of the underground, caverns add ~5.0% (total ~7.9%), while individual
// chambers still reach 100k+ blocks. Raising this threshold shrinks how much
// is carved without making chambers small; lowering it to 0.13 carves ~24%
// and returns the world to the hollow, see-through state it once had.
const CAVERN_THRESHOLD = 0.34;
const CAVERN_MIN_Y = 8;
const CAVERN_MAX_Y = 42;

// Per-eligible-cell chance for cave plants. Only cells that are cave air with
// a stone floor (or ceiling) are eligible, which is a small slice of the
// underground, so these read higher than they look.
const CAVE_FLORA_CHANCE = 0.06;
const CAVE_VINE_CHANCE = 0.05;

const ORE_VEINS = [
  { block: 'char_seam', minY: 5, maxY: 100, chance: 0.02, size: [4, 9] },
  { block: 'ruddle_ore', minY: 5, maxY: 70, chance: 0.012, size: [3, 6] },
  { block: 'glint_ore', minY: 5, maxY: 55, chance: 0.008, size: [2, 5] },
  { block: 'ferrite_ore', minY: 5, maxY: 50, chance: 0.01, size: [3, 6] },
  { block: 'aurum_ore', minY: 5, maxY: 32, chance: 0.006, size: [2, 4] },
  { block: 'glimmerstone_ore', minY: 5, maxY: 20, chance: 0.003, size: [1, 3] },
  { block: 'voidshard_ore', minY: 5, maxY: 12, chance: 0.0012, size: [1, 2] },
  // A thin deep seam so Infusions can be unlocked before the Ember Expanse
  // (the Expanse remains the plentiful source).
  { block: 'sulfur_crystal', minY: 5, maxY: 18, chance: 0.004, size: [2, 4] }
];
const EMBER_ORE_VEINS = [
  { block: 'sulfur_crystal', minY: 5, maxY: 60, chance: 0.02, size: [3, 7] },
  { block: 'voidshard_ore', minY: 5, maxY: 30, chance: 0.003, size: [1, 3] }
];

function mulberrySeed(seed, salt) {
  return (Math.imul(seed ^ salt, 2654435761) >>> 0);
}

export class TerrainGenerator {
  constructor(seed, { biomes, biomeIds, oreVeins, seaLevel = SEA_LEVEL, liquidBlock = 'water', isEmber = false, dimensionId = 'overworld' }) {
    this.seed = seed;
    this.dimensionId = dimensionId;
    this.structures = structuresFor(dimensionId);
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
    this.caveNoise2 = new Noise(mulberrySeed(seed, 6));
    this.cavernNoise = new Noise(mulberrySeed(seed, 7));
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

  /**
   * Carves winding tunnels by intersecting two independent 3D noise "sheets"
   * (each |n| < threshold is a surface through the volume; where two such
   * surfaces cross you get a 1D tube). A single sheet — the simpler approach —
   * hollows out ~18% of the underground into vast connected voids you can see
   * straight through; intersecting two keeps it near ~3%, i.e. actual caves.
   */
  isCave(wx, wy, wz) {
    if (wy < 4 || wy > 110) return false;
    const opts = { octaves: 2, gain: 0.5 };
    const a = this.caveNoise.fbm3D(wx * 0.028, wy * 0.045, wz * 0.028, opts);
    if (Math.abs(a) > CAVE_THRESHOLD) return false;
    const b = this.caveNoise2.fbm3D(wx * 0.028, wy * 0.045, wz * 0.028, opts);
    return Math.abs(b) < CAVE_THRESHOLD;
  }

  /**
   * Large open caverns, carved in a deep band on top of the tunnel network.
   * The threshold is eased towards the middle of the band and tightened at
   * its edges, so chambers dome and close off instead of being sliced flat
   * where the band ends.
   */
  isCavern(wx, wy, wz) {
    if (wy < CAVERN_MIN_Y || wy > CAVERN_MAX_Y) return false;
    const n = this.cavernNoise.fbm3D(wx * 0.011, wy * 0.020, wz * 0.011, { octaves: 2, gain: 0.5 });
    const mid = (CAVERN_MIN_Y + CAVERN_MAX_Y) / 2;
    const half = (CAVERN_MAX_Y - CAVERN_MIN_Y) / 2;
    const verticalFalloff = 1 - Math.abs((wy - mid) / half);
    return n > CAVERN_THRESHOLD - verticalFalloff * 0.05;
  }

  /**
   * Picks a world spawn column for a fresh world. The origin is derived from
   * the seed, so every world starts somewhere different, and candidates are
   * rejected unless they are dry land comfortably above sea level and out of
   * the swamp's standing water — otherwise players spawned in an ocean or
   * inside a hillside. Uses only noise, so it needs no chunks loaded.
   */
  findSpawnColumn() {
    const originX = (hash2D(this.seed, 0x5eed, 1) - 0.5) * 40000;
    const originZ = (hash2D(0x5eed, this.seed, 2) - 0.5) * 40000;

    // Spiral outward in 24-block steps until a column passes.
    let best = null;
    for (let i = 0; i < 600; i++) {
      const angle = i * 2.399963; // golden angle — spreads samples evenly
      const radius = 24 * Math.sqrt(i);
      const wx = Math.round(originX + Math.cos(angle) * radius);
      const wz = Math.round(originZ + Math.sin(angle) * radius);

      const biome = this.pickBiome(wx, wz);
      const height = Math.max(3, Math.min(CHUNK_HEIGHT - 20, this.heightAt(wx, wz, biome)));
      if (height <= this.seaLevel + 1) continue;   // ocean / shoreline
      if (biome.waterlogged) continue;             // swamp standing water
      if (height > 100) continue;                  // sheer peak

      // Prefer gentle ground: reject if the neighbourhood drops away sharply.
      const around = [[3, 0], [-3, 0], [0, 3], [0, -3]]
        .map(([dx, dz]) => this.heightAt(wx + dx, wz + dz, this.pickBiome(wx + dx, wz + dz)));
      const spread = Math.max(...around) - Math.min(...around);
      if (spread > 6) { best ??= { x: wx, z: wz, y: height }; continue; }

      return { x: wx, z: wz, y: height };
    }
    // Nothing ideal nearby — take the least-bad candidate, or the origin.
    return best ?? { x: Math.round(originX), z: Math.round(originZ), y: this.seaLevel + 4 };
  }

  generateChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE_X;
    const baseZ = chunk.cz * CHUNK_SIZE_Z;
    const airId = 0;
    const liquidId = BlockRegistry.idOf(this.liquidBlock);
    const stoneId = BlockRegistry.idOf(this.isEmber ? 'ashstone' : 'stone');
    const worldrootId = BlockRegistry.idOf('worldroot');

    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const wx = baseX + lx, wz = baseZ + lz;
        const biome = this.pickBiome(wx, wz);
        let height = this.heightAt(wx, wz, biome);
        height = Math.max(3, Math.min(CHUNK_HEIGHT - 20, height));

        const surfaceBlock = biome.snowCap && height > biome.snowCap ? 'snowcap' : biome.surface;
        const surfaceId = BlockRegistry.idOf(surfaceBlock);
        const subsurfaceId = BlockRegistry.idOf(biome.subsurface);

        // Depth below which caves may carve. Biomes whose surface/subsurface
        // material *is* stone (mountains) would otherwise have their own
        // ground carved away, opening holes straight through the landscape —
        // so gate on depth rather than on the block being stone.
        const crustBottom = height - biome.subsurfaceDepth;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id = airId;
          // The bottom two layers are the floor of the world: the very last
          // one always, the one above it in a ragged band. Digging through
          // the old plain stone here dropped the player out of the world.
          if (y === 0) id = worldrootId;
          else if (y === 1 && hash2D(wx, wz, this.seed ^ 0x0f1006) < 0.65) id = worldrootId;
          else if (y < crustBottom) id = stoneId;
          else if (y < height) id = subsurfaceId;
          else if (y === height) id = surfaceId;
          else if (y <= this.seaLevel && !this.isEmber) id = liquidId;
          else if (this.isEmber && y <= 24 && y > height) id = liquidId; // magma seas in low basins

          if (y > 0 && y < crustBottom && id === stoneId &&
              (this.isCave(wx, y, wz) || this.isCavern(wx, y, wz))) id = airId;
          chunk.setBlock(lx, y, lz, id, { recordDiff: false });
        }

        this._scatterColumn(chunk, lx, lz, wx, wz, height, biome);
      }
    }

    this._scatterOres(chunk, baseX, baseZ, stoneId);
    this._scatterCaveFlora(chunk, baseX, baseZ, stoneId);
    this._placeStructures(chunk, baseX, baseZ);
    this._placeMegaStructures(chunk, baseX, baseZ);
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

  /**
   * Seeds carved-out cave space with flora: plants that stand on a stone
   * floor, and Dripvine hanging from a stone ceiling. Runs after carving and
   * ore placement so it only ever sees real cave air. Glowcap and Cinderbloom
   * emit light, so caves are partly lit by their own growth.
   */
  _scatterCaveFlora(chunk, baseX, baseZ, stoneId) {
    const flora = this.isEmber
      ? { floor: ['cinderbloom'], ceiling: [] }
      : { floor: ['glowcap', 'duskcap', 'cavefern'], ceiling: ['dripvine'] };
    const floorIds = flora.floor.map((n) => BlockRegistry.idOf(n));
    const ceilingIds = flora.ceiling.map((n) => BlockRegistry.idOf(n));
    const topOfCaves = Math.min(CAVERN_MAX_Y + 12, CHUNK_HEIGHT - 1);

    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const wx = baseX + lx, wz = baseZ + lz;
        for (let y = 5; y < topOfCaves; y++) {
          if (chunk.getBlock(lx, y, lz) !== 0) continue;

          const below = chunk.getBlock(lx, y - 1, lz);
          if (below === stoneId && chunk.getBlock(lx, y + 1, lz) === 0) {
            const r = hash2D(wx * 5 + y, wz * 3 - y, this.seed ^ 0xf10a);
            if (r < CAVE_FLORA_CHANCE) {
              const pick = floorIds[Math.floor(hash2D(wz, wx + y, this.seed) * floorIds.length)];
              chunk.setBlock(lx, y, lz, pick, { recordDiff: false });
              continue;
            }
          }

          if (ceilingIds.length && chunk.getBlock(lx, y + 1, lz) === stoneId) {
            const r = hash2D(wx * 7 - y, wz * 11 + y, this.seed ^ 0x2c11);
            if (r < CAVE_VINE_CHANCE) {
              chunk.setBlock(lx, y, lz, ceilingIds[0], { recordDiff: false });
            }
          }
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
  /**
   * Places at most one structure per chunk. Candidates are shuffled by a
   * per-chunk hash so no single structure always wins, and each gets an
   * independent rarity roll. Origins are constrained to local 4..11 so a
   * structure's ±4 footprint stays inside this chunk — structures never span
   * chunk borders, which keeps generation order-independent.
   */
  _placeStructures(chunk, baseX, baseZ) {
    if (!this.structures.length) return;

    // Salt every roll with the structure's index, not something derived from
    // its name: two ids of equal length would otherwise hash identically and
    // share both their rarity roll and their position, so one of the pair
    // could never generate.
    const order = this.structures
      .map((struct, i) => ({ struct, i, key: hash2D(chunk.cx, chunk.cz, this.seed ^ (0x9e37 + i * 7919)) }))
      .sort((a, b) => a.key - b.key);

    for (const { struct, i } of order) {
      const salt = this.seed ^ (0x1234abcd + i * 2654435761);
      const roll = hash2D(chunk.cx * 31 + i, chunk.cz * 17 - i, salt);
      if (roll > struct.chance) continue;

      const lx = 4 + Math.floor(hash2D(chunk.cx, 1 + i * 13, salt) * 8);
      const lz = 4 + Math.floor(hash2D(chunk.cz, 2 + i * 29, salt) * 8);
      const wx = baseX + lx, wz = baseZ + lz;
      const biome = this.pickBiome(wx, wz);
      if (struct.biomes && !struct.biomes.includes(biome.id)) continue;

      let originY;
      if (struct.placement === 'surface') {
        const ground = Math.max(3, Math.min(CHUNK_HEIGHT - 20, this.heightAt(wx, wz, biome)));
        // Never perch a surface structure over open water or a magma sea.
        if (!this.isEmber && ground <= this.seaLevel) continue;
        originY = ground + 1;
      } else {
        const span = struct.maxY - struct.minY;
        originY = struct.minY + Math.floor(hash2D(chunk.cx, chunk.cz, salt) * span);
      }

      this._buildStructure(chunk, struct, lx, originY, lz, biome);
      return; // one per chunk
    }
  }

  /**
   * Builds the slice of any landmark that reaches into this chunk. Landmarks
   * live on a coarse region grid rather than per chunk (see
   * MegaStructures.js), so a chunk has to look at its own region and the
   * eight around it: one whose centre sits just over a region border still
   * spills across it.
   */
  _placeMegaStructures(chunk, baseX, baseZ) {
    const regionX = Math.floor(baseX / REGION_SIZE);
    const regionZ = Math.floor(baseZ / REGION_SIZE);
    const context = {
      seed: this.seed,
      dimensionId: this.dimensionId,
      hash2D,
      seaLevel: this.seaLevel,
      isEmber: this.isEmber,
      heightAt: (x, z) => this.heightAt(x, z, this.pickBiome(x, z))
    };

    for (let rz = regionZ - 1; rz <= regionZ + 1; rz++) {
      for (let rx = regionX - 1; rx <= regionX + 1; rx++) {
        const placed = megaStructureForRegion(rx, rz, context);
        if (!placed) continue;
        const { mega, x, y, z } = placed;
        // Cheap rejection before doing any building work at all.
        if (x + mega.radius < baseX || x - mega.radius >= baseX + CHUNK_SIZE_X) continue;
        if (z + mega.radius < baseZ || z - mega.radius >= baseZ + CHUNK_SIZE_Z) continue;
        this._buildMegaStructure(chunk, mega, x, y, z, baseX, baseZ);
      }
    }
  }

  _buildMegaStructure(chunk, mega, ox, oy, oz, baseX, baseZ) {
    // Seeded from the landmark's own position, not the chunk's: every chunk
    // that clips it must roll the same numbers, or the eroded holes would
    // differ from one chunk to the next and the walls would not line up.
    let rngState = (hash2D(ox, oz, this.seed ^ 0x3a17c0de) * 4294967296) >>> 0 || 1;
    const rng = () => {
      rngState ^= rngState << 13; rngState >>>= 0;
      rngState ^= rngState >>> 17;
      rngState ^= rngState << 5; rngState >>>= 0;
      return rngState / 4294967296;
    };

    const put = (dx, dy, dz, id) => {
      const x = ox + dx - baseX, y = oy + dy, z = oz + dz - baseZ;
      if (!chunk.inBounds(x, y, z)) return;
      chunk.setBlock(x, y, z, id, { recordDiff: false });
    };

    const api = {
      rng,
      groundY: oy,
      // Lets a builder skip a whole column the instant it falls outside this
      // chunk, which is what keeps clipping a 47000-block tower cheap.
      column: (dx, dz) => {
        const x = ox + dx - baseX, z = oz + dz - baseZ;
        return x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z;
      },
      set: (dx, dy, dz, name) => put(dx, dy, dz, BlockRegistry.idOf(name)),
      air: (dx, dy, dz) => put(dx, dy, dz, 0),
      crate: (dx, dy, dz, lootId) => {
        put(dx, dy, dz, BlockRegistry.idOf('storage_crate'));
        const x = ox + dx - baseX, y = oy + dy, z = oz + dz - baseZ;
        if (!chunk.inBounds(x, y, z)) return;
        chunk.blockEntities.set(`${x},${y},${z}`, { type: 'storage', loot: lootId });
      }
    };

    mega.build(api);
  }

  _buildStructure(chunk, struct, lx, ly, lz, biome) {
    let rngState = (hash2D(chunk.cx, chunk.cz, this.seed ^ 0xbeef) * 4294967296) >>> 0 || 1;
    const rng = () => {
      rngState ^= rngState << 13; rngState >>>= 0;
      rngState ^= rngState >>> 17;
      rngState ^= rngState << 5; rngState >>>= 0;
      return rngState / 4294967296;
    };

    const put = (dx, dy, dz, id) => {
      const x = lx + dx, y = ly + dy, z = lz + dz;
      // Clipped rather than wrapped: a structure must never write into a
      // neighbouring chunk, which may already be generated and meshed.
      if (!chunk.inBounds(x, y, z)) return;
      chunk.setBlock(x, y, z, id, { recordDiff: false });
    };

    const api = {
      rng,
      biome,
      groundY: ly,
      set: (dx, dy, dz, name) => put(dx, dy, dz, BlockRegistry.idOf(name)),
      air: (dx, dy, dz) => put(dx, dy, dz, 0),
      crate: (dx, dy, dz, lootId) => {
        put(dx, dy, dz, BlockRegistry.idOf('storage_crate'));
        const x = lx + dx, y = ly + dy, z = lz + dz;
        if (!chunk.inBounds(x, y, z)) return;
        chunk.blockEntities.set(`${x},${y},${z}`, { type: 'storage', loot: lootId });
      }
    };

    struct.build(api);
  }
}
