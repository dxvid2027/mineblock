import * as THREE from 'three';

// A large inverted sphere shaded with a simple vertical two-color gradient
// (top/bottom uniforms updated every frame from DayNightCycle) — a cheap,
// original stand-in for a full atmospheric sky that still sells time-of-day
// changes and per-dimension palettes.
const VERT = `
varying vec3 vWorldPos;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const FRAG = `
uniform vec3 topColor;
uniform vec3 bottomColor;
varying vec3 vWorldPos;
void main() {
  float h = normalize(vWorldPos).y * 0.5 + 0.5;
  gl_FragColor = vec4(mix(bottomColor, topColor, clamp(h, 0.0, 1.0)), 1.0);
}`;

export class SkyDome {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(400, 16, 12);
    this.material = new THREE.ShaderMaterial({
      uniforms: { topColor: { value: new THREE.Color(0x4a90d9) }, bottomColor: { value: new THREE.Color(0xbfe3f2) } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  update(camera, dayNight) {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.topColor.value.copy(dayNight.sky.top);
    this.material.uniforms.bottomColor.value.copy(dayNight.sky.bottom);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
