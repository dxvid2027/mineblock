import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry.js';

const GRAVITY = 28;
const TERMINAL_VELOCITY = 60;

/**
 * Base class for anything that exists in the world with a position and
 * physics body: the player and every mob. Collision is resolved against
 * the voxel grid one axis at a time (a standard, simple and robust swept-
 * AABB approach for block worlds) so entities can't clip through walls
 * even at high speed.
 */
export class Entity {
  constructor({ width = 0.6, height = 1.8, maxHealth = 20 } = {}) {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.width = width;
    this.height = height;
    this.onGround = false;
    this.inWater = false;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.alive = true;
    this.invulnerableTimer = 0;
  }

  get halfWidth() { return this.width / 2; }

  /** Distance from this entity's feet to an arbitrary point. */
  distanceTo(pos) {
    return Math.hypot(this.position.x - pos.x, this.position.y - pos.y, this.position.z - pos.z);
  }

  aabbAt(pos) {
    const hw = this.halfWidth;
    return {
      minX: pos.x - hw, maxX: pos.x + hw,
      minY: pos.y, maxY: pos.y + this.height,
      minZ: pos.z - hw, maxZ: pos.z + hw
    };
  }

  /** Applies gravity + velocity to position, resolving collisions per-axis against `world`. */
  physicsStep(dt, world) {
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -TERMINAL_VELOCITY) this.velocity.y = -TERMINAL_VELOCITY;

    this.inWater = this._isLiquid(world);
    if (this.inWater) {
      this.velocity.y = Math.max(this.velocity.y, -6);
      this.velocity.multiplyScalar(0.98);
    }

    this._moveAxis(dt, world, 'x');
    this._moveAxis(dt, world, 'z');
    this._moveAxis(dt, world, 'y');

    if (this.invulnerableTimer > 0) this.invulnerableTimer -= dt;
  }

  _isLiquid(world) {
    const id = world.getBlockGlobal(Math.floor(this.position.x), Math.floor(this.position.y + this.height * 0.5), Math.floor(this.position.z));
    return !!BlockRegistry.get(id)?.liquid;
  }

  _moveAxis(dt, world, axis) {
    let delta = this.velocity[axis] * dt;
    if (delta === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.4));
    const step = delta / steps;

    for (let i = 0; i < steps; i++) {
      this.position[axis] += step;
      const box = this.aabbAt(this.position);
      if (this._collidesWorld(world, box)) {
        this.position[axis] -= step;
        if (axis === 'y') {
          if (this.velocity.y < 0) this.onGround = true;
          this.velocity.y = 0;
        } else {
          this.velocity[axis] = 0;
        }
        break;
      }
    }
    if (axis === 'y' && delta > 0) this.onGround = false;
  }

  _collidesWorld(world, box) {
    const minX = Math.floor(box.minX), maxX = Math.floor(box.maxX - 1e-6);
    const minY = Math.floor(box.minY), maxY = Math.floor(box.maxY - 1e-6);
    const minZ = Math.floor(box.minZ), maxZ = Math.floor(box.maxZ - 1e-6);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.isSolidGlobal(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  damage(amount, { ignoreInvuln = false } = {}) {
    if (!this.alive) return;
    if (this.invulnerableTimer > 0 && !ignoreInvuln) return;
    this.health = Math.max(0, this.health - amount);
    this.invulnerableTimer = 0.5;
    if (this.health <= 0) this.die();
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  die() {
    this.alive = false;
  }
}
