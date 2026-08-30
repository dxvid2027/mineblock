// The block-light flood. Two things here are worth a test rather than a
// careful read:
//
//  - it has to *stop*. It used not to at the top of the world: a cell above
//    y=127 has nowhere to store a level, so it always read back as dark and
//    every visit expanded it again. Six ways out, fourteen levels deep, with
//    no memory. The lanterns crowning the Hollow Spire sit right under the
//    ceiling, so walking into view of one filled the heap and killed the tab.
//  - it is incremental. Light is no longer rebuilt for the whole loaded world
//    whenever a chunk arrives, only around what changed, and the two have to
//    agree exactly or the seams show as bands of wrong brightness.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { World } from '../src/world/World.js';
import { Chunk, chunkKey, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world/Chunk.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';

/**
 * A World with its fields set up by hand. The real constructor paints the
 * texture atlas onto a canvas, which does not exist under node — but every
 * method under test here only reads chunks, so borrowing the prototype tests
 * the shipping code rather than a copy of it that could drift.
 */
function headlessWorld(dimensionId = 'overworld', seed = 20260830) {
  const world = Object.create(World.prototype);
  world.seed = seed;
  world.dimensionId = dimensionId;
  world.dimension = DIMENSIONS[dimensionId];
  world.generator = world.dimension.createGenerator(seed);
  world.chunks = new Map();
  world.diffStore = new Map();
  world.beStore = new Map();
  world.loadQueue = [];
  world.meshQueue = new Set();
  world._meshObjects = new Map();
  world._emission = null;
  world._opaqueToLight = null;
  return world;
}

/** Generates, registers and lights one chunk, exactly as streaming does. */
function streamIn(world, cx, cz) {
  const chunk = new Chunk(cx, cz);
  world.chunks.set(chunkKey(cx, cz), chunk);
  world.generator.generateChunk(chunk);
  world._registerLightSources(chunk);
  world._computeSkylight(chunk);
  world._lightNewChunk(chunk);
  return chunk;
}

/** Wipes and re-floods everything at once — order-independent, so it is the answer. */
function fullRecompute(world) {
  for (const chunk of world.chunks.values()) {
    for (let i = 0; i < chunk.light.length; i++) chunk.light[i] &= 0xf0;
  }
  const queue = [];
  for (const chunk of world.chunks.values()) {
    const baseX = chunk.cx * CHUNK_SIZE_X, baseZ = chunk.cz * CHUNK_SIZE_Z;
    for (const [local, level] of chunk.lightSources) {
      const [lx, y, lz] = local.split(',').map(Number);
      world._seedLight(queue, baseX + lx, y, baseZ + lz, level);
    }
  }
  world._floodBlockLight(queue);
}

function lightSnapshot(world) {
  const out = new Map();
  for (const [key, chunk] of world.chunks) out.set(key, Uint8Array.from(chunk.light));
  return out;
}

function countMismatches(a, b) {
  let cells = 0;
  for (const [key, av] of a) {
    const bv = b.get(key);
    for (let i = 0; i < av.length; i++) if ((av[i] & 0xf) !== (bv[i] & 0xf)) cells++;
  }
  return cells;
}

test('a lantern against the world ceiling does not run the flood away', () => {
  const world = headlessWorld();
  const lantern = BlockRegistry.idOf('glow_lantern');
  assert.ok(lantern, 'glow_lantern must exist for this test to mean anything');

  // Three chunks of open air, so nothing but the world's own edges can stop
  // the flood — the worst case the Hollow Spire's crown creates.
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) {
      world.chunks.set(chunkKey(cx, cz), new Chunk(cx, cz));
    }
  }
  const chunk = world.chunks.get(chunkKey(0, 0));
  const topY = CHUNK_HEIGHT - 1;
  chunk.setBlock(8, topY, 8, lantern, { recordDiff: false });
  world._registerLightSources(chunk);

  // Before the ceiling guard this never returned; it exhausted the heap.
  world._lightNewChunk(chunk);

  assert.equal(world.getBlockLightGlobal(8, topY, 8), 15, 'the lantern lights its own cell');
  assert.equal(world.getBlockLightGlobal(8, topY - 14, 8), 1, 'and reaches exactly 14 blocks down');
  assert.equal(world.getBlockLightGlobal(8, topY - 15, 8), 0, 'and no further');
});

