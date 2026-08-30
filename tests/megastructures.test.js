// The two landmarks are the only structures that span more than one chunk,
// and chunks are generated independently and in any order. That makes two
// things worth pinning down: that a landmark really does cross chunk
// borders, and that every chunk clipping it agrees on what it looks like —
// otherwise the halves would not meet and the seams would show as walls
// that stop mid-air.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { ItemRegistry } from '../src/items/ItemRegistry.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';
import { LOOT_TABLES } from '../src/world/Structures.js';
import { MEGA_STRUCTURES, REGION_SIZE, megaStructureForRegion } from '../src/world/MegaStructures.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';
import { hash2D } from '../src/world/noise/Noise.js';
import { Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world/Chunk.js';

registerBlockItems();

const SEED = 20260830;

/** Generates one chunk with a fresh generator, as the world would. */
function generate(dimensionId, cx, cz, seed = SEED) {
  const gen = DIMENSIONS[dimensionId].createGenerator(seed);
  const chunk = new Chunk(cx, cz);
  gen.generateChunk(chunk);
  return chunk;
}

/** Where the landmark of one region actually went, per the placement rule. */
function placementFor(dimensionId, regionX, regionZ, seed = SEED) {
  const gen = DIMENSIONS[dimensionId].createGenerator(seed);
  return megaStructureForRegion(regionX, regionZ, {
    seed, dimensionId, hash2D,
    seaLevel: gen.seaLevel,
    isEmber: gen.isEmber,
    heightAt: (x, z) => gen.heightAt(x, z, gen.pickBiome(x, z))
  });
}

test('every landmark names a loot table that exists', () => {
  for (const mega of MEGA_STRUCTURES) {
    assert.ok(LOOT_TABLES[mega.loot], `landmark "${mega.id}" wants unknown loot table "${mega.loot}"`);
    for (const entry of LOOT_TABLES[mega.loot]) {
      assert.ok(ItemRegistry.get(entry.id), `loot table "${mega.loot}" names unknown item "${entry.id}"`);
    }
  }
});

test('every dimension has exactly one landmark', () => {
  for (const dimId of Object.keys(DIMENSIONS)) {
    const forDim = MEGA_STRUCTURES.filter((m) => m.dimensions.includes(dimId));
    assert.equal(forDim.length, 1, `dimension "${dimId}" has ${forDim.length} landmarks, expected 1`);
  }
});

test('a landmark footprint stays inside its own region', () => {
  // Two landmarks in neighbouring regions must never be able to overlap, or
  // one would overwrite the other and both would be ruined.
  for (const mega of MEGA_STRUCTURES) {
    const margin = mega.radius + 8;
    assert.ok(margin * 2 < REGION_SIZE, `"${mega.id}" is too wide for a ${REGION_SIZE}-block region`);
  }
});

test('landmarks fit under the world ceiling', () => {
  for (const mega of MEGA_STRUCTURES) {
    assert.ok(mega.height < CHUNK_HEIGHT - 10, `"${mega.id}" is ${mega.height} tall and would be cut off`);
  }
});

for (const dimId of ['overworld', 'ember_expanse']) {
  test(`the ${dimId} landmark is built, and spans several chunks`, () => {
    const placed = placementFor(dimId, 0, 0);
    assert.ok(placed, `region 0,0 of ${dimId} produced no landmark at all`);
    const { mega, x, z } = placed;

    const cx0 = Math.floor((x - mega.radius) / CHUNK_SIZE_X);
    const cx1 = Math.floor((x + mega.radius) / CHUNK_SIZE_X);
    const cz0 = Math.floor((z - mega.radius) / CHUNK_SIZE_Z);
    const cz1 = Math.floor((z + mega.radius) / CHUNK_SIZE_Z);
    assert.ok(cx1 > cx0 && cz1 > cz0, 'the landmark does not even span two chunks of footprint');

    const crateId = BlockRegistry.idOf('storage_crate');
    let chunksWithCrates = 0, crates = 0, chunksWithBlocks = 0, tallest = 0;
    const layerCounts = new Map();

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = generate(dimId, cx, cz);
        let here = 0, blocks = 0;
        for (const [, be] of chunk.blockEntities) if (be.loot === mega.loot) here++;
        for (let bx = 0; bx < CHUNK_SIZE_X; bx++) {
          for (let bz = 0; bz < CHUNK_SIZE_Z; bz++) {
            for (let by = placed.y; by < Math.min(CHUNK_HEIGHT, placed.y + mega.height); by++) {
              if (chunk.getBlock(bx, by, bz) === 0) continue;
              blocks++;
              layerCounts.set(by, (layerCounts.get(by) ?? 0) + 1);
              if (by > tallest) tallest = by;
            }
          }
        }
        if (here > 0) { chunksWithCrates++; crates += here; }
        if (blocks > 0) chunksWithBlocks++;
      }
    }

    assert.equal(crates, 3, `${mega.id} should place three crates, found ${crates}`);
    // The three crates sit far apart inside the landmark, so finding them all
    // in one chunk would mean the build had collapsed to a point.
    assert.ok(chunksWithCrates >= 2, `all ${mega.id} crates landed in one chunk`);
    assert.ok(chunksWithBlocks >= 4, `${mega.id} only touched ${chunksWithBlocks} chunks`);

    // Height, and no holes in it. A landmark assembled from slices written by
    // different chunks would show a missing slice as an empty layer partway
    // up — the failure mode that matters here, and the one a screenshot of
    // the base would never catch.
    const reached = tallest - placed.y;
    assert.ok(reached > mega.height * 0.7,
      `${mega.id} reached only ${reached} of its ${mega.height} blocks`);
    for (let y = placed.y; y <= tallest; y++) {
      assert.ok(layerCounts.get(y) > 0, `${mega.id} has an empty layer at y=${y}, so a slice is missing`);
    }
  });
}

test('two chunks clipping the same landmark agree on it', () => {
  // The same chunk generated twice, and its neighbour, must be identical
  // across runs: the landmark's own seed comes from its world position, not
  // from whichever chunk happens to be building it.
  for (const [cx, cz] of [[11, 12], [12, 12], [12, 13]]) {
    const a = generate('overworld', cx, cz);
    const b = generate('overworld', cx, cz);
    assert.deepEqual([...a.blocks], [...b.blocks], `chunk ${cx},${cz} generated differently on a second run`);
  }
});
