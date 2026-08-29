import * as THREE from 'three';
import { Chunk, chunkKey, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './Chunk.js';
import { buildChunkMesh } from './ChunkMesher.js';
import { TextureAtlas } from '../render/TextureAtlas.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { getDimension } from '../dimensions/Dimensions.js';
import { globalEvents } from '../core/EventBus.js';

const CHUNKS_GENERATED_PER_FRAME = 2;
const CHUNKS_MESHED_PER_FRAME = 2;
const UNLOAD_MARGIN = 3; // extra chunks kept loaded beyond render distance before eviction

function worldToChunk(wx, wz) {
  return [Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z)];
}
function mod(n, m) { return ((n % m) + m) % m; }

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
    this.lightSources = new Map(); // "x,y,z" -> emission level, across loaded chunks
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
    this.lightSources.clear();
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
    let generated = 0;
    for (let i = 0; i < this.loadQueue.length && generated < CHUNKS_GENERATED_PER_FRAME; i++) {
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
        this._queueMesh(chunk.cx, chunk.cz);
        for (const [dcx, dcz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          this._queueMesh(chunk.cx + dcx, chunk.cz + dcz);
        }
        generated++;
      }
    }
    this.loadQueue = this.loadQueue.filter((c) => !c.generated);

    if (this.lightDirty) { this._recomputeBlockLight(); this.lightDirty = false; }

    let meshed = 0;
    for (const key of this.meshQueue) {
      if (meshed >= CHUNKS_MESHED_PER_FRAME) break;
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
      }
    }
    this._recomputeBlockLight();
    this.lightDirty = false;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this._rebuildMesh(this.chunks.get(chunkKey(pcx + dx, pcz + dz)));
      }
    }
    this.loadQueue = this.loadQueue.filter((c) => !c.generated);
  }

  setDayFactor(factor) {
    if (Math.abs(factor - this.dayFactor) > 0.03) {
      this.dayFactor = factor;
      for (const key of this.chunks.keys()) this.meshQueue.add(key);
    }
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
  _registerLightSources(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE_X, baseZ = chunk.cz * CHUNK_SIZE_Z;
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const block = BlockRegistry.get(chunk.getBlock(x, y, z));
          if (block?.lightEmission > 0) {
            this.lightSources.set(`${baseX + x},${y},${baseZ + z}`, block.lightEmission);
          }
        }
      }
    }
    this.lightDirty = true;
  }

  _computeSkylight(chunk) {
    if (!this.dimension.hasSkylight) return;
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const top = chunk.topHeight(x, z);
        for (let y = 0; y < CHUNK_HEIGHT; y++) chunk.setSkyLight(x, y, z, y > top ? 15 : 0);
      }
    }
  }

  _recomputeBlockLight() {
    for (const chunk of this.chunks.values()) {
      for (let i = 0; i < chunk.light.length; i++) chunk.light[i] &= 0xf0;
    }
    const queue = [];
    for (const [key, level] of this.lightSources) {
      const [x, y, z] = key.split(',').map(Number);
      if (this._setBlockLightIfLoaded(x, y, z, level)) queue.push([x, y, z, level]);
    }
    let head = 0;
    while (head < queue.length) {
      const [x, y, z, level] = queue[head++];
      if (level <= 1) continue;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const block = BlockRegistry.get(this.getBlockGlobal(nx, ny, nz));
        const passable = !block || block.transparent || block.plant || !block.solid;
        if (!passable) continue;
        const current = this.getBlockLightGlobal(nx, ny, nz);
        if (current >= level - 1) continue;
        if (this._setBlockLightIfLoaded(nx, ny, nz, level - 1)) queue.push([nx, ny, nz, level - 1]);
      }
    }
  }

  _setBlockLightIfLoaded(wx, wy, wz, level) {
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

    const { opaque, cutout, transparent } = buildChunkMesh(chunk, this, this.dimension.hasSkylight ? this.dayFactor : 1);
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
    chunk.setBlock(lx, wy, lz, id);

    const key = `${wx},${wy},${wz}`;
    const block = BlockRegistry.get(id);
    if (block?.lightEmission > 0) this.lightSources.set(key, block.lightEmission);
    else this.lightSources.delete(key);
    if (this.dimension.hasSkylight) this._computeSkylight(chunk);
    this.lightDirty = true;

    this._queueMesh(chunk.cx, chunk.cz);
    if (lx === 0) this._queueMesh(chunk.cx - 1, chunk.cz);
    if (lx === CHUNK_SIZE_X - 1) this._queueMesh(chunk.cx + 1, chunk.cz);
    if (lz === 0) this._queueMesh(chunk.cx, chunk.cz - 1);
    if (lz === CHUNK_SIZE_Z - 1) this._queueMesh(chunk.cx, chunk.cz + 1);
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
