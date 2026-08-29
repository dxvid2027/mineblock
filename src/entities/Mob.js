import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildMobMesh } from '../render/MobModels.js';

const ATTACK_RANGE = 1.6;
const ATTACK_COOLDOWN = 1.0;
const WANDER_CHANGE_INTERVAL = 3.5;

/**
 * A living creature: an Entity driven by a small state machine (idle,
 * wander, chase, attack, flee). Hostile species aggro onto the player
 * within range; passive species wander and flee briefly when hurt.
 */
export class Mob extends Entity {
  constructor(species) {
    super({ width: species.bodyType === 'boss' ? 2.4 : 0.7, height: species.bodyType === 'boss' ? 4.2 : (species.bodyType === 'biped' ? 1.9 : 1.0), maxHealth: species.maxHealth });
    this.species = species;
    this.state = 'idle';
    this._wanderTimer = 0;
    this._wanderDir = new THREE.Vector3();
    this._attackCooldown = 0;
    this._stuckTimer = 0;
    this._fleeTimer = 0;
    this.mesh = buildMobMesh(species);
    this.id = `${species.id}-${Math.random().toString(36).slice(2, 9)}`;
  }

  update(dt, world, player) {
    if (!this.alive) return;
    const distToPlayer = player.alive ? this.distanceTo(player.position) : Infinity;

    if (this._attackCooldown > 0) this._attackCooldown -= dt;
    if (this._fleeTimer > 0) this._fleeTimer -= dt;

    if (this.species.hostile && this._fleeTimer <= 0 && distToPlayer < this.species.aggroRange && player.alive) {
      this.state = distToPlayer < ATTACK_RANGE ? 'attack' : 'chase';
    } else if (!this.species.hostile && this._fleeTimer > 0) {
      this.state = 'flee';
    } else {
      this.state = 'wander';
    }

    const horizontalSpeed = this.species.speed;
    let moveX = 0, moveZ = 0;

    if (this.state === 'chase' || this.state === 'attack') {
      const dx = player.position.x - this.position.x, dz = player.position.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      moveX = dx / len; moveZ = dz / len;
      if (this.state === 'attack' && this._attackCooldown <= 0) {
        player.damage(this.species.damage);
        const thornsTier = player.inventory.thornedWardTier();
        if (thornsTier > 0) this.damage(this.species.damage * 0.15 * thornsTier);
        this._attackCooldown = ATTACK_COOLDOWN;
      }
    } else if (this.state === 'flee') {
      const dx = this.position.x - player.position.x, dz = this.position.z - player.position.z;
      const len = Math.hypot(dx, dz) || 1;
      moveX = dx / len; moveZ = dz / len;
    } else {
      this._wanderTimer -= dt;
      if (this._wanderTimer <= 0) {
        this._wanderTimer = WANDER_CHANGE_INTERVAL + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        this._wanderDir.set(Math.cos(angle), 0, Math.sin(angle));
        if (Math.random() < 0.3) this._wanderDir.set(0, 0, 0); // pause sometimes
      }
      moveX = this._wanderDir.x; moveZ = this._wanderDir.z;
    }

    this.velocity.x = moveX * horizontalSpeed * (this.state === 'attack' ? 0.2 : 1);
    this.velocity.z = moveZ * horizontalSpeed * (this.state === 'attack' ? 0.2 : 1);

    const wasBlocked = this.onGround && Math.abs(this.velocity.x) < 0.01 && Math.abs(this.velocity.z) < 0.01 && (moveX !== 0 || moveZ !== 0);
    if (wasBlocked) this._stuckTimer += dt; else this._stuckTimer = 0;
    if (this._stuckTimer > 0.15 && this.onGround) {
      this.velocity.y = 7.5;
      this._stuckTimer = 0;
    }

    this.physicsStep(dt, world);

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      if (moveX !== 0 || moveZ !== 0) {
        this.mesh.rotation.y = Math.atan2(moveX, moveZ);
      }
    }
  }

  damage(amount, source) {
    super.damage(amount);
    if (!this.species.hostile) this._fleeTimer = 4;
  }
}
