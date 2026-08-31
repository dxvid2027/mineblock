// Every recipe has to be craftable. That sounds too obvious to test until
// you notice how a shapeless recipe counts: `count: 4` means four grid
// CELLS holding one item each, not a stack of four. The Riftstone asked for
// 4 + 3 + 2 = nine of them after this fix and ten before it, and a Workbench
// only has nine — so the one item that opens the Ember Expanse could not be
// made at all, and the second half of the game was unreachable. Nothing in
// the UI said so; the output slot simply stayed empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { ItemRegistry } from '../src/items/ItemRegistry.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';
import { RECIPES, tagsOf } from '../src/items/CraftingRecipes.js';
import { matchRecipe } from '../src/items/CraftingSystem.js';

registerBlockItems();

const GRID_CELLS = 9; // a Workbench, the largest crafting square in the game

/** Some real item that satisfies an ingredient, so a grid can be built from a recipe. */
function itemFor(ingredient) {
  if (ingredient.id) return ingredient.id;
  const match = ItemRegistry.all().find((item) => tagsOf(item.id).includes(ingredient.tag));
  assert.ok(match, `no item in the game carries the tag "${ingredient.tag}"`);
  return match.id;
}

/** Lays a recipe out in a flat 9-cell grid exactly as a player would have to. */
function gridFor(recipe) {
  const grid = new Array(GRID_CELLS).fill(null);
  if (recipe.type === 'shaped') {
    recipe.pattern.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === ' ') return;
        grid[r * 3 + c] = { id: itemFor(recipe.key[ch]), count: 1 };
      });
    });
    return grid;
  }
  let cell = 0;
  for (const ingredient of recipe.ingredients) {
    for (let n = 0; n < (ingredient.count ?? 1); n++) {
      if (cell < GRID_CELLS) grid[cell] = { id: itemFor(ingredient), count: 1 };
      cell++;
    }
  }
  return grid;
}

test('no recipe asks for more cells than the crafting grid has', () => {
  for (const recipe of RECIPES) {
    const cells = recipe.type === 'shaped'
      ? recipe.pattern.join('').replace(/ /g, '').length
      : recipe.ingredients.reduce((sum, ing) => sum + (ing.count ?? 1), 0);
    assert.ok(cells <= GRID_CELLS,
      `recipe "${recipe.id}" needs ${cells} grid cells but a Workbench only has ${GRID_CELLS}, so it can never be crafted`);
  }
});

test('every recipe names ingredients and a result that exist', () => {
  for (const recipe of RECIPES) {
    assert.ok(ItemRegistry.get(recipe.result.id), `recipe "${recipe.id}" makes unknown item "${recipe.result.id}"`);
    const ingredients = recipe.type === 'shaped' ? Object.values(recipe.key) : recipe.ingredients;
    for (const ingredient of ingredients) {
      if (ingredient.tag) { itemFor(ingredient); continue; } // asserts inside
      assert.ok(ItemRegistry.get(ingredient.id),
        `recipe "${recipe.id}" wants unknown ingredient "${ingredient.id}"`);
    }
  }
});

test('laying a recipe out in the grid actually produces it', () => {
  for (const recipe of RECIPES) {
    const match = matchRecipe(gridFor(recipe));
    assert.ok(match, `recipe "${recipe.id}" laid out in the grid matches nothing at all`);
    assert.equal(match.recipe.result.id, recipe.result.id,
      `laying out "${recipe.id}" produced "${match.recipe.result.id}" instead`);
  }
});

test('the Riftstone can be crafted, since nothing else opens the Ember Expanse', () => {
  const riftstone = RECIPES.find((r) => r.id === 'riftstone');
  assert.ok(riftstone, 'the Riftstone recipe is gone');
  const match = matchRecipe(gridFor(riftstone));
  assert.ok(match && match.recipe.result.id === 'riftstone',
    'the Riftstone recipe does not match its own ingredients laid out in a Workbench');

  // And its ingredients must be obtainable without already owning a Riftstone:
  // everything it wants comes out of overworld stone.
  const fromOverworld = new Set(['voidshard', 'glimmer_shard', 'glint_ingot']);
  for (const ingredient of riftstone.ingredients) {
    assert.ok(fromOverworld.has(ingredient.id),
      `the Riftstone wants "${ingredient.id}", which is not something the overworld provides`);
  }
});

test('every ore a recipe chain needs can be mined with a tool from an earlier tier', () => {
  // A block that needs a pickaxe made of the very material it drops can never
  // be mined — the deadlock this table has fallen into before.
  const tierOfMaterial = { ruddle: 1, ferrite: 2, aurum: 3, glimmer: 4, voidshard: 5 };
  for (const block of BlockRegistry.all()) {
    if (block.category !== 'ore') continue;
    const drop = ItemRegistry.get(block.drops);
    if (!drop) continue;
    const material = Object.keys(tierOfMaterial).find((m) => block.name.startsWith(m));
    if (!material) continue;
    assert.ok(block.minToolTier < tierOfMaterial[material],
      `"${block.name}" needs a tier-${block.minToolTier} pickaxe, but ${material} is tier ${tierOfMaterial[material]} — you would need the ore to mine the ore`);
  }
});
