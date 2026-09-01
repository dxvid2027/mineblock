// The amulets. Both were bought with endgame materials and neither did what
// it said: the Warding Amulet was two points of defense with no warding of
// any kind, and the Vigor Amulet — "quickens the wearer's step and swing" —
// was read by no code anywhere in the game. It was a placebo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../src/blocks/BlockTypes.js';
import { ItemRegistry } from '../src/items/ItemRegistry.js';
import { registerBlockItems } from '../src/items/ItemTypes.js';
import { Inventory } from '../src/items/Inventory.js';

registerBlockItems();

const AMULETS = ItemRegistry.all().filter((item) => item.equipSlot === 'amulet');

test('every amulet in the game grants at least one power', () => {
  assert.ok(AMULETS.length >= 2, 'the amulets have gone missing');
  for (const amulet of AMULETS) {
    const powers = Object.entries(amulet.amulet ?? {}).filter(([, v]) => v > 0);
    const armour = (amulet.armor?.defense ?? 0) + (amulet.armor?.toughness ?? 0);
    assert.ok(powers.length > 0 || armour > 0,
      `"${amulet.id}" does nothing at all — it is a placebo the player pays endgame materials for`);
  }
});

test('an amulet that promises something in its description delivers it', () => {
  const promises = [
    ['warding_amulet', /wards? |turns aside/i, ['ward']],
    ['vigor_amulet', /faster|quick/i, ['haste', 'swiftness']]
  ];
  for (const [id, wording, powers] of promises) {
    const item = ItemRegistry.get(id);
    assert.ok(item, `${id} is missing`);
    assert.match(item.description, wording);
    for (const power of powers) {
      assert.ok((item.amulet?.[power] ?? 0) > 0,
        `"${id}" describes ${power} but grants none — exactly the bug this test exists for`);
    }
  }
});

test('amuletPower reads the worn amulet, and nothing else', () => {
  const inv = new Inventory();
  assert.equal(inv.amuletPower('haste'), 0, 'an empty neck grants nothing');

  inv.equipment.amulet = { id: 'vigor_amulet', count: 1 };
  assert.ok(inv.amuletPower('haste') > 0);
  assert.ok(inv.amuletPower('swiftness') > 0);
  assert.equal(inv.amuletPower('ward'), 0, 'the Vigor Amulet must not also ward');

  inv.equipment.amulet = { id: 'warding_amulet', count: 1 };
  assert.ok(inv.amuletPower('ward') > 0);
  assert.equal(inv.amuletPower('haste'), 0, 'the Warding Amulet must not also hasten');

  // Carrying one in a pocket is not wearing it.
  inv.equipment.amulet = null;
  inv.addItem('vigor_amulet', 1);
  assert.equal(inv.amuletPower('haste'), 0);
});

test('an unknown power name is zero, not undefined', () => {
  const inv = new Inventory();
  inv.equipment.amulet = { id: 'warding_amulet', count: 1 };
  assert.equal(inv.amuletPower('nonsense'), 0);
});

test('the Warding Amulet counts toward armour as well as warding', () => {
  const inv = new Inventory();
  const bare = inv.totalDefense();
  inv.equipment.amulet = { id: 'warding_amulet', count: 1 };
  const worn = inv.totalDefense();
  assert.ok(worn.defense > bare.defense, 'it should still be worth an armour point or two');
});
