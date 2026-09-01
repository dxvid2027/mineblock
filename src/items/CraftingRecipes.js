// Crafting, smelting and Runeforge recipe tables. Shaped recipes use a
// Minecraft-style 3x3 pattern + key so they stay readable; ingredient
// entries may be an exact item id or a { tag } that matches by category
// (see matchesIngredient), which lets any tree's planks/logs satisfy a
// generic "wood" slot instead of needing one recipe per tree species.
import { MATERIAL_TIERS, TOOL_TYPES_LIST } from './ItemTypes.js';

export function tagsOf(itemId) {
  const tags = [];
  if (itemId.endsWith('_planks')) tags.push('planks');
  if (itemId.endsWith('_log')) tags.push('log');
  if (itemId.startsWith('woven_cloth')) tags.push('cloth');
  if (itemId.endsWith('_sapling')) tags.push('sapling');
  return tags;
}

export function matchesIngredient(itemId, ingredient) {
  if (!itemId) return false;
  if (ingredient.tag) return tagsOf(itemId).includes(ingredient.tag);
  return itemId === ingredient.id;
}

function shaped(id, pattern, key, result) {
  return { id, type: 'shaped', pattern, key, result };
}
function shapeless(id, ingredients, result) {
  return { id, type: 'shapeless', ingredients, result };
}

const P = { tag: 'planks' };
const S = { id: 'stick' };

export const RECIPES = [
  // --- Basics ---
  shapeless('planks_from_log', [{ tag: 'log', count: 1 }], { id: 'duskwood_planks', count: 4, matchLogSpecies: true }),
  shapeless('sticks', [{ tag: 'planks', count: 2 }], { id: 'stick', count: 4 }),
  shapeless('workbench', [{ tag: 'planks', count: 4 }], { id: 'workbench', count: 1 }),
  shapeless('storage_crate', [{ tag: 'planks', count: 8 }], { id: 'storage_crate', count: 1 }),
  shaped('smelter', ['###', '# #', '###'], { '#': { id: 'cobbled_stone' } }, { id: 'smelter', count: 1 }),
  shaped('torch', ['C', 'S'], { C: { id: 'char_lump' }, S }, { id: 'torch', count: 4 }),
  shaped('ladder', ['S S', 'SSS', 'S S'], { S }, { id: 'ladder', count: 3 }),
  shapeless('bedroll', [{ tag: 'cloth', count: 3 }, { tag: 'planks', count: 3 }], { id: 'bedroll', count: 1 }),
  shapeless('fiber_to_cloth', [{ id: 'fiber', count: 4 }], { id: 'woven_cloth_red', count: 1 }),
  shaped('runeforge',
    ['GSG', 'IVI', 'BBB'],
    { G: { id: 'glint_ingot' }, S: { id: 'glimmer_shard' }, I: { id: 'voidshard' }, V: { id: 'stone_bricks' }, B: { id: 'stone_bricks' } },
    { id: 'runeforge', count: 1 }),
  shapeless('glow_lantern', [{ id: 'glint_ingot', count: 4 }, { id: 'char_lump', count: 1 }], { id: 'glow_lantern', count: 1 }),
  // Deliberately free of Infusion Dust: dust needs Sulfur, and the Riftstone
  // is the only way into the Ember Expanse, so requiring it here made the
  // portal — and the rest of the game — unreachable.
  //
  // A shapeless `count` is a number of grid CELLS, not a stack size — one
  // item per cell. This asked for 4 + 4 + 2 = ten of them, and even a
  // Workbench only has nine, so the Riftstone could not be crafted at all
  // and the Ember Expanse was sealed off. It now fills the Workbench
  // exactly. tests/crafting.test.js keeps every recipe inside the grid.
  shapeless('riftstone', [{ id: 'voidshard', count: 4 }, { id: 'glimmer_shard', count: 3 }, { id: 'glint_ingot', count: 2 }], { id: 'riftstone', count: 1 }),

  // --- Farming ---
  shapeless('baked_loaf', [{ id: 'barley_grain', count: 3 }], { id: 'baked_loaf', count: 1, needsSmelter: true }),

  // --- Magic ---
  shapeless('infusion_dust', [{ id: 'glint_ingot', count: 1 }, { id: 'sulfur_shard', count: 1 }], { id: 'infusion_dust', count: 2 }),
  shapeless('rune_shard', [{ id: 'infusion_dust', count: 2 }, { id: 'voidshard', count: 1 }], { id: 'rune_shard', count: 1 }),
  shapeless('warding_amulet', [{ id: 'glimmer_shard', count: 2 }, { id: 'rune_shard', count: 1 }, { id: 'glint_ingot', count: 2 }], { id: 'warding_amulet', count: 1 }),
  shapeless('vigor_amulet', [{ id: 'aurum_ingot', count: 2 }, { id: 'rune_shard', count: 1 }, { id: 'glint_ingot', count: 2 }], { id: 'vigor_amulet', count: 1 }),
  shapeless('elixir_of_mending', [{ id: 'wild_berries', count: 2 }, { id: 'infusion_dust', count: 1 }], { id: 'elixir_of_mending', count: 1 }),
  shapeless('elixir_of_haste', [{ id: 'roasted_tuber', count: 2 }, { id: 'infusion_dust', count: 1 }], { id: 'elixir_of_haste', count: 1 }),
  shapeless('flint_striker', [{ id: 'ferrite_ingot', count: 1 }, { id: 'stick', count: 1 }], { id: 'flint_striker', count: 1 }),

  // --- Defensive gear ---
  // Deliberately mid-game: the shield wants a metal a player already has by
  // the time anything hits hard, and the totem sits one tier below the
  // Riftstone so it can actually be taken into the boss fight.
  shaped('bulwark_shield', ['PMP', 'PPP', ' P '],
    { P, M: { id: 'ferrite_ingot' } }, { id: 'bulwark_shield', count: 1 }),
  shapeless('warding_totem',
    [{ id: 'aurum_ingot', count: 4 }, { id: 'glimmer_shard', count: 2 }, { id: 'infusion_dust', count: 1 }],
    { id: 'warding_totem', count: 1 }),

  // --- The Eternal Rift ---
  // Two artifacts, one from each dimension, and neither is given up
  // willingly: the Sentinel Heart is carried by the Spire Sentinel at the top
  // of the Hollow Spire, the Warden Core by the Cinder Warden at the
  // Emberforge. Everything else here is the Overworld's deepest seams.
  shapeless('rift_core',
    [{ id: 'sentinel_heart', count: 1 }, { id: 'warden_core', count: 1 },
      { id: 'voidshard', count: 3 }, { id: 'glimmer_shard', count: 2 }, { id: 'aurum_ingot', count: 2 }],
    { id: 'rift_core', count: 1 }),
  // The core set into a frame you can stand in front of.
  shaped('rift_gate', ['PPP', 'PCP', 'PPP'],
    { P: { id: 'polished_stone' }, C: { id: 'rift_core' } }, { id: 'rift_gate', count: 1 }),
  // Made on the far side, from what the Rift itself gives up.
  shapeless('rift_compass',
    [{ id: 'aether_dust', count: 4 }, { id: 'titanite_ingot', count: 1 }, { id: 'glint_ingot', count: 2 }],
    { id: 'rift_compass', count: 1 }),
  shapeless('eternal_sigil',
    [{ id: 'titan_heart', count: 1 }, { id: 'titanite_ingot', count: 4 }, { id: 'aether_dust', count: 2 }],
    { id: 'eternal_sigil', count: 1 })
];

