// The HUD's vitals icons, drawn as pixel art rather than smooth vector
// shapes so they sit in the same world as the blocks and items — which are
// all painted on a pixel grid, with flat tone steps and one light direction
// coming from the upper left.
//
// Each icon is a small character grid. That keeps the shape editable by eye
// (you can see the heart in the source) and keeps the drawing code to one
// function. Every grid is turned into SVG once at module load; the HUD asks
// for the finished markup many times a second and must not be re-rasterising
// anything.

/** Palette letters shared by every grid. '.' is transparent. */
const OUTLINE = 'o';
const BASE = 'b';
const LIGHT = 'l';
const SHADE = 's';
const BONE = 'k';

// Nine across, eight down: wide enough for two lobes and a point, small
// enough that every pixel is a deliberate decision.
const HEART = [
  '.oo...oo.',
  'ollo.obbo',
  'ollbobbso',
  'olbbbbsso',
  '.obbbssso',
  '..obbso..',
  '...obo...',
  '....o....'
];

// Meat on a bone: a round joint up top, a shaft below it, a knob at the end.
// The silhouette is what has to carry at 22px, not the shading.
const DRUMSTICK = [
  '..ooooo..',
  '.obbbbbo.',
  'oblllbbso',
  'obllbbbso',
  'obbbbbbso',
  '.obbbbso.',
  '..ookoo..',
  '..okkko..',
  '...ooo...'
];

const SHIELD = [
  'ooooooooo',
  'ollbbbbso',
  'ollbbbbso',
  'olbbbbbso',
  '.obbbbbo.',
  '..obbbo..',
  '...obo...',
  '....o....'
];

/**
 * Turns one grid into SVG rects, merging horizontal runs of the same colour
 * so ten hearts stay a few dozen elements rather than a few hundred.
 */
function pixelSvg(grid, palette, className) {
  const width = grid[0].length, height = grid.length;
  let rects = '';
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const ch = grid[y][x];
      let run = 1;
      while (x + run < width && grid[y][x + run] === ch) run++;
      const fill = palette[ch];
      if (fill) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
      x += run;
    }
  }
  // shape-rendering keeps the edges hard at any size — a pixel icon that the
  // browser antialiases just looks like a blurry vector one.
  return `<svg viewBox="0 0 ${width} ${height}" class="bar-icon ${className}" shape-rendering="crispEdges">${rects}</svg>`;
}

/** Left half of a grid in one palette, right half in another. */
function splitSvg(grid, left, right, className) {
  const middle = Math.floor(grid[0].length / 2);
  const merged = grid.map((row) => row);
  let rects = '';
  for (let y = 0; y < merged.length; y++) {
    for (let x = 0; x < merged[y].length; x++) {
      const fill = (x <= middle ? left : right)[merged[y][x]];
      if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  }
  return `<svg viewBox="0 0 ${grid[0].length} ${grid.length}" class="bar-icon ${className}" shape-rendering="crispEdges">${rects}</svg>`;
}

// Deep crimson with a cooler shadow and a bright glint on the left lobe —
// the same upper-left light the block textures use.
const HEART_FULL = { [OUTLINE]: '#5c1220', [BASE]: '#d92f43', [LIGHT]: '#ff8fa0', [SHADE]: '#9c1c30' };
const HEART_GONE = { [OUTLINE]: '#8d7a7c', [BASE]: '#ded0d1', [LIGHT]: '#efe6e7', [SHADE]: '#cbb9bb' };
const HUNGER_FULL = { [OUTLINE]: '#5a3210', [BASE]: '#d98a2b', [LIGHT]: '#f7c877', [SHADE]: '#a35f16', [BONE]: '#f2e6cd' };
const HUNGER_GONE = { [OUTLINE]: '#8a7f6d', [BASE]: '#ded5c2', [LIGHT]: '#efe9dc', [SHADE]: '#c8bda6', [BONE]: '#f1ece1' };
const ARMOR_FULL = { [OUTLINE]: '#2f3a52', [BASE]: '#8592ad', [LIGHT]: '#cfd8e8', [SHADE]: '#5d6a86' };
const ARMOR_GONE = { [OUTLINE]: '#9aa1ad', [BASE]: '#dfe3ea', [LIGHT]: '#f0f3f7', [SHADE]: '#c6ccd6' };

// Built once. These never change, and the HUD reaches for them every frame.
const HEARTS = {
  full: pixelSvg(HEART, HEART_FULL, 'heart full'),
  half: splitSvg(HEART, HEART_FULL, HEART_GONE, 'heart half'),
  empty: pixelSvg(HEART, HEART_GONE, 'heart empty')
};
const DRUMSTICKS = {
  full: pixelSvg(DRUMSTICK, HUNGER_FULL, 'hunger full'),
  half: splitSvg(DRUMSTICK, HUNGER_FULL, HUNGER_GONE, 'hunger half'),
  empty: pixelSvg(DRUMSTICK, HUNGER_GONE, 'hunger empty')
};
const SHIELDS = {
  full: pixelSvg(SHIELD, ARMOR_FULL, 'armor full'),
  half: splitSvg(SHIELD, ARMOR_FULL, ARMOR_GONE, 'armor half'),
  empty: pixelSvg(SHIELD, ARMOR_GONE, 'armor empty')
};

export function heartIconMarkup(state) { return HEARTS[state] ?? HEARTS.empty; }
export function drumstickIconMarkup(state) { return DRUMSTICKS[state] ?? DRUMSTICKS.empty; }
export function shieldIconMarkup(state) { return SHIELDS[state] ?? SHIELDS.empty; }
