// Consistency checks for the data tables that wire dimensions, biomes and
// creatures together. These are all cross-references between separate files,
// so a rename or typo produces a silently empty spawn pool or a plant that
// never generates rather than an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { CREATURES } from '../src/entities/creatures/CreatureTypes.js';
import { BIOMES, EMBER_BIOMES } from '../src/world/Biomes.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';

test('every biome mob list names a real creature', () => {
  for (const biome of [...Object.values(BIOMES), ...Object.values(EMBER_BIOMES)]) {
    for (const id of biome.mobs ?? []) {
      assert.ok(CREATURES[id], `biome "${biome.id}" spawns unknown creature "${id}"`);
    }
  }
});

test('every dimension has a non-empty cave mob pool of real creatures', () => {
  for (const [dimId, dim] of Object.entries(DIMENSIONS)) {
    assert.ok(Array.isArray(dim.caveMobs) && dim.caveMobs.length > 0,
      `dimension "${dimId}" has no caveMobs, so nothing spawns underground`);
    for (const id of dim.caveMobs) {
      assert.ok(CREATURES[id], `dimension "${dimId}" spawns unknown cave creature "${id}"`);
    }
  }
});

test('every biome references blocks that exist', () => {
  for (const biome of [...Object.values(BIOMES), ...Object.values(EMBER_BIOMES)]) {
    for (const name of [biome.surface, biome.subsurface, ...(biome.plants ?? [])]) {
      assert.ok(BlockRegistry.byName(name), `biome "${biome.id}" uses unknown block "${name}"`);
    }
  }
});

test('creature drops name real items', async () => {
  const { ItemRegistry } = await import('../src/items/ItemRegistry.js');
  const { registerBlockItems } = await import('../src/items/ItemTypes.js');
  registerBlockItems();
  for (const creature of Object.values(CREATURES)) {
    for (const drop of creature.drops ?? []) {
      assert.ok(ItemRegistry.get(drop.id), `creature "${creature.id}" drops unknown item "${drop.id}"`);
    }
  }
});

test('cave flora blocks exist and behave as plants', () => {
  for (const name of ['glowcap', 'duskcap', 'cavefern', 'dripvine', 'cinderbloom']) {
    const block = BlockRegistry.byName(name);
    assert.ok(block, `cave plant "${name}" is not registered`);
    assert.equal(block.plant, true, `"${name}" must be a plant to render as a cross-quad`);
    assert.equal(block.solid, false, `"${name}" must not be solid or it would block movement`);
  }
  // At least one cave plant lights its surroundings in each dimension.
  assert.ok(BlockRegistry.byName('glowcap').lightEmission > 0, 'Glowcap should emit light');
  assert.ok(BlockRegistry.byName('cinderbloom').lightEmission > 0, 'Cinderbloom should emit light');
});

test('light-emitting blocks stay within the 0-15 light scale', () => {
  for (const block of BlockRegistry.all()) {
    assert.ok(block.lightEmission >= 0 && block.lightEmission <= 15,
      `block "${block.name}" has out-of-range lightEmission ${block.lightEmission}`);
  }
});
