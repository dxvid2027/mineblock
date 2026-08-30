import { CHUNK_HEIGHT } from './Chunk.js';

// Landmarks — the two structures big enough that you see them from far off
// and walk toward them on purpose.
//
// Everything in Structures.js has to fit inside a single 16x16 chunk,
// because a chunk is built in one pass and must never write into a
// neighbour that may already be generated and meshed. These do not fit, and
// cannot: the Spire alone is 29 blocks across and 56 tall.
//
// So they are placed on a coarser grid instead. The world is divided into
// square regions; each region deterministically holds at most one landmark,
// at a position derived from the region's coordinates and the world seed.
// A chunk being generated asks which landmarks reach into it and builds only
// the slice that lands inside itself. Every chunk that overlaps runs the
// same build with the same seed and writes a different slice, and the pieces
// meet exactly because nothing in the build depends on which chunk is asking.

/** Side of one region, in blocks. One landmark per region, at most. */
export const REGION_SIZE = 384;

/** Candidate spots tried inside a region before giving up on it. */
const PLACEMENT_ATTEMPTS = 6;

// ---------------------------------------------------------------------- //
// Building helpers
//
// Every one of these loops columns on the outside and height on the inside,
// and skips a whole column the moment it falls outside the chunk being
// built. Without that, a chunk clipping a 29x29x56 tower would still walk
// all 47000 of its blocks to throw nearly all of them away.
// ---------------------------------------------------------------------- //

/** Solid box, inclusive on both corners. */
function box(api, x0, y0, z0, x1, y1, z1, block) {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!api.column(x, z)) continue;
      for (let y = y0; y <= y1; y++) api.set(x, y, z, block);
    }
  }
}

/** Box with a hollow interior: walls `thickness` thick, open top and bottom. */
function shell(api, x0, y0, z0, x1, y1, z1, block, thickness = 1) {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!api.column(x, z)) continue;
      const edge = x < x0 + thickness || x > x1 - thickness ||
        z < z0 + thickness || z > z1 - thickness;
      for (let y = y0; y <= y1; y++) {
        if (edge) api.set(x, y, z, block);
        else api.air(x, y, z);
      }
    }
  }
}

function slab(api, x0, z0, x1, z1, y, block) {
  box(api, x0, y, z0, x1, y, z1, block);
}

function pillar(api, x, z, y0, y1, block) {
  if (!api.column(x, z)) return;
  for (let y = y0; y <= y1; y++) api.set(x, y, z, block);
}

/** A hollow ring one block thick, used for bands and cornices. */
function ring(api, x0, z0, x1, z1, y, block) {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      if (!api.column(x, z)) continue;
      api.set(x, y, z, block);
    }
  }
}

/**
 * Sinks a skirt of stone from the platform down into whatever the ground
 * happens to be doing. A landmark sits at one height across its whole
 * footprint, so on any slope one side would otherwise hang in the air.
 */
function foundation(api, x0, z0, x1, z1, y, depth, block) {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!api.column(x, z)) continue;
      for (let y2 = y - depth; y2 < y; y2++) api.set(x, y2, z, block);
    }
  }
}

/** Knocks holes in a range so a ruin reads as ruined. */
function erode(api, x0, y0, z0, x1, y1, z1, amount) {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!api.column(x, z)) continue;
      for (let y = y0; y <= y1; y++) if (api.rng() < amount) api.air(x, y, z);
    }
  }
}

