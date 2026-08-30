import * as THREE from 'three';
import '../blocks/BlockTypes.js';
import { registerBlockItems } from '../items/ItemTypes.js';

import { World } from '../world/World.js';
import { DayNightCycle } from '../world/DayNightCycle.js';
import { WeatherSystem } from '../world/WeatherSystem.js';
import { SkyDome } from '../render/SkyDome.js';
import { Player } from '../entities/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { Interaction } from '../player/Interaction.js';
import { SurvivalSystem } from '../player/SurvivalSystem.js';
import { EntityManager } from '../entities/EntityManager.js';
import { ItemRegistry, itemDurability } from '../items/ItemRegistry.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { rollLoot } from '../world/Structures.js';
import { getInfusionLevel } from '../magic/InfusionSystem.js';

import { settings } from './Settings.js';
import { SaveManager } from './SaveManager.js';
import { globalEvents } from './EventBus.js';

import { DebugRenderer } from '../render/DebugRenderer.js';
import { BlockEffects } from '../render/BlockEffects.js';
import { disposeSkins } from '../render/MobSkins.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { HUD } from '../ui/HUD.js';
import { InventoryScreen } from '../ui/InventoryScreen.js';
import { SmelterUI } from '../ui/SmelterUI.js';
import { RuneforgeUI } from '../ui/RuneforgeUI.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { DeathScreen } from '../ui/DeathScreen.js';
import { VictoryScreen } from '../ui/VictoryScreen.js';
import { LoadingScreen } from '../ui/LoadingScreen.js';

registerBlockItems();

const AUTOSAVE_INTERVAL = 90;
const OTHER_DIMENSION = { overworld: 'ember_expanse', ember_expanse: 'overworld' };

/**
 * Owns the whole in-game session: scene/renderer, world, player, all
 * gameplay systems, and the coordination of which UI panel (if any) is
 * currently open. MainMenu hands off to `new Game(...)` + `start()`.
 */
