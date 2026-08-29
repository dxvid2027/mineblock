import { Entity } from './Entity.js';
import { Inventory } from '../items/Inventory.js';
import { globalEvents } from '../core/EventBus.js';

/**
 * The player: an Entity (physics/health) plus everything unique to the
 * human-controlled character — hunger, an inventory, an XP pool that fuels
 * the Runeforge's Infusion system, and which dimension they currently
 * occupy.
 */
export class Player extends Entity {
  constructor() {
    super({ width: 0.6, height: 1.8, maxHealth: 20 });
    this.inventory = new Inventory();
    this.hunger = 20;
    this.maxHunger = 20;
    this.saturation = 5;
    this.xp = 0;
    this.level = 0;
    this.dimension = 'overworld';
    this.spawnPoint = { x: 0, y: 80, z: 0, dimension: 'overworld' };
    this._hungerTickTimer = 0;
    this._regenTimer = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.activeInfusions = { helmet: [], chest: [], legs: [], boots: [], amulet: [], mainHand: [] };
  }

  addXp(amount) {
    this.xp += amount;
    const nextLevelCost = 10 + this.level * 8;
    while (this.xp >= nextLevelCost) {
      this.xp -= nextLevelCost;
      this.level++;
    }
    globalEvents.emit('player:xpChanged');
  }

  spendXpLevels(levels) {
    if (this.level < levels) return false;
    this.level -= levels;
    globalEvents.emit('player:xpChanged');
    return true;
  }

  /** Called once per second of survival ticking (see SurvivalSystem). */
  tickHunger(dtSeconds, isSprinting) {
    this._hungerTickTimer += dtSeconds;
    const drainRate = isSprinting ? 12 : 20; // seconds per hunger point
    if (this._hungerTickTimer >= drainRate) {
      this._hungerTickTimer = 0;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
      globalEvents.emit('player:hungerChanged');
    }
  }

  eat(food) {
    this.hunger = Math.min(this.maxHunger, this.hunger + food.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + food.saturation);
    if (food.heal) this.heal(food.heal);
    globalEvents.emit('player:hungerChanged');
  }

  damage(amount, opts) {
    const { defense, toughness } = this.inventory.totalDefense();
    const reduced = Math.max(amount * 0.2, amount - defense * 1.2 - toughness * 0.4);
    super.damage(reduced, opts);
    globalEvents.emit('player:healthChanged');
  }

  heal(amount) {
    super.heal(amount);
    globalEvents.emit('player:healthChanged');
  }

  respawn() {
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.saturation = 5;
    this.alive = true;
    this.velocity.set(0, 0, 0);
    this.position.set(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
    this.dimension = this.spawnPoint.dimension;
    globalEvents.emit('player:respawned');
  }

  serialize() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw, pitch: this.pitch,
      health: this.health, hunger: this.hunger, saturation: this.saturation,
      xp: this.xp, level: this.level,
      dimension: this.dimension, spawnPoint: this.spawnPoint,
      inventory: this.inventory.serialize(),
      activeInfusions: this.activeInfusions
    };
  }

  deserialize(data) {
    if (!data) return;
    this.position.set(data.position?.x ?? 0, data.position?.y ?? 80, data.position?.z ?? 0);
    this.yaw = data.yaw ?? 0;
    this.pitch = data.pitch ?? 0;
    this.health = data.health ?? this.maxHealth;
    this.hunger = data.hunger ?? this.maxHunger;
    this.saturation = data.saturation ?? 5;
    this.xp = data.xp ?? 0;
    this.level = data.level ?? 0;
    this.dimension = data.dimension ?? 'overworld';
    this.spawnPoint = data.spawnPoint ?? this.spawnPoint;
    this.inventory.deserialize(data.inventory);
    this.activeInfusions = data.activeInfusions ?? this.activeInfusions;
  }
}
