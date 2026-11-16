// Hearing. Gunfire and footsteps are not a ray: they are a radius and a direction. A bot that
// takes a noise remembers where it came from for a few seconds and walks over to look, which is
// what makes a silenced approach and a noisy one play differently.

/** Tell every enemy inside `radius` where the noise came from. */
export function noise(st, x, z, radius, team, kind) {
  const list = st.entities;
  const r2 = radius * radius;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e.alive || e.team === team) continue;
    const dx = e.x - x;
    const dz = e.z - z;
    if (dx * dx + dz * dz > r2) continue;
    // a nearer, louder source overrides one still being walked toward
    const keep = e.alertTimer > 0 && e.alertKind > kind;
    if (keep) continue;
    e.alertX = x;
    e.alertZ = z;
    e.alertTimer = 3.4;
    e.alertKind = kind;
  }
}
