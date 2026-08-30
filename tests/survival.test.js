// Dying, and the floor of the world. Both were reported from play: the
// bottom layer could be mined through, dropping the player out of the world,
// and death did nothing at all — the player sat at zero health, neither
// alive nor dead, with the game still running.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BlockRegistry } from '../src/blocks/BlockRegistry.js';
import '../src/blocks/BlockTypes.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';
import { Player } from '../src/entities/Player.js';
import { globalEvents } from '../src/core/EventBus.js';
import { DIMENSIONS } from '../src/dimensions/Dimensions.js';
import { Chunk, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/world/Chunk.js';

registerBlockItems();

test('the bottom layer of every dimension is unbreakable', () => {
  const root = BlockRegistry.byName('worldroot');
  assert.ok(root, 'there is no worldroot block');
  assert.equal(root.unbreakable, true);

  for (const dimId of Object.keys(DIMENSIONS)) {
    const gen = DIMENSIONS[dimId].createGenerator(4242);
    const chunk = new Chunk(3, -5);
    gen.generateChunk(chunk);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const id = chunk.getBlock(x, 0, z);
        assert.equal(BlockRegistry.get(id)?.name, 'worldroot',
          `${dimId} has a breakable block at y=0 (${x},${z}), so a player could dig out of the world`);
      }
    }
  }
});

test('an unbreakable block reports an infinite mining time', async () => {
  // miningTime is not exported, so this checks the property the breaking
  // code branches on rather than reaching into it.
  const root = BlockRegistry.byName('worldroot');
  assert.equal(root.unbreakable, true);
  assert.ok(!Number.isFinite(root.hardness), 'worldroot should have no finite hardness either');
});

test('a killing blow announces the death', () => {
  const player = new Player();
  let announced = 0;
  const off = globalEvents.on('player:died', () => announced++);

  player.health = 3;
  player.damage(40, { ignoreInvuln: true });
  off();

  assert.equal(player.alive, false, 'the player should be dead');
  assert.equal(announced, 1, 'death must be announced exactly once, or nothing reacts to it');
});

test('a totem stops the death being announced at all', () => {
  const player = new Player();
  player.inventory.offhand = { id: 'warding_totem', count: 1 };
  let announced = 0;
  const off = globalEvents.on('player:died', () => announced++);

  player.health = 3;
  player.damage(40, { ignoreInvuln: true });
  off();

  assert.equal(player.alive, true);
  assert.equal(announced, 0, 'a saved player must not fire the death path');
});

test('respawning restores a player fully', () => {
  const player = new Player();
  player.health = 2;
  player.hunger = 1;
  player.damage(40, { ignoreInvuln: true });
  player.respawn();

  assert.equal(player.alive, true);
  assert.equal(player.health, player.maxHealth);
  assert.equal(player.hunger, player.maxHunger);
});
