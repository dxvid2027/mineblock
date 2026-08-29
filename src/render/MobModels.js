import * as THREE from 'three';

// Builds simple, original low-poly creature bodies out of boxes — the same
// "blocky" visual language as the world itself, just proportioned per
// species rather than textured. No external models/art are used.
function box(w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  return new THREE.Mesh(geo, mat);
}

export function buildMobMesh(species) {
  const group = new THREE.Group();
  const c = species.color;
  const accent = species.accentColor ?? c;

  if (species.bodyType === 'quad') {
    const body = box(0.9, 0.6, 1.3, c); body.position.y = 0.7; group.add(body);
    const head = box(0.5, 0.5, 0.5, accent); head.position.set(0, 0.85, 0.85); group.add(head);
    for (const [dx, dz] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) {
      const leg = box(0.22, 0.55, 0.22, accent); leg.position.set(dx, 0.28, dz); group.add(leg);
    }
  } else if (species.bodyType === 'biped') {
    const body = box(0.7, 0.9, 0.5, c); body.position.y = 1.1; group.add(body);
    const head = box(0.5, 0.5, 0.5, accent); head.position.y = 1.75; group.add(head);
    for (const dx of [-0.22, 0.22]) {
      const leg = box(0.26, 0.9, 0.26, c); leg.position.set(dx, 0.45, 0); group.add(leg);
    }
    for (const dx of [-0.48, 0.48]) {
      const arm = box(0.2, 0.7, 0.2, accent); arm.position.set(dx, 1.15, 0); group.add(arm);
    }
  } else if (species.bodyType === 'blob') {
    const body = box(0.7, 0.7, 0.7, c); body.position.y = 0.5; group.add(body);
    const eye = box(0.18, 0.18, 0.06, accent); eye.position.set(0, 0.55, 0.36); group.add(eye);
  } else if (species.bodyType === 'boss') {
    const body = box(2.2, 2.2, 2.6, c); body.position.y = 2.0; group.add(body);
    const head = box(1.2, 1.0, 1.0, accent); head.position.set(0, 3.2, 1.4); group.add(head);
    for (const [dx, dz] of [[-0.8, 1.0], [0.8, 1.0], [-0.8, -1.0], [0.8, -1.0]]) {
      const leg = box(0.6, 1.8, 0.6, accent); leg.position.set(dx, 0.9, dz); group.add(leg);
    }
    for (const dx of [-1.5, 1.5]) {
      const spike = box(0.3, 1.2, 0.3, accent); spike.position.set(dx, 3.4, 0); spike.rotation.z = dx > 0 ? -0.3 : 0.3; group.add(spike);
    }
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return group;
}
