import * as THREE from 'three';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './Chunk.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';

// Face definitions: each has a normal, the 4 corner offsets (in winding
// order) and which axis-neighbor cell to test for culling/lighting.
//
// Winding matters: the opaque material renders FrontSide only, so a quad
// whose corners wind the wrong way is culled and the block becomes
// see-through from that direction. Each corner list below is ordered
// counter-clockwise as seen from OUTSIDE the block, i.e. cross(c1-c0, c2-c1)
// must equal `dir`.
const FACES = [
  { dir: [0, 1, 0], name: 'top', corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], name: 'bottom', corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], name: 'side', corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] }, // south (+z)
  { dir: [0, 0, -1], name: 'side', corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }, // north (-z)
  { dir: [1, 0, 0], name: 'side', corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] }, // east (+x)
  { dir: [-1, 0, 0], name: 'side', corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] } // west (-x)
];

const FACE_SHADE = { top: 1.0, bottom: 0.55, side: 0.8 };

// Blocks that should render with true alpha blending (translucency) rather
// than as an opaque cube or an alpha-tested cutout.
const BLEND_BLOCKS = new Set(['glass_pane', 'ice_sheet']);

function pickLayer(block, transparent, cutout, opaque) {
  if (block.liquid || BLEND_BLOCKS.has(block.name)) return transparent;
  if (block.transparent) return cutout;
  return opaque;
}

class GeometryBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }
  pushQuad(corners, normal, uv, light, tint) {
    const start = this.positions.length / 3;
    for (const c of corners) { this.positions.push(c[0], c[1], c[2]); this.normals.push(...normal); }
    this.uvs.push(uv.u0, uv.v1, uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0);
    for (let i = 0; i < 4; i++) this.colors.push(light * tint[0], light * tint[1], light * tint[2]);
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  toGeometry() {
    if (this.positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setIndex(this.indices);
    return geo;
  }
}

const WHITE = [1, 1, 1];

// Requested minimum visibility: caves, the underground and nighttime should
// always stay easy to see, not just where a torch or skylight reaches — so
// the floor sits well above the old "needs a torch" 0.05, rather than being
// driven purely by sky/block light propagation.
const MIN_LIGHT = 0.8;

function lightLevel(world, wx, wy, wz, dayFactor) {
  const sky = world.getSkyLightGlobal(wx, wy, wz);
  const block = world.getBlockLightGlobal(wx, wy, wz);
  const combined = Math.max(sky * dayFactor, block);
  return Math.min(1, Math.max(MIN_LIGHT, combined / 15));
}

/**
 * Builds opaque, transparent and cutout (cross-quad plant) geometries for a
 * chunk. `world` supplies cross-chunk block/light lookups so faces at chunk
 * borders are culled/lit correctly against their neighbor chunk.
 */
export function buildChunkMesh(chunk, world, dayFactor = 1) {
  const opaque = new GeometryBuilder();
  const transparent = new GeometryBuilder();
  const cutout = new GeometryBuilder();
  const baseX = chunk.cx * CHUNK_SIZE_X;
  const baseZ = chunk.cz * CHUNK_SIZE_Z;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const id = chunk.getBlock(x, y, z);
        if (id === 0) continue;
        const block = BlockRegistry.get(id);
        const wx = baseX + x, wy = y, wz = baseZ + z;

        if (block.plant) {
          const uv = world.atlas.getUV(id, 'top');
          const l = lightLevel(world, wx, wy, wz, dayFactor);
          addCrossQuads(cutout, x, y, z, uv, l);
          continue;
        }

        const target = pickLayer(block, transparent, cutout, opaque);
        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const neighborId = world.getBlockLocalOrGlobal(chunk, nx, ny, nz);
          const neighborBlock = BlockRegistry.get(neighborId);
          const neighborTransparent = neighborId === 0 || neighborBlock?.transparent || neighborBlock?.plant;
          // Don't draw internal faces between two of the same liquid.
          if (block.liquid && neighborId === id) continue;
          if (!neighborTransparent) continue;

          const uv = world.atlas.getUV(id, face.name);
          const l = lightLevel(world, wx + face.dir[0], wy + face.dir[1], wz + face.dir[2], dayFactor);
          const shade = FACE_SHADE[face.name] ?? 1;
          const corners = face.corners.map(([cx, cy, cz]) => [x + cx, y + cy, z + cz]);
          target.pushQuad(corners, face.dir, uv, l * shade, WHITE);
        }
      }
    }
  }

  return {
    opaque: opaque.toGeometry(),
    transparent: transparent.toGeometry(),
    cutout: cutout.toGeometry()
  };
}

function addCrossQuads(builder, x, y, z, uv, light) {
  const cx = x + 0.5, cz = z + 0.5;
  const r = 0.5;
  const planes = [
    [[cx - r, y, cz - r], [cx + r, y, cz + r]],
    [[cx - r, y, cz + r], [cx + r, y, cz - r]]
  ];
  for (const [[x0, , z0], [x1, , z1]] of planes) {
    const corners = [[x0, y, z0], [x1, y, z1], [x1, y + 1, z1], [x0, y + 1, z0]];
    builder.pushQuad(corners, [0, 1, 0], uv, light, WHITE);
    // back face so the cross is visible from both sides
    builder.pushQuad([...corners].reverse(), [0, 1, 0], uv, light, WHITE);
  }
}
