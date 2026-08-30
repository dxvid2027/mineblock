import * as THREE from 'three';
import { Chunk, chunkKey, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './Chunk.js';
import { buildChunkMesh } from './ChunkMesher.js';
import { TextureAtlas } from '../render/TextureAtlas.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { getDimension } from '../dimensions/Dimensions.js';
import { globalEvents } from '../core/EventBus.js';

// Streaming budgets. The counts are ceilings; the millisecond budgets are
// what actually decides how much gets done, because the same three chunks
// cost wildly different amounts of time on a desktop and on a tablet, and it
// is the frame time the player feels, not the chunk count. Whatever the
// budget says, at least one chunk is always generated and one meshed, so the
// world keeps filling in however slow the device.
const CHUNKS_GENERATED_PER_FRAME = 3;
const CHUNKS_MESHED_PER_FRAME = 6;
const GENERATE_BUDGET_MS = 6;
const MESH_BUDGET_MS = 5;
const UNLOAD_MARGIN = 3; // extra chunks kept loaded beyond render distance before eviction

// The brightest emitter is 15 and every step of the flood costs one level,
// so no light ever reaches further than 14 blocks from its source. Every
// piece of the lighting below leans on that bound to stay local: a chunk
// arriving, or a block changing, can only ever affect what is within 14
// blocks of it, and re-lighting exactly that costs the same whether ten
// chunks are loaded or a thousand.
const MAX_LIGHT_TRAVEL = 14;

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function worldToChunk(wx, wz) {
  return [Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z)];
}
function mod(n, m) { return ((n % m) + m) % m; }

// performance.now() everywhere it exists, which is every browser and Electron;
// the fallback keeps the module usable from node, where the tests run it.
const now = typeof performance !== 'undefined' && performance.now
  ? () => performance.now()
  : () => Number(process.hrtime.bigint() / 1000n) / 1000;

/**
 * Owns all loaded chunks for the *current* dimension: streaming them in/out
 * around the player, generating terrain, propagating light, meshing, and
 * providing the block-access API every other system (physics, interaction,
 * mobs) reads and writes through.
 */
export class World {
  constructor(scene, seed, dimensionId = 'overworld') {
    this.scene = scene;
    this.seed = seed;
    this.atlas = new TextureAtlas();
    this.chunks = new Map();
    this.diffStore = new Map(); // persists block edits for chunks currently unloaded
    this.beStore = new Map(); // persists block-entity state (smelters, storage, crops) for unloaded chunks
    // Emitters live on the chunk that holds them (chunk.lightSources), so
    // walking away from a torch drops it along with its chunk. A world-wide
    // map used to keep every torch the player had ever walked past, and the
    // lighting pass got slower for the rest of the session.
    //
    // These two are id-indexed lookups the flood uses on every step; see
    // _emissionTable().
    this._emission = null;
    this._opaqueToLight = null;
    this.loadQueue = [];
    this.meshQueue = new Set();
    this.dayFactor = 1;
    this._chunkGroup = new THREE.Group();
    this._chunkGroup.name = 'chunks';
    scene.add(this._chunkGroup);
    this._meshObjects = new Map(); // key -> THREE.Group holding opaque/cutout/transparent meshes

    this._materials = this._buildMaterials();
    this.setDimension(dimensionId, false);
  }

