import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { getInfusionLevel } from '../magic/InfusionSystem.js';

const EYE_HEIGHT = 1.62;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 6.2;
const CROUCH_SPEED = 2.1;
const SWIM_SPEED = 3.0;
const JUMP_SPEED = 8.3;

/**
 * First-person camera + movement for the Player entity. Reads InputManager
 * state, updates yaw/pitch from mouse look, derives a world-space move
 * vector from WASD relative to view direction, and hands off to
 * Player.physicsStep() for gravity/collision.
 */
export class PlayerController {
  constructor(player, camera, input) {
    this.player = player;
    this.camera = camera;
    this.input = input;
    this.speedMultiplier = 1; // modified by Infusions (e.g. Vigor)
  }

  update(dt, world) {
    const input = this.input;
    if (input.lookActive) {
      const sensitivity = settings.get('mouseSensitivity') * 0.0022;
      this.player.yaw -= input.mouseDX * sensitivity;
      const invert = settings.get('invertY') ? -1 : 1;
      this.player.pitch -= input.mouseDY * sensitivity * invert;
      this.player.pitch = THREE.MathUtils.clamp(this.player.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }

    const strafe = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const moveForward = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);

    const crouching = input.isDown('crouch');
    const sprinting = input.isDown('sprint') && moveForward > 0 && this.player.hunger > 6 && !crouching;

    let speed = crouching ? CROUCH_SPEED : (sprinting ? SPRINT_SPEED : WALK_SPEED);
    const boots = this.player.inventory.equipment.boots;
    if (this.player.inWater) {
      const aquaTier = getInfusionLevel(this.player.inventory.equipment.chest, 'aqua_ease');
      speed = SWIM_SPEED * (1 + aquaTier * 0.25);
    } else {
      speed *= 1 + getInfusionLevel(boots, 'windward') * 0.08;
    }
    speed *= this.speedMultiplier;

    const yaw = this.player.yaw;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    const moveX = (-sinY * moveForward + cosY * strafe);
    const moveZ = (-cosY * moveForward - sinY * strafe);
    const len = Math.hypot(moveX, moveZ);

    if (len > 0) {
      this.player.velocity.x = (moveX / len) * speed;
      this.player.velocity.z = (moveZ / len) * speed;
    } else {
      this.player.velocity.x = 0;
      this.player.velocity.z = 0;
    }

    if (input.isDown('jump')) {
      if (this.player.onGround) {
        this.player.velocity.y = JUMP_SPEED;
      } else if (this.player.inWater) {
        this.player.velocity.y = Math.min(this.player.velocity.y + 18 * dt, 3.2);
      }
    }

    this.player.isSprinting = sprinting;
    this.player.physicsStep(dt, world);

    this.camera.position.set(this.player.position.x, this.player.position.y + EYE_HEIGHT * (crouching ? 0.88 : 1), this.player.position.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.player.yaw);
    this.camera.rotateX(this.player.pitch);
  }
}