// ---------------------------------------------------------------------- //
// The landmarks
// ---------------------------------------------------------------------- //
export const MEGA_STRUCTURES = [
  {
    id: 'hollow_spire',
    displayName: 'The Hollow Spire',
    dimensions: ['overworld'],
    radius: 15,   // half-width of the footprint, for region and chunk overlap
    height: 56,
    loot: 'hollow_spire',
    build(api) {
      const S = 'stone_bricks', P = 'polished_stone';
      const floors = 7, storey = 8;

      // Plinth and the ground it stands on.
      box(api, -14, -2, -14, 14, 0, 14, S);
      slab(api, -14, -14, 14, 14, 1, P);
      foundation(api, -14, -14, 14, 14, -2, 14, S);

      // Four buttresses stepping outward from the base.
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        for (let i = 0; i < 6; i++) {
          const d = 8 + i;
          box(api, sx * d - 1, 1, sz * d - 1, sx * d + 1, 14 - i * 2, sz * d + 1, S);
        }
      }

      // The shaft: seven storeys, each one block narrower than the last, so
      // the tower tapers as it climbs.
      for (let f = 0; f < floors; f++) {
        const y0 = 1 + f * storey;
        const r = 9 - f;
        shell(api, -r, y0, -r, r, y0 + storey, r, S, 2);
        slab(api, -r + 2, -r + 2, r - 2, r - 2, y0, f === 0 ? P : S);
        ring(api, -r, -r, r, r, y0 + storey - 1, P); // string course between storeys

        // Window slits on all four walls, at head height.
        for (let i = -r + 3; i <= r - 3; i += 3) {
          for (let h = 2; h <= 4; h++) {
            api.air(i, y0 + h, -r); api.air(i, y0 + h, -r + 1);
            api.air(i, y0 + h, r); api.air(i, y0 + h, r - 1);
            api.air(-r, y0 + h, i); api.air(-r + 1, y0 + h, i);
            api.air(r, y0 + h, i); api.air(r - 1, y0 + h, i);
          }
        }

        // The stair shaft: a hole through each floor with a ladder under it.
        const hx = r - 4, hz = r - 4;
        for (let x = hx - 1; x <= hx + 1; x++) {
          for (let z = hz - 1; z <= hz + 1; z++) api.air(x, y0, z);
        }
        for (let y = y0 - storey + 1; y <= y0; y++) api.set(hx, y, hz + 2, 'ladder');
        api.set(-hx, y0 + 1, -hz, 'torch');
        api.set(hx, y0 + 1, -hz, 'torch');
      }

      // Doorway at the foot of the tower.
      for (let y = 1; y <= 4; y++) {
        for (let x = -2; x <= 2; x++) { api.air(x, y, -9); api.air(x, y, -8); }
      }

      // Loot: low, halfway up, and at the top, so the climb pays three times.
      api.crate(-5, 2, 5, 'hollow_spire');
      api.crate(3, 1 + storey * 3 + 1, -3, 'hollow_spire');
      api.crate(0, 1 + storey * 6 + 1, 2, 'hollow_spire');

      // The crown: an open lantern chamber above the last storey.
      const top = 1 + floors * storey;
      const cr = 9 - floors + 1;
      ring(api, -cr, -cr, cr, cr, top, P);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        pillar(api, sx * cr, sz * cr, top, top + 4, S);
      }
      slab(api, -cr, -cr, cr, cr, top + 5, P);
      api.set(0, top + 1, 0, 'glow_lantern');
      api.set(0, top + 2, 0, 'glow_lantern');

      // The top third has stood the longest and shows it.
      erode(api, -8, 1 + storey * 5, -8, 8, top + 5, 8, 0.06);
    }
  },

  {
    id: 'emberforge',
    displayName: 'The Emberforge',
    dimensions: ['ember_expanse'],
    radius: 16,
    height: 46,
    loot: 'emberforge',
    build(api) {
      const A = 'ashstone', B = 'sunbaked_brick', L = 'cinder_log';

      // Terrace and foundations.
      box(api, -15, -2, -15, 15, 0, 15, A);
      slab(api, -15, -15, 15, 15, 1, B);
      foundation(api, -15, -15, 15, 15, -2, 16, A);

      // Outer wall with a wide arch in the middle of each side.
      shell(api, -13, 1, -13, 13, 13, 13, A, 2);
      for (let i = -3; i <= 3; i++) {
        const h = 8 - Math.abs(i); // the arch's curve
        for (let y = 2; y <= h; y++) {
          api.air(i, y, -13); api.air(i, y, -12);
          api.air(i, y, 13); api.air(i, y, 12);
          api.air(-13, y, i); api.air(-12, y, i);
          api.air(13, y, i); api.air(12, y, i);
        }
      }
      ring(api, -13, -13, 13, 13, 14, B);

      // Corner towers.
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = sx * 12, cz = sz * 12;
        shell(api, cx - 3, 1, cz - 3, cx + 3, 24, cz + 3, A, 1);
        ring(api, cx - 3, cz - 3, cx + 3, cz + 3, 25, B);
        api.set(cx, 26, cz, 'glow_lantern');
        for (let y = 2; y <= 22; y += 4) api.set(cx + sx * 3, y, cz, 'cinderbloom');
      }

      // The chimney: the tallest thing in the dimension, open all the way up
      // so the glow at its foot is visible from the rim.
      shell(api, -4, 1, -4, 4, 42, 4, A, 1);
      for (let y = 6; y <= 40; y += 6) ring(api, -4, -4, 4, 4, y, B);
      box(api, -2, 1, -2, 2, 1, 2, 'magma');
      for (let y = 2; y <= 40; y++) { // interior kept clear
        for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) api.air(x, y, z);
      }

      // Four magma channels running from the chimney to the outer wall.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let d = 5; d <= 11; d++) {
          const x = dx * d, z = dz * d;
          api.set(x, 1, z, 'magma');
          api.set(x + dz, 1, z + dx, B);
          api.set(x - dz, 1, z - dx, B);
        }
      }

      // Scaffolds and galleries of cinderwood around the yard.
      for (const [sx, sz] of [[-1, 1], [1, -1]]) {
        const gx = sx * 8, gz = sz * 8;
        box(api, gx - 3, 1, gz - 3, gx + 3, 1, gz + 3, L);
        for (let y = 2; y <= 7; y++) { pillar(api, gx - 3, gz - 3, y, y, L); pillar(api, gx + 3, gz + 3, y, y, L); }
        slab(api, gx - 3, gz - 3, gx + 3, gz + 3, 8, L);
        api.set(gx, 9, gz, 'glow_lantern');
      }

      // Vaults: one at the forge floor, one on a gallery, one up a tower.
      api.crate(6, 2, 6, 'emberforge');
      api.crate(-8, 9, 8, 'emberforge');
      api.crate(-12, 12, -12, 'emberforge');

      erode(api, -13, 8, -13, 13, 25, 13, 0.05);
    }
  }
];

