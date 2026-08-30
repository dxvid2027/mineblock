// Original procedural texture generation. Every block face and item icon in
// MineBlock is a small canvas painted algorithmically at startup — nothing is
// loaded from an image file, so all visuals here are generated content.
//
// The patterns are pixel art: they draw on an integer grid at a small tile
// resolution so faces stay crisp and blocky under NearestFilter, in the
// spirit of the genre, but with entirely original palettes and shapes.
//
// Three ideas run through all of them:
//  - Wrapping value noise, so a pattern meets itself seamlessly where two
//    faces of the same material sit side by side.
//  - A light direction: every material is lit from the upper left, which is
//    what makes a flat tile read as carved stone, planks or cloth.
//  - Restraint at high frequency. The atlas has no mipmaps (they bleed
//    neighbouring tiles together), so fine speckle would shimmer at
//    distance; detail is carried by shapes and broad tone, not per-pixel
//    contrast.

// Deterministic per-tile PRNG so regenerating the atlas is stable.
function makeRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

// ------------------------------------------------------------ color helpers
function hexToRgb(hex) {
  const str = String(hex);
  const m = str.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  const n = parseInt(str.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const hex2 = (v) => clamp255(v).toString(16).padStart(2, '0');

/**
 * Brightens (positive) or darkens (negative) a color, returning hex. Hex out
 * matters: shaded colors are fed back into patterns that parse them, so a
 * pattern can derive its own tones from the ones it was given.
 */
function shade(color, amt) {
  const c = hexToRgb(color);
  return `#${hex2(c.r + amt)}${hex2(c.g + amt)}${hex2(c.b + amt)}`;
}
function shadeRgb(c, amt) {
  return { r: clamp255(c.r + amt), g: clamp255(c.g + amt), b: clamp255(c.b + amt) };
}
function mixRgb(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}
const css = (c) => `rgb(${clamp255(c.r)},${clamp255(c.g)},${clamp255(c.b)})`;

// ------------------------------------------------------------ paint helpers
/**
 * Value noise on a wrapping lattice: sampling it at x and x+size gives the
 * same value, so the pattern tiles seamlessly across adjacent block faces.
 */
function makeNoise(rng, cells) {
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const wrap = (i) => ((i % cells) + cells) % cells;
  const at = (i, j) => lat[wrap(j) * cells + wrap(i)];
  return (x, y, size) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const tx = fx - i0, ty = fy - j0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(i0, j0), b = at(i0 + 1, j0);
    const c = at(i0, j0 + 1), d = at(i0 + 1, j0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

/**
 * Snaps a 0..1 value to a small number of levels. Smooth noise magnified to
 * block size looks like blurry mush; stepping it produces the flat patches of
 * distinct tone that make a texture read as pixel art up close.
 */
function step(t, levels) {
  return Math.min(levels - 1, Math.floor(t * levels)) / (levels - 1);
}

/** Fills the whole tile pixel by pixel. `fn(x, y)` returns {r,g,b,a?} or null for transparent. */
function paint(ctx, size, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const c = fn(x, y);
      if (!c) continue; // createImageData starts fully transparent
      d[i] = clamp255(c.r); d[i + 1] = clamp255(c.g); d[i + 2] = clamp255(c.b);
      d[i + 3] = c.a === undefined ? 255 : clamp255(c.a);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Integer-aligned rectangle: keeps every edge on a pixel boundary. */
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/**
 * The shared light direction: a light rim along the top and left edges, a
 * shadow along the bottom and right. Every solid block gets this, which is
 * what stops a wall of one material reading as flat paint.
 */
function bevel(ctx, size, light = 0.12, dark = 0.16) {
  const t = Math.max(1, Math.round(size / 16));
  px(ctx, 0, 0, size, t, `rgba(255,255,255,${light})`);
  px(ctx, 0, 0, t, size, `rgba(255,255,255,${light * 0.6})`);
  px(ctx, 0, size - t, size, t, `rgba(0,0,0,${dark})`);
  px(ctx, size - t, 0, t, size, `rgba(0,0,0,${dark * 0.7})`);
}

/** A jagged one-pixel line, used for cracks and veins. */
function jaggedLine(ctx, size, rng, x0, y0, len, dx, dy, color) {
  let x = x0, y = y0;
  ctx.fillStyle = color;
  for (let i = 0; i < len; i++) {
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    x += dx + (rng() - 0.5) * 1.2;
    y += dy + (rng() - 0.5) * 1.2;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
  }
}

// ------------------------------------------------------------------ patterns
const PATTERNS = {
  /** Uniform material with just enough noise not to read as painted card. */
  solid(ctx, size, { color }, rng) {
    const base = hexToRgb(color);
    const n = makeNoise(rng, 4);
    paint(ctx, size, (x, y) => shadeRgb(base, (step(n(x, y, size), 4) - 0.5) * 14));
    bevel(ctx, size, 0.05, 0.07);
  },

  /** Loose material — soil, sand, snow, ash. Two noise octaves plus grit. */
  grain(ctx, size, { color, grain }, rng) {
    const a = hexToRgb(color), b = hexToRgb(grain ?? color);
    const coarse = makeNoise(rng, 4), fine = makeNoise(rng, 8);
    paint(ctx, size, (x, y) => {
      const t = step(coarse(x, y, size) * 0.6 + fine(x, y, size) * 0.4, 5);
      return shadeRgb(mixRgb(a, b, t), (Math.round(fine(x, y, size) * 3) - 1.5) * 7);
    });
    // Pebbles and grit, sparse enough not to shimmer at distance.
    const grit = Math.round(size * size * 0.05);
    for (let i = 0; i < grit; i++) {
      const gx = Math.floor(rng() * size), gy = Math.floor(rng() * size);
      const dark = rng() < 0.6;
      px(ctx, gx, gy, 1, 1, dark ? `rgba(0,0,0,0.16)` : `rgba(255,255,255,0.14)`);
    }
    // Barely-there edges: a field of soil or grass is a continuous surface,
    // and a strong bevel here turns it into a tiled floor.
    bevel(ctx, size, 0.05, 0.07);
  },

  /** Solid rock: mottled tone, a couple of hairline cracks, a lit top edge. */
  speckle(ctx, size, { color, grain }, rng) {
    const a = hexToRgb(color), b = hexToRgb(grain ?? color);
    const blotch = makeNoise(rng, 3), detail = makeNoise(rng, 7);
    paint(ctx, size, (x, y) => {
      const t = step(blotch(x, y, size) * 0.65 + detail(x, y, size) * 0.35, 5);
      // The extra swing on top of the color mix is what separates a rock face
      // from a flat gray card at a distance.
      return shadeRgb(mixRgb(a, b, t), (t - 0.5) * 48);
    });
    const cracks = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < cracks; i++) {
      const vertical = rng() < 0.5;
      jaggedLine(ctx, size, rng,
        rng() * size, rng() * size, Math.round(size * (0.3 + rng() * 0.4)),
        vertical ? 0 : 1, vertical ? 1 : 0, 'rgba(0,0,0,0.22)');
    }
    bevel(ctx, size, 0.12, 0.16);
  },

  /**
   * Ore: rock with distinct nuggets of the ore color rather than a dusting
   * of pixels, so a seam is readable across a cave wall. Each nugget is lit
   * from the same direction as everything else — highlight up-left, shadow
   * down-right — which is what makes it look embedded rather than painted.
   */
  ore(ctx, size, { color, grain }, rng) {
    PATTERNS.speckle(ctx, size, { color, grain: shade(color, -14) }, makeRng(`${color}-host`));
    const ore = hexToRgb(grain ?? '#c17a4c');
    const unit = size / 16;
    const cells = 3;
    const step = size / cells;
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        if (rng() < 0.35) continue; // leave gaps so seams look irregular
        const r = Math.max(1, Math.round(unit * (1.2 + rng() * 1.1)));
        const ox = Math.round(cx * step + step / 2 + (rng() - 0.5) * step * 0.5);
        const oy = Math.round(cy * step + step / 2 + (rng() - 0.5) * step * 0.5);
        // A blobby nugget: a square with its corners knocked off.
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > r * 1.45) continue;
            const lit = dx + dy < -r * 0.35;
            const shadow = dx + dy > r * 0.55;
            px(ctx, ox + dx, oy + dy, 1, 1,
              css(shadeRgb(ore, lit ? 38 : shadow ? -34 : 0)));
          }
        }
        px(ctx, ox - Math.round(r * 0.4), oy - Math.round(r * 0.6), 1, 1, 'rgba(255,255,255,0.55)');
      }
    }
    bevel(ctx, size, 0.10, 0.14);
  },

  /** Loose stones set in mortar, each one lit individually. */
  cobble(ctx, size, { color, grain, cells = 4 }, rng) {
    const base = hexToRgb(color);
    px(ctx, 0, 0, size, size, shade(grain ?? color, -28)); // mortar

    const stepPx = size / cells;
    const inset = Math.max(1, Math.round(size / 32));
    // A stone may span two cells; the ones it covers are skipped, which is
    // what keeps the courses from lining up into a grid.
    const taken = new Set();
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        if (taken.has(cy * cells + cx)) continue;
        const wide = cx < cells - 1 && !taken.has(cy * cells + cx + 1) && rng() < 0.28;
        const tall = !wide && cy < cells - 1 && rng() < 0.24;
        if (wide) taken.add(cy * cells + cx + 1);
        if (tall) taken.add((cy + 1) * cells + cx);
        const jx = (rng() - 0.5) * stepPx * 0.25, jy = (rng() - 0.5) * stepPx * 0.25;
        const x0 = Math.round(cx * stepPx + inset + jx), y0 = Math.round(cy * stepPx + inset + jy);
        const w = Math.round(stepPx * (wide ? 2 : 1) - inset * 2);
        const h = Math.round(stepPx * (tall ? 2 : 1) - inset * 2);
        const tone = shadeRgb(base, (rng() - 0.5) * 42);
        px(ctx, x0, y0, w, h, css(tone));
        // Knock the corners off so stones read as rounded, not as tiles.
        px(ctx, x0, y0, 1, 1, shade(grain ?? color, -28));
        px(ctx, x0 + w - 1, y0 + h - 1, 1, 1, shade(grain ?? color, -28));
        px(ctx, x0, y0, w, 1, css(shadeRgb(tone, 26)));       // lit top
        px(ctx, x0, y0 + h - 1, w, 1, css(shadeRgb(tone, -26))); // shaded base
      }
    }
    bevel(ctx, size, 0.08, 0.14);
  },

  checker(ctx, size, { color, grain }, rng) {
    const a = hexToRgb(color), b = hexToRgb(grain ?? color);
    const n = makeNoise(rng, 6);
    const n4 = size / 4;
    paint(ctx, size, (x, y) => {
      const even = (Math.floor(x / n4) + Math.floor(y / n4)) % 2 === 0;
      return shadeRgb(even ? a : b, (step(n(x, y, size), 3) - 0.5) * 12);
    });
    bevel(ctx, size);
  },

  /** Sawn boards: seams, per-board tone, lengthwise grain and the odd knot. */
  planks(ctx, size, { color, grain }, rng) {
    const base = hexToRgb(color);
    const boards = 4;
    const h = size / boards;
    for (let i = 0; i < boards; i++) {
      const y0 = Math.round(i * h);
      const tone = shadeRgb(base, (rng() - 0.5) * 20);
      px(ctx, 0, y0, size, Math.round(h), css(tone));
      // Lengthwise grain: short dashes, darker than the board.
      const streaks = 3 + Math.floor(rng() * 3);
      for (let s = 0; s < streaks; s++) {
        const sy = y0 + 1 + Math.floor(rng() * (h - 2));
        const sx = Math.floor(rng() * size);
        const len = Math.round(size * (0.2 + rng() * 0.45));
        px(ctx, sx, sy, Math.min(len, size - sx), 1, css(shadeRgb(tone, -18)));
      }
      if (rng() < 0.35) { // knot
        const kx = Math.round(rng() * (size - 4)) + 2;
        const ky = y0 + Math.round(h / 2);
        px(ctx, kx - 1, ky - 1, 3, 2, css(shadeRgb(tone, -34)));
        px(ctx, kx, ky, 1, 1, css(shadeRgb(tone, -52)));
      }
      px(ctx, 0, y0, size, 1, css(shadeRgb(hexToRgb(grain ?? color), -22))); // seam
      px(ctx, 0, y0 + 1, size, 1, 'rgba(255,255,255,0.10)');                 // lit lip
    }
    bevel(ctx, size, 0.06, 0.14);
  },

  /** Cut end of a log: growth rings wobbling around an off-centre heart. */
  rings(ctx, size, { color, grain }, rng) {
    const wood = hexToRgb(color), dark = hexToRgb(grain ?? color);
    const wobble = makeNoise(rng, 5);
    const cx = size / 2 + (rng() - 0.5) * size * 0.12;
    const cy = size / 2 + (rng() - 0.5) * size * 0.12;
    const ringStep = size / 9;
    paint(ctx, size, (x, y) => {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const r = d + (step(wobble(x, y, size), 4) - 0.5) * ringStep * 1.1;
      const band = Math.floor(r / ringStep) % 2 === 0;
      const edge = d > size * 0.46;
      if (edge) return shadeRgb(dark, -6); // bark rim
      return shadeRgb(band ? wood : mixRgb(wood, dark, 0.45), 0);
    });
    px(ctx, Math.round(cx) - 1, Math.round(cy) - 1, 2, 2, css(shadeRgb(dark, -14))); // heartwood
    bevel(ctx, size, 0.08, 0.12);
  },

  /** Bark: vertical fibres of varying width, with deep crevices between. */
  bark(ctx, size, { color, grain }, rng) {
    const base = hexToRgb(color), dark = hexToRgb(grain ?? color);
    const fibre = makeNoise(rng, 3);
    paint(ctx, size, (x, y) => {
      const ridge = Math.abs(Math.sin((x / size) * Math.PI * 5 + fibre(x, y, size) * 2.2));
      return mixRgb(dark, base, 0.5 + step(ridge, 4) * 0.5);
    });
    const crevices = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < crevices; i++) {
      jaggedLine(ctx, size, rng, rng() * size, 0, size, 0, 1, 'rgba(0,0,0,0.28)');
    }
    for (let i = 0; i < 3; i++) { // short horizontal splits
      const y = Math.floor(rng() * size), x = Math.floor(rng() * size);
      px(ctx, x, y, Math.round(size * 0.2), 1, 'rgba(0,0,0,0.18)');
    }
    bevel(ctx, size, 0.10, 0.16);
  },

  /**
   * Foliage: clumps of three greens with real gaps in them. Leaves render
   * through the alpha-tested cutout material, so the holes let sky and
   * branches show through instead of forming a solid green cube.
   */
  leafy(ctx, size, { color, grain }, rng) {
    const light = hexToRgb(color);
    const dark = hexToRgb(grain ?? color);
    const clump = makeNoise(rng, 4), detail = makeNoise(rng, 9);
    paint(ctx, size, (x, y) => {
      const n = clump(x, y, size) * 0.65 + detail(x, y, size) * 0.35;
      if (n < 0.28) return null; // gap between leaves
      const c = mixRgb(dark, light, step((n - 0.28) / 0.72, 4));
      const lit = detail(x + 3, y + 3, size) > 0.82;
      return shadeRgb(c, lit ? 14 : n < 0.36 ? -26 : 0);
    });
  },

  /** Grass, ferns, vines: a few tapering blades on a transparent tile. */
  sprig(ctx, size, { color, grain }, rng) {
    ctx.clearRect(0, 0, size, size);
    const light = color, dark = grain ?? shade(color, -30);
    const unit = size / 16;
    const blades = 6 + Math.floor(rng() * 3);
    for (let b = 0; b < blades; b++) {
      let x = size * (0.08 + rng() * 0.84);
      const top = size * (0.22 + rng() * 0.42);
      const drift = (rng() - 0.5) * 0.5;
      const w = Math.max(2, Math.round(unit * (1 + rng())));
      for (let y = size - 1; y > top; y--) {
        const taper = (y - top) / (size - top);
        const bw = taper > 0.3 ? w : Math.max(1, w - 1);
        px(ctx, x, y, bw, 1, light);
        px(ctx, x + bw - 1, y, 1, 1, dark); // shaded edge of the blade
        x += drift * 0.5;
      }
    }
  },

  /** A stem with leaves and a bloom of petals around a bright centre. */
  flower(ctx, size, { color, grain }, rng) {
    ctx.clearRect(0, 0, size, size);
    const stem = grain ?? '#5f9e42';
    const cx = Math.round(size * 0.5), stemTop = Math.round(size * 0.42);
    px(ctx, cx - 1, stemTop, 2, size - stemTop, stem);
    px(ctx, cx - 1, stemTop, 1, size - stemTop, shade(stem, -22));
    // Two leaves off the stem.
    px(ctx, cx - Math.round(size * 0.18), Math.round(size * 0.66), Math.round(size * 0.16), 2, stem);
    px(ctx, cx + 2, Math.round(size * 0.76), Math.round(size * 0.15), 2, shade(stem, -14));
    // Petals: blobs on a ring, then a lit centre.
    const petals = 5;
    const r = size * 0.17;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + rng() * 0.4;
      const pxx = cx + Math.cos(a) * r, pyy = stemTop - size * 0.04 + Math.sin(a) * r;
      const w = Math.max(2, Math.round(size * 0.17));
      px(ctx, pxx - w / 2, pyy - w / 2, w, w, color);
      px(ctx, pxx - w / 2, pyy - w / 2, w, 1, shade(color, 30));
      px(ctx, pxx - w / 2, pyy + w / 2 - 1, w, 1, shade(color, -28));
    }
    const c = Math.max(2, Math.round(size * 0.14));
    px(ctx, cx - c / 2, stemTop - size * 0.04 - c / 2, c, c, shade(color, 55));
  },

  /** Cereal-style crop: stalks carrying kernels near the top. */
  crop(ctx, size, { color, grain }, rng) {
    ctx.clearRect(0, 0, size, size);
    const stalk = grain ?? shade(color, -30);
    for (const xf of [0.25, 0.5, 0.75]) {
      const x = Math.round(size * xf);
      const top = Math.round(size * (0.12 + rng() * 0.14));
      px(ctx, x, top, 2, size - top, stalk);
      px(ctx, x, top, 1, size - top, shade(stalk, 18));
      for (let k = 0; k < 4; k++) {
        const ky = top + Math.round(k * size * 0.11);
        const side = k % 2 ? 2 : -2;
        px(ctx, x + side, ky, 2, 2, color);
        px(ctx, x + side, ky, 2, 1, shade(color, 28));
      }
    }
  },

  /** Water/magma: broad bands with drifting crests, no hard edges. */
  liquid(ctx, size, { color, grain }, rng) {
    const deep = hexToRgb(color), crest = hexToRgb(grain ?? color);
    const swell = makeNoise(rng, 3), ripple = makeNoise(rng, 6);
    paint(ctx, size, (x, y) => {
      const wave = Math.sin((y / size) * Math.PI * 3 + swell(x, y, size) * 3.4) * 0.5 + 0.5;
      const t = step(wave * 0.6 + ripple(x, y, size) * 0.4, 5);
      return mixRgb(deep, crest, t * 0.75);
    });
    for (let i = 0; i < Math.round(size * 0.4); i++) { // glints on the crests
      px(ctx, Math.floor(rng() * size), Math.floor(rng() * size), 1, 1, 'rgba(255,255,255,0.16)');
    }
  },

  /** A torch: wooden handle, layered flame, sparks. */
  torch(ctx, size, { color, grain }, rng) {
    ctx.clearRect(0, 0, size, size);
    const w = Math.max(2, Math.round(size * 0.16));
    const x0 = Math.round(size * 0.5 - w / 2);
    const stickTop = Math.round(size * 0.42);
    px(ctx, x0, stickTop, w, size - stickTop, color);
    px(ctx, x0, stickTop, 1, size - stickTop, shade(color, 24));
    px(ctx, x0 + w - 1, stickTop, 1, size - stickTop, shade(color, -26));
    const flame = grain ?? '#f2a13a';
    const fx = size * 0.5, fy = size * 0.3;
    for (const [r, c] of [[0.20, shade(flame, -30)], [0.14, flame], [0.08, shade(flame, 60)]]) {
      const rr = size * r;
      for (let y = -rr; y <= rr; y++) {
        for (let x = -rr; x <= rr; x++) {
          if (x * x + (y * 1.25) * (y * 1.25) > rr * rr) continue;
          px(ctx, fx + x, fy + y, 1, 1, c);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      px(ctx, fx + (rng() - 0.5) * size * 0.5, fy - size * (0.2 + rng() * 0.15), 1, 1, shade(flame, 40));
    }
  },

  /** Arcane stone: dark rock carrying a glowing glyph. */
  runic(ctx, size, { color, grain }, rng) {
    PATTERNS.speckle(ctx, size, { color, grain: shade(color, 18) }, makeRng(`${color}-rune`));
    const glow = grain ?? '#a35bff';
    const t = Math.max(1, Math.round(size / 16));
    const inset = Math.round(size * 0.22);
    const span = size - inset * 2;
    // Halo first, glyph over it: two passes read as light bleeding into rock.
    const mid = size / 2;
    const r = span / 2;
    // Halo first, glyph over it: two passes read as light bleeding into rock.
    ctx.globalAlpha = 0.22;
    for (let i = -r; i <= r; i++) {
      const w = (r - Math.abs(i)) * 2;
      px(ctx, mid - w / 2 - t, mid + i - t, w + t * 2, t * 2, glow);
    }
    ctx.globalAlpha = 1;
    // Diamond outline.
    for (let i = -r; i <= r; i++) {
      const w = (r - Math.abs(i)) * 2;
      px(ctx, mid - w / 2, mid + i, t, t, glow);
      px(ctx, mid + w / 2 - t, mid + i, t, t, glow);
    }
    // Bars through its centre.
    px(ctx, mid - r * 0.45, mid - t / 2, r * 0.9, t, shade(glow, 45));
    px(ctx, mid - t / 2, mid - r * 0.45, t, r * 0.9, shade(glow, 45));
    for (let i = 0; i < 4; i++) { // sparks in the rock
      px(ctx, Math.floor(rng() * size), Math.floor(rng() * size), 1, 1, shade(glow, 30));
    }
  },

  /** Workbench top: boards with a tool tray cut into them. */
  gridTop(ctx, size, { color, grain }, rng) {
    PATTERNS.planks(ctx, size, { color, grain }, makeRng(`${color}-bench`));
    const dark = shade(grain ?? color, -30);
    const inset = Math.round(size * 0.16);
    const span = size - inset * 2;
    px(ctx, inset, inset, span, span, dark);
    px(ctx, inset, inset, span, 1, 'rgba(0,0,0,0.35)');
    px(ctx, inset, inset + span - 1, span, 1, 'rgba(255,255,255,0.12)');
    // Tools laid in the tray.
    px(ctx, inset + 2, inset + 3, Math.round(span * 0.5), 2, shade(color, 30));
    px(ctx, inset + Math.round(span * 0.55), inset + 3, 2, Math.round(span * 0.6), shade(color, 10));
    px(ctx, inset + 3, inset + Math.round(span * 0.55), Math.round(span * 0.3), 2, shade(color, -10));
    for (let i = 0; i < 3; i++) {
      px(ctx, inset + 2 + i * 3, inset + span - 4, 1, 2, shade(color, 45));
    }
  },

  /** Smelter front: a stone block with a glowing mouth. */
  furnaceFace(ctx, size, { color, grain }, rng) {
    PATTERNS.cobble(ctx, size, { color, grain: shade(color, -18) }, makeRng(`${color}-furnace`));
    const mouthW = Math.round(size * 0.5), mouthH = Math.round(size * 0.34);
    const mx = Math.round((size - mouthW) / 2), my = Math.round(size * 0.5);
    px(ctx, mx - 1, my - 1, mouthW + 2, mouthH + 2, shade(color, -34)); // rim
    px(ctx, mx, my, mouthW, mouthH, grain ?? '#2b2b2e');                // opening
    // Arch the top of the opening by filling its upper corners back in.
    px(ctx, mx, my, 1, 1, shade(color, -34));
    px(ctx, mx + mouthW - 1, my, 1, 1, shade(color, -34));
    // Embers inside, brightest at the base.
    for (let i = 0; i < Math.round(mouthW * 0.9); i++) {
      const ex = mx + 1 + Math.floor(rng() * (mouthW - 2));
      const ey = my + mouthH - 1 - Math.floor(rng() * Math.max(1, mouthH * 0.4));
      px(ctx, ex, ey, 1, 1, rng() < 0.4 ? '#ffcf6a' : '#e0702a');
    }
    px(ctx, Math.round(size * 0.3), Math.round(size * 0.2), Math.round(size * 0.4), 2, shade(color, -30)); // vent
    bevel(ctx, size, 0.10, 0.14);
  },

  /** Crate: boards inside a nailed frame. */
  crate(ctx, size, { color, grain }, rng) {
    PATTERNS.planks(ctx, size, { color, grain }, makeRng(`${color}-crate`));
    const frame = shade(grain ?? color, -18);
    const t = Math.max(2, Math.round(size / 10));
    px(ctx, 0, 0, size, t, frame);
    px(ctx, 0, size - t, size, t, frame);
    px(ctx, 0, 0, t, size, frame);
    px(ctx, size - t, 0, t, size, frame);
    px(ctx, 0, Math.round(size / 2 - t / 2), size, t, frame);
    px(ctx, 0, 0, size, 1, 'rgba(255,255,255,0.16)');
    px(ctx, 0, size - 1, size, 1, 'rgba(0,0,0,0.22)');
    for (const [nx, ny] of [[t, t], [size - t - 1, t], [t, size - t - 1], [size - t - 1, size - t - 1]]) {
      px(ctx, nx, ny, 1, 1, shade(color, 60)); // nail heads
    }
  },

  /** Masonry: staggered courses, each brick lit on its own. */
  brick(ctx, size, { color, grain }, rng) {
    const base = hexToRgb(color);
    px(ctx, 0, 0, size, size, shade(grain ?? color, -26)); // mortar
    const rows = 4;
    const rowH = size / rows;
    const mortar = Math.max(1, Math.round(size / 32));
    for (let r = 0; r < rows; r++) {
      const y0 = Math.round(r * rowH) + mortar;
      const h = Math.round(rowH) - mortar;
      const offset = (r % 2) * (size / 4);
      for (let bx = -size / 2; bx < size; bx += size / 2) {
        const x0 = Math.round(bx + offset) + mortar;
        const w = Math.round(size / 2) - mortar * 2;
        if (x0 + w <= 0 || x0 >= size) continue;
        const tone = shadeRgb(base, (rng() - 0.5) * 22);
        px(ctx, x0, y0, w, h, css(tone));
        px(ctx, x0, y0, w, 1, css(shadeRgb(tone, 22)));
        px(ctx, x0, y0 + h - 1, w, 1, css(shadeRgb(tone, -22)));
      }
    }
    bevel(ctx, size, 0.06, 0.12);
  },

  /**
   * Glass: nearly clear, with a frame and a sheen. It renders through the
   * blended material, so the low alpha here is what you actually see
   * through — a fully opaque tile would make panes look like solid stone.
   */
  glass(ctx, size, { color, grain }, rng) {
    ctx.clearRect(0, 0, size, size);
    const tint = hexToRgb(color);
    paint(ctx, size, () => ({ ...tint, a: 40 }));
    const frame = grain ?? shade(color, 30);
    ctx.globalAlpha = 0.85;
    px(ctx, 0, 0, size, 1, frame);
    px(ctx, 0, size - 1, size, 1, frame);
    px(ctx, 0, 0, 1, size, frame);
    px(ctx, size - 1, 0, 1, size, frame);
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < Math.round(size * 0.4); i++) { // diagonal sheen
      px(ctx, size * 0.18 + i, size * 0.2 + i, 1, 1, '#ffffff');
      px(ctx, size * 0.3 + i, size * 0.2 + i, 1, 1, '#ffffff');
    }
    ctx.globalAlpha = 1;
  },

  /** Woven cloth: warp over weft, with a hemmed border. */
  cloth(ctx, size, { color, grain }, rng) {
    const a = hexToRgb(color), b = hexToRgb(grain ?? color);
    const n = makeNoise(rng, 6);
    const thread = Math.max(1, Math.round(size / 16));
    paint(ctx, size, (x, y) => {
      const warp = Math.floor(x / thread) % 2 === 0;
      const weft = Math.floor(y / thread) % 2 === 0;
      const over = warp === weft;
      const c = mixRgb(a, b, over ? 0.05 : 0.95);
      return shadeRgb(c, (step(n(x, y, size), 3) - 0.5) * 14 + (over ? 20 : -20));
    });
    px(ctx, 0, 0, size, thread, css(shadeRgb(b, -18)));
    px(ctx, 0, size - thread, size, thread, css(shadeRgb(b, -18)));
    bevel(ctx, size, 0.10, 0.10);
  },

  /** Shelf of rolled scrolls in assorted parchment tones. */
  shelf(ctx, size, { color, grain }, rng) {
    PATTERNS.planks(ctx, size, { color, grain: shade(color, -25) }, makeRng(`${color}-shelf`));
    const tones = ['#e8dcb8', '#d8c79a', '#c9b382', '#efe6cd'];
    const top = Math.round(size * 0.18), h = Math.round(size * 0.64);
    px(ctx, 0, top - 2, size, 2, shade(grain ?? color, -30));
    px(ctx, 0, top + h, size, 2, shade(grain ?? color, -30));
    let x = 2;
    while (x < size - 3) {
      const w = 2 + Math.floor(rng() * 2);
      const tone = tones[Math.floor(rng() * tones.length)];
      const lean = Math.round((rng() - 0.5) * 2);
      px(ctx, x, top + Math.max(0, lean), w, h - Math.abs(lean), tone);
      px(ctx, x, top + Math.max(0, lean), 1, h - Math.abs(lean), shade(tone, 25));
      px(ctx, x + w - 1, top + Math.max(0, lean), 1, h - Math.abs(lean), shade(tone, -35));
      x += w + 1;
    }
  },

  /** Ladder: two rails and rungs on a transparent tile. */
  ladder(ctx, size, { color, grain }, rng) {
    ctx.clearRect(0, 0, size, size);
    const railW = Math.max(2, Math.round(size * 0.12));
    for (const xf of [0.16, 0.72]) {
      const x = Math.round(size * xf);
      px(ctx, x, 0, railW, size, color);
      px(ctx, x, 0, 1, size, shade(color, 26));
      px(ctx, x + railW - 1, 0, 1, size, shade(color, -30));
    }
    const rungW = Math.max(2, Math.round(size * 0.09));
    for (const yf of [0.14, 0.44, 0.74]) {
      const y = Math.round(size * yf);
      px(ctx, size * 0.16, y, size * 0.68, rungW, grain ?? shade(color, -20));
      px(ctx, size * 0.16, y, size * 0.68, 1, shade(color, 20));
    }
  },

  /** Tilled soil: furrows with a moist ridge on the lit side of each. */
  furrow(ctx, size, { color, grain }, rng) {
    PATTERNS.grain(ctx, size, { color, grain }, makeRng(`${color}-soil`));
    const rows = 4;
    const step = size / rows;
    for (let i = 0; i < rows; i++) {
      const x = Math.round(i * step + step * 0.35);
      px(ctx, x, 0, Math.max(2, Math.round(size / 12)), size, 'rgba(0,0,0,0.40)');
      px(ctx, x - 1, 0, 1, size, 'rgba(255,255,255,0.20)');
    }
  },

  /** The side of a grassy block: dirt with grass spilling over the top edge. */
  grassSide(ctx, size, { color, grain, top }, rng) {
    PATTERNS.grain(ctx, size, { color, grain }, makeRng(`${color}-dirt`));
    const grass = top ?? '#5f9e42';
    const fringe = makeNoise(rng, 5);
    const baseH = size * 0.26;
    for (let x = 0; x < size; x++) {
      const h = Math.round(baseH + (fringe(x, 0, size) - 0.5) * size * 0.22);
      px(ctx, x, 0, 1, h, grass);
      px(ctx, x, h - 1, 1, 1, shade(grass, -28)); // shaded underside of the fringe
      if (fringe(x, 8, size) > 0.62) px(ctx, x, h, 1, 2, shade(grass, -40)); // roots
      px(ctx, x, 0, 1, 1, shade(grass, 24));      // lit top edge
    }
  }
};

