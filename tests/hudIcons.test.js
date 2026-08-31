// The vitals icons are hand-typed character grids. A row one character short
// is not a crash — it silently produces a lopsided icon that nobody notices
// until it is on screen — so the grids are checked here rather than by eye.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { heartIconMarkup, drumstickIconMarkup, shieldIconMarkup } from '../src/ui/icons.js';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/icons.js'), 'utf-8');

/** Pulls a grid literal out of the module source, without exporting internals. */
function grid(name) {
  const start = source.indexOf(`const ${name} = [`);
  assert.ok(start !== -1, `grid "${name}" not found`);
  const end = source.indexOf('];', start);
  return [...source.slice(start, end).matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

for (const name of ['HEART', 'DRUMSTICK', 'SHIELD']) {
  test(`the ${name} grid is rectangular and uses only known colours`, () => {
    const rows = grid(name);
    assert.ok(rows.length >= 6, `${name} has only ${rows.length} rows`);
    const width = rows[0].length;
    for (const [i, row] of rows.entries()) {
      assert.equal(row.length, width,
        `${name} row ${i} is ${row.length} characters, the others are ${width} — the icon would come out lopsided`);
      for (const ch of row) {
        assert.ok('.obsk l'.includes(ch) && ch !== ' ',
          `${name} row ${i} uses "${ch}", which is not a palette letter, so those pixels vanish`);
      }
    }
  });
}

test('each state of an icon looks different from the others', () => {
  for (const [label, markup] of [['heart', heartIconMarkup], ['hunger', drumstickIconMarkup], ['armor', shieldIconMarkup]]) {
    const [full, half, empty] = ['full', 'half', 'empty'].map(markup);
    assert.notEqual(full, empty, `${label}: a full icon must not look like an empty one`);
    assert.notEqual(full, half, `${label}: a full icon must not look like a half one`);
    assert.notEqual(half, empty, `${label}: a half icon must not look like an empty one`);
    for (const svg of [full, half, empty]) {
      assert.match(svg, /^<svg /, `${label}: markup should be an svg element`);
      assert.match(svg, /shape-rendering="crispEdges"/, `${label}: pixel art must not be antialiased into mush`);
      assert.ok((svg.match(/<rect/g) ?? []).length > 8, `${label}: suspiciously few pixels drawn`);
    }
  }
});

test('an icon is built once, not rebuilt on every call', () => {
  // The HUD asks for these many times a second; they must be constants.
  assert.equal(heartIconMarkup('full'), heartIconMarkup('full'));
  assert.ok(Object.is(heartIconMarkup('full'), heartIconMarkup('full')),
    'the same string instance should come back, not a freshly built one');
});

test('an unknown state falls back to empty rather than rendering nothing', () => {
  assert.equal(heartIconMarkup('nonsense'), heartIconMarkup('empty'));
});