/**
 * The landmark belonging to one region, or null where the region rolled an
 * unusable spot. `heightAt(x, z)` must be the generator's own noise-based
 * surface height: it has to give the same answer no matter which chunk is
 * asking, so it cannot read placed blocks.
 */
export function megaStructureForRegion(regionX, regionZ, { seed, dimensionId, hash2D, heightAt, seaLevel, isEmber }) {
  const candidates = MEGA_STRUCTURES.filter((m) => m.dimensions.includes(dimensionId));
  if (!candidates.length) return null;

  const salt = seed ^ 0x5eed1a11;
  const mega = candidates[Math.floor(hash2D(regionX, regionZ, salt) * candidates.length) % candidates.length];

  // Keep the whole footprint inside its own region, so two landmarks in
  // neighbouring regions can never overlap each other.
  const margin = mega.radius + 8;
  const span = REGION_SIZE - margin * 2;

  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const x = regionX * REGION_SIZE + margin + Math.floor(hash2D(regionX + attempt * 7, regionZ, salt + 11) * span);
    const z = regionZ * REGION_SIZE + margin + Math.floor(hash2D(regionX, regionZ + attempt * 13, salt + 29) * span);
    const ground = heightAt(x, z);

    // Never in the sea, and never so high that the top would be cut off by
    // the world ceiling.
    if (!isEmber && ground <= seaLevel + 1) continue;
    if (ground < 6 || ground + mega.height > CHUNK_HEIGHT - 4) continue;
    return { mega, x, y: ground + 1, z };
  }
  return null;
}
