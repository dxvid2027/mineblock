import { ItemRegistry, itemDurability } from '../items/ItemRegistry.js';
import { getItemIconCanvas } from '../render/ItemIcons.js';
import { infusionDescriptions, getInfusionLevel } from '../magic/InfusionSystem.js';

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
      bar.style.cssText = `position:absolute;left:4px;right:4px;bottom:3px;height:3px;background:#c3cad8;border-radius:2px;overflow:hidden;`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${pct * 100}%;background:${pct > 0.4 ? '#6fc274' : '#d1594f'};`;
      bar.appendChild(fill);
      el.appendChild(bar);
    }
  }
}

/**
 * The numbers behind an item, worked out the same way the game does when it
 * actually swings, blocks or eats it — so what the tooltip promises is what
 * the fight delivers, Infusions included.
 */
export function itemStatLines(stack, def) {
  const lines = [];

  if (def.tool) {
    const keen = getInfusionLevel(stack, 'keenedge');
    const damage = def.tool.damage + keen;
    // Every hit lands for this, bare hands included, so weapons and tools
    // both get the line: a shovel that hits for 1 should say so.
    lines.push({ label: 'Damage', value: keen > 0 ? `${damage} (${def.tool.damage} +${keen})` : `${damage}` });
    if (def.tool.type !== 'sword') {
      const swift = getInfusionLevel(stack, 'swiftmine');
      const speed = def.tool.miningSpeed * (1 + swift * 0.25);
      lines.push({ label: 'Mining speed', value: `${speed.toFixed(1)}x` });
    }
  }

  if (def.armor) {
    lines.push({ label: 'Defense', value: `${def.armor.defense + getInfusionLevel(stack, 'vitality_ward')}` });
    if (def.armor.toughness) lines.push({ label: 'Toughness', value: `${def.armor.toughness}` });
  }

  if (def.shield) lines.push({ label: 'Blocks', value: `${Math.round(def.shield.block * 100)}% of every blow` });
  if (def.totem) lines.push({ label: 'On a killing blow', value: `revives you at ${def.totem.reviveHealth} health` });
  if (def.food?.hunger) lines.push({ label: 'Restores', value: `${def.food.hunger} hunger` });
  if (def.food?.heal) lines.push({ label: 'Heals', value: `${def.food.heal} health` });
  if (def.fuel > 0) lines.push({ label: 'Burns for', value: `${(def.fuel / 20).toFixed(0)}s in a Smelter` });

  const max = itemDurability(def);
  if (max !== undefined && max !== Infinity) {
    lines.push({ label: 'Durability', value: `${Math.round(stack.durability ?? max)} / ${max}` });
  }
  return lines;
}

export function attachTooltip(el, getStack) {
  el.addEventListener('mouseenter', () => {
    const stack = getStack();
    if (!stack) return;
    const def = ItemRegistry.get(stack.id);
    if (!def) return;
    const t = tooltip();
    let html = `<div class="name">${def.displayName}</div><div class="desc">${def.description}</div>`;
    const stats = itemStatLines(stack, def);
    if (stats.length) {
      html += '<div class="stats">';
      for (const { label, value } of stats) {
        html += `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
      }
      html += '</div>';
    }
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

/**
 * Wires the three ways a slot can be clicked, so every screen behaves the
 * same: left click takes/places a whole stack, right click takes half or
 * places a single item, and shift + left click moves the stack straight to
 * the other container without picking it up.
 *
 * `handler` receives { half, shift }.
 */
export function bindSlotClicks(el, handler) {
  el.addEventListener('click', (e) => handler({ half: false, shift: e.shiftKey }));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    handler({ half: true, shift: e.shiftKey });
  });
}
