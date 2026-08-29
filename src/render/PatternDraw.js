// Original procedural texture generation. Every block/item "texture" in
// MineBlock is a small canvas painted algorithmically at startup — nothing
// is loaded from an image file, so all visuals here are generated content.
// Patterns are deliberately simple/flat (a handful of shaded pixels) to
// read clearly at the tiny on-screen size of a voxel face, in the spirit of
// classic blocky sandbox games, while using entirely original palettes.

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

function shade(hex, amt) {
  const c = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function fillBase(ctx, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
}

function speckleNoise(ctx, size, rng, grain, density, ampLow, ampHigh) {
  const pixels = Math.round(size * size * density);
  for (let i = 0; i < pixels; i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const amt = ampLow + rng() * (ampHigh - ampLow);
    ctx.fillStyle = shade(grain, amt);
    ctx.fillRect(x, y, 1, 1);
  }
}

const PATTERNS = {
  solid(ctx, size, { color }) {
    fillBase(ctx, size, color);
  },
  grain(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    speckleNoise(ctx, size, rng, grain, 0.35, -20, 20);
  },
  speckle(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    speckleNoise(ctx, size, rng, grain, 0.12, -10, 40);
    for (let i = 0; i < Math.round(size * size * 0.03); i++) {
      const x = Math.floor(rng() * size), y = Math.floor(rng() * size);
      ctx.fillStyle = grain;
      ctx.fillRect(x, y, 2, 2);
    }
  },
  cobble(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = shade(grain, -20);
    ctx.lineWidth = 1;
    const cells = 4;
    const step = size / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const jitter = (rng() - 0.5) * step * 0.3;
        ctx.strokeRect(x * step + jitter, y * step + jitter, step, step);
      }
    }
    speckleNoise(ctx, size, rng, grain, 0.08, -15, 15);
  },
  checker(ctx, size, { color, grain }) {
    const n = 4, step = size / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? color : grain;
      ctx.fillRect(x * step, y * step, step, step);
    }
  },
  planks(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    const planksN = 4, step = size / planksN;
    ctx.strokeStyle = shade(grain, -10);
    for (let i = 1; i < planksN; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    speckleNoise(ctx, size, rng, grain, 0.06, -8, 8);
  },
  rings(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    const cx = size / 2, cy = size / 2;
    for (let r = size * 0.1; r < size * 0.6; r += size * 0.11) {
      ctx.strokeStyle = shade(grain, -5);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
  },
  bark(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    const cols = 5, step = size / cols;
    ctx.strokeStyle = shade(grain, -8);
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    }
    speckleNoise(ctx, size, rng, grain, 0.08, -15, 15);
  },
  leafy(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    speckleNoise(ctx, size, rng, grain, 0.28, -18, 18);
  },
  sprig(ctx, size, { color, grain }) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.08);
    for (const [x0f, y0f, x1f, y1f] of [[0.5, 1, 0.3, 0.3], [0.5, 1, 0.5, 0.1], [0.5, 1, 0.7, 0.35]]) {
      ctx.beginPath(); ctx.moveTo(x0f * size, y0f * size); ctx.lineTo(x1f * size, y1f * size); ctx.stroke();
    }
  },
  flower(ctx, size, { color, grain }) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = grain; ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath(); ctx.moveTo(size * 0.5, size); ctx.lineTo(size * 0.5, size * 0.4); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(size * 0.5, size * 0.3, size * 0.18, 0, Math.PI * 2); ctx.fill();
  },
  crop(ctx, size, { color, grain }) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.07);
    for (const xf of [0.25, 0.5, 0.75]) {
      ctx.beginPath(); ctx.moveTo(xf * size, size); ctx.lineTo(xf * size + (xf - 0.5) * size * 0.3, size * 0.15); ctx.stroke();
    }
    ctx.strokeStyle = grain;
    ctx.beginPath(); ctx.moveTo(0.5 * size, size); ctx.lineTo(0.5 * size, size * 0.1); ctx.stroke();
  },
  liquid(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = shade(grain, 10);
    for (let i = 0; i < 3; i++) {
      const y = size * (0.25 + i * 0.25) + (rng() - 0.5) * 3;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += size / 8) ctx.lineTo(x, y + Math.sin(x * 0.5 + i) * 2);
      ctx.stroke();
    }
  },
  torch(ctx, size, { color, grain }) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color;
    ctx.fillRect(size * 0.42, size * 0.35, size * 0.16, size * 0.6);
    ctx.fillStyle = grain;
    ctx.beginPath(); ctx.arc(size * 0.5, size * 0.28, size * 0.16, 0, Math.PI * 2); ctx.fill();
  },
  runic(ctx, size, { color, grain }, rng) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = grain; ctx.lineWidth = 1;
    ctx.strokeRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
    ctx.beginPath(); ctx.moveTo(size * 0.5, size * 0.2); ctx.lineTo(size * 0.5, size * 0.8); ctx.stroke();
    speckleNoise(ctx, size, rng, grain, 0.05, 0, 30);
  },
  gridTop(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = shade(grain, -10);
    ctx.strokeRect(size * 0.15, size * 0.15, size * 0.7, size * 0.7);
    ctx.beginPath(); ctx.moveTo(size * 0.5, size * 0.15); ctx.lineTo(size * 0.5, size * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * 0.15, size * 0.5); ctx.lineTo(size * 0.85, size * 0.5); ctx.stroke();
  },
  furnaceFace(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    ctx.fillStyle = grain;
    ctx.fillRect(size * 0.3, size * 0.35, size * 0.4, size * 0.3);
  },
  crate(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = shade(grain, -20);
    ctx.strokeRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8);
    ctx.strokeRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5);
  },
  brick(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = shade(grain, -20);
    const rows = 4, rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (size / 4);
      ctx.beginPath(); ctx.moveTo(0, r * rowH); ctx.lineTo(size, r * rowH); ctx.stroke();
      for (let x = -size / 2; x < size * 1.5; x += size / 2) {
        ctx.beginPath(); ctx.moveTo(x + offset, r * rowH); ctx.lineTo(x + offset, (r + 1) * rowH); ctx.stroke();
      }
    }
  },
  glass(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = grain;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.beginPath(); ctx.moveTo(size * 0.2, size * 0.2); ctx.lineTo(size * 0.5, size * 0.5); ctx.stroke();
  },
  cloth(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    const n = 8, step = size / n;
    ctx.strokeStyle = shade(grain, -10);
    for (let i = 0; i <= n; i += 2) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
  },
  shelf(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    ctx.fillStyle = grain;
    for (let i = 0; i < 5; i++) ctx.fillRect(size * (0.1 + i * 0.18), size * 0.2, size * 0.1, size * 0.6);
  },
  ladder(ctx, size, { color, grain }) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.beginPath(); ctx.moveTo(size * 0.2, 0); ctx.lineTo(size * 0.2, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size * 0.8, 0); ctx.lineTo(size * 0.8, size); ctx.stroke();
    ctx.strokeStyle = grain;
    for (const yf of [0.15, 0.45, 0.75]) {
      ctx.beginPath(); ctx.moveTo(size * 0.2, size * yf); ctx.lineTo(size * 0.8, size * yf); ctx.stroke();
    }
  },
  furrow(ctx, size, { color, grain }) {
    fillBase(ctx, size, color);
    ctx.strokeStyle = shade(grain, -12);
    for (let x = 0; x < size; x += size / 4) {
      ctx.beginPath(); ctx.moveTo(x + 1, 0); ctx.lineTo(x + 1, size); ctx.stroke();
    }
  },
  grassSide(ctx, size, { color, grain, top }) {
    fillBase(ctx, size, color);
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, size, size * 0.28);
    ctx.fillStyle = grain;
    for (let x = 0; x < size; x += 2) {
      const h = size * (0.28 + Math.sin(x) * 0.03);
      ctx.fillRect(x, size * 0.22, 2, h - size * 0.22);
    }
  }
};

