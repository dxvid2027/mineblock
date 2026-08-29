import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { drawPattern } from './PatternDraw.js';

const TILE_SIZE = 16; // classic blocky pixel-art resolution per face

// Builds one square canvas atlas containing every block face texture, and
// exposes per-block/per-face UV rectangles for the chunk mesher to sample.
export class TextureAtlas {
  constructor() {
    this.tileSize = TILE_SIZE;
    this.uvByKey = new Map(); // `${blockId}:${face}` -> {u0,v0,u1,v1}
    this._build();
  }

  _build() {
    const blocks = BlockRegistry.all();
    // Count tiles needed: one per distinct face spec per block.
    let tileCount = 0;
    const tilePlan = [];
    for (const block of blocks) {
      const tex = block.texture;
      if (tex.all) {
        tilePlan.push({ block, faces: ['top', 'bottom', 'side'], spec: tex.all, key: `${block.id}:all` });
        tileCount++;
      } else {
        const top = tex.top ?? tex.side;
        const bottom = tex.bottom ?? tex.side ?? tex.top;
        const side = tex.side ?? tex.top;
        tilePlan.push({ block, faces: ['top'], spec: top, key: `${block.id}:top` });
        tilePlan.push({ block, faces: ['bottom'], spec: bottom, key: `${block.id}:bottom` });
        tilePlan.push({ block, faces: ['side'], spec: side, key: `${block.id}:side` });
        tileCount += 3;
      }
    }

    const cols = Math.ceil(Math.sqrt(tileCount));
    const rows = Math.ceil(tileCount / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    let i = 0;
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = TILE_SIZE; tileCanvas.height = TILE_SIZE;
    const tileCtx = tileCanvas.getContext('2d');

    for (const plan of tilePlan) {
      const col = i % cols, row = Math.floor(i / cols);
      tileCtx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      drawPattern(tileCtx, TILE_SIZE, plan.spec, plan.key);
      ctx.drawImage(tileCanvas, col * TILE_SIZE, row * TILE_SIZE);

      const u0 = col / cols, v0 = row / rows;
      const u1 = (col + 1) / cols, v1 = (row + 1) / rows;
      for (const face of plan.faces) {
        this.uvByKey.set(`${plan.block.id}:${face}`, { u0, v0, u1, v1 });
      }
      i++;
    }

    this.canvas = canvas;
    this.texture = new THREE.CanvasTexture(canvas);
    // Our UV rects are computed directly from canvas pixel rows (row 0 = top
    // of the canvas). three.js textures default to flipY=true (GL's v=0-at-
    // bottom convention), which would sample every tile from a vertically
    // mirrored row — i.e. a different block's tile entirely. Keep the atlas
    // in canvas-native (unflipped) space instead of flipping every UV.
    this.texture.flipY = false;
    this.texture.magFilter = THREE.NearestFilter;
    // No mipmaps: with many small tiles packed edge-to-edge, downsampled mip
    // levels blend neighboring tiles together (visible as one block's face
    // "bleeding" into another's pattern). Blocky/aliased at a distance is the
    // standard, deliberate look for this genre; render distance + fog hide it.
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
  }

  /** face: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west' — sides all reuse the 'side' tile. */
  getUV(blockId, face) {
    const key = face === 'top' || face === 'bottom' ? `${blockId}:${face}` : `${blockId}:side`;
    return this.uvByKey.get(key) ?? this.uvByKey.get(`${blockId}:top`) ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
  }
}
