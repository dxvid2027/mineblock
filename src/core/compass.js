// One definition of which way is which, shared by the debug overlay and the
// HUD's objective tag so they can never disagree.
//
// yaw = 0 faces -Z ("North" by this game's convention); increasing yaw
// rotates toward -X ("West") — see PlayerController's move-vector math.
const CARDINALS = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'];

export function cardinalFromYaw(yaw) {
  const norm = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return CARDINALS[Math.round(norm / (Math.PI / 4)) % 8];
}

/** The compass direction of (dx, dz) as seen from where the player stands. */
export function cardinalTowards(dx, dz) {
  return cardinalFromYaw(Math.atan2(-dx, -dz));
}