export class Game {
  constructor(canvas, uiRoot, input) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.input = input;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Tablets report devicePixelRatio 2; rendering the whole voxel scene at
    // 2x on a large panel roughly halves the frame rate for little visible
    // gain, so cap it there.
    const highDensityTablet = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, highDensityTablet ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), window.innerWidth / window.innerHeight, 0.08, 500);
    this.fog = new THREE.Fog(0xbfe3f2, 40, 140);
    this.scene.fog = this.fog;

    this.clock = new THREE.Clock();
    this.playedTime = 0;
    this.state = 'idle';
    this.activeWorkstation = null; // { type, ui }

    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
    // iOS fires orientationchange before resize, and its dynamic toolbar
    // changes the viewport without a resize event in some cases.
    window.addEventListener('orientationchange', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);

    this._emberLight = new THREE.PointLight(0xff8a3f, 0, 8);
    this.scene.add(this._emberLight);

    this._bindEvents();
  }

  _bindEvents() {
    globalEvents.on('ui:openWorkstation', (info) => this._openWorkstation(info));
    globalEvents.on('ui:closeWorkstation', () => this._closeWorkstation());
    globalEvents.on('player:eat', (item) => this._eatItem(item));
    globalEvents.on('player:died', () => this._onPlayerDied());
    globalEvents.on('entity:mobKilled', (species) => {
      if (species.boss) this._onBossDefeated();
    });
  }

  async start({ mode, name, seed }) {
    this.saveName = name ?? 'New World';
    this.loading = new LoadingScreen(this.uiRoot, mode === 'load' ? 'Loading world…' : 'Carving a new world…');
    await new Promise((r) => setTimeout(r, 20)); // let the loading screen paint

    let saveData = null;
    if (mode === 'load') saveData = await SaveManager.load(name);

    this.seed = saveData?.seed ?? seed ?? Math.floor(Math.random() * 2 ** 31);
    this.dimensionId = saveData?.player?.dimension ?? 'overworld';

    this.world = new World(this.scene, this.seed, this.dimensionId);
    this.dayNight = new DayNightCycle(this.scene);
    this.weather = new WeatherSystem(this.scene);
    this.sky = new SkyDome(this.scene);
    this.player = new Player();
    this.entities = new EntityManager(this.scene, this.world);
    this.controller = new PlayerController(this.player, this.camera, this.input);
    this.interaction = new Interaction(this.world, this.camera, this.input, this.player);
    this.survival = new SurvivalSystem(this.player);

    if (saveData) {
      this.player.deserialize(saveData.player);
      this.dayNight.deserialize(saveData);
      this.world.loadAllDimensions(saveData.chunkDiffs);
      this.playedTime = saveData.playedTime ?? 0;
      this.bossDefeated = !!saveData.bossDefeated;
    } else {
      // Every new world starts somewhere different: the spawn column is
      // derived from the seed and vetted for dry, walkable ground.
      const spawn = this.world.generator.findSpawnColumn();
      this.player.spawnPoint = { x: spawn.x + 0.5, y: spawn.y + 2, z: spawn.z + 0.5, dimension: 'overworld' };
      this.player.position.set(spawn.x + 0.5, spawn.y + 2, spawn.z + 0.5);
    }

    const spawnX = this.player.position.x;
    const spawnZ = this.player.position.z;
    this.world.forceLoad(spawnX, spawnZ, 4);
    if (!saveData) {
      // Re-seat on the actually generated surface, which may differ slightly
      // from the noise estimate once caves and structures are applied.
      const topY = this.world.heightAtWorld(Math.floor(spawnX), Math.floor(spawnZ));
      this.player.position.set(spawnX, topY + 2, spawnZ);
      this.player.spawnPoint.y = topY + 2;
    }

    this.hud = new HUD(this.uiRoot, this.player);
    this.debugRenderer = new DebugRenderer(this.scene);
    this.blockEffects = new BlockEffects(this.scene);
    this._offBlockBroken = globalEvents.on('block:broken', ({ x, y, z, blockId }) =>
      this.blockEffects.burst(x, y, z, blockId));
    this.debugOverlay = new DebugOverlay(this.uiRoot);
    this.loading.destroy();
    this.state = 'playing';
    this.canvas.addEventListener('click', this._requestLock);
    this.input.requestPointerLock();
    this._autosaveTimer = AUTOSAVE_INTERVAL;
    this._handleResize();
    this._loop();
  }

  _requestLock = () => {
    if (this.state === 'playing') this.input.requestPointerLock();
  };

  _handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.fov = settings.get('fov');
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _loop = () => {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, this.clock.getDelta());

    if (this.state === 'playing') this._update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  _update(dt) {
    this.playedTime += dt;

    if (this.input.keyWasPressed(settings.get('keybinds').pause)) {
      if (this.activeWorkstation) this._closeWorkstation();
      else this._togglePause();
      return;
    }
    const canToggleInventory = !this.activeWorkstation || this.activeWorkstation.type === 'inventory';
    if (canToggleInventory && this.input.keyWasPressed(settings.get('keybinds').inventory)) {
      this._toggleInventory();
    }
    for (let i = 0; i < 9; i++) {
      if (this.input.keyWasPressed(settings.get('keybinds')[`hotbar${i + 1}`])) this.player.inventory.selectHotbar(i);
    }
    if (this.input.wasPressed('drop')) this._dropHeldItem(this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight'));

    // Debug toggles: P = chunk boundaries, L = mob hitboxes, O = coordinates/info panel.
    if (this.input.keyWasPressed('KeyP')) {
      const on = this.debugRenderer.toggleChunkBounds();
      globalEvents.emit('ui:toast', `Chunk borders ${on ? 'shown' : 'hidden'}`);
    }
    if (this.input.keyWasPressed('KeyL')) {
      const on = this.debugRenderer.toggleHitboxes();
      globalEvents.emit('ui:toast', `Mob hitboxes ${on ? 'shown' : 'hidden'}`);
    }
    if (this.input.keyWasPressed('KeyO')) {
      const on = this.debugOverlay.toggle();
      this.hud.setTagsVisible(!on);
    }

    const uiOpen = !!this.activeWorkstation;
    if (!uiOpen) {
      // Only matters where Pointer Lock is unavailable (Safari on iPadOS):
      // keeps the view turning while the cursor rests against a screen edge.
      this.input.updateFallbackLook(dt);
      this.controller.update(dt, this.world);
      this.interaction.update(dt);
      this.blockEffects.update(dt, this.interaction.target, this.interaction.breaking);
      this.entities.update(dt, this.player, this.dayNight, this.input, this.interaction);
    } else {
      this.player.velocity.set(0, this.player.velocity.y, 0);
      // No crosshair target while a panel is open, but debris already in the
      // air keeps falling.
      this.blockEffects.update(dt, null, null);
      this.activeWorkstation.ui.update?.(dt);
    }

    this.survival.update(dt, this.world);
    this.dayNight.update(dt, this.world.dimension);
    this.world.setDayFactor(this.dayNight.dayFactor);
    this.world.update(this.player.position.x, this.player.position.z, settings.get('renderDistance'));
    this.weather.update(dt, this.player, this.world);
    this.sky.update(this.camera, this.dayNight);
    this.fog.color.copy(this.dayNight.sky.bottom);
    this.fog.near = this.world.dimension.fogNear;
    this.fog.far = this.world.dimension.fogFar;
    this.renderer.setClearColor(this.dayNight.sky.bottom);

    this._updateEmberlight();
    this.hud.update(this.world, this.dayNight, this.interaction, this.entities.boss);
    this.debugRenderer.update(this.world, this.entities, this.player);
    this.debugOverlay.trackFrame(dt);
    this.debugOverlay.update({ world: this.world, player: this.player, dayNight: this.dayNight, interaction: this.interaction, entities: this.entities, weather: this.weather });

    this._autosaveTimer -= dt;
    if (this._autosaveTimer <= 0) { this._autosaveTimer = AUTOSAVE_INTERVAL; this.save(); }
  }

  /**
   * Lights the area around the player from either an Emberlight infusion or a
   * light-emitting block carried in hand — carrying torches in the offhand is
   * the practical way to see while mining with a pickaxe.
   */
  _updateEmberlight() {
    const inv = this.player.inventory;
    let tier = 0;
    const held = inv.getSelected();
    if (held) tier = Math.max(tier, getInfusionLevel(held, 'emberlight'));
    for (const item of Object.values(inv.equipment)) tier = Math.max(tier, getInfusionLevel(item, 'emberlight'));

    let carriedGlow = 0;
    for (const stack of [held, inv.offhand]) {
      const blockName = stack && ItemRegistry.get(stack.id)?.blockName;
      if (!blockName) continue;
      carriedGlow = Math.max(carriedGlow, BlockRegistry.byName(blockName)?.lightEmission ?? 0);
    }

    const intensity = Math.max(tier > 0 ? 1.4 : 0, carriedGlow / 15 * 1.2);
    this._emberLight.intensity = intensity;
    this._emberLight.distance = carriedGlow > 0 ? 12 : 8;
    this._emberLight.position.copy(this.camera.position);
  }

  // ------------------------------------------------------------- eating
  _eatItem({ item, hand }) {
    const inv = this.player.inventory;
    if (hand === 'off') {
      if (!inv.offhand) return;
      this.player.eat(item.food);
      inv.offhand.count -= 1;
      if (inv.offhand.count <= 0) inv.offhand = null;
      globalEvents.emit('inventory:changed');
      return;
    }
    const slot = inv.slots[inv.selectedHotbar];
    if (!slot) return;
    this.player.eat(item.food);
    inv.removeFromSlot(inv.selectedHotbar, 1);
  }

  /**
   * Throws the selected item out in front of the player: one with the drop
   * key, the whole stack with shift held. It is tossed along the view
   * direction and cannot be picked up again for a moment, or the player
   * would collect it on the very next frame.
   */
  _dropHeldItem(wholeStack) {
    const inv = this.player.inventory;
    const slot = inv.getSelected();
    if (!slot) return;
    const count = wholeStack ? slot.count : 1;
    const { durability, infusions } = slot;
    const id = slot.id;
    inv.removeFromSlot(inv.selectedHotbar, count);

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    globalEvents.emit('item:drop', {
      id, count, durability, infusions,
      position: {
        x: this.player.position.x + dir.x * 0.6,
        y: this.player.position.y + 1.2,
        z: this.player.position.z + dir.z * 0.6
      },
      velocity: { x: dir.x * 5, y: 2.4, z: dir.z * 5 },
      pickupDelay: 1.2
    });
  }

  /**
   * Everything the player was carrying falls where they died — pack,
   * offhand and worn armor alike. Dropping it here rather than on respawn
   * means it lands at the place of death, which is the point of losing it.
   */
  _scatterInventoryOnDeath() {
    const inv = this.player.inventory;
    const at = {
      x: this.player.position.x,
      y: this.player.position.y + 0.5,
      z: this.player.position.z
    };
    const toss = (stack) => {
      if (!stack) return;
      globalEvents.emit('item:drop', {
        id: stack.id, count: stack.count ?? 1,
        durability: stack.durability, infusions: stack.infusions,
        position: at, pickupDelay: 2
      });
    };

    for (let i = 0; i < inv.slots.length; i++) { toss(inv.slots[i]); inv.slots[i] = null; }
    toss(inv.offhand); inv.offhand = null;
    for (const key of Object.keys(inv.equipment)) { toss(inv.equipment[key]); inv.equipment[key] = null; }
    globalEvents.emit('inventory:changed');
  }

  // ------------------------------------------------------------- workstations
  _toggleInventory() {
    if (this.activeWorkstation?.type === 'inventory') { this._closeWorkstation(); return; }
    if (this.activeWorkstation) this._closeWorkstation();
    const ui = new InventoryScreen(this.uiRoot, this.player, { craftSize: 2, title: 'Inventory' });
    this.activeWorkstation = { type: 'inventory', ui };
    this.input.releasePointerLock();
  }

  _openWorkstation({ type, pos }) {
    if (this.activeWorkstation) this._closeWorkstation();
    this.input.releasePointerLock();

    if (type === 'crafting') {
      const ui = new InventoryScreen(this.uiRoot, this.player, { craftSize: 3, showRecipes: true, title: 'Workbench' });
      this.activeWorkstation = { type, ui };
    } else if (type === 'smelter') {
      const be = this.world.getBlockEntity(pos.x, pos.y, pos.z) ?? {};
      const ui = new SmelterUI(this.uiRoot, this.player, be, (state) => this.world.setBlockEntity(pos.x, pos.y, pos.z, state));
      this.activeWorkstation = { type, ui, pos };
    } else if (type === 'runeforge') {
      const ui = new RuneforgeUI(this.uiRoot, this.player);
      this.activeWorkstation = { type, ui };
    } else if (type === 'storage') {
      let be = this.world.getBlockEntity(pos.x, pos.y, pos.z);
      if (!be) { be = { type: 'storage' }; this.world.setBlockEntity(pos.x, pos.y, pos.z, be); }
      if (!be.items) be.items = new Array(27).fill(null);
      if (be.loot) { this._fillLoot(be, be.loot); be.loot = null; }
      const ui = new InventoryScreen(this.uiRoot, this.player, {
        craftSize: 0, title: 'Storage Crate',
        externalContainer: { name: 'Storage', slots: be.items, onChange: () => {} }
      });
      this.activeWorkstation = { type, ui, pos };
    } else if (type === 'bed') {
      this._sleep();
      this.input.requestPointerLock();
      return;
    } else if (type === 'portal') {
      this._travelDimension();
      this.input.requestPointerLock();
      return;
    }
  }

  _closeWorkstation() {
    if (!this.activeWorkstation) return;
    this.activeWorkstation.ui.destroy();
    this.activeWorkstation = null;
    if (this.state === 'playing') this.input.requestPointerLock();
  }

  /** Fills a structure's crate the first time it is opened, from its loot table. */
  _fillLoot(blockEntity, table) {
    let slotIdx = 0;
    for (const stack of rollLoot(table)) {
      if (!ItemRegistry.get(stack.id)) continue;
      if (slotIdx >= blockEntity.items.length) break;
      const def = ItemRegistry.get(stack.id);
      blockEntity.items[slotIdx++] = {
        id: stack.id,
        count: Math.min(stack.count, def.stackSize),
        // Tools and armor need durability or they read as broken.
        durability: itemDurability(def)
      };
    }
  }

  _sleep() {
    const phase = this.dayNight.phase();
    if (phase !== 'night') { globalEvents.emit('ui:toast', 'You can only sleep at night.'); return; }
    this.dayNight.setTime(0.26);
    this.player.heal(this.player.maxHealth);
    globalEvents.emit('ui:toast', 'You wake up feeling refreshed.');
  }

  _travelDimension() {
    const nextId = OTHER_DIMENSION[this.world.dimensionId];
    this.world.setDimension(nextId);
    this.player.dimension = nextId;
    this.entities.setWorld(this.world);
    const x = Math.floor(this.player.position.x), z = Math.floor(this.player.position.z);
    this.world.forceLoad(x, z, 2);
    const topY = this.world.heightAtWorld(x, z);
    this.player.position.set(x + 0.5, topY + 2, z + 0.5);
    this.player.velocity.set(0, 0, 0);
    globalEvents.emit('ui:toast', `You step into ${this.world.dimension.displayName}.`);

    if (nextId === 'ember_expanse' && !this.entities.bossAlive && this.player.level >= 5 && Math.random() < 0.5) {
      const angle = Math.random() * Math.PI * 2;
      const bx = x + Math.cos(angle) * 18, bz = z + Math.sin(angle) * 18;
      const by = this.world.heightAtWorld(Math.floor(bx), Math.floor(bz)) + 1;
      this.entities.spawnMob('cinder_warden', { x: bx, y: by, z: bz });
      globalEvents.emit('ui:toast', 'You sense a monstrous presence nearby...');
    }
  }

  // ------------------------------------------------------------- pause/death
  _togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input.releasePointerLock();
      this.pauseMenu = new PauseMenu(this.uiRoot, {
        onResume: () => this._togglePause(),
        onSaveQuit: () => this._saveAndQuit()
      });
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.pauseMenu.destroy();
      this.pauseMenu = null;
      this.input.requestPointerLock();
    }
  }

  _onBossDefeated() {
    if (this.state !== 'playing' || this.bossDefeated) return;
    this.bossDefeated = true;
    this.state = 'victory';
    this.input.releasePointerLock();
    this.victoryScreen = new VictoryScreen(this.uiRoot, {
      stats: { days: this.dayNight.day, level: this.player.level },
      onContinue: () => {
        this.victoryScreen.destroy();
        this.victoryScreen = null;
        this.state = 'playing';
        this.input.requestPointerLock();
      }
    });
    this.save();
  }

  _onPlayerDied() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this._scatterInventoryOnDeath();
    this.input.releasePointerLock();
    this.deathScreen = new DeathScreen(this.uiRoot, {
      onRespawn: () => {
        this.player.respawn();
        this.deathScreen.destroy();
        this.deathScreen = null;
        this.state = 'playing';
        this.input.requestPointerLock();
      }
    });
  }

  async save() {
    if (!this.world) return;
    const payload = SaveManager.serialize(this);
    await SaveManager.write(this.saveName, payload);
  }

  async _saveAndQuit() {
    await this.save();
    this.dispose();
    window.location.reload();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    window.visualViewport?.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('click', this._requestLock);
    this.entities?.dispose();
    this.weather?.dispose();
    this.sky?.dispose(this.scene);
    this.world?.dispose();
    this.debugRenderer?.dispose();
    this.blockEffects?.dispose();
    disposeSkins(); // creature hides are cached across mobs, not per mob
    this._offBlockBroken?.();
    this.debugOverlay?.dispose();
  }
}
