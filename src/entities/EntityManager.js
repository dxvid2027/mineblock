import * as THREE from 'three';
import { Mob } from './Mob.js';
import { disposeMobMesh } from '../render/MobModels.js';
import { updateHealthBar } from '../render/HealthBar.js';
import { Entity } from './Entity.js';
import { CREATURES } from './creatures/CreatureTypes.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { getItemIconCanvas } from '../render/ItemIcons.js';
import { globalEvents } from '../core/EventBus.js';
import { getInfusionLevel } from '../magic/InfusionSystem.js';

const SPAWN_INTERVAL = 2.5;
const SPAWN_MIN_DIST = 12;
const SPAWN_MAX_DIST = 28;
const DESPAWN_DIST = 44;
// Cave spawning: closer than surface spawning, since sight lines underground
// are short and mobs spawning 28 blocks away would never be found.
const CAVE_SPAWN_MIN_DIST = 9;
const CAVE_SPAWN_MAX_DIST = 20;
const CAVE_SPAWN_MIN_DEPTH = 6; // blocks below the local surface
const CAVE_SPAWN_MAX_LIGHT = 8; // torch-lit areas stay clear
const HEALTH_BAR_DISTANCE = 20; // beyond this a creature's bar is not drawn
const DROP_LIFETIME = 300;
const PICKUP_RADIUS = 1.3;
const ATTACK_COOLDOWN_BASE = 0.55;

function spriteForItem(itemId) {
  const canvas = getItemIconCanvas(itemId);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.4, 0.4, 0.4);
  return sprite;
}

/** A pickup lying in the world: a floating item icon the player can walk into. */
class ItemDrop extends Entity {
  constructor(itemId, count, position, { pickupDelay = 0, velocity = null, durability, infusions } = {}) {
    super({ width: 0.35, height: 0.35, maxHealth: 1 });
    this.itemId = itemId;
    this.count = count;
    // Carried through the drop so a worn, infused sword comes back exactly
    // as it went in rather than as a pristine one.
    this.durability = durability;
    this.infusions = infusions;
    this.position.set(position.x, position.y, position.z);
    if (velocity) this.velocity.set(velocity.x, velocity.y, velocity.z);
    else this.velocity.set((Math.random() - 0.5) * 1.5, 3, (Math.random() - 0.5) * 1.5);
    this.age = 0;
    // Anything the player threw out has to be un-collectable for a moment,
    // or they would walk straight back into it on the same frame.
    this.pickupDelay = pickupDelay;
    this.mesh = spriteForItem(itemId);
  }
}