export function drawPattern(ctx, size, spec, seed) {
  const rng = makeRng(seed);
  const fn = PATTERNS[spec.pattern] ?? PATTERNS.solid;
  fn(ctx, size, spec, rng);
}

// ---------------- Item icon shapes (used for UI slot canvases) ----------------
const ICON_SHAPES = {
  chunk(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.6); ctx.lineTo(s * 0.4, s * 0.2); ctx.lineTo(s * 0.75, s * 0.3); ctx.lineTo(s * 0.8, s * 0.7); ctx.lineTo(s * 0.5, s * 0.85); ctx.closePath(); ctx.fill(); },
  ingot(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.22, s * 0.65); ctx.lineTo(s * 0.32, s * 0.35); ctx.lineTo(s * 0.68, s * 0.35); ctx.lineTo(s * 0.78, s * 0.65); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke(); },
  gem(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.15); ctx.lineTo(s * 0.8, s * 0.45); ctx.lineTo(s * 0.5, s * 0.9); ctx.lineTo(s * 0.2, s * 0.45); ctx.closePath(); ctx.fill(); },
  stick(ctx, s, color) { ctx.strokeStyle = color; ctx.lineWidth = s * 0.12; ctx.beginPath(); ctx.moveTo(s * 0.25, s * 0.85); ctx.lineTo(s * 0.75, s * 0.15); ctx.stroke(); },
  fiber(ctx, s, color) { ctx.strokeStyle = color; ctx.lineWidth = s * 0.08; for (const dx of [-0.1, 0, 0.1]) { ctx.beginPath(); ctx.moveTo(s * (0.5 + dx), s * 0.85); ctx.lineTo(s * (0.5 + dx * 3), s * 0.15); ctx.stroke(); } },
  pickaxe(ctx, s, color) { ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.9); ctx.lineTo(s * 0.5, s * 0.4); ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.moveTo(s * 0.15, s * 0.3); ctx.quadraticCurveTo(s * 0.5, s * 0.1, s * 0.85, s * 0.3); ctx.stroke(); },
  axe(ctx, s, color) { ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.9); ctx.lineTo(s * 0.65, s * 0.25); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.55, s * 0.15); ctx.lineTo(s * 0.9, s * 0.3); ctx.lineTo(s * 0.6, s * 0.5); ctx.closePath(); ctx.fill(); },
  shovel(ctx, s, color) { ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.9); ctx.lineTo(s * 0.5, s * 0.35); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.22, s * 0.16, s * 0.14, 0, 0, Math.PI * 2); ctx.fill(); },
  sword(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.1); ctx.lineTo(s * 0.62, s * 0.55); ctx.lineTo(s * 0.38, s * 0.55); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.55); ctx.lineTo(s * 0.5, s * 0.9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.58); ctx.lineTo(s * 0.7, s * 0.58); ctx.stroke(); },
  hoe(ctx, s, color) { ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(s * 0.45, s * 0.9); ctx.lineTo(s * 0.6, s * 0.3); ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.moveTo(s * 0.35, s * 0.25); ctx.lineTo(s * 0.85, s * 0.25); ctx.stroke(); },
  hand(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.6, s * 0.2, s * 0.28, 0, 0, Math.PI * 2); ctx.fill(); },
  helmet(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.32, Math.PI, 0); ctx.lineTo(s * 0.78, s * 0.65); ctx.lineTo(s * 0.22, s * 0.65); ctx.closePath(); ctx.fill(); },
  chest(ctx, s, color) { ctx.fillStyle = color; ctx.fillRect(s * 0.25, s * 0.2, s * 0.5, s * 0.6); ctx.fillRect(s * 0.12, s * 0.25, s * 0.13, s * 0.4); ctx.fillRect(s * 0.75, s * 0.25, s * 0.13, s * 0.4); },
  legs(ctx, s, color) { ctx.fillStyle = color; ctx.fillRect(s * 0.28, s * 0.15, s * 0.2, s * 0.7); ctx.fillRect(s * 0.52, s * 0.15, s * 0.2, s * 0.7); },
  boots(ctx, s, color) { ctx.fillStyle = color; ctx.fillRect(s * 0.25, s * 0.15, s * 0.2, s * 0.5); ctx.fillRect(s * 0.22, s * 0.6, s * 0.26, s * 0.2); ctx.fillRect(s * 0.55, s * 0.15, s * 0.2, s * 0.5); ctx.fillRect(s * 0.52, s * 0.6, s * 0.26, s * 0.2); },
  amulet(ctx, s, color) { ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.35, s * 0.28, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.68, s * 0.16, 0, Math.PI * 2); ctx.fill(); },
  grain(ctx, s, color) { ctx.fillStyle = color; for (let i = 0; i < 6; i++) ctx.fillRect(s * (0.2 + (i % 3) * 0.25), s * (0.3 + Math.floor(i / 3) * 0.3), s * 0.15, s * 0.15); },
  bread(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.55, s * 0.32, s * 0.2, 0, 0, Math.PI * 2); ctx.fill(); },
  root(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.2); ctx.quadraticCurveTo(s * 0.7, s * 0.5, s * 0.5, s * 0.85); ctx.quadraticCurveTo(s * 0.3, s * 0.5, s * 0.5, s * 0.2); ctx.fill(); },
  berries(ctx, s, color) { ctx.fillStyle = color; for (const [dx, dy] of [[-0.12, 0], [0.12, 0], [0, -0.15], [0, 0.15]]) { ctx.beginPath(); ctx.arc(s * (0.5 + dx), s * (0.5 + dy), s * 0.14, 0, Math.PI * 2); ctx.fill(); } },
  meat(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.45, s * 0.28, s * 0.22, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e0d0c0'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.75); ctx.lineTo(s * 0.5, s * 0.9); ctx.stroke(); },
  dust(ctx, s, color) { ctx.fillStyle = color; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.beginPath(); ctx.arc(s * (0.5 + Math.cos(a) * 0.28), s * (0.5 + Math.sin(a) * 0.28), s * 0.05, 0, Math.PI * 2); ctx.fill(); } },
  shard(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.1); ctx.lineTo(s * 0.65, s * 0.5); ctx.lineTo(s * 0.5, s * 0.9); ctx.lineTo(s * 0.35, s * 0.5); ctx.closePath(); ctx.fill(); },
  potion(ctx, s, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.38, s * 0.4); ctx.lineTo(s * 0.62, s * 0.4); ctx.lineTo(s * 0.72, s * 0.85); ctx.lineTo(s * 0.28, s * 0.85); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#8a6a4f'; ctx.fillRect(s * 0.42, s * 0.15, s * 0.16, s * 0.25); },
  striker(ctx, s, color) { ctx.fillStyle = color; ctx.fillRect(s * 0.3, s * 0.3, s * 0.4, s * 0.15); ctx.fillRect(s * 0.3, s * 0.55, s * 0.4, s * 0.15); }
};

export function drawIcon(ctx, size, shape, color) {
  ctx.clearRect(0, 0, size, size);
  const fn = ICON_SHAPES[shape];
  if (fn) fn(ctx, size, color);
  else { ctx.fillStyle = color; ctx.fillRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5); }
}