  _buildMaterials() {
    const map = this.atlas.texture;
    // Lighting is fully baked into per-vertex colors by the mesher (sky + block
    // light), so chunks use unlit materials rather than reacting to scene lights.
    return {
      opaque: new THREE.MeshBasicMaterial({ map, vertexColors: true }),
      cutout: new THREE.MeshBasicMaterial({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      transparent: new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
    };
  }

  setDimension(dimensionId, keepPlayer = true) {
    this._diffsByDimension = this._diffsByDimension ?? {};
    this._beByDimension = this._beByDimension ?? {};
    // Clear all loaded chunk visuals/state — each dimension has independent
    // storage — but keep (storeDiffs=true) whatever the player changed here
    // so it survives the round trip back to this dimension, and the save.
    for (const key of [...this.chunks.keys()]) this._unloadChunk(key, true);
    this.chunks.clear();

    this.dimensionId = dimensionId;
    this.dimension = getDimension(dimensionId);
    this.generator = this.dimension.createGenerator(this.seed);
    this.diffStore = this._diffsByDimension[dimensionId] ?? new Map();
    this._diffsByDimension[dimensionId] = this.diffStore;
    this.beStore = this._beByDimension[dimensionId] ?? new Map();
    this._beByDimension[dimensionId] = this.beStore;
    globalEvents.emit('world:dimensionChanged', dimensionId);
  }

  // -------------------------------------------------------------- streaming
  update(playerX, playerZ, renderDistance) {
    const [pcx, pcz] = worldToChunk(playerX, playerZ);
    const wanted = new Set();
    const candidates = [];
    for (let dz = -renderDistance; dz <= renderDistance; dz++) {
      for (let dx = -renderDistance; dx <= renderDistance; dx++) {
        if (dx * dx + dz * dz > renderDistance * renderDistance) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const key = chunkKey(cx, cz);
        wanted.add(key);
        if (!this.chunks.has(key)) candidates.push({ key, cx, cz, dist: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) if (!this.chunks.has(c.key)) this._loadChunk(c.cx, c.cz);

    // Evict chunks well outside render distance.
    const evictDist = renderDistance + UNLOAD_MARGIN;
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > evictDist * evictDist) this._unloadChunk(key);
    }

    // Bounded per-frame work so streaming never causes a frame spike.
    const startedAt = now();
    let generated = 0;
    for (let i = 0; i < this.loadQueue.length && generated < CHUNKS_GENERATED_PER_FRAME; i++) {
      if (generated > 0 && now() - startedAt > GENERATE_BUDGET_MS) break;
      const chunk = this.loadQueue[i];
      if (!chunk.generated) {
        this.generator.generateChunk(chunk);
        const key = chunkKey(chunk.cx, chunk.cz);
        const diffs = this.diffStore.get(key);
        if (diffs) chunk.applyDiffs(diffs);
        const be = this.beStore.get(key);
        if (be) chunk.blockEntities = new Map(Object.entries(be));
        this._registerLightSources(chunk);
        this._computeSkylight(chunk);
        this._lightNewChunk(chunk);
        this._queueMesh(chunk.cx, chunk.cz);
        for (const [dcx, dcz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          this._queueMesh(chunk.cx + dcx, chunk.cz + dcz);
        }
        generated++;
      }
    }
    this.loadQueue = this.loadQueue.filter((c) => !c.generated);

    const meshingFrom = now();
    let meshed = 0;
    for (const key of this.meshQueue) {
      if (meshed >= CHUNKS_MESHED_PER_FRAME) break;
      if (meshed > 0 && now() - meshingFrom > MESH_BUDGET_MS) break;
      const chunk = this.chunks.get(key);
      if (chunk) this._rebuildMesh(chunk);
      this.meshQueue.delete(key);
      meshed++;
    }
  }

  /**
   * Synchronously generates, lights and meshes a small area (bypassing the
   * per-frame streaming budget). Used once at world start/dimension switch
   * so the player never spawns over an unloaded void; background streaming
   * via update() takes over for everything beyond this radius.
   */
  forceLoad(wx, wz, radius = 2) {
    const [pcx, pcz] = worldToChunk(wx, wz);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        const key = chunkKey(cx, cz);
        if (this.chunks.has(key)) continue;
        const chunk = new Chunk(cx, cz);
        this.chunks.set(key, chunk);
        this.generator.generateChunk(chunk);
        const diffs = this.diffStore.get(key);
        if (diffs) chunk.applyDiffs(diffs);
        const be = this.beStore.get(key);
        if (be) chunk.blockEntities = new Map(Object.entries(be));
        this._registerLightSources(chunk);
        this._computeSkylight(chunk);
        this._lightNewChunk(chunk);
      }
    }
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this._rebuildMesh(this.chunks.get(chunkKey(pcx + dx, pcz + dz)));
      }
    }
    this.loadQueue = this.loadQueue.filter((c) => !c.generated);
  }

  /**
   * Records the current day/night brightness. Deliberately does NOT trigger
   * remeshing: re-baking every loaded chunk each time the sun moved a little
   * kept the mesh queue permanently saturated, so freshly streamed-in chunks
   * waited behind hundreds of stale rebuilds and never got a mesh at all —
   * which showed up in game as see-through holes in the landscape.
   * Terrain light is baked once (see ChunkMesher); the visible day/night
   * change comes from the sky, fog and scene lighting instead.
   */
  setDayFactor(factor) {
    this.dayFactor = factor;
  }

