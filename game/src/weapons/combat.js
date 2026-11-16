// Bullets, knives and the flash: how a trigger pull becomes damage. One ray against the map and
// every body, nearest hit wins, head box first so a shot that clips both counts as a head. Nothing
// here allocates: the hit record is a module singleton.
import { WEAPONS } from './defs.js';
import { emit } from '../sim/state.js';

const HIT_HEAD = 1;
const HIT_BODY = 2;
const HIT_LEG = 3;

/** The shared result of a trace. Read it immediately; the next trace overwrites it. */
const hit = {
  kind: 'none', // none | world | body
  t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0,
  entity: null, part: 0, boxIndex: -1,
};

const boxHit = { t: 0, axis: 0, sign: 1 };

/** Slab test for one axis-aligned box. Returns the entry distance, or -1 for a miss. */
function rayBox(ox, oy, oz, dx, dy, dz, x0, x1, y0, y1, z0, z1) {
  let tmin = 0;
  let tmax = 1e9;
  let axis = 0;
  let sign = 1;
  if (dx === 0) { if (ox < x0 || ox > x1) return -1; } else {
    const inv = 1 / dx;
    let t1 = (x0 - ox) * inv;
    let t2 = (x1 - ox) * inv;
    let s = 1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = -1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (dy === 0) { if (oy < y0 || oy > y1) return -1; } else {
    const inv = 1 / dy;
    let t1 = (y0 - oy) * inv;
    let t2 = (y1 - oy) * inv;
    let s = 1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = -1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (dz === 0) { if (oz < z0 || oz > z1) return -1; } else {
    const inv = 1 / dz;
    let t1 = (z0 - oz) * inv;
    let t2 = (z1 - oz) * inv;
    let s = 1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = -1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  boxHit.t = tmin;
  boxHit.axis = axis;
  boxHit.sign = sign;
  return tmin;
}

/** Where a body's eyes are. */
export function eyeOf(e, out) {
  out.x = e.x;
  out.y = e.y + e.eye;
  out.z = e.z;
  return out;
}

/**
 * The whole ray: map first, then every living enemy. Teammates are transparent, so a team-mate
 * stepping into the lane never eats a bullet aimed at someone else.
 */
export function trace(st, col, shooter, ox, oy, oz, dx, dy, dz, maxT, skipTeam) {
  hit.kind = 'none';
  hit.t = maxT;
  hit.entity = null;
  hit.part = 0;
  hit.boxIndex = -1;

  const w = col.rayBoxes(ox, oy, oz, dx, dy, dz, maxT);
  if (w) {
    hit.kind = 'world';
    hit.t = w.t;
    hit.nx = w.nx; hit.ny = w.ny; hit.nz = w.nz;
    hit.boxIndex = w.index;
  }
  const wallT = hit.kind === 'world' ? hit.t : maxT;

  const list = st.entities;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e === shooter || !e.alive) continue;
    if (skipTeam >= 0 && e.team === skipTeam) continue;
    const hTop = e.y + e.height;
    const hc = hTop - 0.14;
    const torsoTop = hTop - 0.26;
    // head
    let t = rayBox(ox, oy, oz, dx, dy, dz, e.x - 0.15, e.x + 0.15, hc - 0.16, hc + 0.16, e.z - 0.15, e.z + 0.15);
    if (t >= 0 && t < wallT && t < hit.t) {
      hit.kind = 'body'; hit.t = t; hit.entity = e; hit.part = HIT_HEAD; hit.nx = 0; hit.ny = 0; hit.nz = 0;
    }
    // torso
    t = rayBox(ox, oy, oz, dx, dy, dz, e.x - 0.24, e.x + 0.24, e.y + 0.42, torsoTop, e.z - 0.24, e.z + 0.24);
    if (t >= 0 && t < wallT && t < hit.t) {
      hit.kind = 'body'; hit.t = t; hit.entity = e; hit.part = HIT_BODY; hit.nx = 0; hit.ny = 0; hit.nz = 0;
    }
    // legs
    t = rayBox(ox, oy, oz, dx, dy, dz, e.x - 0.20, e.x + 0.20, e.y + 0.02, e.y + 0.42, e.z - 0.20, e.z + 0.20);
    if (t >= 0 && t < wallT && t < hit.t) {
      hit.kind = 'body'; hit.t = t; hit.entity = e; hit.part = HIT_LEG; hit.nx = 0; hit.ny = 0; hit.nz = 0;
    }
  }
  if (hit.kind !== 'none') {
    hit.x = ox + dx * hit.t;
    hit.y = oy + dy * hit.t;
    hit.z = oz + dz * hit.t;
  }
  return hit;
}

/** The cone a body's shots actually leave the barrel in, in radians. */
export function spreadOf(e, w) {
  let s = w.spreadStill * (e.crouching ? w.spreadCrouch : 1);
  const move = e.speed / 5.2;
  s += (move > 1 ? 1 : move) * w.spreadMove;
  if (!e.onGround) s += w.spreadAir;
  s += e.shotSpread;
  return s;
}

/** Apply damage, armour and the kill. Head shots are not softened by armour; body shots are. */
export function damage(st, attacker, victim, amount, part) {
  if (!victim.alive) return false;
  let dealt = amount;
  if (victim.armour > 0 && part !== HIT_HEAD) {
    dealt = amount * 0.75;
    victim.armour = Math.max(0, victim.armour - amount * 0.5);
    if (victim.armour === 0) victim.armour = 0;
  }
  victim.health -= dealt;
  if (victim.isPlayer) st.hitFlash = Math.min(1, st.hitFlash + 0.55);
  else if (attacker && attacker.team !== victim.team) {
    // being shot from somewhere you are not looking is the loudest noise there is
    victim.alertX = attacker.x;
    victim.alertZ = attacker.z;
    victim.alertTimer = 3.2;
    victim.alertKind = 3;
  }
  emit(st, 'hit', victim.x, victim.y + victim.height * 0.6, victim.z, attacker ? attacker.id : -1, victim.id, part === HIT_HEAD ? 1 : 0, dealt);
  if (victim.health > 0) return false;

  victim.health = 0;
  victim.alive = false;
  victim.deathAt = st.time;
  victim.deaths += 1;
  victim.hasBomb = false;
  victim.trigger = false;
  victim.reloading = false;
  victim.reloadTimer = 0;
  if (attacker && attacker !== victim) {
    attacker.kills += 1;
    attacker.roundKills += 1;
  }
  emit(st, 'kill', victim.x, victim.y + victim.height * 0.6, victim.z, attacker ? attacker.id : -1, victim.id, part === HIT_HEAD ? 1 : 0, attacker ? attacker.weapon : 0);
  return true;
}

function applyRecoil(e, w) {
  const pattern = w.recoil;
  if (!pattern) return;
  const shot = pattern[e.recoilIndex < pattern.length ? e.recoilIndex : pattern.length - 1];
  e.recoilPitch += shot[0];
  e.recoilYaw += shot[1] * (e.recoilIndex % 2 === 0 ? 1 : -1);
  e.recoilIndex = Math.min(e.recoilIndex + 1, 40);
  e.recoilHold = 0.22;
}

const eye = { x: 0, y: 0, z: 0 };
const dir = { x: 0, y: 0, z: 0 };

/**
 * Fire one round (or throw, or swing). Returns true when the trigger pull did something, so the
 * view model knows whether to kick.
 */
export function fire(st, col, e, spreadMul = 1) {
  const w = WEAPONS[e.weapon];
  const slot = e.inv[e.weapon];
  if (e.shotTimer > 0 || e.reloading || e.switching > 0) return false;
  if (w.kind === 'gun' && slot.mag <= 0) {
    emit(st, 'dry', e.x, e.y + e.eye, e.z, e.id, 0, 0, 0);
    e.shotTimer = 0.25;
    return false;
  }
  if (w.kind === 'throw' && slot.mag <= 0) return false;

  e.shotTimer = w.rate;
  eyeOf(e, eye);
  const yaw = e.yaw + e.recoilYaw;
  const pitch = e.pitch + e.recoilPitch;

  if (w.kind === 'melee') {
    const cy = Math.cos(pitch);
    dir.x = -Math.sin(yaw) * cy;
    dir.y = Math.sin(pitch);
    dir.z = -Math.cos(yaw) * cy;
    const h = trace(st, col, e, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, w.range, e.team);
    emit(st, 'swing', eye.x, eye.y, eye.z, e.id, 0, 0, 0);
    if (h.kind === 'body') {
      const v = h.entity;
      const facing = Math.cos(v.yaw) * Math.cos(e.yaw) + Math.sin(v.yaw) * Math.sin(e.yaw);
      const back = facing > 0.35;
      damage(st, e, v, w.damage * (back ? w.backMul : 1), h.part);
      emit(st, 'knifehit', h.x, h.y, h.z, back ? 1 : 0, v.id, 0, 0);
    }
    return true;
  }

  if (w.kind === 'throw') {
    slot.mag -= 1;
    const cy = Math.cos(pitch);
    const sp = 15;
    st.projectiles.push({
      x: eye.x + dir.x * 0.3, y: eye.y, z: eye.z + dir.z * 0.3,
      vx: -Math.sin(yaw) * cy * sp, vy: Math.sin(pitch) * sp + 3.2, vz: -Math.cos(yaw) * cy * sp,
      fuse: w.fuse, owner: e.id, team: e.team, alive: true, spin: 0,
    });
    emit(st, 'throw', eye.x, eye.y, eye.z, e.id, 0, 0, 0);
    return true;
  }

  slot.mag -= 1;
  st.stats.shots += 1;
  const spread = spreadOf(e, w) * spreadMul;
  const angle = st.rng() * Math.PI * 2;
  const radius = Math.sqrt(st.rng()) * spread;
  const finalYaw = yaw + (Math.cos(angle) * radius) / Math.max(0.2, Math.cos(pitch));
  const finalPitch = pitch + Math.sin(angle) * radius;
  const cy = Math.cos(finalPitch);
  dir.x = -Math.sin(finalYaw) * cy;
  dir.y = Math.sin(finalPitch);
  dir.z = -Math.cos(finalYaw) * cy;

  const h = trace(st, col, e, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, w.range, e.team);
  emit(st, 'shot', eye.x, eye.y, eye.z, e.id, e.weapon, h.kind === 'world' ? 1 : 0, 0);
  emit(st, 'trace', eye.x, eye.y, eye.z, h.kind === 'none' ? eye.x + dir.x * w.range : h.x, h.kind === 'none' ? eye.y + dir.y * w.range : h.y, h.kind === 'none' ? eye.z + dir.z * w.range : h.z, e.team);

  if (h.kind === 'body') {
    const v = h.entity;
    const mul = h.part === HIT_HEAD ? w.headMul : h.part === HIT_LEG ? w.legMul : 1;
    st.stats.hits += 1;
    if (h.part === HIT_HEAD) st.stats.headshots += 1;
    damage(st, e, v, w.damage * mul, h.part);
    emit(st, 'impact', h.x, h.y, h.z, 0, 0, 0, 2);
  } else if (h.kind === 'world') {
    emit(st, 'impact', h.x, h.y, h.z, h.nx, h.ny, h.nz, 1);
  }

  applyRecoil(e, w);
  e.shotSpread = Math.min(0.05, e.shotSpread + w.spreadPerShot);
  e.recoilHold = 0.22;
  return true;
}

/** Per-body weapon housekeeping: timers, spread recovery, recoil recovery, reload finish. */
export function updateWeapon(st, e, dt) {
  const w = WEAPONS[e.weapon];
  if (e.shotTimer > 0) e.shotTimer = Math.max(0, e.shotTimer - dt);
  if (e.switching > 0) e.switching = Math.max(0, e.switching - dt);

  if (e.reloading) {
    e.reloadTimer -= dt;
    if (e.reloadTimer <= 0) {
      const slot = e.inv[e.weapon];
      const need = w.mag - slot.mag;
      const take = need < slot.reserve ? need : slot.reserve;
      slot.mag += take;
      slot.reserve -= take;
      e.reloading = false;
      e.reloadTimer = 0;
    }
  }

  e.shotSpread = Math.max(0, e.shotSpread - w.spreadRecover * dt * (e.crouching ? 1.4 : 1));
  if (e.recoilHold > 0) e.recoilHold -= dt;
  else {
    const k = Math.min(1, dt * w.recoilRecover);
    e.recoilPitch -= e.recoilPitch * k;
    e.recoilYaw -= e.recoilYaw * k;
    if (Math.abs(e.recoilPitch) < 0.0004) {
      e.recoilPitch = 0;
      e.recoilYaw = 0;
      e.recoilIndex = 0;
    }
  }
  e.flash = Math.max(0, e.flash - dt * 0.55);
}

export function startReload(e) {
  const w = WEAPONS[e.weapon];
  const slot = e.inv[e.weapon];
  if (w.kind !== 'gun' || e.reloading || slot.mag >= w.mag || slot.reserve <= 0) return false;
  e.reloading = true;
  e.reloadTimer = w.reload;
  return true;
}

/** Switch to a slot the body actually owns. */
export function switchTo(st, e, slot) {
  if (slot === e.weapon) return false;
  if (!e.inv[slot] || !e.inv[slot].owned) return false;
  e.weapon = slot;
  e.reloading = false;
  e.reloadTimer = 0;
  e.switching = 0.22;
  e.shotTimer = Math.max(e.shotTimer, 0.22);
  return true;
}

/** A flash leaving a body's hand: everyone facing it with a clear line loses their sight. */
export function resolveFlash(st, col, x, y, z, team) {
  const list = st.entities;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e.alive) continue;
    const ex = e.x;
    const ey = e.y + e.eye;
    const ez = e.z;
    let dx = x - ex;
    let dy = y - ey;
    let dz = z - ez;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 13) continue;
    if (!col.clear(ex, ey, ez, x, y, z)) continue;
    dx /= dist || 1; dy /= dist || 1; dz /= dist || 1;
    const cy = Math.cos(e.pitch);
    const fx = -Math.sin(e.yaw) * cy;
    const fy = Math.sin(e.pitch);
    const fz = -Math.cos(e.yaw) * cy;
    const facing = dx * fx + dy * fy + dz * fz; // 1 = staring at it, -1 = back turned
    const near = 1 - dist / 13;
    let amount = (facing + 0.35) / 1.35;
    if (amount <= 0) continue;
    amount = amount * amount * (0.55 + near * 0.75);
    if (e.team === team) amount *= 0.75; // your own team's flash still stings, a little
    e.flash = Math.min(1.15, e.flash + amount);
    if (e.isPlayer) emit(st, 'blinded', e.x, e.y + e.eye, e.z, amount, 0, 0, 0);
  }
  emit(st, 'flash', x, y, z, 0, 0, 0, 0);
}
