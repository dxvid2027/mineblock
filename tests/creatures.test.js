// The creature roster is data, and its visual fields are looked up by name
// at render time: a typo in `shape` or `skin` does not throw, it silently
// falls back to a default model, which is the kind of thing that ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATURES } from '../src/entities/creatures/CreatureTypes.js';
import { MOB_SHAPES } from '../src/render/MobModels.js';
import { MOB_SKINS } from '../src/render/MobSkins.js';

test('every creature names a model shape that exists', () => {
  for (const c of Object.values(CREATURES)) {
    assert.ok(c.shape, `creature "${c.id}" has no shape`);
    assert.ok(MOB_SHAPES.includes(c.shape), `creature "${c.id}" wants unknown shape "${c.shape}"`);
  }
});

test('every creature names a skin that exists', () => {
  for (const c of Object.values(CREATURES)) {
    assert.ok(c.skin, `creature "${c.id}" has no skin`);
    assert.ok(MOB_SKINS.includes(c.skin), `creature "${c.id}" wants unknown skin "${c.skin}"`);
  }
});

test('no model shape is left unused by the roster', () => {
  const used = new Set(Object.values(CREATURES).map((c) => c.shape));
  for (const shape of MOB_SHAPES) {
    assert.ok(used.has(shape), `model shape "${shape}" is built but no creature uses it`);
  }
});

test('every creature has the two colors its model is built from', () => {
  for (const c of Object.values(CREATURES)) {
    assert.equal(typeof c.color, 'number', `creature "${c.id}" has no color`);
    assert.equal(typeof c.accentColor, 'number', `creature "${c.id}" has no accentColor`);
  }
});

// The accent color is what eyes, flames and vents are drawn in, unlit and at
// full strength. A dark accent makes those parts vanish into the body — the
// Rockjaw shipped that way until it was seen side by side with the others.
test('accent colors are bright enough to read as a highlight', () => {
  const luminance = (hex) => {
    const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const c of Object.values(CREATURES)) {
    const accent = luminance(c.accentColor);
    const body = luminance(c.color);
    assert.ok(
      accent > 0.35 || Math.abs(accent - body) > 0.18,
      `creature "${c.id}" accent #${c.accentColor.toString(16)} is too dark and too close to its body color to show up`
    );
  }
});
