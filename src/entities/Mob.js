import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildMobMesh } from '../render/MobModels.js';
import { createHealthBar } from '../render/HealthBar.js';
import { BossBehaviour } from './BossBehaviour.js';

// How far past its own body a creature can reach. Added to the half-width,
// so a Warden with a four-block reach still has to close in, while a
// beetle has to be on top of you — one constant, scaled by how big the
// thing actually is.
const ATTACK_REACH = 1.3;
const ATTACK_COOLDOWN = 1.0;
const WANDER_CHANGE_INTERVAL = 3.5;

// A creature's collision box is not its model. The Cinder Warden stands
// four blocks tall and looks it, but a box that wide genuinely cannot walk
// through a voxel world: three block columns across means any step, tree or
// doorway is a wall. Measured before this was capped, the Warden closed to
// 2.92 blocks, ran out of room, and stood there with its attack range two
// blocks short — which is exactly what "the boss does not attack" looked
// like. The model is untouched; only what the world collides with shrinks.
const MAX_HITBOX_WIDTH = 1.2;
const MAX_HITBOX_HEIGHT = 2.6;

/**
 * A living creature: an Entity driven by a small state machine (idle,
 * wander, chase, attack, flee). Hostile species aggro onto the player
 * within range; passive species wander and flee briefly when hurt.
 */
export class Mob extends Entity {
  constructor(species) {
    const bodyWidth = species.bodyType === 'boss' ? 2.4 : 0.7;
    const bodyHeight = species.bodyType === 'boss' ? 4.2
      : species.bodyType === 'biped' ? 1.9 : 1.0;
    super({
      width: Math.min(bodyWidth, MAX_HITBOX_WIDTH),
      height: Math.min(bodyHeight, MAX_HITBOX_HEIGHT),
      maxHealth: species.maxHealth
    });
    // What the creature looks like, as opposed to what the world collides
    // with: the health bar floats over the model, and reach is measured from
    // the model's edge.
    this.bodyWidth = bodyWidth;
    this.bodyHeight = bodyHeight;
    // One block of free step, so ordinary terrain is walkable without the
    // hop-when-stuck below having to do all the work.
    this.stepHeight = 1.02;
    this.species = species;
    this.state = 'idle';
    this._wanderTimer = 0;
    this._wanderDir = new THREE.Vector3();
    this._attackCooldown = 0;
    this._stuckTimer = 0;
    this._fleeTimer = 0;
    this._animTime = Math.random() * 10; // desync identical species
    this._hurtFlash = 0;
    this.mesh = buildMobMesh(species);
    // The boss gets the wide bar across the top of the screen instead; a
    // floating one over its head would only be in the way of the fight.
    if (!species.boss) {
      this.healthBar = createHealthBar(species.bodyType === 'biped' ? 1.1 : 1);
      this.healthBar.position.y = this.bodyHeight + 0.25;
      this.mesh.add(this.healthBar);
    }
    // Multi-phase bosses drive their own fight; everything else keeps the
    // plain four-state machine below.
    this.boss = species.phases ? new BossBehaviour(this) : null;
    this.id = `${species.id}-${Math.random().toString(36).slice(2, 9)}`;
  }

  update(dt, world, player, entities) {
    if (!this.alive) return;
    const distToPlayer = player.alive ? this.distanceTo(player.position) : Infinity;

    if (this._attackCooldown > 0) this._attackCooldown -= dt;
    if (this._fleeTimer > 0) this._fleeTimer -= dt;

    // A boss between phases stands its ground and cannot be hurt; the rest of
    // the tick still runs so it keeps falling and animating.
    const holding = this.boss ? this.boss.update(dt, entities, player) : false;
    const phase = this.boss?.phase ?? null;

    // Reach is measured from the edge of the body, not from its centre, or a
    // creature twice as wide would have to overlap the player to land a hit.
    const reach = ATTACK_REACH + this.bodyWidth / 2;
    if (this.species.hostile && this._fleeTimer <= 0 && distToPlayer < this.species.aggroRange && player.alive) {
      this.state = distToPlayer < reach ? 'attack' : 'chase';
    } else if (!this.species.hostile && this._fleeTimer > 0) {
      this.state = 'flee';
    } else {
      this.state = 'wander';
    }

    if (holding) this.state = 'wander';
    const horizontalSpeed = phase?.speed ?? this.species.speed;
    let moveX = 0, moveZ = 0;

    if (this.state === 'chase' || this.state === 'attack') {
      const dx = player.position.x - this.position.x, dz = player.position.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      moveX = dx / len; moveZ = dz / len;
      if (this.state === 'attack' && this._attackCooldown <= 0) {
        const hit = phase?.damage ?? this.species.damage;
        player.damage(hit);
        const thornsTier = player.inventory.thornedWardTier();
        if (thornsTier > 0) this.damage(hit * 0.15 * thornsTier);
        this._attackCooldown = phase?.attackCooldown ?? ATTACK_COOLDOWN;
      }
    } else if (this.state === 'flee') {
      const dx = this.position.x - player.position.x, dz = this.position.z - player.position.z;
      const len = Math.hypot(dx, dz) || 1;
      moveX = dx / len; moveZ = dz / len;
    } else if (holding) {
      moveX = 0; moveZ = 0; // rooted while it changes gear
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

    const wantsToMove = moveX !== 0 || moveZ !== 0;
    const fromX = this.position.x, fromZ = this.position.z;

    this.physicsStep(dt, world);

    // Whether it is stuck can only be known afterwards. This used to be
    // decided from the velocity that had just been assigned two lines above,
    // which is never zero while the creature is trying to move — so the
    // condition was never true and this jump had never once fired. Ledges
    // taller than a step (a two-block bank, a wall) stopped every mob in the
    // game permanently, the Warden included.
    const travelled = Math.hypot(this.position.x - fromX, this.position.z - fromZ);
    if (wantsToMove && travelled < horizontalSpeed * dt * 0.25) this._stuckTimer += dt;
    else this._stuckTimer = 0;
    if (this._stuckTimer > 0.2 && this.onGround) {
      this.velocity.y = 8.4; // enough to clear two blocks
      this._stuckTimer = 0;
    }

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      if (moveX !== 0 || moveZ !== 0) {
        this.mesh.rotation.y = Math.atan2(moveX, moveZ);
      }
      // Drive the model's own animation from how fast it is actually moving,
      // not from how fast it wants to move: a creature pushed up against a
      // wall should stop walking on the spot.
      this._animTime += dt;
      if (this._hurtFlash > 0) this._hurtFlash = Math.max(0, this._hurtFlash - dt * 4);
      const groundSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this.mesh.userData.animate?.(this._animTime, groundSpeed, this._hurtFlash);
    }
  }

  damage(amount, source) {
    super.damage(amount);
    this._hurtFlash = 1;
    if (!this.species.hostile) this._fleeTimer = 4;
  }
}
