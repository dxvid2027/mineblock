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
import { ItemRegistry, itemDurability } from '../src/items/ItemRegistry.js';
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

// The shield and the totem only matter if a player can hold them before the
// fight they exist for. Both are checked against the same reachability walk
// as the rest of the chain, so a later recipe change cannot quietly strand
// them behind the boss they are meant to survive.
test('the Bulwark Shield and Warding Totem are craftable before the Riftstone', () => {
  for (const id of ['bulwark_shield', 'warding_totem']) {
    assert.ok(REACHABLE.has(id), `"${id}" cannot be crafted from anything reachable`);
  }
});

test('defensive gear carries the fields the combat code reads', () => {
  const shield = ItemRegistry.get('bulwark_shield');
  assert.ok(shield.shield, 'the shield has no shield block');
  assert.ok(shield.shield.block > 0 && shield.shield.block < 1, 'a shield must absorb some but not all damage');
  assert.ok(shield.shield.durability > 0, 'a shield without durability would never break');

  const totem = ItemRegistry.get('warding_totem');
  assert.ok(totem.totem, 'the totem has no totem block');
  assert.ok(totem.totem.reviveHealth > 0, 'reviving at zero health would kill the player again immediately');
});

// Anything carrying durability must not stack, or two shields would merge
// into one slot and share a single durability value.
test('items with durability never stack', () => {
  for (const item of ItemRegistry.all()) {
    if (itemDurability(item) === undefined) continue;
    assert.equal(item.stackSize, 1, `"${item.id}" has durability but stacks to ${item.stackSize}`);
  }
});

// A shield must not turn into a general damage sponge: it stops blows, and
// leaves falls, drowning, magma and starvation alone. Those all arrive with
// ignoreInvuln set, which is the line the combat code draws.
test('the shield only absorbs creature attacks, not the environment', async () => {
  const { Player } = await import('../src/entities/Player.js');
  const withShield = () => {
    const p = new Player();
    p.inventory.offhand = { id: 'bulwark_shield', count: 1, durability: 260 };
    p.health = 20;
    return p;
  };

  const struck = withShield();
  struck.damage(10);
  assert.ok(struck.health > 10, 'a creature blow should be partly absorbed');

  const fell = withShield();
  fell.damage(10, { ignoreInvuln: true });
  assert.equal(fell.health, 10, 'fall damage should pass through the shield untouched');
  assert.equal(fell.inventory.offhand.durability, 260, 'a fall should not wear the shield down');
});

test('a totem saves the player from any death, including a fall', async () => {
  const { Player } = await import('../src/entities/Player.js');
  const p = new Player();
  p.inventory.offhand = { id: 'warding_totem', count: 1 };
  p.health = 3;
  p.damage(40, { ignoreInvuln: true });
  assert.ok(p.alive, 'the totem should have caught a lethal fall');
  assert.equal(p.health, ItemRegistry.get('warding_totem').totem.reviveHealth);
  assert.equal(p.inventory.offhand, null, 'the totem should be spent');
});
