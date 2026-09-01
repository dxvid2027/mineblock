// The Eternal Rift. The things worth pinning here are the ones that would
// quietly break the ending rather than throw: an ore that is not actually
// the rarest, a gate whose ingredients cannot be obtained, a boss with no
// arena to stand in, or a phase that can never be reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { ItemRegistry } from '../src/items/ItemRegistry.js';
import { registerBlockItems, MATERIAL_TIERS } from '../src/items/ItemTypes.js';
import { RECIPES } from '../src/items/CraftingRecipes.js';
import { CREATURES } from '../src/entities/creatures/CreatureTypes.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';
import { RIFT_BIOMES } from '../src/world/Biomes.js';
import { MEGA_STRUCTURES } from '../src/world/MegaStructures.js';
import { STRUCTURES } from '../src/world/Structures.js';
import { Chunk, CHUNK_HEIGHT } from '../src/world/Chunk.js';
import { readFileSync } from 'node:fs';

registerBlockItems();

const SEED = 20260830;
const rift = () => DIMENSIONS.eternal_rift.createGenerator(SEED);

/** Counts blocks over a run of real chunks. */
function census(generator, chunks = 50, ox = 700, oz = 700) {
  const counts = new Map();
  for (let i = 0; i < chunks; i++) {
    const chunk = new Chunk(ox + (i % 10), oz + Math.floor(i / 10));
    generator.generateChunk(chunk);
    for (const id of chunk.blocks) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return (name) => (counts.get(BlockRegistry.idOf(name)) ?? 0) / chunks;
}

test('the Eternal Rift is a real dimension with its own everything', () => {
  const dim = DIMENSIONS.eternal_rift;
  assert.ok(dim, 'the dimension is missing');
  assert.equal(dim.hasSkylight, false, 'the Rift has no sun');
  assert.ok(Object.keys(RIFT_BIOMES).length >= 3, 'one biome is not an ecosystem');
  for (const biome of Object.values(RIFT_BIOMES)) {
    assert.ok(BlockRegistry.byName(biome.surface), `biome "${biome.id}" has no real surface block`);
    for (const id of biome.mobs) assert.ok(CREATURES[id], `biome "${biome.id}" spawns unknown "${id}"`);
  }
  // Its own palette, not the Overworld's.
  assert.notEqual(dim.skyTop, DIMENSIONS.overworld.skyTop);
});

test('Titanite is rarer than every ore that came before it', () => {
  const inRift = census(rift());
  const inOverworld = census(DIMENSIONS.overworld.createGenerator(SEED));
  const inEmber = census(DIMENSIONS.ember_expanse.createGenerator(SEED));

  const titanite = inRift('titanite_ore');
  assert.ok(titanite > 0, 'Titanite never generates, so the best gear cannot be made');

  const others = ['char_seam', 'ruddle_ore', 'glint_ore', 'ferrite_ore', 'aurum_ore', 'glimmerstone_ore', 'voidshard_ore', 'sulfur_crystal'];
  for (const ore of others) {
    const elsewhere = Math.max(inOverworld(ore), inEmber(ore));
    if (elsewhere === 0) continue;
    assert.ok(titanite < elsewhere,
      `Titanite is ${titanite.toFixed(2)}/chunk but ${ore} is only ${elsewhere.toFixed(2)} — it is meant to be the rarest thing in the game`);
  }
  // And it only exists here.
  assert.equal(inOverworld('titanite_ore'), 0, 'Titanite must not generate in the Overworld');
  assert.equal(inEmber('titanite_ore'), 0, 'Titanite must not generate in the Ember Expanse');
});

test('Titanite is the strongest tier, and is gated behind the one before it', () => {
  const titanite = MATERIAL_TIERS.find((t) => t.id === 'titanite');
  assert.ok(titanite, 'the Titanite tier is missing');
  assert.equal(titanite.tierIndex, Math.max(...MATERIAL_TIERS.map((t) => t.tierIndex)), 'it should be the last tier');

  const sword = ItemRegistry.get('titanite_sword');
  const previous = ItemRegistry.get('voidshard_sword');
  assert.ok(sword.tool.damage > previous.tool.damage, 'the best sword should hit hardest');
  assert.ok(sword.tool.durability > previous.tool.durability);
  assert.ok(ItemRegistry.get('titanite_chest').armor.defense > ItemRegistry.get('voidshard_chest').armor.defense);

  // You need Voidshard gear to mine it — a tier that required itself would be
  // unreachable, which this repo has shipped before.
  const ore = BlockRegistry.byName('titanite_ore');
  assert.ok(ore.minToolTier < titanite.tierIndex, 'you would need Titanite to mine Titanite');
  assert.ok(ore.lightEmission > 0, 'it should be visible in a dark tunnel — that is its tell');
});

test('the way in needs one artifact from each existing dimension', () => {
  const core = RECIPES.find((r) => r.id === 'rift_core');
  assert.ok(core, 'the Rift Core recipe is missing');
  const ids = core.ingredients.map((i) => i.id);
  assert.ok(ids.includes('sentinel_heart'), 'the Overworld artifact is not required');
  assert.ok(ids.includes('warden_core'), 'the Ember Expanse artifact is not required');

  // And each artifact is carried by something that has to be killed for it.
  const holders = Object.values(CREATURES).filter((c) => c.drops?.some((d) => d.id === 'sentinel_heart'));
  assert.equal(holders.length, 1, 'exactly one creature should carry the Sentinel Heart');
  assert.ok(holders[0].maxHealth >= 100, 'an artifact guardian should be a real fight');
  const wardens = Object.values(CREATURES).filter((c) => c.drops?.some((d) => d.id === 'warden_core'));
  assert.ok(wardens.length >= 1);

  // The gate itself must be buildable from the core plus ordinary materials —
  // nothing from inside the Rift, or it could never be built.
  const gate = RECIPES.find((r) => r.id === 'rift_gate');
  assert.ok(gate, 'the Rift Gate recipe is missing');
  const riftOnly = new Set(['voidstone', 'rift_shale', 'pale_turf', 'titanite_ingot', 'aether_dust', 'rift_brick', 'pale_marble', 'runed_basalt']);
  for (const ing of Object.values(gate.key)) {
    assert.ok(!riftOnly.has(ing.id), `the gate needs "${ing.id}", which only exists on the far side of it`);
  }
  assert.ok(BlockRegistry.byName('rift_gate')?.interactive, 'the gate block must be right-clickable');
});

test('the Rift has landmarks and structures of its own, and they are reachable', () => {
  const landmarks = MEGA_STRUCTURES.filter((m) => m.dimensions.includes('eternal_rift'));
  assert.ok(landmarks.length >= 4, `only ${landmarks.length} landmarks — the Rift should have a horizon worth walking to`);

  const small = STRUCTURES.filter((s) => s.dimensions.includes('eternal_rift'));
  assert.ok(small.length >= 6, `only ${small.length} small structures in the Rift`);
  assert.ok(small.some((s) => s.placement === 'underground'), 'nothing to find below ground');
  assert.ok(small.some((s) => s.placement === 'surface'), 'nothing to find above ground');

  // The Titan's arena has to exist near wherever the player comes out.
  const generator = rift();
  let worst = 0;
  for (let i = 0; i < 30; i++) {
    const x = (i * 6421) % 24000 - 12000, z = (i * 9137) % 24000 - 12000;
    const fortress = generator.megaStructureNear(x, z, 'ruined_fortress');
    assert.ok(fortress, `no Ruined Fortress within reach of ${x},${z} — the Titan would be unreachable`);
    worst = Math.max(worst, fortress.distance);
  }
  assert.ok(worst < 1600, `nearest fortress was ${Math.round(worst)} blocks away`);
});

test('the Rift generates: ground, growth, light and floating islands', () => {
  const per = census(rift(), 30);
  assert.ok(per('voidstone') > 1000, 'the Rift has almost no ground in it');
  assert.ok(per('pale_turf') > 50, 'nothing grows on the surface');
  assert.ok(per('aether_crystal') > 10, 'nothing lights the caves');
  assert.ok(per('riftwood_log') > 0, 'no trees');

  // Floating islands: solid ground well above the terrain, with nothing
  // holding it up. Without them the Rift is just a recoloured Overworld.
  const chunk = new Chunk(700, 700);
  rift().generateChunk(chunk);
  let aloft = 0;
  for (let y = 74; y <= 116; y++) {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) if (chunk.getBlock(x, y, z) !== 0) aloft++;
  }
  assert.ok(aloft > 0, 'no floating land at all');
  assert.ok(aloft < 43 * 256 * 0.6, 'the island band is a solid ceiling, not islands');
});