test('light spreads no further than 14 blocks, in open air', () => {
  const world = headlessWorld();
  const torch = BlockRegistry.byName('torch');
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) world.chunks.set(chunkKey(cx, cz), new Chunk(cx, cz));
  }
  const chunk = world.chunks.get(chunkKey(0, 0));
  chunk.setBlock(8, 64, 8, torch.id, { recordDiff: false });
  world._registerLightSources(chunk);
  world._lightNewChunk(chunk);

  const reach = torch.lightEmission - 1;
  assert.equal(world.getBlockLightGlobal(8 + reach, 64, 8), 1, 'reaches its full range sideways');
  assert.equal(world.getBlockLightGlobal(8 + reach + 1, 64, 8), 0, 'and stops there');
  // Crossing a chunk border must not change the answer.
  assert.equal(world.getBlockLightGlobal(8 - reach, 64, 8), 1, 'and the same into the chunk next door');
});

for (const [dimensionId, cx, cz] of [
  ['overworld', 21, 7],      // the chunk holding the Hollow Spire for this seed
  ['overworld', 200, 200],
  ['ember_expanse', 12, 12]
]) {
  test(`incremental lighting matches a full recompute (${dimensionId} at ${cx},${cz})`, () => {
    const world = headlessWorld(dimensionId);
    // Deliberately not in reading order: chunks stream in nearest-first from
    // wherever the player happens to be, and the result must not depend on it.
    const order = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) order.push([cx + dx, cz + dz]);
    order.sort((a, b) => ((a[0] * 31 + a[1] * 17) % 7) - ((b[0] * 31 + b[1] * 17) % 7));
    for (const [a, b] of order) streamIn(world, a, b);

    const incremental = lightSnapshot(world);
    fullRecompute(world);
    assert.equal(countMismatches(incremental, lightSnapshot(world)), 0,
      'streaming chunks in one at a time must light the world exactly as one big pass would');
  });
}

test('breaking an emitter darkens what it used to light', () => {
  const world = headlessWorld();
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) streamIn(world, 21 + dx, 7 + dz);

  // Any emitter will do; take the first one the Spire's chunk offers.
  let found = null;
  for (const chunk of world.chunks.values()) {
    for (const [local, level] of chunk.lightSources) {
      const [lx, y, lz] = local.split(',').map(Number);
      found = { x: chunk.cx * CHUNK_SIZE_X + lx, y, z: chunk.cz * CHUNK_SIZE_Z + lz, level };
      break;
    }
    if (found) break;
  }
  assert.ok(found, 'the test area should contain at least one light source');

  world.setBlockGlobal(found.x, found.y, found.z, 0);
  assert.equal(world.getBlockLightGlobal(found.x, found.y, found.z) < found.level, true,
    'the cell the emitter stood in must get darker once it is gone');

  const afterEdit = lightSnapshot(world);
  fullRecompute(world);
  assert.equal(countMismatches(afterEdit, lightSnapshot(world)), 0,
    'the local relight after an edit must match a full recompute');
});

test('emitters are forgotten when their chunk unloads', () => {
  const world = headlessWorld();
  const chunk = streamIn(world, 21, 7);
  assert.ok(chunk.lightSources.size > 0, 'the Spire chunk should hold emitters');
  world._unloadChunk(chunkKey(21, 7), false);
  // Light sources live on the chunk, so dropping the chunk drops them. A
  // world-wide map used to keep every torch the player had ever walked past.
  let remaining = 0;
  for (const c of world.chunks.values()) remaining += c.lightSources.size;
  assert.equal(remaining, 0);
});
