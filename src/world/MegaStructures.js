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
    // The tallest block this build places, measured from the base — the
    // crown slab at 1 + floors * storey + 5. Placement uses it to keep the
    // whole tower under the world ceiling, so it must stay >= what build()
    // actually reaches (tests/megastructures.test.js checks that it does).
    // Six storeys is what fits: the overworld only ever offers ground
    // between the shoreline and y=68, and a seventh put the crown — and its
    // lanterns — above y=128, where it was silently sliced off. The build
    // tops out 54 above its base, so 55 is the true figure; declaring 56
    // cost the Spire every hilltop at y=68 once placement started counting
    // from the base block rather than the ground under it.
    height: 55,
    loot: 'hollow_spire',
    build(api) {
      const S = 'stone_bricks', P = 'polished_stone';
      const floors = 6, storey = 8;

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
      api.crate(0, 1 + storey * (floors - 1) + 1, 2, 'hollow_spire');

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
      erode(api, -8, 1 + storey * (floors - 2), -8, 8, top + 5, 8, 0.06);
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
      // Columns outside, height inside, and skip the column the moment it
      // falls outside the chunk being built — the same shape as the helpers
      // above, and for the same reason.
      for (let x = -3; x <= 3; x++) {
        for (let z = -3; z <= 3; z++) {
          if (!api.column(x, z)) continue;
          for (let y = 2; y <= 40; y++) api.air(x, y, z); // interior kept clear
        }
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
,

  // ------------------------------------------------------------------ //
  // The Eternal Rift
  //
  // Four landmarks rather than one, because the Rift is the endgame and its
  // horizon is supposed to have something on it wherever you look. The
  // region grid still allows only one per region, so they are spread out —
  // megaStructureForRegion picks between whichever candidates a dimension
  // offers, seeded from the region's own coordinates.
  // ------------------------------------------------------------------ //
  {
    id: 'ruined_fortress',
    displayName: 'The Ruined Fortress',
    dimensions: ['eternal_rift'],
    radius: 16,
    height: 40,
    loot: 'treasure_vault',
    build(api) {
      const W = 'rift_brick', M = 'pale_marble', B = 'runed_basalt';
      box(api, -15, -2, -15, 15, 0, 15, W);
      slab(api, -15, -15, 15, 15, 1, M);
      foundation(api, -15, -15, 15, 15, -2, 14, W);

      // Curtain wall with a gatehouse on the north face.
      shell(api, -14, 1, -14, 14, 12, 14, W, 2);
      for (let i = -2; i <= 2; i++) for (let y = 2; y <= 6; y++) { api.air(i, y, -14); api.air(i, y, -13); }
      ring(api, -14, -14, 14, 14, 13, B);

      // Four corner keeps of different heights, so the silhouette is not a box.
      const keeps = [[-1, -1, 26], [1, -1, 22], [-1, 1, 30], [1, 1, 24]];
      for (const [sx, sz, top] of keeps) {
        const cx = sx * 11, cz = sz * 11;
        shell(api, cx - 4, 1, cz - 4, cx + 4, top, cz + 4, W, 1);
        ring(api, cx - 4, cz - 4, cx + 4, cz + 4, top + 1, M);
        api.set(cx, top + 2, cz, 'aether_crystal');
        for (let y = 5; y <= top - 3; y += 5) { api.air(cx - 4, y, cz); api.air(cx + 4, y, cz); }
        for (let y = 2; y <= top; y++) api.set(cx + 3, y, cz + 3, 'ladder');
      }

      // Great hall down the middle of the yard.
      shell(api, -6, 1, -5, 6, 9, 5, M, 1);
      for (let i = -4; i <= 4; i += 2) api.set(i, 10, 0, 'aether_crystal');
      for (let y = 2; y <= 5; y++) { api.air(0, y, -5); api.air(0, y, 5); }

      api.crate(-4, 2, 0, 'treasure_vault');
      api.crate(9, 2, -9, 'ancient_battlefield');
      api.crate(-11, 2, 11, 'crystal_cache');
      erode(api, -14, 6, -14, 14, 20, 14, 0.07);
    }
  },
  {
    id: 'floating_temple',
    displayName: 'The Floating Temple',
    dimensions: ['eternal_rift'],
    radius: 14,
    // Built high on purpose: it sits in the island band, so it reads as
    // hanging in the air rather than standing on anything.
    height: 34,
    lift: 46,
    loot: 'forgotten_shrine',
    build(api) {
      const M = 'pale_marble', B = 'runed_basalt', G = 'void_glass';
      // An inverted stepped base, widest at the top — nothing holds it up.
      for (let i = 0; i < 5; i++) {
        const r = 5 + i * 2;
        slab(api, -r, -r, r, r, i, i === 4 ? M : B);
      }
      // Colonnade.
      const cols = [];
      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        cols.push([Math.round(Math.cos(angle) * 10), Math.round(Math.sin(angle) * 10)]);
      }
      for (const [cx, cz] of cols) pillar(api, cx, cz, 5, 14, M);
      ring(api, -11, -11, 11, 11, 15, M);
      slab(api, -11, -11, 11, 11, 16, M);

      // Inner sanctum with glass walls and the crystal it was built around.
      shell(api, -4, 5, -4, 4, 13, 4, G, 1);
      slab(api, -4, -4, 4, 4, 14, M);
      for (let y = 6; y <= 12; y++) api.set(0, y, 0, 'aether_crystal');
      for (let y = 6; y <= 8; y++) { api.air(0, y, -4); api.air(0, y, 4); }

      api.crate(3, 6, 3, 'forgotten_shrine');
      api.crate(-3, 6, -3, 'treasure_vault');
      // A ladder down through the base, so it can be left without falling.
      for (let y = -1; y <= 5; y++) api.set(6, y, 0, 'ladder');
      erode(api, -11, 12, -11, 11, 16, 11, 0.10);
    }
  },
  {
    id: 'sunken_city',
    displayName: 'The Sunken City',
    dimensions: ['eternal_rift'],
    radius: 15,
    height: 18,
    // Sunk below the surface: a city with its roofs at ground level.
    lift: -22,
    loot: 'underground_city',
    build(api) {
      const W = 'rift_brick', M = 'pale_marble', B = 'runed_basalt';
      // Hollow out the cavern the city stands in.
      for (let x = -14; x <= 14; x++) {
        for (let z = -14; z <= 14; z++) {
          if (!api.column(x, z)) continue;
          for (let y = 1; y <= 16; y++) api.air(x, y, z);
        }
      }
      slab(api, -14, -14, 14, 14, 0, W);
      // Streets on a grid, houses in the blocks between them.
      for (let bx = -12; bx <= 8; bx += 7) {
        for (let bz = -12; bz <= 8; bz += 7) {
          const h = 4 + Math.floor(api.rng() * 5);
          shell(api, bx, 1, bz, bx + 4, h, bz + 4, W, 1);
          api.air(bx + 2, 1, bz); api.air(bx + 2, 2, bz);
          slab(api, bx, bz, bx + 4, bz + 4, h + 1, M);
          if (api.rng() < 0.5) api.set(bx + 2, h + 2, bz + 2, 'aether_crystal');
        }
      }
      // A plaza with a monument, so the place has a centre.
      slab(api, -3, -3, 3, 3, 1, M);
      pillar(api, 0, 0, 2, 10, B);
      api.set(0, 11, 0, 'aether_crystal');
      // Ceiling lights, otherwise it is pitch dark down here.
      for (let x = -12; x <= 12; x += 6) for (let z = -12; z <= 12; z += 6) api.set(x, 16, z, 'aether_crystal');
      slab(api, -14, -14, 14, 14, 17, W);

      api.crate(-6, 2, 6, 'underground_city');
      api.crate(6, 2, -6, 'treasure_vault');
      api.crate(0, 2, 8, 'hidden_laboratory');
      erode(api, -14, 3, -14, 14, 14, 14, 0.05);
    }
  },
  {
    id: 'titan_outpost',
    displayName: 'A Boss Outpost',
    dimensions: ['eternal_rift'],
    radius: 12,
    height: 22,
    loot: 'ancient_battlefield',
    // Where the Riftbound Colossus stands. Game.js reads this flag to know
    // which landmarks are worth putting a mini-boss on.
    guardian: 'riftbound_colossus',
    build(api) {
      const B = 'runed_basalt', M = 'pale_marble';
      box(api, -11, -2, -11, 11, 0, 11, B);
      slab(api, -11, -11, 11, 11, 1, M);
      foundation(api, -11, -11, 11, 11, -2, 12, B);
      // An open ring of standing stones: a place to fight, not to hide in.
      for (let a = 0; a < 10; a++) {
        const angle = (a / 10) * Math.PI * 2;
        const cx = Math.round(Math.cos(angle) * 9), cz = Math.round(Math.sin(angle) * 9);
        for (let y = 2; y <= 9 + (a % 3) * 3; y++) api.set(cx, y, cz, B);
        api.set(cx, 10 + (a % 3) * 3, cz, 'aether_crystal');
      }
      ring(api, -4, -4, 4, 4, 1, M);
      api.crate(-2, 2, -2, 'ancient_battlefield');
      api.crate(2, 2, 2, 'treasure_vault');
      erode(api, -11, 4, -11, 11, 16, 11, 0.06);
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

    // `lift` moves a landmark off the ground it was placed against: positive
    // for the Floating Temple, which hangs up among the islands, negative for
    // the Sunken City, whose roofs come out at ground level. Both ends of the
    // build have to stay inside the world.
    const base = ground + 1 + (mega.lift ?? 0);

    // Never in the sea, and never so high that the top would be cut off by
    // the world ceiling.
    if (!isEmber && seaLevel > 0 && ground <= seaLevel + 1) continue;
    if (ground < 6) continue;
    if (base < 2 || base + mega.height > CHUNK_HEIGHT - 4) continue;
    return { mega, x, y: base, z };
  }
  return null;
}