test('nothing in the Rift is placed outside the world', () => {
  const generator = rift();
  for (let i = 0; i < 12; i++) {
    const chunk = new Chunk(700 + i, 703);
    generator.generateChunk(chunk);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        assert.notEqual(chunk.getBlock(x, 0, z), 0, 'the world needs a floor to stand on');
        assert.equal(chunk.getBlock(x, CHUNK_HEIGHT - 1, z), 0, 'something is jammed against the ceiling');
      }
    }
  }
});

test('the Titan pays out, and its trophy cannot be obtained any other way', () => {
  const titan = CREATURES.eternal_titan;
  const drops = titan.drops.map((d) => d.id);
  for (const id of drops) assert.ok(ItemRegistry.get(id), `the Titan drops unknown item "${id}"`);
  assert.ok(drops.includes('titan_trophy'), 'there is no proof of the kill');
  assert.ok(drops.includes('titan_heart'), 'nothing to build the reward out of');
  assert.ok(titan.xp > 300, 'the hardest fight in the game should be worth the most');

  // The trophy has no recipe and no loot table entry — killing it is the only way.
  assert.ok(!RECIPES.some((r) => r.result.id === 'titan_trophy'), 'the trophy can be crafted, so it proves nothing');

  // The Heart buys the one piece of gear that is strictly better than
  // anything else in the game.
  const sigil = ItemRegistry.get('eternal_sigil');
  assert.ok(sigil, 'the Eternal Sigil is missing');
  assert.ok(sigil.amulet.ward > ItemRegistry.get('warding_amulet').amulet.ward,
    'the endgame amulet should beat the mid-game one');
  const recipe = RECIPES.find((r) => r.id === 'eternal_sigil');
  assert.ok(recipe.ingredients.some((i) => i.id === 'titan_heart'), 'the Sigil should cost a Titan Heart');
});