export function drawPattern(ctx, size, spec, seed) {
  const rng = makeRng(seed);
  const fn = PATTERNS[spec.pattern] ?? PATTERNS.solid;
  ctx.save();
  fn(ctx, size, spec, rng);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Item icon shapes. Each shape draws flat colored forms; the shared passes in
// drawIcon() then add the light direction and the dark outline that make them
// read at inventory size against a light panel.
// ---------------------------------------------------------------------------
const HANDLE = '#8a6a4f';
const HANDLE_DARK = '#6b5039';

/** Rounded blob used for gems, berries and other small organic shapes. */
function blob(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

const ICON_SHAPES = {
  chunk(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.62); ctx.lineTo(s * 0.36, s * 0.20); ctx.lineTo(s * 0.74, s * 0.26);
    ctx.lineTo(s * 0.84, s * 0.66); ctx.lineTo(s * 0.52, s * 0.86); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 34); // a lit facet
    ctx.beginPath();
    ctx.moveTo(s * 0.36, s * 0.20); ctx.lineTo(s * 0.74, s * 0.26); ctx.lineTo(s * 0.52, s * 0.46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, -30);
    ctx.beginPath();
    ctx.moveTo(s * 0.52, s * 0.86); ctx.lineTo(s * 0.84, s * 0.66); ctx.lineTo(s * 0.6, s * 0.58); ctx.closePath(); ctx.fill();
  },
  ingot(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.20, s * 0.68); ctx.lineTo(s * 0.31, s * 0.36); ctx.lineTo(s * 0.69, s * 0.36);
    ctx.lineTo(s * 0.80, s * 0.68); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 40); // cast top face
    ctx.beginPath();
    ctx.moveTo(s * 0.31, s * 0.36); ctx.lineTo(s * 0.69, s * 0.36); ctx.lineTo(s * 0.63, s * 0.28);
    ctx.lineTo(s * 0.37, s * 0.28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(s * 0.36, s * 0.44, s * 0.28, s * 0.05);
  },
  gem(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.12); ctx.lineTo(s * 0.82, s * 0.42); ctx.lineTo(s * 0.5, s * 0.9);
    ctx.lineTo(s * 0.18, s * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 48);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.12); ctx.lineTo(s * 0.5, s * 0.5); ctx.lineTo(s * 0.18, s * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, -34);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.5); ctx.lineTo(s * 0.82, s * 0.42); ctx.lineTo(s * 0.5, s * 0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(s * 0.38, s * 0.3, s * 0.06, s * 0.12);
  },
  shard(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.52, s * 0.08); ctx.lineTo(s * 0.72, s * 0.52); ctx.lineTo(s * 0.46, s * 0.92);
    ctx.lineTo(s * 0.32, s * 0.48); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 45);
    ctx.beginPath();
    ctx.moveTo(s * 0.52, s * 0.08); ctx.lineTo(s * 0.52, s * 0.7); ctx.lineTo(s * 0.32, s * 0.48); ctx.closePath(); ctx.fill();
  },
  stick(ctx, s, color) {
    ctx.strokeStyle = color; ctx.lineWidth = s * 0.12; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(s * 0.26, s * 0.84); ctx.lineTo(s * 0.74, s * 0.16); ctx.stroke();
    ctx.strokeStyle = shade(color, 30); ctx.lineWidth = s * 0.04;
    ctx.beginPath(); ctx.moveTo(s * 0.24, s * 0.8); ctx.lineTo(s * 0.7, s * 0.14); ctx.stroke();
  },
  fiber(ctx, s, color) {
    ctx.lineCap = 'round';
    for (const [dx, tone] of [[-0.12, shade(color, -20)], [0, color], [0.12, shade(color, 20)]]) {
      ctx.strokeStyle = tone; ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.moveTo(s * (0.5 + dx), s * 0.86);
      ctx.quadraticCurveTo(s * (0.5 + dx * 2.5), s * 0.5, s * (0.5 + dx * 3), s * 0.14);
      ctx.stroke();
    }
  },
  // --- tools: a wooden haft plus a shaded metal head ------------------------
  pickaxe(ctx, s, color) {
    ctx.strokeStyle = HANDLE; ctx.lineWidth = s * 0.11; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.92); ctx.lineTo(s * 0.5, s * 0.34); ctx.stroke();
    ctx.strokeStyle = HANDLE_DARK; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.moveTo(s * 0.545, s * 0.9); ctx.lineTo(s * 0.545, s * 0.36); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = s * 0.15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.13, s * 0.34); ctx.quadraticCurveTo(s * 0.5, s * 0.08, s * 0.87, s * 0.34); ctx.stroke();
    ctx.strokeStyle = shade(color, 45); ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(s * 0.18, s * 0.3); ctx.quadraticCurveTo(s * 0.5, s * 0.12, s * 0.82, s * 0.3); ctx.stroke();
  },
  axe(ctx, s, color) {
    ctx.strokeStyle = HANDLE; ctx.lineWidth = s * 0.11; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(s * 0.36, s * 0.92); ctx.lineTo(s * 0.62, s * 0.24); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.16); ctx.quadraticCurveTo(s * 0.92, s * 0.2, s * 0.84, s * 0.46);
    ctx.lineTo(s * 0.56, s * 0.48); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 45);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.16); ctx.quadraticCurveTo(s * 0.9, s * 0.2, s * 0.86, s * 0.3);
    ctx.lineTo(s * 0.54, s * 0.3); ctx.closePath(); ctx.fill();
  },
  shovel(ctx, s, color) {
    ctx.strokeStyle = HANDLE; ctx.lineWidth = s * 0.11; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.92); ctx.lineTo(s * 0.5, s * 0.38); ctx.stroke();
    // A spade: broad at the top, tapering down to where it meets the haft.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.28, s * 0.12); ctx.lineTo(s * 0.72, s * 0.12);
    ctx.lineTo(s * 0.58, s * 0.4); ctx.lineTo(s * 0.42, s * 0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 42);
    ctx.beginPath();
    ctx.moveTo(s * 0.28, s * 0.12); ctx.lineTo(s * 0.72, s * 0.12);
    ctx.lineTo(s * 0.66, s * 0.22); ctx.lineTo(s * 0.34, s * 0.22); ctx.closePath(); ctx.fill();
  },
  sword(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.06); ctx.lineTo(s * 0.64, s * 0.5); ctx.lineTo(s * 0.36, s * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 48);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.06); ctx.lineTo(s * 0.5, s * 0.5); ctx.lineTo(s * 0.36, s * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, -25);
    ctx.fillRect(s * 0.26, s * 0.5, s * 0.48, s * 0.08); // crossguard
    ctx.strokeStyle = HANDLE; ctx.lineWidth = s * 0.1; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.58); ctx.lineTo(s * 0.5, s * 0.86); ctx.stroke();
    blob(ctx, s * 0.5, s * 0.9, s * 0.07, s * 0.06, shade(color, -10)); // pommel
  },
  hoe(ctx, s, color) {
    ctx.strokeStyle = HANDLE; ctx.lineWidth = s * 0.11; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.92); ctx.lineTo(s * 0.6, s * 0.26); ctx.stroke();
    // An L-shaped blade, so a hoe is never mistaken for a shovel in a slot.
    ctx.fillStyle = color;
    ctx.fillRect(s * 0.24, s * 0.14, s * 0.42, s * 0.12);
    ctx.fillRect(s * 0.24, s * 0.14, s * 0.12, s * 0.3);
    ctx.fillStyle = shade(color, 42);
    ctx.fillRect(s * 0.24, s * 0.14, s * 0.42, s * 0.04);
  },
  hand(ctx, s, color) {
    blob(ctx, s * 0.5, s * 0.62, s * 0.2, s * 0.26, color);
    ctx.fillStyle = color;
    for (const dx of [-0.14, -0.05, 0.05, 0.14]) ctx.fillRect(s * (0.5 + dx) - s * 0.035, s * 0.3, s * 0.07, s * 0.2);
  },
  // --- armor ---------------------------------------------------------------
  helmet(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.32, Math.PI, 0);
    ctx.lineTo(s * 0.82, s * 0.7); ctx.lineTo(s * 0.62, s * 0.7); ctx.lineTo(s * 0.62, s * 0.6);
    ctx.lineTo(s * 0.38, s * 0.6); ctx.lineTo(s * 0.38, s * 0.7); ctx.lineTo(s * 0.18, s * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 40);
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.32, Math.PI, Math.PI * 1.45); ctx.lineTo(s * 0.5, s * 0.52); ctx.closePath(); ctx.fill();
  },
  chest(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(s * 0.28, s * 0.22, s * 0.44, s * 0.56);
    ctx.fillRect(s * 0.12, s * 0.26, s * 0.14, s * 0.36);
    ctx.fillRect(s * 0.74, s * 0.26, s * 0.14, s * 0.36);
    ctx.fillStyle = shade(color, 38);
    ctx.fillRect(s * 0.28, s * 0.22, s * 0.44, s * 0.08);
    ctx.fillStyle = shade(color, -28);
    ctx.fillRect(s * 0.48, s * 0.3, s * 0.04, s * 0.48);
  },
  legs(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(s * 0.26, s * 0.16, s * 0.2, s * 0.68);
    ctx.fillRect(s * 0.54, s * 0.16, s * 0.2, s * 0.68);
    ctx.fillStyle = shade(color, 38);
    ctx.fillRect(s * 0.26, s * 0.16, s * 0.48, s * 0.08);
    ctx.fillStyle = shade(color, -28);
    ctx.fillRect(s * 0.46, s * 0.16, s * 0.08, s * 0.68);
  },
  boots(ctx, s, color) {
    ctx.fillStyle = color;
    for (const x of [0.22, 0.54]) {
      ctx.fillRect(s * x, s * 0.2, s * 0.2, s * 0.4);
      ctx.fillRect(s * (x - 0.03), s * 0.6, s * 0.26, s * 0.18);
    }
    ctx.fillStyle = shade(color, -30);
    for (const x of [0.19, 0.51]) ctx.fillRect(s * x, s * 0.74, s * 0.26, s * 0.05);
  },
  amulet(ctx, s, color) {
    ctx.strokeStyle = HANDLE_DARK; ctx.lineWidth = s * 0.055;
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.38, s * 0.28, 0.25, Math.PI - 0.25); ctx.stroke();
    blob(ctx, s * 0.5, s * 0.68, s * 0.17, s * 0.17, color);
    blob(ctx, s * 0.44, s * 0.62, s * 0.05, s * 0.05, shade(color, 55));
  },
  // --- food and reagents ----------------------------------------------------
  grain(ctx, s, color) {
    ctx.strokeStyle = shade(color, -35); ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.9); ctx.lineTo(s * 0.5, s * 0.2); ctx.stroke();
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      const y = s * (0.22 + i * 0.15);
      ctx.fillRect(s * 0.3, y, s * 0.16, s * 0.1);
      ctx.fillRect(s * 0.54, y + s * 0.05, s * 0.16, s * 0.1);
    }
  },
  bread(ctx, s, color) {
    blob(ctx, s * 0.5, s * 0.56, s * 0.33, s * 0.22, color);
    ctx.strokeStyle = shade(color, -32); ctx.lineWidth = s * 0.05;
    for (const dx of [-0.14, 0, 0.14]) {
      ctx.beginPath(); ctx.moveTo(s * (0.5 + dx - 0.04), s * 0.46); ctx.lineTo(s * (0.5 + dx + 0.04), s * 0.62); ctx.stroke();
    }
  },
  root(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.28);
    ctx.quadraticCurveTo(s * 0.78, s * 0.5, s * 0.5, s * 0.88);
    ctx.quadraticCurveTo(s * 0.22, s * 0.5, s * 0.5, s * 0.28);
    ctx.fill();
    ctx.strokeStyle = '#4f8f4a'; ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.42, s * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.62, s * 0.14); ctx.stroke();
  },
  berries(ctx, s, color) {
    for (const [dx, dy, r] of [[-0.13, 0.04, 0.14], [0.13, 0.04, 0.14], [0, -0.13, 0.15], [0, 0.18, 0.12]]) {
      blob(ctx, s * (0.5 + dx), s * (0.5 + dy), s * r, s * r, color);
      blob(ctx, s * (0.5 + dx - r * 0.35), s * (0.5 + dy - r * 0.35), s * r * 0.3, s * r * 0.3, shade(color, 55));
    }
  },
  meat(ctx, s, color) {
    blob(ctx, s * 0.52, s * 0.42, s * 0.28, s * 0.22, color);
    blob(ctx, s * 0.44, s * 0.34, s * 0.1, s * 0.08, shade(color, 40));
    ctx.strokeStyle = '#e6dccb'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.58); ctx.lineTo(s * 0.28, s * 0.86); ctx.stroke();
  },
  dust(ctx, s, color) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 0.16 + (i % 3) * 0.08;
      blob(ctx, s * (0.5 + Math.cos(a) * r), s * (0.5 + Math.sin(a) * r), s * 0.05, s * 0.05, i % 2 ? color : shade(color, 40));
    }
    blob(ctx, s * 0.5, s * 0.5, s * 0.08, s * 0.08, shade(color, 30));
  },
  potion(ctx, s, color) {
    ctx.fillStyle = 'rgba(240,246,252,0.85)';
    ctx.beginPath();
    ctx.moveTo(s * 0.36, s * 0.38); ctx.lineTo(s * 0.64, s * 0.38); ctx.lineTo(s * 0.76, s * 0.86);
    ctx.lineTo(s * 0.24, s * 0.86); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.31, s * 0.58); ctx.lineTo(s * 0.69, s * 0.58); ctx.lineTo(s * 0.76, s * 0.86);
    ctx.lineTo(s * 0.24, s * 0.86); ctx.closePath(); ctx.fill();
    ctx.fillStyle = HANDLE; ctx.fillRect(s * 0.42, s * 0.12, s * 0.16, s * 0.26);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(s * 0.33, s * 0.62, s * 0.05, s * 0.18);
  },
  /** A kite shield: banded face, a boss in the middle, a rim all round. */
  shield(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.22, s * 0.12); ctx.lineTo(s * 0.78, s * 0.12);
    ctx.lineTo(s * 0.78, s * 0.58); ctx.quadraticCurveTo(s * 0.5, s * 0.94, s * 0.22, s * 0.58);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, -32); // reinforcing band
    ctx.fillRect(s * 0.22, s * 0.34, s * 0.56, s * 0.08);
    ctx.fillStyle = shade(color, 34);
    ctx.fillRect(s * 0.22, s * 0.12, s * 0.56, s * 0.06); // lit top rim
    ctx.fillStyle = '#c9ced9';
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.46, s * 0.1, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2f5fa';
    ctx.beginPath(); ctx.ellipse(s * 0.47, s * 0.43, s * 0.04, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  },

  /** A carved totem: a stacked face on a post, crowned with a bright stone. */
  totem(ctx, s, color) {
    const wood = '#a67a4a';
    ctx.fillStyle = wood;
    ctx.fillRect(s * 0.3, s * 0.2, s * 0.4, s * 0.72);
    ctx.fillStyle = shade(wood, -28);
    ctx.fillRect(s * 0.3, s * 0.2, s * 0.07, s * 0.72); // shaded side of the post
    // Carved face.
    ctx.fillStyle = shade(wood, -45);
    ctx.fillRect(s * 0.38, s * 0.42, s * 0.08, s * 0.08);
    ctx.fillRect(s * 0.56, s * 0.42, s * 0.08, s * 0.08);
    ctx.fillRect(s * 0.4, s * 0.62, s * 0.22, s * 0.06);
    // Outstretched arms and the stone set into the crown.
    ctx.fillStyle = wood;
    ctx.fillRect(s * 0.14, s * 0.52, s * 0.16, s * 0.09);
    ctx.fillRect(s * 0.7, s * 0.52, s * 0.16, s * 0.09);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.04); ctx.lineTo(s * 0.66, s * 0.2);
    ctx.lineTo(s * 0.34, s * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 45);
    ctx.fillRect(s * 0.45, s * 0.12, s * 0.06, s * 0.06);
  },

  striker(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(s * 0.24, s * 0.28, s * 0.44, s * 0.16);
    ctx.fillRect(s * 0.3, s * 0.56, s * 0.44, s * 0.16);
    ctx.fillStyle = shade(color, 45);
    ctx.fillRect(s * 0.24, s * 0.28, s * 0.44, s * 0.05);
    ctx.fillStyle = '#f2a13a';
    for (const [x, y] of [[0.74, 0.44], [0.8, 0.5], [0.7, 0.52]]) ctx.fillRect(s * x, s * y, s * 0.06, s * 0.06);
  }
};

