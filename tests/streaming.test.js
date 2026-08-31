// Chunk streaming has a state the rest of the game keeps forgetting about: a
// chunk can *exist* and still be empty. update() creates it and puts it in
// the queue, and generation happens some frames later. Anything that treats
// "the chunk is in the map" as "the terrain is there" reads an all -1 height
// map — which means "solid ground at y = -1", and whoever gets placed on top
// of it falls out of the world.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../src/blocks/BlockTypes.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';
import { World } from '../src/world/World.js';
import { chunkKey, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/world/Chunk.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';

registerBlockItems();

/** A World with its fields set by hand; the real constructor needs a canvas. */
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
  world._rebuildMesh = () => {}; // meshing needs three.js and is not what is under test
  return world;
}

test('heightAtWorld never answers from a chunk that has not been generated', () => {
  const world = headlessWorld();
  const wx = 340, wz = 120;

  const fromGenerator = world.heightAtWorld(wx, wz);
  assert.ok(fromGenerator > 0, 'with nothing loaded it should sample the generator');

  // Exactly what update() does on the frame a chunk comes into range: the
  // chunk object exists, the terrain does not.
  world._loadChunk(Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z));
  const chunk = world.chunks.get(chunkKey(Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z)));
  assert.equal(chunk.generated, false, 'the chunk is queued, not built');

  assert.equal(world.heightAtWorld(wx, wz), fromGenerator,
    'an empty queued chunk must not report ground at y=-1 — that is how a teleported player falls through the world');
});

test('forceLoad finishes chunks that were queued but not yet generated', () => {
  const world = headlessWorld();
  const wx = 340, wz = 120;
  const cx = Math.floor(wx / CHUNK_SIZE_X), cz = Math.floor(wz / CHUNK_SIZE_Z);

  world._loadChunk(cx, cz); // queued by ordinary streaming, still empty
  world.forceLoad(wx, wz, 1);

  const chunk = world.chunks.get(chunkKey(cx, cz));
  assert.equal(chunk.generated, true,
    'forceLoad promises the area is ready; skipping a queued-but-empty chunk left a hole in it');
  assert.ok(chunk.topHeight(wx % CHUNK_SIZE_X, wz % CHUNK_SIZE_Z) > 0, 'and the column has real ground');

  // The whole promised radius, not just the one chunk that was queued.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      assert.equal(world.chunks.get(chunkKey(cx + dx, cz + dz))?.generated, true,
        `chunk ${cx + dx},${cz + dz} inside the forceLoad radius was left ungenerated`);
    }
  }
});

test('a player placed on the ground after forceLoad stands on something solid', () => {
  const world = headlessWorld();
  const wx = -4558, wz = 10149;
  world._loadChunk(Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z));
  world.forceLoad(wx, wz, 2);

  const ground = world.heightAtWorld(wx, wz);
  assert.ok(ground > 0, `ground came back as ${ground}`);
  assert.ok(world.isSolidGlobal(wx, ground, wz), 'the block reported as the surface must actually be solid');
  assert.equal(world.getBlockGlobal(wx, ground + 1, wz), 0, 'and there must be room to stand on it');
});
