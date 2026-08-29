import { ItemRegistry } from '../items/ItemRegistry.js';
import { getItemIconCanvas } from '../render/ItemIcons.js';
import { infusionDescriptions } from '../magic/InfusionSystem.js';

let tooltipEl = null;
function tooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'inv-tooltip';
    tooltipEl.style.display = 'none';
    document.getElementById('ui-root').appendChild(tooltipEl);
  }
  return tooltipEl;
}

/** Fills an .inv-slot element's icon/count from a stack ({id,count,durability,infusions}|null). */
export function renderSlotContent(el, stack) {
  el.innerHTML = '';
  if (!stack) return;
  const canvas = getItemIconCanvas(stack.id);
  const clone = document.createElement('canvas');
  clone.width = canvas.width; clone.height = canvas.height;
  clone.getContext('2d').drawImage(canvas, 0, 0);
  el.appendChild(clone);
  if (stack.count > 1) {
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = stack.count;
    el.appendChild(count);
  }
  if (stack.durability !== undefined && stack.durability !== null) {
    const def = ItemRegistry.get(stack.id);
    if (def?.tool?.durability && def.tool.durability !== Infinity) {
      const bar = document.createElement('div');
      const pct = Math.max(0, stack.durability / def.tool.durability);
      bar.style.cssText = `position:absolute;left:4px;right:4px;bottom:3px;height:3px;background:#000;border-radius:2px;overflow:hidden;`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${pct * 100}%;background:${pct > 0.4 ? '#6fc274' : '#d1594f'};`;
      bar.appendChild(fill);
      el.appendChild(bar);
    }
  }
}

export function attachTooltip(el, getStack) {
  el.addEventListener('mouseenter', () => {
    const stack = getStack();
    if (!stack) return;
    const def = ItemRegistry.get(stack.id);
    if (!def) return;
    const t = tooltip();
    let html = `<div class="name">${def.displayName}</div><div class="desc">${def.description}</div>`;
    for (const line of infusionDescriptions(stack)) html += `<div class="desc" style="color:#a35bff">${line}</div>`;
    t.innerHTML = html;
    t.style.display = 'block';
  });
  el.addEventListener('mousemove', (e) => {
    const t = tooltip();
    if (t.style.display === 'none') return;
    t.style.left = `${e.clientX + 16}px`;
    t.style.top = `${e.clientY + 12}px`;
  });
  el.addEventListener('mouseleave', () => { tooltip().style.display = 'none'; });
}

export function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

export function makeSlotEl(className = 'inv-slot') {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
