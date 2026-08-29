// Proves the game is actually completable: walks the real block/item/recipe
// tables and checks that, starting bare-handed, a player can reach every
// equipment tier, a full armor set, the Riftstone portal and the Ember
// Expanse. Tier gates and recipes are easy to write in a way that quietly
// makes an ore (or the portal) unobtainable, which no amount of playtesting
// the early game would reveal.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js'; // side effect: populates BlockRegistry
import { ItemRegistry } from '../src/items/ItemRegistry.js';
import { registerBlockItems, MATERIAL_TIERS } from '../src/items/ItemTypes.js';
import { RECIPES, SMELTING_RECIPES, matchesIngredient } from '../src/items/CraftingRecipes.js';

registerBlockItems();

/** Ingredients a recipe needs, regardless of shape. */
function ingredientsOf(recipe) {
  return recipe.type === 'shaped' ? Object.values(recipe.key) : recipe.ingredients;
}

function canCraft(recipe, have) {
  return ingredientsOf(recipe).every((ing) => [...have].some((id) => matchesIngredient(id, ing)));
}

/** Best pickaxe tierIndex currently craftable/owned, or -1 for bare hands. */
function bestPickaxeTier(have) {
  let best = -1;
  for (const id of have) {
    const tool = ItemRegistry.get(id)?.tool;
    if (tool?.type === 'pickaxe') best = Math.max(best, tool.tierIndex);
  }
  return best;
}

/**
 * Simulates acquisition to a fixpoint: harvest what the current pickaxe
 * allows, then craft and smelt whatever that unlocks, and repeat.
 * Quantities are ignored — this asks "is it reachable at all?".
 */
function reachableItems() {
  const have = new Set();

  for (let pass = 0; pass < 40; pass++) {
    const before = have.size;
    const tier = bestPickaxeTier(have);

    // Harvest every block whose tool gate the current pickaxe satisfies.
    for (const block of BlockRegistry.all()) {
      const gated = block.toolType === 'pickaxe';
      if (gated && tier < block.minToolTier) continue;
      if (block.drops) have.add(block.drops);
      // Breaking a block also yields the block itself where it drops itself.
      if (!gated || tier >= block.minToolTier) have.add(block.name);
    }

    for (const recipe of RECIPES) {
      if (canCraft(recipe, have)) have.add(recipe.result.id);
    }
    for (const r of SMELTING_RECIPES) {
      if (have.has(r.input)) have.add(r.output);
    }

    if (have.size === before) break;
  }
  return have;
}

const REACHABLE = reachableItems();

test('every ore tier is obtainable without a circular tool requirement', () => {
  const ores = BlockRegistry.all().filter((b) => b.category === 'ore');
  const unreachable = ores.filter((ore) => !REACHABLE.has(ore.drops));
  assert.deepEqual(
    unreachable.map((o) => `${o.name} (needs pickaxe tier ${o.minToolTier})`),
    [],
    'these ores can never be harvested — their tier gate is only satisfied by a tool made from the ore itself'
  );
});

test('every tool and weapon tier is craftable', () => {
  for (const tier of MATERIAL_TIERS) {
    for (const type of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) {
      assert.ok(REACHABLE.has(`${tier.id}_${type}`), `${tier.id}_${type} is not craftable`);
    }
  }
});

test('a full armor set is craftable in every armor tier', () => {
  for (const tier of MATERIAL_TIERS) {
    if (tier.id === 'wood') continue; // no wood armor by design
    for (const slot of ['helmet', 'chest', 'legs', 'boots']) {
      assert.ok(REACHABLE.has(`${tier.id}_${slot}`), `${tier.id}_${slot} is not craftable`);
    }
  }
});

test('the Riftstone portal to the Ember Expanse is craftable', () => {
  // The portal is the only route to the second dimension and the boss, so a
  // recipe needing an Ember-only material would make the game uncompletable.
  assert.ok(REACHABLE.has('riftstone'), 'riftstone is not craftable from Overworld-reachable materials');
});

test('the Infusion system is usable before entering the Ember Expanse', () => {
  assert.ok(REACHABLE.has('infusion_dust'), 'infusion_dust is not reachable');
  assert.ok(REACHABLE.has('rune_shard'), 'rune_shard is not reachable');
});

test('key workstations are craftable', () => {
  for (const id of ['workbench', 'smelter', 'runeforge', 'storage_crate', 'torch']) {
    assert.ok(REACHABLE.has(id), `${id} is not craftable`);
  }
});
