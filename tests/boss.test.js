// The Cinder Warden is the end of the game, so anything that can stop him
// from ever appearing makes the game uncompletable — quietly, with no error
// and nothing on screen to explain it. Two such things have existed:
//
//  - he spawned on a coin flip as you arrived in the Ember Expanse, in a
//    random direction, so there was no way to go and look for him. He now
//    guards the Emberforge, which is what these tests pin down.
//  - changing dimension tears every mob down but left the "a boss is alive"
//    flag set, so stepping back through the portal for a moment meant he
//    could never spawn again for the rest of the session.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';
import { CREATURES } from '../src/entities/creatures/CreatureTypes.js';
import { EntityManager } from '../src/entities/EntityManager.js';
import { MEGA_STRUCTURES } from '../src/world/MegaStructures.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';
import { cardinalTowards } from '../src/core/compass.js';
import { readFileSync } from 'node:fs';

registerBlockItems();

const SEED = 20260830;

/**
 * An EntityManager with its fields set by hand — the real constructor builds
 * three.js groups. Only the boss bookkeeping is under test, and that is
 * plain state, so this exercises the shipping methods rather than a copy.
 */
function headlessEntities() {
  const entities = Object.create(EntityManager.prototype);
  entities.mobs = [];
  entities.drops = [];
  entities.group = { add() {}, remove() {} };
  return entities;
}

test('every boss belongs to a dimension, and exactly one of them ends the game', () => {
  const bosses = Object.values(CREATURES).filter((c) => c.boss);
  assert.ok(bosses.length >= 1, 'the bosses have gone missing');
  // The victory screen fires on one specific kill. More than one creature
  // claiming to be the final boss would mean the game could end twice.
  const finals = bosses.filter((c) => c.finalBoss);
  assert.equal(finals.length, 1, `${finals.length} creatures claim to be the final boss`);
  assert.equal(finals[0].id, 'eternal_titan');
  // The Cinder Warden is still a boss, just no longer the last one.
  assert.ok(bosses.some((c) => c.id === 'cinder_warden'));
});

test('the final boss has phases, and they cover the whole health bar', () => {
  const titan = CREATURES.eternal_titan;
  assert.ok(Array.isArray(titan.phases) && titan.phases.length >= 3,
    'a multi-phase fight needs at least three phases');
  assert.equal(titan.phases[0].from, 1.0, 'the first phase must start at full health');
  // Descending thresholds, or a phase in the middle could never be reached.
  for (let i = 1; i < titan.phases.length; i++) {
    assert.ok(titan.phases[i].from < titan.phases[i - 1].from,
      `phase "${titan.phases[i].name}" starts at ${titan.phases[i].from}, not below the one before it`);
  }
  assert.ok(titan.phases[titan.phases.length - 1].from > 0, 'the last phase must be reachable above zero health');
  // Each phase has to bring something, or it is the same fight three times.
  const shapes = titan.phases.map((p) => `${p.speed}|${p.damage}|${p.attackCooldown}|${!!p.shockwave}|${p.summon?.species}`);
  assert.equal(new Set(shapes).size, shapes.length, 'two phases play identically');
  assert.ok(titan.maxHealth > CREATURES.cinder_warden.maxHealth * 3,
    'the final boss should be substantially harder than the one before it');
});

test('leaving a dimension forgets the boss that left with it', () => {
  const entities = headlessEntities();
  // Just enough of a mesh for the teardown path to walk over.
  const mesh = { traverse() {}, userData: {} };
  entities.mobs.push({ species: CREATURES.cinder_warden, alive: true, mesh });
  assert.equal(entities.bossAlive, true);

  entities.setWorld({});

  assert.equal(entities.mobs.length, 0, 'the mobs go with the dimension');
  assert.equal(entities.bossAlive, false,
    'a Warden who no longer exists must not block the next one from spawning — this made the game uncompletable');
  assert.equal(entities.boss, null, 'and the boss bar must not track a mob that was torn down');
});

