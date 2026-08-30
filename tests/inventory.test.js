// Quick-move (shift + click) plumbing: insertIntoSlots is what every "send
// this stack over there" gesture in the UI runs on, so its edge cases —
// partial fits, stack-size limits, tools that must never merge — are worth
// pinning down without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertIntoSlots, HOTBAR_SIZE } from '../src/items/Inventory.js';
import '../src/blocks/BlockTypes.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';

registerBlockItems();

test('a stack fills empty slots and reports nothing left over', () => {
  const slots = new Array(4).fill(null);
  const leftover = insertIntoSlots(slots, { id: 'cobbled_stone', count: 12 });
  assert.equal(leftover, null);
  assert.deepEqual(slots[0], { id: 'cobbled_stone', count: 12 });
  assert.equal(slots[1], null);
});

test('stacking tops up a matching slot before using an empty one', () => {
  const slots = [{ id: 'cobbled_stone', count: 60 }, null];
  const leftover = insertIntoSlots(slots, { id: 'cobbled_stone', count: 10 });
  assert.equal(leftover, null);
  assert.equal(slots[0].count, 64);
  assert.equal(slots[1].count, 6);
});

test('what does not fit comes back instead of vanishing', () => {
  const slots = [{ id: 'cobbled_stone', count: 64 }];
  const leftover = insertIntoSlots(slots, { id: 'cobbled_stone', count: 5 });
  assert.deepEqual(leftover, { id: 'cobbled_stone', count: 5 });
});

test('a full container leaves the stack untouched', () => {
  const slots = [{ id: 'ruddle_ingot', count: 1 }];
  const leftover = insertIntoSlots(slots, { id: 'cobbled_stone', count: 3 });
  assert.equal(leftover.count, 3);
  assert.equal(slots[0].id, 'ruddle_ingot');
});

test('items with durability never merge into one slot', () => {
  const slots = new Array(3).fill(null);
  insertIntoSlots(slots, { id: 'wood_pickaxe', count: 1, durability: 40 });
  const leftover = insertIntoSlots(slots, { id: 'wood_pickaxe', count: 1, durability: 12 });
  assert.equal(leftover, null);
  assert.equal(slots[0].durability, 40);
  assert.equal(slots[1].durability, 12);
});

test('worn equipment, which carries no count, moves as a single item', () => {
  const slots = new Array(2).fill(null);
  const leftover = insertIntoSlots(slots, { id: 'ruddle_helmet', durability: 90 });
  assert.equal(leftover, null);
  assert.equal(slots[0].count, 1);
  assert.equal(slots[0].durability, 90);
});

test('a slot range confines the move, which is how hotbar <-> storage works', () => {
  const slots = new Array(36).fill(null);
  const leftover = insertIntoSlots(slots, { id: 'cobbled_stone', count: 8 }, HOTBAR_SIZE, slots.length);
  assert.equal(leftover, null);
  assert.equal(slots[0], null);
  assert.equal(slots[HOTBAR_SIZE].count, 8);
});
