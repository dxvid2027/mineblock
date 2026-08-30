// Every ore has to actually turn up in generated ground. The progression
// test walks recipes and block data and asks "is this reachable in
// principle?", which cannot see an ore that never physically generates —
// and two of them did not. char_seam, glint_ore and aurum_ore are all nine
// characters long, and the scatter salted its rolls with the block name's
// length, so all three rolled the same number at every position. char_seam
// is rolled first and has the loosest chance, so it claimed every spot the
// other two would have taken, leaving them nothing but non-stone to sit in.
//
// That silently removed the Riftstone, the Runeforge, Infusion Dust, the
// Warding Totem and both amulets from the game. This test generates real
// chunks and counts.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';
import { Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../src/world/Chunk.js';

/** Counts every ore block over a patch of freshly generated world. */
function countOres(dimensionId, seed, chunks = 40) {
  const gen = DIMENSIONS[dimensionId].createGenerator(seed);
  const counts = new Map();
  for (let i = 0; i < chunks; i++) {
    const chunk = new Chunk((i % 8) + 20, Math.floor(i / 8) + 20);
    gen.generateChunk(chunk);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const block = BlockRegistry.get(chunk.getBlock(x, y, z));
          if (block?.category === 'ore') counts.set(block.name, (counts.get(block.name) ?? 0) + 1);
        }
      }
    }
  }
  return { counts, veins: gen.oreVeins };
}

for (const dimensionId of ['overworld', 'ember_expanse']) {
  test(`every ore in ${dimensionId} actually generates`, () => {
    const { counts, veins } = countOres(dimensionId, 13579);
    for (const vein of veins) {
      const found = counts.get(vein.block) ?? 0;
      assert.ok(found > 0,
        `"${vein.block}" is in the ore table but generated ${found} blocks — it cannot be mined at all`);
    }
  });
}

test('rarer ores stay rarer than common ones', () => {
  // Guards the other direction: a salt that collides would also show up as
  // one ore swamping another, or as two ores appearing in lockstep.
  const { counts } = countOres('overworld', 24680);
  const at = (name) => counts.get(name) ?? 0;

  assert.ok(at('char_seam') > at('ruddle_ore'), 'char should be the commonest ore');
  assert.ok(at('ruddle_ore') > at('ferrite_ore'), 'ruddle should outnumber ferrite');
  assert.ok(at('glint_ore') > at('glimmerstone_ore'), 'glint should outnumber glimmerstone');
  assert.ok(at('glimmerstone_ore') > at('voidshard_ore'), 'glimmerstone should outnumber voidshard');
});

test('ores whose names are the same length both still generate', () => {
  // This is the collision itself, written down. char_seam, glint_ore and
  // aurum_ore are all nine characters; any future salt must keep them apart.
  const { counts, veins } = countOres('overworld', 24680);
  const byLength = new Map();
  for (const vein of veins) {
    const key = vein.block.length;
    byLength.set(key, [...(byLength.get(key) ?? []), vein.block]);
  }
  const collisions = [...byLength.values()].filter((group) => group.length > 1);
  assert.ok(collisions.length > 0,
    'the overworld table no longer has equal-length ore names, so this guard has nothing to check');

  for (const group of collisions) {
    for (const name of group) {
      assert.ok((counts.get(name) ?? 0) > 0,
        `"${name}" shares its name length with ${group.filter((n) => n !== name).join(', ')} and generated nothing`);
    }
  }
});
