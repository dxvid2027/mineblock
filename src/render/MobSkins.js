import * as THREE from 'three';
import { pixelArt } from './PatternDraw.js';

// Creature hides, drawn with the same pixel-art toolkit as the blocks so a
// Grazer standing on grass looks like it belongs to the same world: wrapping
// noise quantized into flat tone steps, integer-aligned shapes, one light
// direction. Every skin is generated here — no image files.

const { makeRng, makeNoise, paint, px, step, shade, shadeRgb, mixRgb, hexToRgb, css } = pixelArt;

const SKIN_TILE = 32;
const cache = new Map();

const SKINS = {
  /** Short-haired hide with irregular patches, for grazing animals. */
  hide(ctx, size, base, accent, rng) {
    const a = hexToRgb(base), b = hexToRgb(accent);
    const patch = makeNoise(rng, 3), grain = makeNoise(rng, 9);
    paint(ctx, size, (x, y) => {
      // Patches are a hard threshold rather than a blend: a blotchy hide
      // reads at a distance, a gradient does not.
      const spotted = patch(x, y, size) > 0.62;
      const c = spotted ? b : a;
      return shadeRgb(c, (step(grain(x, y, size), 3) - 0.5) * 16);
    });
  },

  /** Dense shaggy coat: short strokes lying in one direction. */
  fur(ctx, size, base, accent, rng) {
    const a = hexToRgb(base), b = hexToRgb(accent);
    const drift = makeNoise(rng, 4);
    paint(ctx, size, (x, y) => mixRgb(a, b, step(drift(x, y, size), 3) * 0.5));
    // Sparse, long strokes. A dense scatter of short ones reads as static
    // noise at the size a creature actually occupies on screen.
    for (let i = 0; i < size * 1.4; i++) {
      const x = Math.floor(rng() * size), y = Math.floor(rng() * size);
      const len = 3 + Math.floor(rng() * 4);
      px(ctx, x, y, 1, len, rng() < 0.5 ? shade(accent, -10) : shade(base, 12));
    }
  },

  /** Winter coat: pale fur with cold tips, for the tundra hunter. */
  frost(ctx, size, base, accent, rng) {
    SKINS.fur(ctx, size, base, accent, rng);
    for (let i = 0; i < size * 0.6; i++) {
      const x = Math.floor(rng() * size), y = Math.floor(rng() * size);
      px(ctx, x, y, 1, 3, rng() < 0.5 ? '#ffffff' : shade(accent, 20));
    }
  },

  /** Hard segmented plates with dark seams — insects and crawlers. */
  chitin(ctx, size, base, accent, rng) {
    const a = hexToRgb(base), b = hexToRgb(accent);
    const mottle = makeNoise(rng, 5);
    paint(ctx, size, (x, y) => shadeRgb(mixRgb(a, b, step(mottle(x, y, size), 3) * 0.4), 0));
    const bands = 4;
    const h = size / bands;
    for (let i = 0; i < bands; i++) {
      const y = Math.round(i * h);
      px(ctx, 0, y, size, 1, 'rgba(0,0,0,0.42)');          // seam between plates
      px(ctx, 0, y + 1, size, 1, 'rgba(255,255,255,0.16)'); // lit lip of the next
    }
    for (let i = 0; i < 5; i++) { // pitting in the shell
      px(ctx, Math.floor(rng() * size), Math.floor(rng() * size), 2, 1, 'rgba(0,0,0,0.2)');
    }
  },

  /** Rough rock, for the stone-bodied cave brute. */
  stone(ctx, size, base, accent, rng) {
    const a = hexToRgb(base), b = hexToRgb(accent);
    const blotch = makeNoise(rng, 3), detail = makeNoise(rng, 7);
    paint(ctx, size, (x, y) => {
      const t = step(blotch(x, y, size) * 0.65 + detail(x, y, size) * 0.35, 5);
      return shadeRgb(mixRgb(a, b, t), (t - 0.5) * 40);
    });
    for (let i = 0; i < 3; i++) { // cracks
      let x = rng() * size, y = rng() * size;
      for (let k = 0; k < size * 0.5; k++) {
        px(ctx, x, y, 1, 1, 'rgba(0,0,0,0.3)');
        x += (rng() - 0.5) * 2; y += 1;
        if (x < 0 || y >= size) break;
      }
    }
  },

  /** Cooled crust split by glowing veins — everything from the Ember Expanse. */
  molten(ctx, size, base, accent, rng) {
    const crust = hexToRgb(base);
    const vein = makeNoise(rng, 4), detail = makeNoise(rng, 8);
    const glow = hexToRgb(accent);
    paint(ctx, size, (x, y) => {
      const v = vein(x, y, size);
      // A narrow band of the noise field becomes the glowing seam; either
      // side of it is dark crust.
      const heat = Math.max(0, 1 - Math.abs(v - 0.5) * 7);
      const c = mixRgb(shadeRgb(crust, (step(detail(x, y, size), 3) - 0.5) * 18), glow, step(heat, 4));
      return c;
    });
  },

  /** Soft translucent body with a darker core, for the drifting cave horror. */
  slime(ctx, size, base, accent, rng) {
    const a = hexToRgb(base), b = hexToRgb(accent);
    const core = makeNoise(rng, 3);
    paint(ctx, size, (x, y) => mixRgb(a, b, step(core(x, y, size), 4) * 0.55));
    // A wet highlight, always in the upper left, like every other material.
    for (let i = 0; i < 4; i++) px(ctx, 4 + i, 5 + Math.floor(i / 2), 2, 1, 'rgba(255,255,255,0.28)');
  },

  /** Pale ringed segments, for the grub. */
  grub(ctx, size, base, accent, rng) {
    const a = hexToRgb(base), b = hexToRgb(accent);
    const rings = 6;
    const h = size / rings;
    paint(ctx, size, (x, y) => {
      const t = Math.abs(((y % h) / h) - 0.5) * 2;
      return mixRgb(a, b, step(t, 3) * 0.55);
    });
    for (let i = 0; i < rings; i++) px(ctx, 0, Math.round(i * h), size, 1, 'rgba(0,0,0,0.16)');
  }
};

/** The hides a creature can name, for the same reason as MOB_SHAPES. */
export const MOB_SKINS = Object.keys(SKINS);

/**
 * Returns the (cached) texture for one species' hide. `variant` lets a
 * species use a second, usually darker, version of its own skin for limbs
 * and features without a second entry in the roster.
 */
export function creatureSkin(species, variant = 'body') {
  const key = `${species.id}:${variant}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = SKIN_TILE; canvas.height = SKIN_TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const draw = SKINS[species.skin] ?? SKINS.hide;
  const base = '#' + (species.color >>> 0).toString(16).padStart(6, '0');
  const accent = '#' + (species.accentColor >>> 0).toString(16).padStart(6, '0');
  // Limbs are drawn a shade darker so they separate from the body without
  // needing an outline.
  const b = variant === 'limb' ? shade(base, -18) : base;
  const a = variant === 'limb' ? shade(accent, -18) : accent;
  draw(ctx, SKIN_TILE, b, a, makeRng(`${species.id}:${variant}`));

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Frees every generated skin; used when the game session is torn down. */
export function disposeSkins() {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}
