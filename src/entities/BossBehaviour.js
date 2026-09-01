import { globalEvents } from '../core/EventBus.js';

// Multi-phase boss behaviour, kept out of Mob so ordinary creatures stay a
// four-state machine. A species opts in by declaring `phases` (see
// CreatureTypes.eternal_titan); everything below reads those numbers and
// nothing else, so the fight can be retuned without touching this file.
//
// Each phase can change the boss's speed, damage and swing rate, and can add:
//
//   shockwave — a ring of force centred on the boss, on a timer. Everything
//     within `radius` on the ground takes `damage`. Standing still next to
//     the boss is the mistake it punishes; the answer is to be outside the
//     ring, or in the air when it lands, which is what makes the fight about
//     movement rather than trading blows.
//   summon — adds, on a timer, capped so a long fight cannot bury the arena.
//
// Between phases the boss is briefly untouchable and roars. That pause is
// deliberate: it is the only moment in the fight to drink something, and it
// tells the player the rules just changed.

const PHASE_TRANSITION_TIME = 2.2;
const MAX_SUMMONS_ALIVE = 6;
/** How high off the ground counts as "in the air" when a shockwave lands. */
const SHOCKWAVE_CLEARANCE = 1.4;

export class BossBehaviour {
  constructor(mob) {
    this.mob = mob;
    this.phases = mob.species.phases ?? [];
    this.index = -1;
    this.transitionTimer = 0;
    this.shockTimer = 0;
    this.summonTimer = 0;
    this.summoned = [];
  }

  get phase() { return this.phases[Math.max(0, this.index)] ?? null; }
  get transitioning() { return this.transitionTimer > 0; }

  /** The phase a given health fraction belongs to — the last one it is under. */
  _phaseIndexFor(fraction) {
    let found = 0;
    for (let i = 0; i < this.phases.length; i++) {
      if (fraction <= this.phases[i].from) found = i;
    }
    return found;
  }

  /**
   * Advances the fight. Returns true while the boss is mid-transition, which
   * is the caller's cue to hold it still and leave it alone.
   */
  update(dt, entities, player) {
    if (!this.phases.length) return false;
    const fraction = this.mob.health / this.mob.maxHealth;
    const wanted = this._phaseIndexFor(fraction);

    if (wanted !== this.index) {
      this.index = wanted;
      this.transitionTimer = PHASE_TRANSITION_TIME;
      this.shockTimer = 0;
      this.summonTimer = 0;
      const phase = this.phases[wanted];
      globalEvents.emit('boss:phase', { name: phase.name, index: wanted, total: this.phases.length });
      if (phase.announce) globalEvents.emit('ui:toast', phase.announce);
    }

    if (this.transitionTimer > 0) {
      this.transitionTimer -= dt;
      // Untouchable while it changes gear, and it does not chase either.
      this.mob.invulnerableTimer = Math.max(this.mob.invulnerableTimer, 0.2);
      this.mob.velocity.x = 0;
      this.mob.velocity.z = 0;
      return true;
    }

    const phase = this.phase;
    if (!phase) return false;

    if (phase.shockwave) {
      this.shockTimer += dt;
      if (this.shockTimer >= phase.shockwave.every) {
        this.shockTimer = 0;
        this._shockwave(phase.shockwave, player);
      }
    }
    if (phase.summon) {
      this.summonTimer += dt;
      if (this.summonTimer >= phase.summon.every) {
        this.summonTimer = 0;
        this._summon(phase.summon, entities);
      }
    }
    return false;
  }

  _shockwave({ radius, damage }, player) {
    globalEvents.emit('boss:shockwave', {
      x: this.mob.position.x, y: this.mob.position.y, z: this.mob.position.z, radius
    });
    if (!player?.alive) return;
    const dx = player.position.x - this.mob.position.x;
    const dz = player.position.z - this.mob.position.z;
    if (Math.hypot(dx, dz) > radius) return; // outside the ring

    // A jump clears it. The boss telegraphs by roaring first (the toast
    // above), so this is a reaction the player can actually make.
    const clearance = player.position.y - this.mob.position.y;
    if (!player.onGround && clearance > SHOCKWAVE_CLEARANCE) {
      globalEvents.emit('ui:toast', 'You clear the shockwave.');
      return;
    }
    // Ignores the invulnerability window on purpose: a shockwave you can eat
    // for free because a Shardling just clipped you is not a mechanic.
    player.damage(damage, { ignoreInvuln: true });
    // And it throws you, which is half of what makes the arena matter.
    const push = Math.hypot(dx, dz) || 1;
    player.velocity.x += (dx / push) * 9;
    player.velocity.z += (dz / push) * 9;
    player.velocity.y += 5;
  }

  _summon({ species, count }, entities) {
    this.summoned = this.summoned.filter((m) => m.alive && entities.mobs.includes(m));
    if (this.summoned.length >= MAX_SUMMONS_ALIVE) return;

    let spawned = 0;
    for (let i = 0; i < count && this.summoned.length < MAX_SUMMONS_ALIVE; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 4 + Math.random() * 3;
      const x = this.mob.position.x + Math.cos(angle) * distance;
      const z = this.mob.position.z + Math.sin(angle) * distance;
      const mob = entities.spawnMob(species, { x, y: this.mob.position.y + 1, z });
      if (mob) { this.summoned.push(mob); spawned++; }
    }
    if (spawned > 0) globalEvents.emit('ui:toast', 'The Titan calls something up out of the floor.');
  }

  /** Cleared when the boss falls, so its escort does not outlive it forever. */
  dismiss() {
    for (const mob of this.summoned) if (mob.alive) mob.damage(9999);
    this.summoned = [];
  }
}
