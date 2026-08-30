import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { globalEvents } from '../core/EventBus.js';
import { getInfusionLevel } from '../magic/InfusionSystem.js';

const REACH = 5.5;
const STEP = 0.04;

// Only pickaxe-gated blocks (stone/ore) actually require the right tool to
// drop anything, matching the classic genre convention — axe/shovel/hoe are
// always a speed bonus, never a hard requirement, so bare hands can still
// gather wood, dirt, sand and crops (just more slowly).
function miningTime(block, toolDef, heldSlot) {
  if (block.hardness <= 0) return 0.08;
  const gated = block.toolType === 'pickaxe';
  const correctType = toolDef?.type === block.toolType;
  const tierOk = (toolDef?.tierIndex ?? -1) >= block.minToolTier;
  if (gated && (!correctType || !tierOk)) return block.hardness * 7;
  const swiftmineTier = getInfusionLevel(heldSlot, 'swiftmine');
  const speed = (correctType ? (toolDef?.miningSpeed ?? 1) : 1) * (1 + swiftmineTier * 0.25);
  return Math.max(0.06, block.hardness / speed);
}

function canHarvest(block, toolDef) {
  if (block.toolType !== 'pickaxe') return true;
  return toolDef?.type === block.toolType && (toolDef.tierIndex ?? -1) >= block.minToolTier;
}

/**
 * Handles the crosshair raycast, the block-break progress bar, block
 * placement, and simple item-based world interactions (hoeing soil,
 * planting crops, opening workstation UIs).
 */
export class Interaction {
  constructor(world, camera, input, player) {
    this.world = world;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.target = null; // { x,y,z, face:[nx,ny,nz], blockId }
    this.breaking = null; // { key, progress, time }
    this._placeCooldown = 0;
    this._breakCooldown = 0;
  }

  raycast() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position;
    let lastAir = null;

