import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry.js';

// Everything the player sees happening to a block: the outline around the
// one they are looking at, the cracks that spread across it while it is
// being mined, the dust that comes off each hit, and the burst of debris
// when it finally gives way.
//
// The crack stages are generated here rather than loaded: one strip of
// CRACK_STAGES tiles, each showing the same fractures a little further
// along, which the material scrolls through as mining progresses.

const CRACK_STAGES = 10;
const CRACK_TILE = 32;
const CRACK_BRANCHES = 9;

const MAX_PARTICLES = 260;
const GRAVITY = 11;
const DUST_INTERVAL = 0.11; // seconds between puffs while mining

/** Builds the horizontal strip of cumulative crack stages. */
function buildCrackStrip() {
  const strip = document.createElement('canvas');
  strip.width = CRACK_TILE * CRACK_STAGES;
  strip.height = CRACK_TILE;
  const sctx = strip.getContext('2d');

  const scratch = document.createElement('canvas');
  scratch.width = CRACK_TILE; scratch.height = CRACK_TILE;
  const ctx = scratch.getContext('2d');

  // A fixed seed: the crack pattern is part of the game's look, not
  // something that should differ between sessions.
  let h = 0x9e3779b9;
  const rng = () => {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };

  // Each branch is a jagged walk outward from the centre of the face.
  const centre = CRACK_TILE / 2;
  const branches = [];
  for (let b = 0; b < CRACK_BRANCHES; b++) {
    const angle = (b / CRACK_BRANCHES) * Math.PI * 2 + rng() * 0.8;
    let x = centre + (rng() - 0.5) * 3, y = centre + (rng() - 0.5) * 3;
    let dx = Math.cos(angle), dy = Math.sin(angle);
    const pts = [];
    for (let i = 0; i < CRACK_TILE * 0.75; i++) {
      pts.push([Math.round(x), Math.round(y)]);
      // Wander, but keep the overall direction so cracks radiate rather
      // than curl back on themselves.
      dx += (rng() - 0.5) * 0.35; dy += (rng() - 0.5) * 0.35;
      const len = Math.hypot(dx, dy) || 1;
      x += dx / len; y += dy / len;
      if (x < 0 || y < 0 || x >= CRACK_TILE || y >= CRACK_TILE) break;
    }
    branches.push(pts);
  }

  const thickness = Math.max(1, CRACK_TILE / 16);
  for (let s = 0; s < CRACK_STAGES; s++) {
    const t = (s + 1) / CRACK_STAGES;
    ctx.clearRect(0, 0, CRACK_TILE, CRACK_TILE);
    for (let b = 0; b < branches.length; b++) {
      // Branches appear one after another, then keep growing outward.
      const birth = (b / branches.length) * 0.55;
      const grown = Math.max(0, Math.min(1, (t - birth) / 0.45));
      const count = Math.floor(branches[b].length * grown);
      for (let i = 0; i < count; i++) {
        const [x, y] = branches[b][i];
        ctx.fillStyle = 'rgba(14,11,10,0.88)';
        ctx.fillRect(x, y, thickness, thickness);
        // A faint lit lip on one side gives the crack depth. Kept subtle:
        // brighter than this and the fractures read as a white star.
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + thickness, y + thickness, thickness, thickness);
      }
    }
    sctx.drawImage(scratch, s * CRACK_TILE, 0);
  }
  return strip;
}

