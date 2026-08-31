import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { cardinalFromYaw } from '../core/compass.js';

/**
 * F3-style debug info panel toggled with 'O': position, chunk, facing,
 * dimension/biome, light levels, time, targeted block, and entity counts.
 */
export class DebugOverlay {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.style.display = 'none';
    root.appendChild(this.el);
    this.visible = false;
    this._fps = 0;
    this._fpsTimer = 0;
    this._fpsFrames = 0;
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
    return this.visible;
  }

  trackFrame(dt) {
    this._fpsFrames++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsTimer);
      this._fpsFrames = 0;
      this._fpsTimer = 0;
    }
  }

  update({ world, player, dayNight, interaction, entities, weather }) {
    if (!this.visible) return;
    const p = player.position;
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16);
    const lx = ((Math.floor(p.x) % 16) + 16) % 16, lz = ((Math.floor(p.z) % 16) + 16) % 16;
    const sky = world.getSkyLightGlobal(Math.floor(p.x), Math.floor(p.y) + 1, Math.floor(p.z));
    const block = world.getBlockLightGlobal(Math.floor(p.x), Math.floor(p.y) + 1, Math.floor(p.z));
    const biome = world.getBiomeAt(Math.floor(p.x), Math.floor(p.z));

    let targetLine = 'none';
    if (interaction.target) {
      const t = interaction.target;
      const b = BlockRegistry.get(t.blockId);
      targetLine = `${b?.displayName ?? '?'} @ ${t.x}, ${t.y}, ${t.z}`;
    }

    this.el.innerHTML = `
      <div><b>MineBlock Debug</b> (F3-style — press O to hide)</div>
      <div>FPS: ${this._fps}</div>
      <div>XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}</div>
      <div>Block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}</div>
      <div>Chunk: ${cx}, ${cz} (local ${lx}, ${lz}) — ${world.chunks.size} loaded</div>
      <div>Facing: ${cardinalFromYaw(player.yaw)} (yaw ${(player.yaw * 180 / Math.PI).toFixed(1)}°, pitch ${(player.pitch * 180 / Math.PI).toFixed(1)}°)</div>
      <div>Velocity: ${player.velocity.x.toFixed(2)}, ${player.velocity.y.toFixed(2)}, ${player.velocity.z.toFixed(2)} · onGround: ${player.onGround} · inWater: ${player.inWater}</div>
      <div>Dimension: ${world.dimension.displayName} · Biome: ${biome.displayName}</div>
      <div>Light: sky ${sky} / block ${block}</div>
      <div>Time: ${dayNight.formattedClock()} (Day ${dayNight.day}, ${dayNight.phase()}) · Weather: ${weather.current}</div>
      <div>Looking at: ${targetLine}</div>
      <div>Entities: ${entities.mobs.length} mobs, ${entities.drops.length} drops</div>
      <div>Health: ${player.health.toFixed(1)}/${player.maxHealth} · Hunger: ${player.hunger.toFixed(1)}/${player.maxHunger}</div>
    `;
  }

  dispose() {
    this.el.remove();
  }
}
