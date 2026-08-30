import * as THREE from 'three';
import { creatureSkin } from './MobSkins.js';

// Original creature bodies, built from boxes in the same blocky visual
// language as the world — but shaped per species rather than per body type,
// so a Grazer, a Frostfang and a Rockjaw are told apart by silhouette at a
// glance and not only by colour. No external models or art are used.
//
// Every model returns an `animate(time, speed, hurt)` on the group: legs
// swing while walking, heads bob, tails sway, blobs breathe and flames
// flicker. A creature that never moves a limb reads as a prop, however good
// its shape is.

// Per-face tint baked into vertex colours, in BoxGeometry's face order
// (+x, -x, +y, -y, +z, -z). Creatures are drawn unlit, exactly like the
// world's blocks, so this is the only thing giving a box edges you can see —
// and it deliberately mirrors the chunk mesher's own face shading (top
// brightest, bottom darkest) so an animal sits in the same light as the
// ground it stands on.
const FACE_TINT = [0.86, 0.86, 1.0, 0.6, 0.95, 0.78];

function tintBox(geo, brightness) {
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    const v = FACE_TINT[face] * brightness;
    for (let i = 0; i < 4; i++) {
      const o = (face * 4 + i) * 3;
      colors[o] = v; colors[o + 1] = v; colors[o + 2] = v;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * One box of a creature. `pivot` moves the geometry so the mesh rotates
 * around a joint rather than its own centre: 'top' for limbs hanging from a
 * hip or shoulder, 'back' for tails swinging from where they meet the body.
 */
function part(w, h, d, material, { pos, rot, pivot, brightness = 1, name } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (pivot === 'top') geo.translate(0, -h / 2, 0);
  if (pivot === 'back') geo.translate(0, 0, d / 2);
  tintBox(geo, brightness);
  const mesh = new THREE.Mesh(geo, material);
  if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (name) mesh.name = name;
  return mesh;
}

function materials(species) {
  const accent = species.accentColor ?? species.color;
  // Unlit, like every block in the world. Lit materials would put creatures
  // on a different brightness scale from the terrain: the chunk meshes bake
  // their own light with a high floor so caves and nights stay readable,
  // while a Lambert hide only ever sees the scene's dim tinted ambient, which
  // turned every animal into a dark silhouette against a bright world.
  const hide = (variant) => new THREE.MeshBasicMaterial({
    map: creatureSkin(species, variant), vertexColors: true
  });
  return {
    body: hide('body'),
    limb: hide('limb'),
    // Eyes and glowing parts carry no face shading at all, so they stay at
    // full strength in a pitch-dark cave, where they are often the first
    // thing you see coming.
    glow: new THREE.MeshBasicMaterial({ color: accent }),
    eye: new THREE.MeshBasicMaterial({ color: 0xf7f9fc }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x161a24 })
  };
}

/** A pair of eyes with pupils, added to `group` and mirrored across x. */
function addEyes(group, m, { y, z, spread, size = 0.09, glowing = false }) {
  for (const sx of [-1, 1]) {
    group.add(part(size, size, 0.04, glowing ? m.glow : m.eye, { pos: [sx * spread, y, z] }));
    if (!glowing) {
      group.add(part(size * 0.45, size * 0.45, 0.03, m.pupil, { pos: [sx * spread, y, z + 0.03] }));
    }
  }
}

/** Legs at the given footprint, each remembering its gait phase. */
function addLegs(group, m, legs, { w, h, brightness = 0.95 }) {
  const built = [];
  for (const [x, hipY, z, phase] of legs) {
    const leg = part(w, h, w, m.limb, { pos: [x, hipY, z], pivot: 'top', brightness });
    leg.userData.phase = phase;
    group.add(leg);
    built.push(leg);
  }
  return built;
}

// ---------------------------------------------------------------- animation
/**
 * The shared gait: limbs swing in opposition, the body rises and falls a
 * little with each step, and everything scales with how fast the creature is
 * actually moving, so a standing animal is still.
 */
function walker(parts, { rate = 9, swing = 0.55, bob = 0.03 } = {}) {
  return (t, speed) => {
    const gait = Math.min(1, speed / 2.2);
    for (const leg of parts.legs ?? []) {
      leg.rotation.x = Math.sin(t * rate + leg.userData.phase) * swing * gait;
    }
    if (parts.head) {
      parts.head.position.y = parts.head.userData.baseY + Math.sin(t * rate * 2) * bob * gait;
      // A slow idle glance when standing still keeps it looking alive.
      parts.head.rotation.y = gait < 0.1 ? Math.sin(t * 0.7) * 0.3 : 0;
    }
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * (2 + gait * 4)) * (0.15 + gait * 0.25);
    for (const f of parts.flames ?? []) {
      const s = 0.75 + Math.abs(Math.sin(t * 7 + f.userData.phase)) * 0.5;
      f.scale.set(1, s, 1);
    }
    for (const w of parts.wisps ?? []) {
      w.rotation.x = Math.sin(t * 3 + w.userData.phase) * 0.5;
      w.rotation.z = Math.cos(t * 2.4 + w.userData.phase) * 0.4;
    }
  };
}

