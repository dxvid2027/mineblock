import { ItemRegistry } from '../items/ItemRegistry.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { drawPattern, drawIcon } from './PatternDraw.js';

const ICON_SIZE = 32;
const cache = new Map();

/** Returns a small <canvas> (cached) rendering the given item's icon, for use in inventory/hotbar slots. */
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
    const spec = block?.texture?.top ?? block?.texture?.all ?? { pattern: 'solid', color: '#999' };
    drawPattern(ctx, ICON_SIZE, spec, `icon:${itemId}`);
  } else if (item.texture) {
    drawIcon(ctx, ICON_SIZE, item.texture.shape, item.texture.color);
  } else {
    ctx.fillStyle = '#999'; ctx.fillRect(4, 4, ICON_SIZE - 8, ICON_SIZE - 8);
  }
  cache.set(itemId, canvas);
  return canvas;
}
