// A single vertical column of the world: 16x16 blocks wide/deep, 128 tall.
// Block data is a flat Uint16Array (supports up to 65536 block types) and
// light data packs skylight (0-15) and blocklight (0-15) into one byte per
// cell to keep memory reasonable — an infinite world can have thousands of
// these resident at once.
export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Z = 16;
export const CHUNK_HEIGHT = 128;
const PLANE = CHUNK_SIZE_X * CHUNK_SIZE_Z;

export function chunkKey(cx, cz) { return `${cx},${cz}`; }

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint16Array(CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z);
    this.light = new Uint8Array(CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z);
    this.heightMap = new Int16Array(PLANE).fill(-1); // topmost solid Y per column
    this.entities = []; // mobs/items currently in this chunk (see World)
    this.blockEntities = new Map(); // "x,y,z" -> { type, ...state } for interactive blocks
    // "x,y,z" (local) -> emission level. Kept on the chunk rather than in one
    // world-wide map so an emitter is forgotten the moment its chunk unloads.
    this.lightSources = new Map();
    this.dirty = true; // needs remeshing
    this.diffs = new Map(); // "x,y,z" -> blockId, only cells changed from generation
    this.generated = false;
    this.mesh = null; // THREE.Group assigned by ChunkMesher/World
  }

  static index(x, y, z) {
    return x + z * CHUNK_SIZE_X + y * PLANE;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < CHUNK_SIZE_X && z >= 0 && z < CHUNK_SIZE_Z && y >= 0 && y < CHUNK_HEIGHT;
  }

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.blocks[Chunk.index(x, y, z)];
  }

  setBlock(x, y, z, id, { recordDiff = true } = {}) {
    if (!this.inBounds(x, y, z)) return;
    const idx = Chunk.index(x, y, z);
    this.blocks[idx] = id;
    if (recordDiff) this.diffs.set(`${x},${y},${z}`, id);
    const hIdx = x + z * CHUNK_SIZE_X;
    if (id !== 0 && y > this.heightMap[hIdx]) this.heightMap[hIdx] = y;
    else if (id === 0 && y === this.heightMap[hIdx]) {
      let ny = y - 1;
      while (ny >= 0 && this.blocks[Chunk.index(x, ny, z)] === 0) ny--;
      this.heightMap[hIdx] = ny;
    }
    this.dirty = true;
  }

  getSkyLight(x, y, z) { return this.inBounds(x, y, z) ? (this.light[Chunk.index(x, y, z)] >> 4) & 0xf : 15; }
  getBlockLight(x, y, z) { return this.inBounds(x, y, z) ? this.light[Chunk.index(x, y, z)] & 0xf : 0; }
  setSkyLight(x, y, z, v) { if (this.inBounds(x, y, z)) { const i = Chunk.index(x, y, z); this.light[i] = (this.light[i] & 0x0f) | ((v & 0xf) << 4); } }
  setBlockLight(x, y, z, v) { if (this.inBounds(x, y, z)) { const i = Chunk.index(x, y, z); this.light[i] = (this.light[i] & 0xf0) | (v & 0xf); } }

  topHeight(x, z) { return this.heightMap[x + z * CHUNK_SIZE_X]; }

  serializeDiffs() {
    return this.diffs.size ? Object.fromEntries(this.diffs) : null;
  }

  applyDiffs(diffMap) {
    for (const [key, id] of Object.entries(diffMap)) {
      const [x, y, z] = key.split(',').map(Number);
      this.setBlock(x, y, z, id, { recordDiff: false });
      this.diffs.set(key, id);
    }
  }
}