/** Blobs and grubs have no legs: they pulse instead. */
function breather(parts, { rate = 4, amount = 0.09 } = {}) {
  const walk = walker(parts);
  return (t, speed) => {
    walk(t, speed);
    const s = 1 + Math.sin(t * rate) * amount;
    for (const b of parts.blobs ?? []) {
      b.scale.set(2 - s, s, 2 - s);
      b.position.y = b.userData.baseY + (s - 1) * 0.25;
    }
  };
}

// ----------------------------------------------------------------- builders
const BUILDERS = {
  /** Broad grazing animal: patched hide, ears, muzzle, swishing tail. */
  grazer(g, m) {
    g.add(part(0.78, 0.62, 1.18, m.body, { pos: [0, 0.66, 0] }));
    g.add(part(0.34, 0.3, 0.22, m.limb, { pos: [0, 0.8, 0.62], brightness: 0.92 })); // neck
    const head = part(0.42, 0.42, 0.46, m.body, { pos: [0, 0.92, 0.84], name: 'head' });
    head.userData.baseY = 0.92;
    g.add(head);
    head.add(part(0.28, 0.22, 0.18, m.limb, { pos: [0, -0.09, 0.28], brightness: 1.12 })); // muzzle
    for (const sx of [-1, 1]) {
      head.add(part(0.1, 0.2, 0.07, m.limb, { pos: [sx * 0.24, 0.16, -0.06], rot: [0, 0, sx * 0.45] }));
    }
    addEyes(g, m, { y: 0.98, z: 1.08, spread: 0.14 });
    const tail = part(0.09, 0.42, 0.09, m.limb, { pos: [0, 0.88, -0.6], pivot: 'top', name: 'tail' });
    g.add(tail);
    const legs = addLegs(g, m, [
      [-0.26, 0.5, 0.42, 0], [0.26, 0.5, 0.42, Math.PI],
      [-0.26, 0.5, -0.42, Math.PI], [0.26, 0.5, -0.42, 0]
    ], { w: 0.2, h: 0.52 });
    return walker({ legs, head, tail });
  },

  /** Heavy, low, unhurried: a humped back and short thick legs. */
  plodder(g, m) {
    g.add(part(0.92, 0.66, 1.3, m.body, { pos: [0, 0.6, 0] }));
    g.add(part(0.6, 0.28, 0.72, m.body, { pos: [0, 0.95, -0.08], brightness: 1.05 })); // hump
    const head = part(0.5, 0.44, 0.46, m.body, { pos: [0, 0.62, 0.82], name: 'head' });
    head.userData.baseY = 0.62;
    g.add(head);
    g.add(part(0.36, 0.24, 0.18, m.limb, { pos: [0, 0.53, 1.06], brightness: 1.1 }));
    addEyes(g, m, { y: 0.7, z: 1.02, spread: 0.15, size: 0.08 });
    const tail = part(0.1, 0.22, 0.1, m.limb, { pos: [0, 0.8, -0.66], pivot: 'top', name: 'tail' });
    g.add(tail);
    const legs = addLegs(g, m, [
      [-0.3, 0.42, 0.44, 0], [0.3, 0.42, 0.44, Math.PI],
      [-0.3, 0.42, -0.44, Math.PI], [0.3, 0.42, -0.44, 0]
    ], { w: 0.26, h: 0.44 });
    return walker({ legs, head, tail }, { rate: 6, swing: 0.4 });
  },

  /** Six-legged crawler. Options give each species its own build. */
  crawler(g, m, species) {
    const f = species.features ?? {};
    const bodyY = f.tall ? 0.52 : 0.44;
    g.add(part(0.6, 0.28, 0.8, m.body, { pos: [0, bodyY, 0.05] }));
    g.add(part(0.52, 0.4, 0.52, m.body, { pos: [0, bodyY + 0.1, -0.5], brightness: 1.05 })); // abdomen
    const head = part(0.34, 0.26, 0.32, m.body, { pos: [0, bodyY, 0.55], name: 'head' });
    head.userData.baseY = bodyY;
    g.add(head);
    addEyes(g, m, { y: bodyY + 0.06, z: 0.72, spread: 0.1, size: 0.07, glowing: !!f.glowEyes });
    if (f.mandibles) {
      for (const sx of [-1, 1]) {
        g.add(part(0.07, 0.07, 0.22, m.limb, { pos: [sx * 0.11, bodyY - 0.09, 0.76], rot: [0, sx * 0.3, 0] }));
      }
    }
    if (f.plates) {
      for (let i = 0; i < 3; i++) {
        g.add(part(0.5 - i * 0.1, 0.08, 0.18, m.limb, { pos: [0, bodyY + 0.18, 0.3 - i * 0.32], brightness: 1.1 }));
      }
    }
    if (f.moss) {
      for (const [x, z] of [[-0.16, 0.2], [0.18, -0.1], [0, -0.45]]) {
        g.add(part(0.18, 0.1, 0.18, m.glow, { pos: [x, bodyY + 0.2, z] }));
      }
    }
    const extras = [];
    if (f.stinger) {
      // A tail arcing up over the back, each segment rotated a little further.
      let prev = g;
      for (let i = 0; i < 3; i++) {
        const seg = part(0.14 - i * 0.02, 0.14 - i * 0.02, 0.2, m.limb, {
          pos: i === 0 ? [0, bodyY + 0.25, -0.7] : [0, 0.14, -0.16], rot: [-0.5, 0, 0], pivot: 'back'
        });
        prev.add(seg); prev = seg; extras.push(seg);
      }
      prev.add(part(0.1, 0.18, 0.1, m.glow, { pos: [0, 0.12, -0.1] })); // barb
    }
    const legs = addLegs(g, m, [
      [-0.34, bodyY + 0.06, 0.34, 0], [0.34, bodyY + 0.06, 0.34, Math.PI],
      [-0.36, bodyY + 0.06, 0, Math.PI], [0.36, bodyY + 0.06, 0, 0],
      [-0.34, bodyY + 0.06, -0.34, 0], [0.34, bodyY + 0.06, -0.34, Math.PI]
    ], { w: 0.11, h: bodyY + 0.14 });
    for (const leg of legs) leg.rotation.z = leg.position.x > 0 ? -0.42 : 0.42; // splayed outward
    return (t, speed) => {
      const gait = Math.min(1, speed / 2.2);
      for (const leg of legs) {
        leg.rotation.x = Math.sin(t * 13 + leg.userData.phase) * 0.45 * gait;
      }
      head.rotation.y = gait < 0.1 ? Math.sin(t * 1.2) * 0.25 : 0;
      for (let i = 0; i < extras.length; i++) {
        extras[i].rotation.x = -0.5 + Math.sin(t * 2 + i) * 0.12;
      }
    };
  },

  /** Lean hunter: long snout, pricked ears, brush tail, raised hackles. */
  beast(g, m) {
    g.add(part(0.54, 0.5, 1.02, m.body, { pos: [0, 0.68, 0] }));
    const head = part(0.4, 0.38, 0.4, m.body, { pos: [0, 0.86, 0.62], name: 'head' });
    head.userData.baseY = 0.86;
    g.add(head);
    head.add(part(0.24, 0.2, 0.3, m.limb, { pos: [0, -0.06, 0.3], brightness: 1.1 })); // snout
    for (const sx of [-1, 1]) {
      head.add(part(0.1, 0.18, 0.06, m.limb, { pos: [sx * 0.13, 0.24, -0.04], rot: [0, 0, sx * 0.25] }));
    }
    addEyes(g, m, { y: 0.92, z: 0.83, spread: 0.12, size: 0.08, glowing: true });
    for (let i = 0; i < 3; i++) { // hackles along the spine
      g.add(part(0.06, 0.12, 0.14, m.limb, { pos: [0, 0.97, 0.25 - i * 0.28], brightness: 1.1 }));
    }
    const tail = part(0.16, 0.5, 0.16, m.limb, { pos: [0, 0.8, -0.55], pivot: 'top', rot: [-0.5, 0, 0], name: 'tail' });
    g.add(tail);
    const legs = addLegs(g, m, [
      [-0.2, 0.56, 0.36, 0], [0.2, 0.56, 0.36, Math.PI],
      [-0.2, 0.56, -0.36, Math.PI], [0.2, 0.56, -0.36, 0]
    ], { w: 0.16, h: 0.58 });
    return walker({ legs, head, tail }, { rate: 12, swing: 0.7 });
  },

  /** Slab-shouldered stone brute: heavy jaw, plated spine, glowing ore eyes. */
  brute(g, m) {
    g.add(part(0.86, 0.66, 1.1, m.body, { pos: [0, 0.64, 0] }));
    const head = part(0.62, 0.5, 0.55, m.body, { pos: [0, 0.76, 0.72], name: 'head' });
    head.userData.baseY = 0.76;
    g.add(head);
    head.add(part(0.56, 0.2, 0.44, m.limb, { pos: [0, -0.24, 0.08], brightness: 1.1 })); // jaw
    for (const sx of [-1, 1]) { // tusks
      head.add(part(0.07, 0.16, 0.07, m.eye, { pos: [sx * 0.18, -0.16, 0.24], rot: [0.2, 0, 0] }));
    }
    addEyes(g, m, { y: 0.86, z: 0.99, spread: 0.16, size: 0.09, glowing: true });
    for (let i = 0; i < 4; i++) { // spine plates
      g.add(part(0.4 - i * 0.06, 0.16, 0.16, m.limb, { pos: [0, 1.0, 0.3 - i * 0.3], brightness: 1.15 }));
    }
    const legs = addLegs(g, m, [
      [-0.3, 0.48, 0.36, 0], [0.3, 0.48, 0.36, Math.PI],
      [-0.3, 0.48, -0.36, Math.PI], [0.3, 0.48, -0.36, 0]
    ], { w: 0.28, h: 0.5 });
    return walker({ legs, head }, { rate: 6, swing: 0.35, bob: 0.05 });
  },

  /** A drifting cave horror: a translucent shell, a dark core, hanging wisps. */
  floater(g, m) {
    const core = part(0.5, 0.5, 0.5, m.body, { pos: [0, 0.62, 0] });
    core.userData.baseY = 0.62;
    g.add(core);
    const shell = part(0.72, 0.72, 0.72, m.body, { pos: [0, 0.62, 0], brightness: 1.2 });
    shell.material = m.body.clone();
    shell.material.transparent = true;
    shell.material.opacity = 0.45;
    shell.material.depthWrite = false;
    shell.userData.baseY = 0.62;
    g.add(shell);
    for (const sx of [-1, 0, 1]) { // three eyes, the middle one higher
      g.add(part(0.1, 0.1, 0.05, m.glow, { pos: [sx * 0.16, 0.66 + (sx === 0 ? 0.12 : 0), 0.38] }));
    }
    const wisps = [];
    for (const [x, z] of [[-0.18, 0.18], [0.18, 0.18], [-0.18, -0.18], [0.18, -0.18]]) {
      const w = part(0.06, 0.42, 0.06, m.limb, { pos: [x, 0.36, z], pivot: 'top' });
      w.userData.phase = x + z * 2;
      g.add(w); wisps.push(w);
    }
    return breather({ blobs: [core, shell], wisps }, { rate: 2.6, amount: 0.07 });
  },

  /** Pale segmented grub: a chain of shrinking bodies on stubby legs. */
  grub(g, m) {
    const blobs = [];
    for (let i = 0; i < 4; i++) {
      const s = 0.46 - i * 0.06;
      const seg = part(s, s, 0.3, m.body, { pos: [0, 0.26, 0.42 - i * 0.28] });
      seg.userData.baseY = 0.26;
      g.add(seg);
      if (i === 0) blobs.push(seg);
    }
    addEyes(g, m, { y: 0.3, z: 0.58, spread: 0.09, size: 0.06 });
    const legs = addLegs(g, m, [
      [-0.2, 0.16, 0.3, 0], [0.2, 0.16, 0.3, Math.PI],
      [-0.2, 0.16, 0, Math.PI], [0.2, 0.16, 0, 0],
      [-0.2, 0.16, -0.3, 0], [0.2, 0.16, -0.3, Math.PI]
    ], { w: 0.07, h: 0.16 });
    return breather({ blobs, legs }, { rate: 3, amount: 0.08 });
  },

  /** A knot of living fire: molten crust, flame crown, stubby limbs. */
  ember(g, m) {
    const body = part(0.56, 0.56, 0.56, m.body, { pos: [0, 0.42, 0] });
    body.userData.baseY = 0.42;
    g.add(body);
    addEyes(g, m, { y: 0.48, z: 0.3, spread: 0.13, size: 0.09, glowing: true });
    const flames = [];
    for (const [x, z, h] of [[-0.16, 0, 0.24], [0.05, 0.1, 0.34], [0.16, -0.08, 0.2]]) {
      const f = part(0.14, h, 0.14, m.glow, { pos: [x, 0.7, z], pivot: 'top' });
      f.userData.phase = x * 10;
      g.add(f); flames.push(f);
    }
    const legs = addLegs(g, m, [[-0.16, 0.16, 0, 0], [0.16, 0.16, 0, Math.PI]], { w: 0.12, h: 0.18 });
    return breather({ blobs: [body], flames, legs }, { rate: 5, amount: 0.07 });
  },

  /** Upright fire-eater: horns, a glowing maw, long arms. */
  biped(g, m) {
    g.add(part(0.64, 0.86, 0.44, m.body, { pos: [0, 1.06, 0] }));
    g.add(part(0.3, 0.18, 0.06, m.glow, { pos: [0, 1.1, 0.23] })); // chest vent
    const head = part(0.5, 0.46, 0.46, m.body, { pos: [0, 1.72, 0.02], name: 'head' });
    head.userData.baseY = 1.72;
    g.add(head);
    head.add(part(0.34, 0.1, 0.05, m.glow, { pos: [0, -0.12, 0.23] })); // maw
    for (const sx of [-1, 1]) {
      head.add(part(0.08, 0.22, 0.08, m.limb, { pos: [sx * 0.19, 0.26, -0.04], rot: [0, 0, sx * 0.5] }));
    }
    addEyes(g, m, { y: 1.8, z: 0.26, spread: 0.13, size: 0.08, glowing: true });
    const arms = addLegs(g, m, [[-0.44, 1.44, 0, 0], [0.44, 1.44, 0, Math.PI]], { w: 0.18, h: 0.72 });
    const legs = addLegs(g, m, [[-0.18, 0.86, 0, Math.PI], [0.18, 0.86, 0, 0]], { w: 0.24, h: 0.88 });
    return walker({ legs: [...legs, ...arms], head }, { rate: 7, swing: 0.5, bob: 0.04 });
  },

  /** The Cinder Warden: everything above, at four times the size. */
  boss(g, m) {
    g.add(part(1.9, 1.6, 2.5, m.body, { pos: [0, 2.1, 0] }));
    const head = part(1.15, 0.95, 1.0, m.body, { pos: [0, 2.85, 1.5], name: 'head' });
    head.userData.baseY = 2.85;
    g.add(head);
    head.add(part(0.8, 0.22, 0.1, m.glow, { pos: [0, -0.3, 0.5] })); // maw
    for (const sx of [-1, 1]) { // horns
      head.add(part(0.18, 0.62, 0.18, m.limb, { pos: [sx * 0.44, 0.6, -0.1], rot: [0, 0, sx * 0.55], brightness: 1.1 }));
    }
    addEyes(g, m, { y: 3.0, z: 2.02, spread: 0.3, size: 0.18, glowing: true });
    g.add(part(0.5, 0.5, 0.12, m.glow, { pos: [0, 2.3, 1.28] })); // heart core
    const flames = [];
    for (let i = 0; i < 5; i++) { // spines down the back
      const spine = part(0.26, 0.7 - i * 0.08, 0.26, m.limb, { pos: [0, 2.9, 0.6 - i * 0.55], pivot: 'top', brightness: 1.15 });
      spine.scale.y = -1; // point upward from the spine line
      g.add(spine);
      const ember = part(0.14, 0.14, 0.14, m.glow, { pos: [0, 3.55 - i * 0.06, 0.6 - i * 0.55] });
      ember.userData.phase = i;
      g.add(ember); flames.push(ember);
    }
    const tail = part(0.4, 1.0, 0.4, m.limb, { pos: [0, 2.4, -1.3], pivot: 'top', rot: [-0.9, 0, 0], name: 'tail' });
    g.add(tail);
    const legs = addLegs(g, m, [
      [-0.75, 1.6, 0.9, 0], [0.75, 1.6, 0.9, Math.PI],
      [-0.75, 1.6, -0.9, Math.PI], [0.75, 1.6, -0.9, 0]
    ], { w: 0.52, h: 1.62 });
    return walker({ legs, head, tail, flames }, { rate: 4.5, swing: 0.35, bob: 0.07 });
  }
};

/**
 * The shapes a creature can name. Exported so the roster can be checked
 * against it without a browser: a typo here would silently fall back to the
 * grazer model, which is exactly the kind of thing nobody notices.
 */
export const MOB_SHAPES = Object.keys(BUILDERS);

export function buildMobMesh(species) {
  const group = new THREE.Group();
  const m = materials(species);
  const build = BUILDERS[species.shape] ?? BUILDERS[species.bodyType] ?? BUILDERS.grazer;
  const animate = build(group, m, species);

  // Hurt flashes are applied to the hide only: eyes and glowing parts keep
  // their own colour so a creature stays readable while it is being hit.
  const tinted = [m.body, m.limb];
  group.userData.animate = (t, speed, hurt = 0) => {
    animate(t, speed);
    for (const mat of tinted) {
      mat.color.setRGB(1, 1 - hurt * 0.75, 1 - hurt * 0.75);
    }
  };
  group.userData.materials = [...Object.values(m)];
  return group;
}

/** Releases the per-mob materials and geometries when a creature is removed. */
export function disposeMobMesh(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    // Skins are shared and cached per species, so only the materials go here.
    if (o.material.transparent) o.material.dispose();
  });
  for (const mat of group.userData.materials ?? []) mat.dispose();
}