test('the Rift always offers a destination, before and after attunement', () => {
  // Arriving in the Rift with no bearing at all would mean searching a
  // dimension the size of the Overworld on foot. Before the player knows
  // where the Titan is, the signpost points at a Boss Outpost — because
  // killing what stands on one is how you find out.
  const source = readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf-8');
  const rift = source.slice(source.indexOf('eternal_rift: {'), source.indexOf('};', source.indexOf('eternal_rift: {')));
  assert.match(rift, /beforeAttuned/, 'the Rift has no stand-in destination before attunement');
  assert.match(rift, /titan_outpost/, 'the stand-in should be a Boss Outpost');

  // And an outpost has to have something on it worth killing.
  const outpost = MEGA_STRUCTURES.find((m) => m.id === 'titan_outpost');
  assert.ok(outpost, 'the Boss Outpost landmark is missing');
  assert.equal(outpost.guardian, 'riftbound_colossus');
  assert.ok(CREATURES[outpost.guardian]?.miniBoss, 'its guardian should be a mini-boss');

  // Both routes to attunement must exist: the kill, and the craftable compass.
  const compass = RECIPES.find((r) => r.id === 'rift_compass');
  assert.ok(compass, 'the Riftfinder cannot be crafted');
  assert.ok(CREATURES.riftbound_colossus.drops.some((d) => d.id === 'rift_compass'),
    'the Colossus should also be able to drop one');
});