export class EntityManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.drops = [];
    this.group = new THREE.Group();
    this.group.name = 'entities';
    scene.add(this.group);
    this._spawnTimer = 0;
    this._attackCooldown = 0;

    this._offDrop = globalEvents.on('item:drop', ({ id, count, position, ...options }) => this.spawnDrop(id, count, position, options));
  }

  /**
   * The creature the wide bar at the top of the screen belongs to: a boss if
   * one is on the field, otherwise a mini-boss. Derived rather than stored,
   * because a stored flag has to be cleared on every path a creature can
   * leave by — death, despawn, dimension change — and missing one of those
   * left the game believing in a Warden that no longer existed.
   */
  get boss() {
    let best = null;
    for (const mob of this.mobs) {
      if (!mob.alive || !(mob.species.boss || mob.species.miniBoss)) continue;
      if (!best || (mob.species.boss && !best.species.boss)) best = mob;
    }
    return best;
  }

  /** Whether a true boss — not a mini-boss — is currently in the world. */
  get bossAlive() {
    return this.mobs.some((mob) => mob.alive && mob.species.boss);
  }

  setWorld(world) {
    this.world = world;
    for (const m of this.mobs) { this.group.remove(m.mesh); disposeMobMesh(m.mesh); }
    for (const d of this.drops) this.group.remove(d.mesh);
    // Changing dimension takes every mob with it, the boss included. Both
    // bossAlive and boss read straight off this list, so emptying it is the
    // whole job.
    this.mobs = [];
    this.drops = [];
  }

  spawnDrop(itemId, count, position, options) {
    if (!ItemRegistry.get(itemId)) return;
    const drop = new ItemDrop(itemId, count, position, options);
    this.group.add(drop.mesh);
    this.drops.push(drop);
  }

  spawnMob(speciesId, position) {
    const species = CREATURES[speciesId];
    if (!species) return null;
    const mob = new Mob(species);
    mob.position.set(position.x, position.y, position.z);
    this.group.add(mob.mesh);
    this.mobs.push(mob);
    return mob;
  }

  update(dt, player, dayNight, input, interaction) {
    this._updateSpawning(dt, player, dayNight);
    this._updateMobs(dt, player, interaction?.camera);
    this._updateDrops(dt, player);
    this._updateCombat(dt, player, input, interaction);
  }

  _updateSpawning(dt, player, dayNight) {
    this._spawnTimer -= dt;
    if (this._spawnTimer > 0) return;
    this._spawnTimer = SPAWN_INTERVAL;
    if (this.mobs.length >= this.world.dimension.spawnMobCap) return;

    // Underground first: spawning only ever used the surface height, so a
    // player deep in a cave had every mob spawn far above them and never met
    // anything. Cave spawns are attempted around the player's own depth.
    if (this._trySpawnUnderground(player)) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_MIN_DIST + Math.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const wx = Math.floor(player.position.x + Math.cos(angle) * dist);
    const wz = Math.floor(player.position.z + Math.sin(angle) * dist);
    const chunk = this.world.getChunk(Math.floor(wx / 16), Math.floor(wz / 16));
    if (!chunk || !chunk.generated) return;

    const biome = this.world.getBiomeAt(wx, wz);
    const topY = this.world.heightAtWorld(wx, wz);
    if (topY < 0) return;
    const spawnY = topY + 1;
    if (this.world.getBlockGlobal(wx, spawnY, wz) !== 0) return;
    if (biome.waterlogged) return;

    const isNight = dayNight.phase() === 'night';
    const pool = biome.mobs.filter((id) => isNight || !CREATURES[id]?.hostile || this.world.dimension.id === 'ember_expanse');
    if (!pool.length) return;
    const speciesId = pool[Math.floor(Math.random() * pool.length)];
    this.spawnMob(speciesId, { x: wx + 0.5, y: spawnY, z: wz + 0.5 });
  }

  /**
   * Looks for a dark, enclosed pocket near the player's own depth and spawns
   * a cave species there. Returns true if it spawned something.
   *
   * Only fires when the player is actually below ground, and only in cells
   * with no skylight and little block light — so torches genuinely keep a
   * mined-out area clear, and the display brightness (which is deliberately
   * high everywhere) has no effect on it.
   */
  _trySpawnUnderground(player) {
    const caveMobs = this.world.dimension.caveMobs;
    if (!caveMobs?.length) return false;

    const px = Math.floor(player.position.x), pz = Math.floor(player.position.z);
    const surface = this.world.heightAtWorld(px, pz);
    const playerDepth = surface - player.position.y;
    if (playerDepth < CAVE_SPAWN_MIN_DEPTH) return false;

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = CAVE_SPAWN_MIN_DIST + Math.random() * (CAVE_SPAWN_MAX_DIST - CAVE_SPAWN_MIN_DIST);
      const wx = Math.floor(player.position.x + Math.cos(angle) * dist);
      const wz = Math.floor(player.position.z + Math.sin(angle) * dist);

      const chunk = this.world.getChunk(Math.floor(wx / 16), Math.floor(wz / 16));
      if (!chunk?.generated) continue;

      // Scan the column around the player's depth rather than guessing a Y:
      // picking a random point in 3D underground lands in solid rock ~88% of
      // the time, so cave spawns almost never fired.
      const from = Math.max(6, Math.floor(player.position.y) - 8);
      const to = Math.floor(player.position.y) + 8;
      const startY = from + Math.floor(Math.random() * Math.max(1, to - from));

      for (let step = 0; step <= to - from; step++) {
        const y = from + ((startY - from + step) % (to - from + 1));
        if (!this.world.isSolidGlobal(wx, y - 1, wz)) continue;
        if (this.world.getBlockGlobal(wx, y, wz) !== 0) continue;
        if (this.world.getBlockGlobal(wx, y + 1, wz) !== 0) continue;
        if (this.world.getSkyLightGlobal(wx, y, wz) > 2) continue;
        if (this.world.getBlockLightGlobal(wx, y, wz) >= CAVE_SPAWN_MAX_LIGHT) continue;

        const speciesId = caveMobs[Math.floor(Math.random() * caveMobs.length)];
        this.spawnMob(speciesId, { x: wx + 0.5, y, z: wz + 0.5 });
        return true;
      }
    }
    return false;
  }

  _updateMobs(dt, player, camera) {
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      mob.update(dt, this.world, player, this);
      if (mob.healthBar && camera) updateHealthBar(mob.healthBar, mob, camera, HEALTH_BAR_DISTANCE);
      const dist = mob.distanceTo(player.position);
      if (!mob.alive) {
        this._killMob(mob, i);
        continue;
      }
      // Bosses and mini-bosses stay put. They are placed deliberately, at a
      // landmark the player walked to, and the distance that wakes one (34)
      // sits close enough under this one that a few blocks of height
      // difference culled a Riftbound Colossus on the same frame it appeared
      // — you arrived at the outpost and nobody was there.
      const permanent = mob.species.boss || mob.species.miniBoss;
      if (dist > DESPAWN_DIST && !permanent) {
        this.group.remove(mob.mesh);
        disposeMobMesh(mob.mesh);
        this.mobs.splice(i, 1);
      }
    }
  }

  _killMob(mob, index) {
    for (const drop of mob.species.drops) {
      if (Math.random() > (drop.chance ?? 1)) continue;
      const count = drop.count[0] + Math.floor(Math.random() * (drop.count[1] - drop.count[0] + 1));
      if (count > 0) this.spawnDrop(drop.id, count, { x: mob.position.x, y: mob.position.y + 0.5, z: mob.position.z });
    }
    this.group.remove(mob.mesh);
    disposeMobMesh(mob.mesh);
    this.mobs.splice(index, 1);
    // The escort does not outlive whatever called it up.
    if (mob.species.boss) mob.boss?.dismiss();
    globalEvents.emit('entity:mobKilled', mob.species);
  }

  _updateDrops(dt, player) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.age += dt;
      drop.physicsStep(dt, this.world);
      drop.mesh.position.set(drop.position.x, drop.position.y + Math.sin(drop.age * 3) * 0.08 + 0.2, drop.position.z);

      if (drop.age > DROP_LIFETIME) {
        this.group.remove(drop.mesh);
        this.drops.splice(i, 1);
        continue;
      }
      if (drop.age >= drop.pickupDelay && drop.distanceTo(player.position) < PICKUP_RADIUS) {
        const leftover = player.inventory.addItem(drop.itemId, drop.count, drop.durability, drop.infusions);
        if (leftover < drop.count) {
          globalEvents.emit('ui:toast', `+${drop.count - leftover} ${ItemRegistry.get(drop.itemId)?.displayName ?? drop.itemId}`);
        }
        if (leftover > 0) { drop.count = leftover; continue; }
        this.group.remove(drop.mesh);
        this.drops.splice(i, 1);
      }
    }
  }

  _updateCombat(dt, player, input, interaction) {
    if (this._attackCooldown > 0) this._attackCooldown -= dt;
    if (!input.mouseButtons.has(0) || this._attackCooldown > 0) return;

    const camera = interaction.camera;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const blockDist = interaction.target
      ? Math.hypot(interaction.target.x + 0.5 - camera.position.x, interaction.target.y + 0.5 - camera.position.y, interaction.target.z + 0.5 - camera.position.z)
      : Infinity;

    let best = null, bestDist = Infinity;
    for (const mob of this.mobs) {
      // Aim at the middle of the body the player can see, not the middle of
      // the smaller box the world collides with — on the Warden those are
      // nearly a block apart, and the crosshair follows the model.
      const aimY = mob.position.y + (mob.bodyHeight ?? mob.height) * 0.5;
      const toMob = new THREE.Vector3(mob.position.x - camera.position.x, aimY - camera.position.y, mob.position.z - camera.position.z);
      const dist = toMob.length();
      if (dist > 4.5 || dist > blockDist) continue;
      const angle = toMob.normalize().angleTo(forward);
      if (angle < 0.28 && dist < bestDist) { best = mob; bestDist = dist; }
    }
    if (!best) return;

    const heldSlot = player.inventory.getSelected();
    const heldItem = heldSlot ? ItemRegistry.get(heldSlot.id) : null;
    const damage = (heldItem?.tool?.damage ?? 1) + getInfusionLevel(heldSlot, 'keenedge');
    const knockback = new THREE.Vector3(best.position.x - player.position.x, 0.3, best.position.z - player.position.z).normalize().multiplyScalar(5);

    best.damage(damage);
    best.velocity.x += knockback.x; best.velocity.y += 3; best.velocity.z += knockback.z;
    const swing = heldItem?.tool?.type === 'sword' ? ATTACK_COOLDOWN_BASE * 0.7 : ATTACK_COOLDOWN_BASE;
    // ...and the swing, the other half of what the Vigor Amulet promises.
    this._attackCooldown = swing / (1 + player.inventory.amuletPower('swiftness'));
    if (!best.alive) player.addXp(best.species.xp ?? 2);
  }

  dispose() {
    this._offDrop?.();
    this.scene.remove(this.group);
  }
}
