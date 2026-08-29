import { globalEvents } from '../core/EventBus.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { getInfusionLevel } from '../magic/InfusionSystem.js';

const FALL_DAMAGE_THRESHOLD = 3.2; // blocks
const MAX_BREATH = 10;

/**
 * Ticks the survival mechanics that aren't pure physics: hunger drain and
 * starvation, passive regeneration when well-fed, fall damage, and
 * drowning. Reads/writes the Player entity each frame.
 */
export class SurvivalSystem {
  constructor(player) {
    this.player = player;
    this.breath = MAX_BREATH;
    this._fallStartY = null;
    this._wasOnGround = true;
    this._regenTimer = 0;
    this._starveTimer = 0;
  }

  update(dt, world) {
    const player = this.player;
    if (!player.alive) return;

    // --- hunger ---
    player.tickHunger(dt, player.isSprinting);
    if (player.hunger <= 0) {
      this._starveTimer += dt;
      if (this._starveTimer >= 4) { this._starveTimer = 0; player.damage(1, { ignoreInvuln: true }); }
    } else if (player.hunger >= 18 && player.health < player.maxHealth) {
      this._regenTimer += dt;
      if (this._regenTimer >= 2.5) { this._regenTimer = 0; player.heal(1); player.saturation = Math.max(0, player.saturation - 0.5); }
    }

    // --- fall damage ---
    if (!player.onGround && this._wasOnGround) {
      this._fallStartY = player.position.y;
    }
    if (player.onGround && !this._wasOnGround && this._fallStartY !== null) {
      const dropped = this._fallStartY - player.position.y;
      if (dropped > FALL_DAMAGE_THRESHOLD && !player.inWater) {
        const featherTier = getInfusionLevel(player.inventory.equipment.boots, 'featherstep');
        const reduction = 1 - Math.min(1, featherTier * 0.5);
        player.damage(Math.floor((dropped - FALL_DAMAGE_THRESHOLD) * 1.6 * reduction), { ignoreInvuln: true });
      }
      this._fallStartY = null;
    }
    this._wasOnGround = player.onGround;

    // --- drowning ---
    const eyeBlock = world.getBlockGlobal(
      Math.floor(player.position.x), Math.floor(player.position.y + player.height - 0.2), Math.floor(player.position.z)
    );
    const submerged = !!BlockRegistry.get(eyeBlock)?.liquid && BlockRegistry.get(eyeBlock)?.name !== 'magma';
    const inMagma = BlockRegistry.get(eyeBlock)?.name === 'magma';

    const aquaTier = Math.max(
      getInfusionLevel(player.inventory.equipment.chest, 'aqua_ease'),
      getInfusionLevel(player.inventory.equipment.amulet, 'aqua_ease')
    );
    if (submerged) {
      if (aquaTier < 2) this.breath = Math.max(0, this.breath - dt * (aquaTier === 1 ? 0.4 : 1));
      if (this.breath <= 0) {
        this._starveTimer += dt;
        if (this._starveTimer >= 1.5) { this._starveTimer = 0; player.damage(2, { ignoreInvuln: true }); }
      }
    } else {
      this.breath = Math.min(MAX_BREATH, this.breath + dt * 3);
    }
    if (inMagma) player.damage(4 * dt, { ignoreInvuln: true });

    if (!player.alive && !this._deathHandled) {
      this._deathHandled = true;
      globalEvents.emit('player:died');
    } else if (player.alive) {
      this._deathHandled = false;
    }
  }
}
