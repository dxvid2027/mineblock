import * as THREE from 'three';

// The small health bar that floats over a creature. Built from two flat
// quads rather than a canvas texture: there is one per living mob, they
// change every time something takes a hit, and repainting a texture that
// often would cost far more than moving a vertex.
//
// The bars are depth-tested on purpose. A bar that shines through a wall
// would give away every creature in the cave behind it.

const BAR_WIDTH = 0.9;
const BAR_HEIGHT = 0.11;
const BORDER = 0.02;

// Shared across every creature in the world — the bars only ever differ in
// how far the fill is scaled, which is per-mesh.
const backdropMaterial = new THREE.MeshBasicMaterial({ color: 0x1b2130, transparent: true, opacity: 0.72 });
const fillMaterials = {
  healthy: new THREE.MeshBasicMaterial({ color: 0x5fbf5a }),
  hurt: new THREE.MeshBasicMaterial({ color: 0xe0b23a }),
  critical: new THREE.MeshBasicMaterial({ color: 0xd1544a })
};
const backdropGeometry = new THREE.PlaneGeometry(BAR_WIDTH + BORDER * 2, BAR_HEIGHT + BORDER * 2);
// The fill is anchored at its left edge, so scaling x shrinks it toward the
// left the way a bar should drain, instead of toward its middle.
const fillGeometry = new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT).translate(BAR_WIDTH / 2, 0, 0);

/**
 * Creates a bar for one creature. `scale` sizes it for big bodies — the
 * default suits a sheep-sized animal.
 */
export function createHealthBar(scale = 1) {
  const group = new THREE.Group();

  const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
  backdrop.position.z = -0.001; // behind the fill, never z-fighting with it
  group.add(backdrop);

  const fill = new THREE.Mesh(fillGeometry, fillMaterials.healthy);
  fill.position.x = -BAR_WIDTH / 2;
  group.add(fill);

  group.scale.setScalar(scale);
  group.renderOrder = 1;
  group.visible = false;
  // The geometry and materials above are shared by every bar in the world,
  // so whoever tears a creature down must not dispose of them.
  group.userData.shared = true;

  group.userData.setFraction = (fraction) => {
    const f = Math.max(0, Math.min(1, fraction));
    fill.scale.x = Math.max(0.0001, f); // a zero scale would drop the quad entirely
    fill.material = f > 0.6 ? fillMaterials.healthy : f > 0.3 ? fillMaterials.hurt : fillMaterials.critical;
  };
  return group;
}

/**
 * Turns the bar to face the camera and decides whether it should be seen at
 * all. Called once per creature per frame from the entity manager, which is
 * the only place that has both the camera and the whole mob list.
 */
export function updateHealthBar(bar, mob, camera, maxDistance) {
  const dx = mob.position.x - camera.position.x;
  const dy = mob.position.y - camera.position.y;
  const dz = mob.position.z - camera.position.z;
  const distance = Math.hypot(dx, dy, dz);

  if (distance > maxDistance) { bar.visible = false; return; }
  bar.visible = true;
  bar.userData.setFraction(mob.health / mob.maxHealth);
  // Billboard: take the camera's orientation wholesale so the bar stays
  // square to the viewer however they are standing.
  bar.quaternion.copy(camera.quaternion);
}
