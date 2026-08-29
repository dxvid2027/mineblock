// Original, from-scratch gradient-noise implementation used to drive all
// procedural generation (terrain height, biome fields, caves, ore veins).
// This is a classic Perlin-style permutation-gradient noise (not copied from
// any reference implementation) with 2D/3D sampling and an fBm helper for
// combining octaves.

function buildPermutation(seed) {
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;

  // xorshift32 PRNG seeded deterministically from the world seed, so the
  // same seed always reproduces the same terrain.
  let state = seed >>> 0 || 0x9e3779b9;
  const rand = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };

  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  const doubled = new Uint8Array(512);
  for (let i = 0; i < 512; i++) doubled[i] = perm[i & 255];
  return doubled;
}

const GRAD_3D = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

export class Noise {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.perm = buildPermutation(this.seed);
  }

  /** 2D Perlin noise, output roughly in [-1, 1]. */
  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const p = this.perm;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];

    const grad2 = (hash, x, y) => {
      const h = hash & 3;
      const gx = (h & 1) === 0 ? x : -x;
      const gy = (h & 2) === 0 ? y : -y;
      return gx + gy;
    };

    const x1 = lerp(grad2(aa, x, y), grad2(ba, x - 1, y), u);
    const x2 = lerp(grad2(ab, x, y - 1), grad2(bb, x - 1, y - 1), u);
    return lerp(x1, x2, v);
  }

  /** 3D Perlin noise, output roughly in [-1, 1]. Used for caves/ore blobs. */
  noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const p = this.perm;

    const grad3 = (hash, x, y, z) => {
      const g = GRAD_3D[hash % 12];
      return g[0] * x + g[1] * y + g[2] * z;
    };

    const aaa = p[p[p[X] + Y] + Z], aba = p[p[p[X] + Y + 1] + Z];
    const aab = p[p[p[X] + Y] + Z + 1], abb = p[p[p[X] + Y + 1] + Z + 1];
    const baa = p[p[p[X + 1] + Y] + Z], bba = p[p[p[X + 1] + Y + 1] + Z];
    const bab = p[p[p[X + 1] + Y] + Z + 1], bbb = p[p[p[X + 1] + Y + 1] + Z + 1];

    const x1 = lerp(grad3(aaa, x, y, z), grad3(baa, x - 1, y, z), u);
    const x2 = lerp(grad3(aba, x, y - 1, z), grad3(bba, x - 1, y - 1, z), u);
    const y1 = lerp(x1, x2, v);

    const x3 = lerp(grad3(aab, x, y, z - 1), grad3(bab, x - 1, y, z - 1), u);
    const x4 = lerp(grad3(abb, x, y - 1, z - 1), grad3(bbb, x - 1, y - 1, z - 1), u);
    const y2 = lerp(x3, x4, v);

    return lerp(y1, y2, w);
  }

  /** Fractal Brownian motion: sums octaves of 2D noise for natural-looking terrain. */
  fbm2D(x, y, { octaves = 4, lacunarity = 2.0, gain = 0.5, frequency = 1, amplitude = 1 } = {}) {
    let sum = 0, amp = amplitude, freq = frequency, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3D(x, y, z, { octaves = 3, lacunarity = 2.0, gain = 0.5, frequency = 1, amplitude = 1 } = {}) {
    let sum = 0, amp = amplitude, freq = frequency, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise3D(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

/** Simple deterministic hash -> [0,1), used for scatter placement (trees, ores, mobs). */
export function hash2D(x, y, seed = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
