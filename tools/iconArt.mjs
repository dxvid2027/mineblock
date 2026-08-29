// Procedural geometry/color generator for the MineBlock app icon — an
// original isometric "grass block" mark in MineBlock's own palette
// (matches src/blocks/BlockTypes.js's grassy_sod colors), built the same
// way the in-game textures are: algorithmic shapes + deterministic noise,
// no external art. Pure math/data — no DOM/canvas here, so this file can
// be `import`ed from plain Node (for the SVG writer) as well as evaluated
// inside a browser page (for the PNG renderer). See tools/generate-icons.mjs.

const TAU = Math.PI * 2;
const ANGLE = Math.PI / 6; // 30°, classic isometric

function hash(i, j, k, salt) {
  let h = Math.imul(i * 374761393 + j * 668265263 + k * 2147483647 + salt, 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 3266489917);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function mix(a, b, t) { return a + (b - a) * t; }

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * factor));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * factor));
  const b = Math.max(0, Math.min(255, (n & 255) * factor));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/**
 * Builds the icon as a flat list of 2D polygon cells (already projected),
 * plus layout metadata for a background glow / drop shadow / highlight.
 * `contentScale` shrinks the cube (used for the Android "maskable" variant,
 * which needs its important content inside a smaller safe zone).
 */
export function buildIcon(size, { contentScale = 1 } = {}) {
  const S = 8; // cube edge, in grid cells — matches the blocky look of the in-game atlas
  const unit = (size * 0.30 * contentScale) / S;
  const cx = size / 2;
  const cy = size / 2 + unit * S * 0.32;

  const ux = [Math.cos(ANGLE), Math.sin(ANGLE)];
  const uz = [-Math.cos(ANGLE), Math.sin(ANGLE)];
  const project = (x, y, z) => [
    cx + (x * ux[0] + z * uz[0]) * unit,
    cy + (x * ux[1] + z * uz[1] - y) * unit
  ];

  const GRASS_TOP = '#6bb84a';
  const GRASS_SIDE = '#5a9e3f';
  const DIRT = '#8a6135';

  const cells = [];
  const quad = (p00, p10, p11, p01, color) => cells.push({ points: [p00, p10, p11, p01], color });

  // --- Top face (grass), y = S ---
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < S; j++) {
      const checker = (i + j) % 2 === 0 ? 1.06 : 0.96;
      const noise = 0.94 + hash(i, j, 1, 11) * 0.14;
      const edge = (i === 0 || j === 0 || i === S - 1 || j === S - 1) ? 0.93 : 1;
      const col = shade(GRASS_TOP, checker * noise * edge);
      quad(project(i, S, j), project(i + 1, S, j), project(i + 1, S, j + 1), project(i, S, j + 1), col);
    }
  }

  // Overhang depth per column, independent per visible side face.
  const overhang = (face, k) => {
    const r = hash(k, 0, face, 77);
    if (r < 0.55) return 0;
    if (r < 0.85) return 1;
    return 2;
  };

  // --- Right face (x = S), brighter — light source upper-right ---
  for (let k = 0; k < S; k++) {
    const depth = overhang(1, k);
    for (let h = 0; h < S; h++) {
      const isRim = h === S - 1;
      const isOverhang = h >= S - 1 - depth;
      const grassy = isRim || isOverhang;
      const noise = 0.94 + hash(k, h, 2, 23) * 0.14;
      const ao = mix(0.78, 1.02, h / (S - 1));
      const col = grassy ? shade(GRASS_SIDE, 0.98 * noise) : shade(DIRT, 0.92 * noise * ao);
      quad(project(S, h, k), project(S, h, k + 1), project(S, h + 1, k + 1), project(S, h + 1, k), col);
    }
  }

  // --- Left face (z = S), darker — away from the light ---
  for (let i = 0; i < S; i++) {
    const depth = overhang(2, i);
    for (let h = 0; h < S; h++) {
      const isRim = h === S - 1;
      const isOverhang = h >= S - 1 - depth;
      const grassy = isRim || isOverhang;
      const noise = 0.9 + hash(i, h, 3, 41) * 0.14;
      const ao = mix(0.62, 0.86, h / (S - 1));
      const col = grassy ? shade(GRASS_SIDE, 0.74 * noise) : shade(DIRT, 0.72 * noise * ao);
      quad(project(i, h, S), project(i + 1, h, S), project(i + 1, h + 1, S), project(i, h + 1, S), col);
    }
  }

  const topCorner = project(0, S, 0);
  const bottomCorner = project(S, 0, S);
  const leftCorner = project(0, 0, S);
  const rightCorner = project(S, 0, 0);

  return {
    cells,
    meta: {
      cx, cy,
      top: topCorner[1],
      bottom: bottomCorner[1],
      left: Math.min(leftCorner[0], topCorner[0]),
      right: Math.max(rightCorner[0], topCorner[0]),
      glowY: cy - unit * S * 0.15
    }
  };
}
