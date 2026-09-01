// Movement rules that decide whether a creature can reach the player at all.
// Both of the bugs these cover were invisible from the code: the boss looked
// like it was chasing, because it was — it just never arrived.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { Entity } from '../src/entities/Entity.js';

const STONE = BlockRegistry.idOf('stone');

/** A world made of a floor plus whatever extra blocks a test names. */
function slab(extra = []) {
  const solid = new Set(extra.map(([x, y, z]) => `${x},${y},${z}`));
  return {
    getBlockGlobal(x, y, z) {
      if (y < 0) return STONE;
      if (y === 0) return STONE; // ground everyone stands on
      return solid.has(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ? STONE : 0;
    },
    isSolidGlobal(x, y, z) { return BlockRegistry.isSolid(this.getBlockGlobal(x, y, z)); }
  };
}

/** Runs an entity forward along +x for a while and reports how far it got. */
function walk(entity, world, seconds = 2, speed = 3) {
  const startX = entity.position.x;
  for (let i = 0; i < seconds * 60; i++) {
    entity.velocity.x = speed;
    entity.physicsStep(1 / 60, world);
  }
  return entity.position.x - startX;
}

test('a mob steps up a one-block ledge instead of stopping against it', () => {
  // A one-block rise that keeps going, which is what a hillside looks like.
  const world = slab([[3, 1, 0], [4, 1, 0], [5, 1, 0], [6, 1, 0]]);
  const mob = new Entity({ width: 0.7, height: 1.8 });
  mob.stepHeight = 1.02;
  mob.position.set(0, 1, 0.5);
  mob.onGround = true;

  const travelled = walk(mob, world);
  assert.ok(travelled > 3, `a mob with a step height only got ${travelled.toFixed(2)} blocks — it is stuck on the ledge`);
  assert.ok(mob.position.y >= 2, 'and it should end up standing on top of the block, not beside it');
});

test('the player does not step up on their own — that is what jumping is for', () => {
  const world = slab([[3, 1, 0]]);
  const player = new Entity({ width: 0.6, height: 1.8 }); // stepHeight stays 0
  player.position.set(0, 1, 0.5);
  player.onGround = true;

  assert.ok(walk(player, world) < 3, 'the player should be stopped by a one-block wall');
});

test('a step up onto blocked space is refused rather than clipping into it', () => {
  // A ledge with a low ceiling over it: stepping up would bury the entity.
  const world = slab([[3, 1, 0], [3, 2, 0], [3, 3, 0]]);
  const mob = new Entity({ width: 0.7, height: 1.8 });
  mob.stepHeight = 1.02;
  mob.position.set(0, 1, 0.5);
  mob.onGround = true;

  walk(mob, world);
  assert.ok(!mob._collidesWorld(world, mob.aabbAt(mob.position)),
    'the entity ended up inside solid rock');
});

test('a body wider than two blocks cannot fit through ordinary terrain', () => {
  // Why Mob caps the collision box well below the Warden's four-block model:
  // a gap one block wide is a doorway to a normal creature and a wall to a
  // wide one, and the Warden spends its life in corridors and forge yards.
  const gap = [];
  for (let y = 1; y <= 4; y++) { gap.push([3, y, -1]); gap.push([3, y, 1]); } // gap open at z=0
  const world = slab(gap);

  const narrow = new Entity({ width: 0.7, height: 1.8 });
  narrow.position.set(0, 1, 0.5); narrow.onGround = true;
  const wide = new Entity({ width: 2.4, height: 1.8 });
  wide.position.set(0, 1, 0.5); wide.onGround = true;

  assert.ok(walk(narrow, world) > 3, 'a normal creature should walk through the gap');
  assert.ok(walk(wide, world) < 3, 'a four-block-wide box should not fit, which is the whole reason the hitbox is capped');
});

test('reach is measured from the edge of the body, so a big creature can land a hit', () => {
  // The rule Mob applies: reach = ATTACK_REACH + bodyWidth / 2. It has to
  // exceed how close the two bodies can physically get, or the creature
  // stands next to the player swinging at nothing — which is what the Cinder
  // Warden did, stalling at 2.92 blocks with a flat 1.6 reach.
  const ATTACK_REACH = 1.3;
  for (const [label, bodyWidth, hitboxWidth] of [['beetle', 0.7, 0.7], ['warden', 2.4, 1.2]]) {
    const reach = ATTACK_REACH + bodyWidth / 2;
    const closest = hitboxWidth / 2 + 0.6 / 2; // its box against the player's
    assert.ok(reach > closest,
      `${label}: reach ${reach.toFixed(2)} does not cover the ${closest.toFixed(2)} blocks the bodies keep between them`);
  }
});