// Programmatically add tool + weapon recipes for every material tier.
function tierMaterialIngredient(tier) {
  if (tier.id === 'wood') return P;
  if (tier.id === 'glimmer') return { id: 'glimmer_shard' };
  if (tier.id === 'voidshard') return { id: 'voidshard' };
  return { id: `${tier.id}_ingot` };
}

const TOOL_PATTERNS = {
  pickaxe: ['MMM', ' S ', ' S '],
  axe: ['MM', 'MS', ' S'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM', ' S', ' S']
};

for (const tier of MATERIAL_TIERS) {
  const M = tierMaterialIngredient(tier);
  for (const type of TOOL_TYPES_LIST) {
    RECIPES.push(shaped(`${tier.id}_${type}`, TOOL_PATTERNS[type], { M, S }, { id: `${tier.id}_${type}`, count: 1 }));
  }
}

// Armor recipes (skip the Wood tier — no wood armor, same as the tool-tier gap it mirrors).
const ARMOR_PATTERNS = {
  helmet: ['MMM', 'M M', '   '],
  chest: ['M M', 'MMM', 'MMM'],
  legs: ['MMM', 'M M', 'M M'],
  boots: ['   ', 'M M', 'M M']
};
for (const tier of MATERIAL_TIERS) {
  if (tier.id === 'wood') continue;
  const M = tierMaterialIngredient(tier);
  for (const slot of ['helmet', 'chest', 'legs', 'boots']) {
    RECIPES.push(shaped(`${tier.id}_${slot}`, ARMOR_PATTERNS[slot], { M }, { id: `${tier.id}_${slot}`, count: 1 }));
  }
}

// ---------------------------------------------------------------------- //
// Smelter (smelting + cooking) recipes
// ---------------------------------------------------------------------- //
export const SMELTING_RECIPES = [
  { input: 'ruddle_chunk', output: 'ruddle_ingot', count: 1, time: 8 },
  { input: 'ferrite_chunk', output: 'ferrite_ingot', count: 1, time: 10 },
  { input: 'aurum_chunk', output: 'aurum_ingot', count: 1, time: 10 },
  { input: 'glint_chunk', output: 'glint_ingot', count: 1, time: 9 },
  // Titanite takes its time.
  { input: 'titanite_chunk', output: 'titanite_ingot', count: 1, time: 22 },
  { input: 'sand', output: 'glass_pane', count: 1, time: 6 },
  { input: 'red_sand', output: 'glass_pane', count: 1, time: 6 },
  { input: 'loam', output: 'sunbaked_brick', count: 1, time: 7 },
  { input: 'stone_bricks', output: 'stone_bricks', count: 1, time: 5 },
  { input: 'raw_meat', output: 'cooked_meat', count: 1, time: 6 },
  { input: 'tuber', output: 'roasted_tuber', count: 1, time: 6 },
  { input: 'barley_grain', output: 'baked_loaf', count: 1, time: 8, extraInput: { id: 'barley_grain', count: 3 } }
];

export function findSmeltingRecipe(inputId) {
  return SMELTING_RECIPES.find((r) => r.input === inputId) ?? null;
}
