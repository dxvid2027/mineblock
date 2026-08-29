import * as THREE from 'three';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../world/Chunk.js';

const CHUNK_BOUNDS_RADIUS = 4; // chunks around the player to draw pillars for, kept small for perf

function pushBoxEdges(arr, minX, minY, minZ, maxX, maxY, maxZ) {
  const c = [
    [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ],
    [minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // bottom
    [4, 5], [5, 6], [6, 7], [7, 4], // top
    [0, 4], [1, 5], [2, 6], [3, 7] // verticals
  ];
  for (const [a, b] of edges) arr.push(...c[a], ...c[b]);
}

/**
 * Debug visualizations toggled by the player: chunk boundary pillars ('P')
 * and mob hitboxes ('L'). Both rebuild their line geometry from scratch
 * each frame while visible — cheap at these counts, and simplest to keep
 * correct as chunks/mobs come and go.
 */
export class DebugRenderer {
  constructor(scene) {
    this.scene = scene;
    this.chunkBoundsVisible = false;
    this.hitboxesVisible = false;

    this._chunkGeo = new THREE.BufferGeometry();
    this._chunkLines = new THREE.LineSegments(this._chunkGeo, new THREE.LineBasicMaterial({ color: 0x39d0ff, transparent: true, opacity: 0.55 }));
    this._chunkLines.visible = false;
    this._chunkLines.frustumCulled = false;
    scene.add(this._chunkLines);

    this._hitboxGeo = new THREE.BufferGeometry();
    this._hitboxLines = new THREE.LineSegments(this._hitboxGeo, new THREE.LineBasicMaterial({ color: 0xff3b3b }));
    this._hitboxLines.visible = false;
    this._hitboxLines.frustumCulled = false;
    scene.add(this._hitboxLines);
  }

  toggleChunkBounds() {
    this.chunkBoundsVisible = !this.chunkBoundsVisible;
    this._chunkLines.visible = this.chunkBoundsVisible;
    return this.chunkBoundsVisible;
  }

  toggleHitboxes() {
    this.hitboxesVisible = !this.hitboxesVisible;
    this._hitboxLines.visible = this.hitboxesVisible;
    return this.hitboxesVisible;
  }

  update(world, entityManager, player) {
    if (this.chunkBoundsVisible) this._rebuildChunkBounds(world, player);
    if (this.hitboxesVisible) this._rebuildHitboxes(entityManager, player);
  }

  _rebuildChunkBounds(world, player) {
    const positions = [];
    const pcx = Math.floor(player.position.x / CHUNK_SIZE_X);
    const pcz = Math.floor(player.position.z / CHUNK_SIZE_Z);
    for (const chunk of world.chunks.values()) {
      if (Math.abs(chunk.cx - pcx) > CHUNK_BOUNDS_RADIUS || Math.abs(chunk.cz - pcz) > CHUNK_BOUNDS_RADIUS) continue;
      const x0 = chunk.cx * CHUNK_SIZE_X, z0 = chunk.cz * CHUNK_SIZE_Z;
      pushBoxEdges(positions, x0, 0, z0, x0 + CHUNK_SIZE_X, CHUNK_HEIGHT, z0 + CHUNK_SIZE_Z);
    }
    this._chunkGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this._chunkGeo.computeBoundingSphere();
  }

  _rebuildHitboxes(entityManager, player) {
    const positions = [];
    for (const mob of entityManager.mobs) {
      if (!mob.alive) continue;
      const box = mob.aabbAt(mob.position);
      pushBoxEdges(positions, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
    }
    // Include the player's own hitbox too, for reference.
    if (player) {
      const box = player.aabbAt(player.position);
      pushBoxEdges(positions, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
    }
    this._hitboxGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this._hitboxGeo.computeBoundingSphere();
  }

  dispose() {
    this.scene.remove(this._chunkLines, this._hitboxLines);
    this._chunkGeo.dispose();
    this._hitboxGeo.dispose();
  }
}
