import { ItemRegistry } from '../items/ItemRegistry.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { drawPattern, drawIcon, outlineSprite } from './PatternDraw.js';

const ICON_SIZE = 48;
const TILE = 32; // matches the atlas tile resolution
const cache = new Map();

// A block in the inventory is drawn as a small isometric cube rather than a
// flat swatch: with the real top and side textures on its faces it reads as
// the thing you are about to place, and the three face brightnesses match
// the ones the chunk mesher uses in the world.
const HALF_W = 0.417;  // of the icon size
const TOP_H = 0.208;
const BODY_H = 0.417;
const FACE_LIGHT = { top: 1.0, left: 0.8, right: 0.63 };

function renderTile(spec, seed) {
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawPattern(ctx, TILE, spec, seed);
  return c;
}

/** Fills one face of the cube with a texture, clipped to the face polygon. */
function drawFace(ctx, points, tile, light) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.clip();

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  ctx.drawImage(tile, minX, minY, maxX - minX, maxY - minY);
  // Face shading, so the three sides of the cube are told apart.
  if (light < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - light})`;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }
  ctx.restore();
}

function drawBlockIcon(ctx, size, block) {
  const tex = block.texture ?? {};
  const topTile = renderTile(tex.top ?? tex.all ?? tex.side, `icon:${block.name}:top`);
  const sideTile = renderTile(tex.side ?? tex.all ?? tex.top, `icon:${block.name}:side`);

  // Plants, torches and ladders are not cubes in the world either; their
  // tiles are already item-shaped sprites, so show them flat.
  if (block.plant || !block.solid) {
    const pad = Math.round(size * 0.08);
    ctx.drawImage(topTile, pad, pad, size - pad * 2, size - pad * 2);
    outlineSprite(ctx, size);
    return;
  }

  const cx = size / 2;
  const w = size * HALF_W, th = size * TOP_H, bh = size * BODY_H;
  const top = size * 0.11;
  const mid = top + th * 2;      // where the three faces meet, front-centre
  const bottom = mid + bh;

  drawFace(ctx, [[cx, top], [cx + w, top + th], [cx, mid], [cx - w, top + th]], topTile, FACE_LIGHT.top);
  drawFace(ctx, [[cx - w, top + th], [cx, mid], [cx, bottom], [cx - w, top + th + bh]], sideTile, FACE_LIGHT.left);
  drawFace(ctx, [[cx, mid], [cx + w, top + th], [cx + w, top + th + bh], [cx, bottom]], sideTile, FACE_LIGHT.right);

  // The three edges meeting at the front corner, to keep the faces apart.
  ctx.strokeStyle = 'rgba(20,24,36,0.28)';
  ctx.lineWidth = Math.max(1, size / 48);
  ctx.beginPath();
  ctx.moveTo(cx, mid); ctx.lineTo(cx, bottom);
  ctx.moveTo(cx, mid); ctx.lineTo(cx - w, top + th);
  ctx.moveTo(cx, mid); ctx.lineTo(cx + w, top + th);
  ctx.stroke();

  outlineSprite(ctx, size);
}

/** Returns a small <canvas> (cached) rendering the given item's icon, for inventory/hotbar slots. */
export function getItemIconCanvas(itemId) {
  if (cache.has(itemId)) return cache.get(itemId);
  const item = ItemRegistry.get(itemId);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE; canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (!item) {
    ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  } else if (item.texture?.shape === 'block') {
    const block = BlockRegistry.byName(item.texture.blockName);
    if (block) drawBlockIcon(ctx, ICON_SIZE, block);
    else drawIcon(ctx, ICON_SIZE, 'chunk', '#999999');
  } else if (item.texture) {
    drawIcon(ctx, ICON_SIZE, item.texture.shape, item.texture.color);
  } else {
    drawIcon(ctx, ICON_SIZE, 'chunk', '#999999');
  }
  cache.set(itemId, canvas);
  return canvas;
}
