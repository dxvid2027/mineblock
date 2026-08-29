import * as THREE from 'three';

const PARTICLE_COUNT = 700;
const VOLUME = 40; // particles fill a cube of this size centered on the player
const CHECK_INTERVAL = 25; // seconds between weather re-rolls

/**
 * Dynamic weather: periodically re-rolls clear/rain/snow based on the
 * player's current biome, and renders a simple falling-particle effect for
 * whichever is active. Purely visual — it does not (yet) affect gameplay
 * beyond ambience, but biome-appropriate weather is itself a requirement.
 */
export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.current = 'clear';
    this._timer = 0;
    this._targetIntensity = 0;
    this.intensity = 0;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * VOLUME;
      positions[i * 3 + 1] = Math.random() * VOLUME;
      positions[i * 3 + 2] = (Math.random() - 0.5) * VOLUME;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._rainMat = new THREE.PointsMaterial({ color: 0x9fc0e0, size: 0.12, transparent: true, opacity: 0 });
    this._snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0 });
    this.rainPoints = new THREE.Points(geo, this._rainMat);
    this.snowPoints = new THREE.Points(geo.clone(), this._snowMat);
    this.rainPoints.frustumCulled = false;
    this.snowPoints.frustumCulled = false;
    scene.add(this.rainPoints, this.snowPoints);
  }

  update(dt, player, world) {
    if (!world.dimension.hasWeather) {
      this.current = 'clear';
      this._setVisible(0, 0);
      return;
    }

    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = CHECK_INTERVAL;
      const biome = world.getBiomeAt(Math.floor(player.position.x), Math.floor(player.position.z));
      const options = biome.weather ?? ['clear'];
      const roll = Math.random();
      this.current = roll < 0.55 ? 'clear' : options[Math.floor(Math.random() * options.length)];
    }

    const rainAmt = this.current === 'rain' ? 1 : 0;
    const snowAmt = this.current === 'snow' ? 1 : 0;
    this._setVisible(rainAmt, snowAmt);

    const pos = player.position;
    this.rainPoints.position.set(pos.x, pos.y + VOLUME / 3, pos.z);
    this.snowPoints.position.set(pos.x, pos.y + VOLUME / 3, pos.z);

    if (rainAmt) this._fall(this.rainPoints.geometry, dt, 18);
    if (snowAmt) this._fall(this.snowPoints.geometry, dt, 2.5);
  }

  _fall(geo, dt, speed) {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 1] -= speed * dt;
      if (arr[i * 3 + 1] < -VOLUME / 2) arr[i * 3 + 1] = VOLUME / 2;
    }
    geo.attributes.position.needsUpdate = true;
  }

  _setVisible(rain, snow) {
    this._rainMat.opacity = THREE.MathUtils.lerp(this._rainMat.opacity, rain * 0.55, 0.05);
    this._snowMat.opacity = THREE.MathUtils.lerp(this._snowMat.opacity, snow * 0.8, 0.05);
    this.rainPoints.visible = this._rainMat.opacity > 0.01;
    this.snowPoints.visible = this._snowMat.opacity > 0.01;
  }

  isPrecipitating() {
    return this.current === 'rain' || this.current === 'snow';
  }

  dispose() {
    this.scene.remove(this.rainPoints, this.snowPoints);
    this.rainPoints.geometry.dispose();
    this.snowPoints.geometry.dispose();
    this._rainMat.dispose();
    this._snowMat.dispose();
  }
}