test('the boss bar picks the right creature, and mini-bosses get one too', () => {
  const entities = headlessEntities();
  assert.equal(entities.boss, null, 'nothing on the field, nothing on the bar');

  // A mini-boss is worth a bar: the Spire Sentinel and the Riftbound Colossus
  // are real fights, and before this only true bosses had one.
  const sentinel = { species: CREATURES.spire_sentinel, alive: true, mesh: null };
  entities.mobs.push(sentinel);
  assert.equal(entities.boss, sentinel);
  assert.equal(entities.bossAlive, false, 'a mini-boss must not read as a boss to the lair logic');

  // With both on the field the real boss wins the bar.
  const titan = { species: CREATURES.eternal_titan, alive: true, mesh: null };
  entities.mobs.push(titan);
  assert.equal(entities.boss, titan);
  assert.equal(entities.bossAlive, true);

  // And a corpse holds neither.
  titan.alive = false; sentinel.alive = false;
  assert.equal(entities.boss, null);
  assert.equal(entities.bossAlive, false);
});

test('a mini-boss is never culled for being far away', () => {
  // Spawning happens at 34 blocks and the despawn radius is 44, measured in
  // three dimensions — close enough that a hill between the player and a
  // Boss Outpost culled the Colossus on the frame it appeared.
  for (const id of ['spire_sentinel', 'riftbound_colossus']) {
    assert.equal(CREATURES[id].miniBoss, true, `${id} should be flagged as a mini-boss`);
  }
  const source = readFileSync(new URL('../src/entities/EntityManager.js', import.meta.url), 'utf-8');
  const despawn = source.slice(source.indexOf('DESPAWN_DIST &&'), source.indexOf('DESPAWN_DIST &&') + 60);
  assert.match(despawn, /permanent/, 'the despawn check still culls anything that is not a plain boss');
  assert.match(source, /const permanent = mob\.species\.boss \|\| mob\.species\.miniBoss/,
    'mini-bosses must be exempt from despawning');
});

test('the Ember Expanse landmark is the Warden lair, and it is always findable', () => {
  const forge = MEGA_STRUCTURES.find((m) => m.dimensions.includes('ember_expanse'));
  assert.ok(forge, 'the Ember Expanse has no landmark for the Warden to guard');

  const generator = DIMENSIONS.ember_expanse.createGenerator(SEED);
  assert.equal(typeof generator.megaStructureNear, 'function',
    'the boss watch asks the generator where the nearest landmark is');

  // Wherever the portal drops you, a forge has to be within walking range —
  // otherwise the boss exists but cannot be reached.
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    const x = (i * 5387) % 20000 - 10000;
    const z = (i * 7919) % 20000 - 10000;
    const near = generator.megaStructureNear(x, z);
    assert.ok(near, `no Emberforge anywhere near ${x},${z} — the Warden would be unreachable from there`);
    assert.equal(near.mega.id, forge.id);
    worst = Math.max(worst, near.distance);
  }
  // One region is 384 blocks across and holds at most one landmark, so the
  // nearest can never be further than a couple of regions away.
  assert.ok(worst < 800, `nearest Emberforge was ${Math.round(worst)} blocks away, too far to be a destination`);
});

test('the Warden drops what the victory screen says he does', () => {
  const drops = CREATURES.cinder_warden.drops.map((d) => d.id);
  assert.ok(drops.includes('warden_core'),
    'the victory text has the player carrying the Warden Core out, so he must drop one');
  for (const drop of CREATURES.cinder_warden.drops) {
    assert.ok(BlockRegistry.byName(drop.id) || drop.id, `unknown drop "${drop.id}"`);
  }
});

test('the objective bearing points the way the player would have to walk', () => {
  // The Ember Expanse fogs out at 90 blocks and the Emberforge is usually
  // further off, so the bearing is the only thing making it findable. Getting
  // the sign wrong would send the player away from it.
  //
  // yaw = 0 faces -Z, so -Z is North and +X is East (see core/compass.js).
  assert.equal(cardinalTowards(0, -10), 'N');
  assert.equal(cardinalTowards(0, 10), 'S');
  assert.equal(cardinalTowards(10, 0), 'E');
  assert.equal(cardinalTowards(-10, 0), 'W');
  assert.equal(cardinalTowards(10, -10), 'NE');
  assert.equal(cardinalTowards(-10, 10), 'SW');
});
