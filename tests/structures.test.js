// Validates the structure and loot catalog against the real block/item
// registries, and checks the world-spawn rules. A structure referencing a
// block name that does not exist silently generates a hole in the ground, and
// a loot entry naming a missing item silently yields nothing — neither throws,
// so neither shows up without a check like this.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { ItemRegistry } from '../src/items/ItemRegistry.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';
import { STRUCTURES, LOOT_TABLES, rollLoot } from '../src/world/Structures.js';
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { BIOMES, EMBER_BIOMES } from '../src/world/Biomes.js';

registerBlockItems();

const DIMENSION_IDS = ['overworld', 'ember_expanse'];

/**
 * Runs a structure's build() against a recording stub, collecting every block
 * name and loot table it asks for. Exercises the real build code rather than
 * trusting a hand-maintained list.
 */
function inspect(struct) {
  const blocks = new Set();
  const loots = new Set();
  let rngCalls = 0;
  const api = {
    rng: () => { rngCalls++; return ((rngCalls * 2654435761) % 1000) / 1000; },
    biome: BIOMES.plains,
    groundY: 70,
    set: (_dx, _dy, _dz, name) => blocks.add(name),
    air: () => {},
    crate: (_dx, _dy, _dz, lootId) => { blocks.add('storage_crate'); loots.add(lootId); }
  };
  struct.build(api);
  return { blocks, loots };
}

test('every structure places only registered blocks', () => {
  for (const struct of STRUCTURES) {
    const { blocks } = inspect(struct);
    for (const name of blocks) {
      assert.ok(BlockRegistry.byName(name), `structure "${struct.id}" places unknown block "${name}"`);
    }
  }
});

test('every structure references an existing loot table', () => {
  for (const struct of STRUCTURES) {
    assert.ok(LOOT_TABLES[struct.loot], `structure "${struct.id}" uses unknown loot table "${struct.loot}"`);
    const { loots } = inspect(struct);
    for (const id of loots) {
      assert.ok(LOOT_TABLES[id], `structure "${struct.id}" opens a crate with unknown loot table "${id}"`);
    }
  }
});

test('every loot entry names a registered item', () => {
  for (const [tableId, entries] of Object.entries(LOOT_TABLES)) {
    for (const entry of entries) {
      assert.ok(ItemRegistry.get(entry.id), `loot table "${tableId}" contains unknown item "${entry.id}"`);
      assert.ok(entry.min >= 0 && entry.max >= entry.min, `loot table "${tableId}" has a bad range for "${entry.id}"`);
      assert.ok(entry.chance > 0 && entry.chance <= 1, `loot table "${tableId}" has a bad chance for "${entry.id}"`);
    }
  }
});

test('loot rolls stay within a crate and respect stack sizes', () => {
  for (const tableId of Object.keys(LOOT_TABLES)) {
    for (let i = 0; i < 50; i++) {
      const rolled = rollLoot(tableId, () => (i * 37 % 100) / 100);
      assert.ok(rolled.length <= 27, `${tableId} rolled more stacks than a crate holds`);
      for (const s of rolled) assert.ok(s.count > 0, `${tableId} rolled a non-positive count`);
    }
  }
});

test('structures exist for every dimension, underground and on the surface', () => {
  for (const dim of DIMENSION_IDS) {
    const forDim = STRUCTURES.filter((s) => s.dimensions.includes(dim));
    assert.ok(forDim.length > 0, `no structures generate in "${dim}"`);
    assert.ok(forDim.some((s) => s.placement === 'surface'), `"${dim}" has no surface structures`);
    assert.ok(forDim.some((s) => s.placement === 'underground'), `"${dim}" has no underground structures`);
  }
});

test('underground structures declare a sane depth band', () => {
  for (const struct of STRUCTURES.filter((s) => s.placement === 'underground')) {
    assert.ok(Number.isFinite(struct.minY) && Number.isFinite(struct.maxY),
      `"${struct.id}" is underground but has no minY/maxY`);
    assert.ok(struct.maxY > struct.minY, `"${struct.id}" has an inverted depth band`);
    assert.ok(struct.minY >= 5, `"${struct.id}" may generate in bedrock`);
  }
});

test('structure biome filters name real biomes', () => {
  for (const struct of STRUCTURES) {
    if (!struct.biomes) continue;
    for (const id of struct.biomes) {
      assert.ok(BIOMES[id] || EMBER_BIOMES[id], `structure "${struct.id}" filters on unknown biome "${id}"`);
    }
  }
});

// ---------------------------------------------------------------- spawn ----
function overworldGenerator(seed) {
  return new TerrainGenerator(seed, {
    biomes: BIOMES, seaLevel: 62, liquidBlock: 'water', isEmber: false, dimensionId: 'overworld'
  });
}

const SEEDS = [1, 2, 7, 42, 1337, 99999, 2 ** 30, 123456789];

test('world spawn is dry land above sea level for many seeds', () => {
  for (const seed of SEEDS) {
    const gen = overworldGenerator(seed);
    const spawn = gen.findSpawnColumn();
    const biome = gen.pickBiome(spawn.x, spawn.z);
    const height = gen.heightAt(spawn.x, spawn.z, biome);
    assert.ok(height > gen.seaLevel, `seed ${seed}: spawn height ${height} is at or below sea level`);
    assert.ok(!biome.waterlogged, `seed ${seed}: spawn is in waterlogged biome "${biome.id}"`);
  }
});

test('world spawn differs between seeds and is stable for one seed', () => {
  const points = SEEDS.map((s) => overworldGenerator(s).findSpawnColumn());
  const unique = new Set(points.map((p) => `${p.x},${p.z}`));
  assert.equal(unique.size, SEEDS.length, 'two different seeds produced the same spawn point');

  for (const seed of SEEDS) {
    const a = overworldGenerator(seed).findSpawnColumn();
    const b = overworldGenerator(seed).findSpawnColumn();
    assert.deepEqual(a, b, `seed ${seed} produced a non-deterministic spawn`);
  }
});