/**
 * Light-from-upper-left shading across whatever the shape functions drew.
 * Applying it once here rather than inside every shape is what gives the
 * whole item set one consistent light direction.
 */
function shadeSprite(ctx, size) {
  const d = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (d[i + 3] < 8) continue;
      // -1 at the upper-left corner of the sprite, +1 at the lower-right.
      const grad = ((x + y) / (size * 2 - 2)) * 2 - 1;
      const amt = -grad * 26;
      out[i] = clamp255(d[i] + amt);
      out[i + 1] = clamp255(d[i + 1] + amt);
      out[i + 2] = clamp255(d[i + 2] + amt);
    }
  }
  ctx.putImageData(new ImageData(out, size, size), 0, 0);
}

/**
 * Draws a one-pixel dark border around the sprite: transparent pixels that
 * touch it become outline. This is what keeps small icons legible against
 * the light UI panels, where an unoutlined pale item would wash out.
 */
export function outlineSprite(ctx, size) {
  const d = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8ClampedArray(d);
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : d[(y * size + x) * 4 + 3]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (d[i + 3] >= 8) continue;
      const touches = alphaAt(x - 1, y) > 128 || alphaAt(x + 1, y) > 128 ||
        alphaAt(x, y - 1) > 128 || alphaAt(x, y + 1) > 128;
      if (!touches) continue;
      out[i] = 28; out[i + 1] = 32; out[i + 2] = 44; out[i + 3] = 235;
    }
  }
  ctx.putImageData(new ImageData(out, size, size), 0, 0);
}

export function drawIcon(ctx, size, shape, color) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  const fn = ICON_SHAPES[shape];
  if (fn) fn(ctx, size, color ?? '#999999');
  else { ctx.fillStyle = color ?? '#999999'; ctx.fillRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5); }
  ctx.restore();
  shadeSprite(ctx, size);
  outlineSprite(ctx, size);
}

/**
 * The pixel-art toolkit these patterns are built from, shared with the
 * creature skins in MobSkins.js so blocks and mobs are drawn the same way:
 * wrapping noise quantized into flat tone steps, integer-aligned rectangles,
 * one light direction.
 */
export const pixelArt = { makeRng, makeNoise, paint, px, bevel, step, shade, shadeRgb, mixRgb, hexToRgb, css };

export { shade };