export class BlockEffects {
  constructor(scene) {
    this.scene = scene;
    this._dustTimer = 0;
    this._time = 0;

    // ---- outline around the block under the crosshair
    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x181d2b, transparent: true, opacity: 0.5 })
    );
    this.selection.visible = false;
    this.selection.renderOrder = 2;
    scene.add(this.selection);

    // ---- crack overlay
    this.crackTexture = new THREE.CanvasTexture(buildCrackStrip());
    this.crackTexture.magFilter = THREE.NearestFilter;
    this.crackTexture.minFilter = THREE.NearestFilter;
    this.crackTexture.generateMipmaps = false;
    this.crackTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.crackTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.crackTexture.repeat.set(1 / CRACK_STAGES, 1);

    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({
        map: this.crackTexture,
        transparent: true,
        depthWrite: false,
        // Sit just in front of the block face so the cracks are never
        // swallowed by z-fighting with the chunk mesh.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
      })
    );
    this.crack.visible = false;
    this.crack.renderOrder = 3;
    scene.add(this.crack);

    // ---- debris particles
    this._positions = new Float32Array(MAX_PARTICLES * 3);
    this._colors = new Float32Array(MAX_PARTICLES * 3);
    this._velocities = new Float32Array(MAX_PARTICLES * 3);
    this._lives = new Float32Array(MAX_PARTICLES);
    this._count = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
    geo.setDrawRange(0, 0);
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.11, vertexColors: true, sizeAttenuation: true, depthWrite: false
    }));
    this.particles.frustumCulled = false;
    scene.add(this.particles);
  }

  /**
   * @param dt        frame time
   * @param target    the block under the crosshair, or null
   * @param breaking  { progress, time } while a block is being mined, else null
   */
  update(dt, target, breaking) {
    this._time += dt;
    this._updateParticles(dt);

    if (!target) {
      this.selection.visible = false;
      this.crack.visible = false;
      this._dustTimer = 0;
      return;
    }

    const cx = target.x + 0.5, cy = target.y + 0.5, cz = target.z + 0.5;
    this.selection.position.set(cx, cy, cz);
    this.selection.visible = true;

    if (!breaking || !(breaking.time > 0)) {
      this.crack.visible = false;
      this._dustTimer = 0;
      return;
    }

    const t = Math.max(0, Math.min(0.999, breaking.progress / breaking.time));
    const stage = Math.floor(t * CRACK_STAGES);
    this.crackTexture.offset.x = stage / CRACK_STAGES;
    this.crack.position.set(cx, cy, cz);
    // A small shudder that grows with progress, so a block visibly takes the
    // hits rather than just accumulating cracks. The pulse only ever swells
    // outward: shrinking the overlay even slightly would tuck it inside the
    // block, where the depth test hides it and the cracks flicker.
    const shake = 1 + (0.5 + 0.5 * Math.sin(this._time * 34)) * 0.012 * t;
    this.crack.scale.set(shake, shake, shake);
    this.crack.visible = true;

    this._dustTimer -= dt;
    if (this._dustTimer <= 0) {
      this._dustTimer = DUST_INTERVAL;
      this._emitDust(target);
    }
  }

  /** A few chips flying off the face being struck. */
  _emitDust(target) {
    const color = blockColor(target.blockId);
    const [fx, fy, fz] = target.face ?? [0, 1, 0];
    for (let i = 0; i < 3; i++) {
      this._spawn(
        target.x + 0.5 + fx * 0.55 + (Math.random() - 0.5) * 0.6 * (1 - Math.abs(fx)),
        target.y + 0.5 + fy * 0.55 + (Math.random() - 0.5) * 0.6 * (1 - Math.abs(fy)),
        target.z + 0.5 + fz * 0.55 + (Math.random() - 0.5) * 0.6 * (1 - Math.abs(fz)),
        fx * 1.4 + (Math.random() - 0.5) * 1.2,
        fy * 1.4 + Math.random() * 1.4,
        fz * 1.4 + (Math.random() - 0.5) * 1.2,
        color, 0.35 + Math.random() * 0.25
      );
    }
  }

  /** The burst when a block finally breaks. */
  burst(x, y, z, blockId) {
    const color = blockColor(blockId);
    for (let i = 0; i < 22; i++) {
      this._spawn(
        x + 0.5 + (Math.random() - 0.5) * 0.8,
        y + 0.5 + (Math.random() - 0.5) * 0.8,
        z + 0.5 + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 3.6,
        Math.random() * 3.4 + 0.6,
        (Math.random() - 0.5) * 3.6,
        color, 0.5 + Math.random() * 0.4
      );
    }
  }

  _spawn(x, y, z, vx, vy, vz, color, life) {
    // The pool is deliberately fixed: when it is full the oldest particle is
    // reused, which keeps a long mining session from growing the buffer.
    const i = this._count < MAX_PARTICLES ? this._count++ : Math.floor(Math.random() * MAX_PARTICLES);
    const p = i * 3;
    this._positions[p] = x; this._positions[p + 1] = y; this._positions[p + 2] = z;
    this._velocities[p] = vx; this._velocities[p + 1] = vy; this._velocities[p + 2] = vz;
    // Vary each chip's brightness a little so a burst does not look like one
    // flat-colored cloud.
    const v = 0.82 + Math.random() * 0.36;
    this._colors[p] = color.r * v; this._colors[p + 1] = color.g * v; this._colors[p + 2] = color.b * v;
    this._lives[i] = life;
  }

  _updateParticles(dt) {
    let i = 0;
    while (i < this._count) {
      this._lives[i] -= dt;
      if (this._lives[i] <= 0) {
        // Swap the last live particle into this slot so the live ones stay
        // packed at the front of the buffer and one draw range covers them.
        const last = --this._count;
        const a = i * 3, b = last * 3;
        for (let k = 0; k < 3; k++) {
          this._positions[a + k] = this._positions[b + k];
          this._velocities[a + k] = this._velocities[b + k];
          this._colors[a + k] = this._colors[b + k];
        }
        this._lives[i] = this._lives[last];
        continue;
      }
      const p = i * 3;
      this._velocities[p + 1] -= GRAVITY * dt;
      this._positions[p] += this._velocities[p] * dt;
      this._positions[p + 1] += this._velocities[p + 1] * dt;
      this._positions[p + 2] += this._velocities[p + 2] * dt;
      i++;
    }
    const geo = this.particles.geometry;
    geo.setDrawRange(0, this._count);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.particles.visible = this._count > 0;
  }

  dispose() {
    for (const obj of [this.selection, this.crack, this.particles]) {
      this.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    }
    this.crackTexture.dispose();
  }
}

const colorCache = new Map();

/** The representative color of a block, for its debris. */
function blockColor(blockId) {
  if (colorCache.has(blockId)) return colorCache.get(blockId);
  const block = BlockRegistry.get(blockId);
  const tex = block?.texture ?? {};
  const spec = tex.all ?? tex.side ?? tex.top;
  const c = new THREE.Color(spec?.color ?? '#8a8a8f');
  const value = { r: c.r, g: c.g, b: c.b };
  colorCache.set(blockId, value);
  return value;
}