    for (let t = 0; t < REACH; t += STEP) {
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
      const id = this.world.getBlockGlobal(bx, by, bz);
      if (id !== 0 && BlockRegistry.get(id)?.solid) {
        const face = lastAir ? [lastAir[0] - bx, lastAir[1] - by, lastAir[2] - bz] : [0, 1, 0];
        return { x: bx, y: by, z: bz, face, blockId: id };
      }
      lastAir = [bx, by, bz];
    }
    return null;
  }

  update(dt) {
    if (this._placeCooldown > 0) this._placeCooldown -= dt;
    if (this._breakCooldown > 0) this._breakCooldown -= dt;
    this.target = this.raycast();

    const heldSlot = this.player.inventory.getSelected();
    const heldItem = heldSlot ? ItemRegistry.get(heldSlot.id) : null;

    this._handleBreaking(dt, heldItem);
    if (this.input.mouseButtons.has(2) && this._placeCooldown <= 0) {
      this._placeCooldown = 0.22;
      this._handleRightClick(heldSlot, heldItem);
    }
  }

  _handleBreaking(dt, heldItem) {
    if (!this.input.mouseButtons.has(0) || !this.target) {
      this.breaking = null;
      globalEvents.emit('interact:breakProgress', null);
      return;
    }
    const key = `${this.target.x},${this.target.y},${this.target.z}`;
    const block = BlockRegistry.get(this.target.blockId);
    const toolDef = heldItem?.tool ?? null;
    const heldSlot = this.player.inventory.getSelected();
    const time = miningTime(block, toolDef, heldSlot);

    if (!this.breaking || this.breaking.key !== key) {
      this.breaking = { key, progress: 0, time };
    }
    this.breaking.progress += dt;
    globalEvents.emit('interact:breakProgress', { progress: this.breaking.progress / this.breaking.time, block });

    if (this.breaking.progress >= this.breaking.time) {
      this._breakBlock(this.target, block, toolDef, heldItem);
      this.breaking = null;
    }
  }

  _breakBlock(target, block, toolDef, heldItem) {
    const blockEntity = this.world.getBlockEntity(target.x, target.y, target.z);
    let dropId = block.drops;
    let dropCount = block.dropCount[0] + Math.floor(Math.random() * (block.dropCount[1] - block.dropCount[0] + 1));

    if (block.category === 'crop' && blockEntity?.type === 'crop') {
      const ripe = Date.now() / 1000 - blockEntity.plantedAt >= blockEntity.growTime;
      dropCount = ripe ? dropCount : 1;
    }

    if (!canHarvest(block, toolDef)) dropId = null;

    this.world.setBlockGlobal(target.x, target.y, target.z, 0);
    if (dropId) {
      globalEvents.emit('item:drop', {
        id: dropId, count: dropCount,
        position: { x: target.x + 0.5, y: target.y + 0.3, z: target.z + 0.5 }
      });
    }
    if (block.category === 'ore') this.player.addXp(3 + Math.floor(Math.random() * 4));

    if (toolDef && heldItem) this._damageHeldTool();
  }

  _damageHeldTool() {
    const slotIndex = this.player.inventory.selectedHotbar;
    const slot = this.player.inventory.slots[slotIndex];
    if (!slot) return;
    const def = ItemRegistry.get(slot.id);
    if (!def?.tool || def.tool.durability === Infinity) return;
    slot.durability = (slot.durability ?? def.tool.durability) - 1;
    if (slot.durability <= 0) this.player.inventory.slots[slotIndex] = null;
    globalEvents.emit('inventory:changed');
  }

  _handleRightClick(heldSlot, heldItem) {
    if (!this.target) return;
    const targetBlock = BlockRegistry.get(this.target.blockId);

    if (targetBlock.interactive) {
      globalEvents.emit('ui:openWorkstation', {
        type: targetBlock.interactive,
        pos: { x: this.target.x, y: this.target.y, z: this.target.z }
      });
      return;
    }

    if (heldItem?.tool?.type === 'hoe' && (targetBlock.name === 'grassy_sod' || targetBlock.name === 'loam')) {
      const above = this.world.getBlockGlobal(this.target.x, this.target.y + 1, this.target.z);
      if (above === 0) this.world.setBlockGlobal(this.target.x, this.target.y, this.target.z, BlockRegistry.idOf('tilled_soil'));
      return;
    }

    if (heldItem && (heldItem.id === 'barley_grain' || heldItem.id === 'tuber') && targetBlock.name === 'tilled_soil') {
      const above = this.world.getBlockGlobal(this.target.x, this.target.y + 1, this.target.z);
      if (above !== 0) return;
      const cropBlock = heldItem.id === 'barley_grain' ? 'barley_stalk' : 'tuber_root';
      this.world.setBlockGlobal(this.target.x, this.target.y + 1, this.target.z, BlockRegistry.idOf(cropBlock));
      this.world.setBlockEntity(this.target.x, this.target.y + 1, this.target.z, {
        type: 'crop', plantedAt: Date.now() / 1000, growTime: 55
      });
      this.player.inventory.removeFromSlot(this.player.inventory.selectedHotbar, 1);
      return;
    }

    // The offhand acts as a fallback for the main hand: it is used only when
    // the held item cannot do the job itself, so holding a pickaxe and a
    // stack of torches lets you mine and light the way without swapping.
    const offhandSlot = this.player.inventory.offhand;
    const offhandItem = offhandSlot ? ItemRegistry.get(offhandSlot.id) : null;

    if (heldItem?.food) {
      globalEvents.emit('player:eat', { item: heldItem, hand: 'main' });
      return;
    }
    if (!heldItem && offhandItem?.food) {
      globalEvents.emit('player:eat', { item: offhandItem, hand: 'off' });
      return;
    }

    if (heldItem?.blockName) {
      this._placeBlock(heldItem.blockName, 'main');
      return;
    }
    if (offhandItem?.blockName) {
      this._placeBlock(offhandItem.blockName, 'off');
    }
  }

  /** Places a block against the targeted face, consuming it from the given hand. */
  _placeBlock(blockName, hand) {
    const placePos = {
      x: this.target.x + this.target.face[0],
      y: this.target.y + this.target.face[1],
      z: this.target.z + this.target.face[2]
    };
    if (this._collidesPlayer(placePos)) return;
    if (this.world.getBlockGlobal(placePos.x, placePos.y, placePos.z) !== 0) return;

    this.world.setBlockGlobal(placePos.x, placePos.y, placePos.z, BlockRegistry.idOf(blockName));
    const inv = this.player.inventory;
    if (hand === 'off') {
      inv.offhand.count -= 1;
      if (inv.offhand.count <= 0) inv.offhand = null;
      globalEvents.emit('inventory:changed');
    } else {
      inv.removeFromSlot(inv.selectedHotbar, 1);
    }
  }

  _collidesPlayer(pos) {
    const box = this.player.aabbAt(this.player.position);
    return pos.x + 1 > box.minX && pos.x < box.maxX &&
      pos.y + 1 > box.minY && pos.y < box.maxY &&
      pos.z + 1 > box.minZ && pos.z < box.maxZ;
  }
}
