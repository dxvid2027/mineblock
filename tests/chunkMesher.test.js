// Guards the chunk mesher's face winding. The opaque terrain material renders
// FrontSide only, so a quad wound the wrong way is silently culled and the
// block turns see-through from that direction — which is exactly how the
// ground and cave floors/ceilings once became transparent. Cheap to assert,
// very hard to spot by eye.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/world/ChunkMesher.js'), 'utf-8');

/** Pulls the FACES table out of the module source without importing three.js. */
function parseFaces() {
  const start = source.indexOf('const FACES = [');
  assert.ok(start !== -1, 'FACES table not found in ChunkMesher.js');
  const end = source.indexOf('];', start);
  const body = source.slice(start + 'const FACES = ['.length, end);

  const faces = [];
  const entry = /\{\s*dir:\s*\[([-\d,\s]+)\][^}]*?name:\s*'(\w+)'[^}]*?corners:\s*\[(.*?)\]\s*\}/gs;
  let m;
  while ((m = entry.exec(body)) !== null) {
    const dir = m[1].split(',').map((n) => Number(n.trim()));
    const corners = [...m[3].matchAll(/\[\s*(\d)\s*,\s*(\d)\s*,\s*(\d)\s*\]/g)]
      .map((c) => [Number(c[1]), Number(c[2]), Number(c[3])]);
    faces.push({ dir, name: m[2], corners });
  }
  return faces;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const normalize = (v) => {
  const len = Math.hypot(...v);
  return len === 0 ? v : v.map((c) => c / len);
};

test('every cube face has exactly 4 corners', () => {
  const faces = parseFaces();
  assert.equal(faces.length, 6, 'expected 6 cube faces');
  for (const face of faces) {
    assert.equal(face.corners.length, 4, `${face.name} should have 4 corners`);
  }
});

test('face winding produces an outward normal matching its direction', () => {
  const faces = parseFaces();
  for (const face of faces) {
    const [c0, c1, c2] = face.corners;
    const normal = normalize(cross(sub(c1, c0), sub(c2, c1)));
    assert.deepEqual(
      // `|| 0` collapses -0 to 0 so the comparison is about direction only.
      normal.map((n) => Math.round(n) || 0),
      face.dir,
      `face "${face.name}" (dir ${face.dir}) winds inward: computed normal ${normal}. ` +
      'Reverse its corner order, or it will be backface-culled and render as see-through.'
    );
  }
});

test('all six axis directions are covered exactly once', () => {
  const faces = parseFaces();
  const seen = faces.map((f) => f.dir.join(',')).sort();
  assert.deepEqual(seen, [
    '-1,0,0', '0,-1,0', '0,0,-1', '0,0,1', '0,1,0', '1,0,0'
  ]);
});