  _loadChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    this.chunks.set(chunkKey(cx, cz), chunk);
    this.loadQueue.push(chunk);
  }

  _unloadChunk(key, storeDiffs = true) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    if (storeDiffs && chunk.diffs.size) this.diffStore.set(key, Object.fromEntries(chunk.diffs));
    if (storeDiffs && chunk.blockEntities.size) this.beStore.set(key, Object.fromEntries(chunk.blockEntities));
    const group = this._meshObjects.get(key);
    if (group) {
      this._chunkGroup.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this._meshObjects.delete(key);
    }
    this.chunks.delete(key);
    this.meshQueue.delete(key);
  }

  // ----------------------------------------------------------------- light
  //
  // Block light is a flood fill: an emitter seeds its own level and every
  // step outward costs one, so nothing carries further than MAX_LIGHT_TRAVEL
  // blocks. Two things can disturb it, and they are not symmetric:
  //
  //  - a chunk arrives, or an emitter is placed. Light only ever *increases*,
  //    and the "already at least this bright" test below stops the flood the
  //    moment it meets light that is good enough. Nothing has to be erased.
  //  - an emitter is broken, or a wall is built across a lit space. Light has
  //    to *drop*, which a flood cannot express, so the affected box is wiped
  //    and lit again from scratch — see _relightAround().
  //
  // Both paths touch a bounded neighbourhood, never the whole loaded world.

  /** Block id -> emission level. Built once; the registry never changes after startup. */
  _emissionTable() {
    if (!this._emission) {
      const blocks = BlockRegistry.all();
      this._emission = new Uint8Array(blocks.length + 1);
      this._opaqueToLight = new Uint8Array(blocks.length + 1);
      for (const b of blocks) {
        this._emission[b.id] = b.lightEmission ?? 0;
        // Matches the passability test the flood used before this table
        // existed: anything see-through, plant-like or non-solid lets light by.
        this._opaqueToLight[b.id] = (b.transparent || b.plant || !b.solid) ? 0 : 1;
      }
    }
    return this._emission;
  }

  /** True if a block id stops light from passing through it. */
  _blocksLight(id) {
    if (id === 0) return false;
    this._emissionTable();
    return this._opaqueToLight[id] === 1;
  }

  /**
   * Records every emitter in a freshly generated chunk. Scans the block array
   * flat and skips air outright — most of a chunk is air or stone, and this
   * runs for every chunk that streams in.
   */
  _registerLightSources(chunk) {
    const emission = this._emissionTable();
    chunk.lightSources.clear();
    const blocks = chunk.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const id = blocks[i];
      if (id === 0 || id >= emission.length || emission[id] === 0) continue;
      const y = Math.floor(i / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
      const rest = i - y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
      const z = Math.floor(rest / CHUNK_SIZE_X);
      chunk.lightSources.set(`${rest - z * CHUNK_SIZE_X},${y},${z}`, emission[id]);
    }
  }

  _computeSkylight(chunk) {
    if (!this.dimension.hasSkylight) return;
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) this._computeSkylightColumn(chunk, x, z);
    }
  }

  /** One column's worth of skylight — all a single block change can affect. */
  _computeSkylightColumn(chunk, x, z) {
    const top = chunk.topHeight(x, z);
    for (let y = 0; y < CHUNK_HEIGHT; y++) chunk.setSkyLight(x, y, z, y > top ? 15 : 0);
  }

  /**
   * Lights a chunk that has just been generated. Its own emitters are new to
   * the world, and light already standing in the neighbouring chunks could
   * not reach across the border while this space did not exist — so the lit
   * cells just outside each side are seeded too, and flow inward.
   */
  _lightNewChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE_X, baseZ = chunk.cz * CHUNK_SIZE_Z;
    const queue = [];

    for (const [local, level] of chunk.lightSources) {
      const [lx, y, lz] = local.split(',');
      this._seedLight(queue, baseX + Number(lx), Number(y), baseZ + Number(lz), level);
    }

    // The four vertical faces of the neighbouring chunks, one block out.
    for (let i = 0; i < CHUNK_SIZE_X; i++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        this._seedNeighborLight(queue, baseX + i, y, baseZ - 1);
        this._seedNeighborLight(queue, baseX + i, y, baseZ + CHUNK_SIZE_Z);
        this._seedNeighborLight(queue, baseX - 1, y, baseZ + i);
        this._seedNeighborLight(queue, baseX + CHUNK_SIZE_X, y, baseZ + i);
      }
    }

    this._floodBlockLight(queue);
  }

  /** Queues an already-lit cell so its light can spread into new space. */
  _seedNeighborLight(queue, wx, wy, wz) {
    const level = this.getBlockLightGlobal(wx, wy, wz);
    if (level > 1) queue.push(wx, wy, wz, level);
  }

  /** Raises a cell to `level` (never lowers it) and queues it for spreading. */
  _seedLight(queue, wx, wy, wz, level) {
    if (level <= 1) return;
    const current = this.getBlockLightGlobal(wx, wy, wz);
    if (current >= level) { queue.push(wx, wy, wz, current); return; }
    if (this._setBlockLightIfLoaded(wx, wy, wz, level)) queue.push(wx, wy, wz, level);
  }

  /**
   * Spreads light outward from the queued cells. `queue` is a flat run of
   * x, y, z, level — one array of numbers rather than an array of tuples,
   * because this is the hottest loop in the world and every seed used to
   * allocate a four-element array of its own.
   */
  _floodBlockLight(queue) {
    let head = 0;
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++], level = queue[head++];
      if (level <= 1) continue;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const ny = y + dy;
        // The world has a floor and a ceiling, and light must not walk off
        // either. Outside 0..CHUNK_HEIGHT there is nowhere to *store* a
        // level, so such a cell always reads back as dark and every visit
        // expands it again — a flood with no memory, branching six ways,
        // fourteen levels deep. The lanterns crowning the Hollow Spire sit
        // right under the ceiling, which is why walking into view of it used
        // to fill the heap and kill the tab.
        if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
        const nx = x + dx, nz = z + dz;
        if (this._blocksLight(this.getBlockGlobal(nx, ny, nz))) continue;
        if (this.getBlockLightGlobal(nx, ny, nz) >= level - 1) continue;
        if (!this._setBlockLightIfLoaded(nx, ny, nz, level - 1)) continue;
        queue.push(nx, ny, nz, level - 1);
      }
    }
  }

  /**
   * Rebuilds the light around a block that changed. Anything the change could
   * have lit (or stopped lighting) lies within MAX_LIGHT_TRAVEL blocks, so
   * that box is wiped and filled again from the emitters inside it plus the
   * lit shell around it, which carries in whatever the rest of the world
   * contributes. Erasing first is what lets light get *darker* — breaking a
   * torch, or walling a lit room off.
   */
  _relightAround(wx, wy, wz) {
    const r = MAX_LIGHT_TRAVEL;
    const x0 = wx - r, x1 = wx + r, z0 = wz - r, z1 = wz + r;
    const y0 = Math.max(0, wy - r), y1 = Math.min(CHUNK_HEIGHT - 1, wy + r);

    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const chunk = this._chunkAt(x, z);
        if (!chunk) continue;
        const lx = mod(x, CHUNK_SIZE_X), lz = mod(z, CHUNK_SIZE_Z);
        for (let y = y0; y <= y1; y++) chunk.setBlockLight(lx, y, lz, 0);
      }
    }

    const queue = [];
    for (const chunk of this._chunksOverlapping(x0, z0, x1, z1)) {
      const baseX = chunk.cx * CHUNK_SIZE_X, baseZ = chunk.cz * CHUNK_SIZE_Z;
      for (const [local, level] of chunk.lightSources) {
        const [lx, ly, lz] = local.split(',');
        const x = baseX + Number(lx), y = Number(ly), z = baseZ + Number(lz);
        if (x < x0 || x > x1 || z < z0 || z > z1 || y < y0 || y > y1) continue;
        this._seedLight(queue, x, y, z, level);
      }
    }

    // The shell one block outside the wiped box still holds correct light.
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        const onSide = x < x0 || x > x1 || z < z0 || z > z1;
        if (onSide) {
          for (let y = y0; y <= y1; y++) this._seedNeighborLight(queue, x, y, z);
        } else {
          this._seedNeighborLight(queue, x, y0 - 1, z);
          this._seedNeighborLight(queue, x, y1 + 1, z);
        }
      }
    }

    this._floodBlockLight(queue);
  }

  /** Every loaded chunk touching a world-space rectangle. */
  * _chunksOverlapping(x0, z0, x1, z1) {
    const [cx0, cz0] = worldToChunk(x0, z0);
    const [cx1, cz1] = worldToChunk(x1, z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunks.get(chunkKey(cx, cz));
        if (chunk) yield chunk;
      }
    }
  }

  _setBlockLightIfLoaded(wx, wy, wz, level) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const chunk = this._chunkAt(wx, wz);
    if (!chunk) return false;
    chunk.setBlockLight(mod(wx, CHUNK_SIZE_X), wy, mod(wz, CHUNK_SIZE_Z), level);
    return true;
  }

  // ---------------------------------------------------------------- meshes
  _queueMesh(cx, cz) {
    const key = chunkKey(cx, cz);
    if (this.chunks.get(key)?.generated) this.meshQueue.add(key);
  }

  _rebuildMesh(chunk) {
    const key = chunkKey(chunk.cx, chunk.cz);
    const old = this._meshObjects.get(key);
    if (old) { this._chunkGroup.remove(old); old.traverse((o) => o.geometry?.dispose()); }

    // Baked at full daylight — see setDayFactor() for why this is constant.
    const { opaque, cutout, transparent } = buildChunkMesh(chunk, this, 1);
    const group = new THREE.Group();
    group.position.set(chunk.cx * CHUNK_SIZE_X, 0, chunk.cz * CHUNK_SIZE_Z);
    if (opaque) group.add(new THREE.Mesh(opaque, this._materials.opaque));
    if (cutout) group.add(new THREE.Mesh(cutout, this._materials.cutout));
    if (transparent) group.add(new THREE.Mesh(transparent, this._materials.transparent));
    group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this._chunkGroup.add(group);
    this._meshObjects.set(key, group);
    chunk.dirty = false;
  }

  // ------------------------------------------------------------- accessors
  _chunkAt(wx, wz) {
    const [cx, cz] = worldToChunk(wx, wz);
    return this.chunks.get(chunkKey(cx, cz)) ?? null;
  }

  getChunk(cx, cz) { return this.chunks.get(chunkKey(cx, cz)) ?? null; }

  getBlockGlobal(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    const chunk = this._chunkAt(wx, wz);
    if (!chunk) return 0;
    return chunk.getBlock(mod(wx, CHUNK_SIZE_X), wy, mod(wz, CHUNK_SIZE_Z));
  }

  /** Used by the mesher: nx/ny/nz may be outside the chunk's own 0..15 local range. */
  getBlockLocalOrGlobal(chunk, lx, ly, lz) {
    if (chunk.inBounds(lx, ly, lz)) return chunk.getBlock(lx, ly, lz);
    return this.getBlockGlobal(chunk.cx * CHUNK_SIZE_X + lx, ly, chunk.cz * CHUNK_SIZE_Z + lz);
  }

  getSkyLightGlobal(wx, wy, wz) {
    if (!this.dimension.hasSkylight) return 4;
    if (wy >= CHUNK_HEIGHT) return 15;
    const chunk = this._chunkAt(wx, wz);
    if (!chunk) return 15;
    return chunk.getSkyLight(mod(wx, CHUNK_SIZE_X), Math.max(0, wy), mod(wz, CHUNK_SIZE_Z));
  }

  getBlockLightGlobal(wx, wy, wz) {
    const chunk = this._chunkAt(wx, wz);
    if (!chunk || wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    return chunk.getBlockLight(mod(wx, CHUNK_SIZE_X), wy, mod(wz, CHUNK_SIZE_Z));
  }

  setBlockGlobal(wx, wy, wz, id) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const chunk = this._chunkAt(wx, wz);
    if (!chunk) return false;
    const lx = mod(wx, CHUNK_SIZE_X), lz = mod(wz, CHUNK_SIZE_Z);
    const emission = this._emissionTable();
    const previous = chunk.getBlock(lx, wy, lz);
    chunk.setBlock(lx, wy, lz, id);

    const localKey = `${lx},${wy},${lz}`;
    const emits = emission[id] ?? 0;
    if (emits > 0) chunk.lightSources.set(localKey, emits);
    else chunk.lightSources.delete(localKey);
    if (this.dimension.hasSkylight) this._computeSkylightColumn(chunk, lx, lz);
    this._relightAround(wx, wy, wz);

    this._queueMesh(chunk.cx, chunk.cz);
    if (lx === 0) this._queueMesh(chunk.cx - 1, chunk.cz);
    if (lx === CHUNK_SIZE_X - 1) this._queueMesh(chunk.cx + 1, chunk.cz);
    if (lz === 0) this._queueMesh(chunk.cx, chunk.cz - 1);
    if (lz === CHUNK_SIZE_Z - 1) this._queueMesh(chunk.cx, chunk.cz + 1);
    // A torch lights well past its own chunk, so putting one up (or taking it
    // down) has to re-bake every chunk the light reaches, not just this one.
    // Plain blocks skip this: nine remeshes for placing a dirt block would
    // cost more than the light it changes is worth.
    if (emits > 0 || (emission[previous] ?? 0) > 0) {
      const r = MAX_LIGHT_TRAVEL;
      for (const near of this._chunksOverlapping(wx - r, wz - r, wx + r, wz + r)) {
        this._queueMesh(near.cx, near.cz);
      }
    }
    globalEvents.emit('world:blockChanged', { x: wx, y: wy, z: wz, id });
    return true;
  }

  isSolidGlobal(wx, wy, wz) {
    return BlockRegistry.isSolid(this.getBlockGlobal(wx, wy, wz));
  }

  getBiomeAt(wx, wz) {
    return this.generator.pickBiome(wx, wz);
  }

  getBlockEntity(wx, wy, wz) {
    const chunk = this._chunkAt(wx, wz);
    return chunk?.blockEntities.get(`${mod(wx, CHUNK_SIZE_X)},${wy},${mod(wz, CHUNK_SIZE_Z)}`) ?? null;
  }

  setBlockEntity(wx, wy, wz, data) {
    const chunk = this._chunkAt(wx, wz);
    chunk?.blockEntities.set(`${mod(wx, CHUNK_SIZE_X)},${wy},${mod(wz, CHUNK_SIZE_Z)}`, data);
  }

  /** Highest solid block Y at a world column — used to place the player/mobs on load. */
  heightAtWorld(wx, wz) {
    const chunk = this._chunkAt(wx, wz);
    if (chunk) return chunk.topHeight(mod(wx, CHUNK_SIZE_X), mod(wz, CHUNK_SIZE_Z));
    // Chunk not loaded yet (e.g. initial spawn calc) — sample the generator directly.
    const biome = this.generator.pickBiome(wx, wz);
    return this.generator.heightAt(wx, wz, biome);
  }

  /** Current dimension's diffs+block-entities: live loaded-chunk state merged with its stored backlog. */
  _currentDimensionSnapshot() {
    const blocks = {}, entities = {};
    for (const chunk of this.chunks.values()) {
      const key = chunkKey(chunk.cx, chunk.cz);
      if (chunk.diffs.size) blocks[key] = Object.fromEntries(chunk.diffs);
      if (chunk.blockEntities.size) entities[key] = Object.fromEntries(chunk.blockEntities);
    }
    for (const [key, diffs] of this.diffStore) if (!blocks[key]) blocks[key] = diffs;
    for (const [key, be] of this.beStore) if (!entities[key]) entities[key] = be;
    return { blocks, entities };
  }

  /** Serializes every dimension's diffs + block entities (not just the active one) for the save file. */
  serializeAllDimensions() {
    const out = {};
    for (const [dimId, map] of Object.entries(this._diffsByDimension ?? {})) {
      if (dimId === this.dimensionId) continue;
      out[dimId] = { blocks: Object.fromEntries(map), entities: Object.fromEntries(this._beByDimension?.[dimId] ?? []) };
    }
    out[this.dimensionId] = this._currentDimensionSnapshot();
    return out;
  }

  /** Loads the full per-dimension blob produced by serializeAllDimensions(). */
  loadAllDimensions(byDimension) {
    this._diffsByDimension = {};
    this._beByDimension = {};
    for (const [dimId, snapshot] of Object.entries(byDimension ?? {})) {
      this._diffsByDimension[dimId] = new Map(Object.entries(snapshot?.blocks ?? {}));
      this._beByDimension[dimId] = new Map(Object.entries(snapshot?.entities ?? {}));
    }
    this.diffStore = this._diffsByDimension[this.dimensionId] ?? new Map();
    this._diffsByDimension[this.dimensionId] = this.diffStore;
    this.beStore = this._beByDimension[this.dimensionId] ?? new Map();
    this._beByDimension[this.dimensionId] = this.beStore;
  }

  dispose() {
    for (const key of [...this.chunks.keys()]) this._unloadChunk(key, false);
    this.scene.remove(this._chunkGroup);
  }
}
