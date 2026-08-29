import * as THREE from 'three';

const DAY_LENGTH_SECONDS = 720; // one full day/night cycle = 12 real minutes

function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1));
}

/**
 * Drives the sun/moon, sky color and ambient brightness from a single
 * `time` value in [0,1). Also exposes `dayFactor` (0..1 brightness curve)
 * consumed by World for baked chunk lighting so caves/interiors correctly
 * darken at night unless lit by torches.
 */
export class DayNightCycle {
  constructor(scene) {
    this.time = 0.28; // start mid-morning
    this.day = 1;
    this.dayFactor = 1;
    this.paused = false;

    this.sunLight = new THREE.DirectionalLight(0xfff2d9, 1.1);
    this.sunLight.position.set(50, 80, 30);
    this.ambient = new THREE.AmbientLight(0x6a7a9a, 0.6);
    scene.add(this.sunLight, this.sunLight.target, this.ambient);

    this.sky = { top: new THREE.Color(0x4a90d9), bottom: new THREE.Color(0xbfe3f2) };
  }

  setTime(t) { this.time = ((t % 1) + 1) % 1; }

  update(dt, dimension) {
    if (!this.paused) {
      this.time += dt / DAY_LENGTH_SECONDS;
      if (this.time >= 1) { this.time -= 1; this.day++; }
    }

    if (!dimension.hasSkylight) {
      // Perpetual dim twilight in dimensions without a sky (e.g. Ember Expanse).
      this.dayFactor = 0.6;
      this.sunLight.intensity = 0.35;
      this.ambient.intensity = 0.85;
      this.ambient.color.set(dimension.ambientNight);
      this.sky.top.set(dimension.skyTop);
      this.sky.bottom.set(dimension.skyBottom);
      return;
    }

    const angle = this.time * Math.PI * 2 - Math.PI / 2;
    const height = Math.sin(angle);
    this.sunLight.position.set(Math.cos(angle) * 100, Math.max(height, -0.1) * 100 + 20, 40);
    this.sunLight.target.position.set(0, 0, 0);

    // Brightness curve: still visibly brighter by day, but the floor is kept
    // high (requested: caves/underground/night should always stay easy to
    // see) rather than dropping toward black at night.
    this.dayFactor = THREE.MathUtils.clamp(height * 1.4 + 0.15, 0.6, 1);
    this.sunLight.intensity = THREE.MathUtils.clamp(height * 1.3, 0.2, 1.2);
    this.ambient.intensity = THREE.MathUtils.lerp(0.6, 0.9, this.dayFactor);

    const isNight = height < -0.15;
    const isDawnDusk = height >= -0.15 && height < 0.2;
    let top, bottom;
    if (isNight) {
      top = new THREE.Color(0x050912); bottom = new THREE.Color(0x141c30);
      this.ambient.color.set(0x333a55);
    } else if (isDawnDusk) {
      const t = (height + 0.15) / 0.35;
      top = lerpColor(0x1a2440, dimension.skyTop, t);
      bottom = lerpColor(0xe8926a, dimension.skyBottom, t);
      this.ambient.color.set(0x8a7a8f);
    } else {
      top = new THREE.Color(dimension.skyTop); bottom = new THREE.Color(dimension.skyBottom);
      this.ambient.color.set(0x6a7a9a);
    }
    this.sky.top.copy(top);
    this.sky.bottom.copy(bottom);
  }

  /** 'day' | 'night' | 'dawn' | 'dusk' — used by HUD clock + mob spawn rules. */
  phase() {
    if (this.time < 0.22 || this.time > 0.95) return 'night';
    if (this.time < 0.28) return 'dawn';
    if (this.time < 0.75) return 'day';
    if (this.time < 0.85) return 'dusk';
    return 'night';
  }

  formattedClock() {
    const totalMinutes = Math.floor(this.time * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  serialize() { return { time: this.time, day: this.day }; }
  deserialize(data) { if (data) { this.time = data.time ?? this.time; this.day = data.day ?? this.day; } }
}
