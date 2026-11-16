// The bot brain: a lane, an angle, and what the eyes and ears put in front of it. Accuracy depends
// on range and on whether its own feet are moving; it re-decides every few seconds, so a fight
// pulls it off its route the way it would pull a person.
import { NODES, HOLDS, MAP } from '../world/map.js';
import { WEAPONS } from '../weapons/defs.js';
import { fire, startReload, switchTo, spreadOf, eyeOf } from '../weapons/combat.js';
import { drive } from '../sim/movement.js';
import { TEAM_ATK, TEAM_DEF, PHASE_LIVE, emit } from '../sim/state.js';

const MODE_ROUTE = 0;
const MODE_INVESTIGATE = 1;
const MODE_ENGAGE = 2;
const MODE_RETREAT = 3;

const FOV_COS = 0.42; // about 130 degrees of vision, with a close-range bubble behind it
const SIGHT_RANGE = 62;
const TURN_RATE = 8.2;

const tmp = { x: 0, y: 0, z: 0 };

/** The graph node closest to a point: the entry and exit a bot uses for a marker it can see. */
function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const dx = NODES[i].x - x;
    const dz = NODES[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}


function angleDiff(to, from) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Give a bot a lane and a first order. Called once, when a round starts. */
export function assignRoute(st, nav, e, lane) {
  const team = e.team === TEAM_ATK ? 'atk' : 'def';
  const ids = nav.routeIds(team, lane);
  e.route = lane;
  e.path = ids.map((id) => nav.index.get(id));
  e.pathStep = 0;
  e.mode = MODE_ROUTE;
  e.goalX = 0;
  e.goalZ = 0;
  e.repath = 0;
  e.aimHead = st.rng() < 0.45;
  const holds = HOLDS[team];
  e.holdIndex = Math.floor(st.rng() * holds.length);
  e.holdYaw = 0;
  if (e.team === TEAM_DEF) {
    // a defender starts alive on the site side, so it opens on the angle it was posted to
    const h = holds[e.holdIndex];
    e.lookX = h.lookX;
    e.lookZ = h.lookZ;
  }
}

/** Reset a bot for a fresh round and hand it a lane. */
export function prepareBot(st, nav, e, lane) {
  assignRoute(st, nav, e, lane);
  e.holdX = NODES[e.path[e.path.length - 1]].x;
  e.holdZ = NODES[e.path[e.path.length - 1]].z;
  e.targetId = -1;
  e.targetSeen = -99;
  e.reaction = 0.15 + st.rng() * 0.3;
  e.settle = 0;
  e.aimErrYaw = 0;
  e.aimErrPitch = 0;
  e.burstLeft = 0;
  e.burstCooldown = 0;
  e.strafeSign = st.rng() < 0.5 ? -1 : 1;
  e.strafeTimer = 0.6 + st.rng();
  e.lastHealth = 100;
}

/** The whole team's brain, one tick. */
export function updateBots(st, col, nav, dt) {
  const list = st.entities;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e.alive || e.isPlayer) continue;
    if (st.phase !== PHASE_LIVE) {
      // Between rounds a bot stands easy: it still turns its head, it does not walk or shoot.
      drive(st, col, e, 0, 0, dt, false, 5.0);
      aim(st, e, dt);
      e.trigger = false;
      continue;
    }
    e.think -= dt;
    if (e.think <= 0) {
      e.think = 0.11 + (i % 3) * 0.012;
      perceive(st, col, e);
      decide(st, col, nav, e);
    }
    steer(st, col, nav, e, dt);
    aim(st, e, dt);
    shoot(st, col, e, dt);
  }
}

/**
 * Sight: field of view, then a line to the chest and to the head. A target behind a crate can
 * still be seen by its head, which is exactly what makes crouching behind cover matter.
 */
function perceive(st, col, e) {
  const cy = Math.cos(e.pitch);
  const fx = -Math.sin(e.yaw) * cy;
  const fy = Math.sin(e.pitch);
  const fz = -Math.cos(e.yaw) * cy;
  const eyeY = e.y + e.eye;
  let best = -1;
  let bestScore = -1e9;
  const list = st.entities;
  for (let i = 0; i < list.length; i += 1) {
    const o = list[i];
    if (o === e || !o.alive || o.team === e.team) continue;
    const dx = o.x - e.x;
    const dz = o.z - e.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > SIGHT_RANGE) continue;
    const chestY = o.y + o.height * 0.62;
    const headY = o.y + o.height - 0.16;
    let dy = chestY - eyeY;
    let dot = (dx * fx + dy * fy + dz * fz) / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
    if (dot < FOV_COS && dist > 3.2) continue;
    if (!col.clear(e.x, eyeY, e.z, o.x, chestY, o.z) && !col.clear(e.x, eyeY, e.z, o.x, headY, o.z)) continue;
    const score = 200 - dist * 2 + (o === st.player ? 12 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best >= 0) {
    if (e.targetId !== best) {
      e.targetId = best;
      e.reaction = 0.17 + st.rng() * 0.24;
      e.settle = 0;
      rollAimError(st, e, best);
    }
    e.targetSeen = st.time;
    const t = list[best];
    e.alertX = t.x;
    e.alertZ = t.z;
    e.alertTimer = Math.max(e.alertTimer, 1.6);
    e.alertKind = 3;
    e.settle = Math.min(1.6, e.settle + 0.11);
  } else if (e.targetId >= 0 && st.time - e.targetSeen > 0.4) {
    e.targetId = -1;
    e.settle = 0;
  }
}

/** Aim error, in radians, re-rolled as the bot tracks: worse at range, worse on the move. */
function rollAimError(st, e, id) {
  const t = st.entities[id];
  const dx = t.x - e.x;
  const dz = t.z - e.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const move = e.speed > 1.2 ? 0.012 : 0;
  const reactive = Math.max(0.45, 1 - e.settle * 0.45);
  const base = (0.009 + dist * 0.0012 + move) * reactive;
  const angle = st.rng() * Math.PI * 2;
  const radius = (0.35 + st.rng() * 0.65) * base;
  e.aimErrYaw = Math.cos(angle) * radius;
  e.aimErrPitch = Math.sin(angle) * radius * 0.8;
}

/** Pick a mode. Sight beats sound, sound beats the lane, and bleeding beats everything. */
function decide(st, col, nav, e) {
  const t = e.targetId >= 0 ? st.entities[e.targetId] : null;
  const hurt = e.lastHealth - e.health;
  e.lastHealth = e.health;

  if (t && t.alive && e.health < 38 && hurt > 0 && st.rng() < 0.55) {
    e.mode = MODE_RETREAT;
    return;
  }
  if (t && t.alive && st.time - e.targetSeen < 0.5) {
    e.mode = MODE_ENGAGE;
    return;
  }
  if (e.alertTimer > 0.6 && e.alertKind >= 2) {
    e.mode = MODE_INVESTIGATE;
    return;
  }
  e.mode = MODE_ROUTE;
}

/** Turn the wish direction into velocity through the same body solver the player uses. */
function steer(st, col, nav, e, dt) {
  let wishX = 0;
  let wishZ = 0;
  let crouch = false;
  bombDuty(st, nav, e);
  const t = e.targetId >= 0 ? st.entities[e.targetId] : null;

  if (e.mode === MODE_ENGAGE && t && t.alive) {
    const dx = t.x - e.x;
    const dz = t.z - e.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) {
      e.strafeSign = -e.strafeSign;
      e.strafeTimer = 0.55 + st.rng() * 0.85;
      rollAimError(st, e, e.targetId);
    }
    if (dist > 15) {
      wishX = nx; wishZ = nz; // close the distance, staying in the lane
    } else if (dist < 4.2) {
      wishX = -nx * 0.9; wishZ = -nz * 0.9; // too close to aim: give ground
    } else {
      wishX = -nz * e.strafeSign * 0.8 + nx * 0.22;
      wishZ = nx * e.strafeSign * 0.8 + nz * 0.22;
      crouch = dist > 12 && e.strafeTimer > 0.7;
    }
  } else if (e.mode === MODE_RETREAT) {
    const away = e.targetId >= 0 ? st.entities[e.targetId] : null;
    if (away) {
      const dx = e.x - away.x;
      const dz = e.z - away.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      wishX = dx / d; wishZ = dz / d;
    }
    crouch = true;
  } else if (e.mode === MODE_INVESTIGATE) {
    const dx = e.alertX - e.x;
    const dz = e.alertZ - e.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1.6) { wishX = dx / d; wishZ = dz / d; }
    e.alertTimer -= dt;
  } else {
    e.alertTimer = Math.max(0, e.alertTimer - dt);
    followLane(st, nav, e);
    wishX = e.wishX;
    wishZ = e.wishZ;
    crouch = e.holdCrouch;
    if (e.bombSeek) {
      const bx = st.bomb.x - e.x;
      const bz = st.bomb.z - e.z;
      const bd = Math.sqrt(bx * bx + bz * bz) || 1;
      // stand on it once close: planting and defusing both need the body to stop moving
      wishX = bd > 1.0 ? bx / bd : 0;
      wishZ = bd > 1.0 ? bz / bd : 0;
      crouch = false;
    }
  }

  drive(st, col, e, wishX, wishZ, dt, crouch, 5.0);
}

/**
 * The bomb outranks the route: a carrier walks to the plant spot, a dropped charge pulls every
 * attacker onto it, and an armed one pulls every defender. Re-paths only when the goal changes.
 */
function bombDuty(st, nav, e) {
  e.bombSeek = false;
  const b = st.bomb;
  let goal;
  if (e.team === TEAM_ATK) {
    if (e.hasBomb) goal = nav.index.get('s1');
    else if (b.state === 'dropped') goal = nearestNode(b.x, b.z);
  } else if (b.state === 'planted') {
    goal = nearestNode(b.x, b.z);
  }
  if (goal === undefined) return;
  // close enough to see it: walk straight at it rather than at the node beside it
  e.bombSeek = Math.abs(b.x - e.x) < 12 && Math.abs(b.z - e.z) < 12 && b.state !== 'carried';
  if (goal === e.bombGoal) return;
  e.bombGoal = goal;
  const path = nav.find(nearestNode(e.x, e.z), goal);
  if (path.length > 1) {
    e.path = path;
    e.pathStep = 0;
  }
}

/** Walk the assigned lane, then settle onto the hold point that belongs to this bot. */
function followLane(st, nav, e) {
  e.wishX = 0;
  e.wishZ = 0;
  e.holdCrouch = false;
  if (!e.path || e.path.length === 0) return;
  let node = NODES[e.path[e.pathStep]];
  let dx = node.x - e.x;
  let dz = node.z - e.z;
  let d = Math.sqrt(dx * dx + dz * dz);
  while (d < 0.85 && e.pathStep < e.path.length - 1) {
    e.pathStep += 1;
    node = NODES[e.path[e.pathStep]];
    dx = node.x - e.x;
    dz = node.z - e.z;
    d = Math.sqrt(dx * dx + dz * dz);
  }
  if (e.pathStep >= e.path.length - 1 && d < 1.4) {
    if (e.hasBomb) {
      // the carrier's job is the plant spot, not an angle: stand on it and get to work
      e.holdYaw = Math.atan2(-(MAP.site.x - e.x), -(MAP.site.z - e.z));
      return;
    }
    // arrived: take up the angle and stay put, crouched behind whatever is there
    const holds = HOLDS[e.team === TEAM_ATK ? 'atk' : 'def'];
    const h = holds[e.holdIndex % holds.length];
    const hx = h.x - e.x;
    const hz = h.z - e.z;
    const hd = Math.sqrt(hx * hx + hz * hz);
    if (hd > 1.1) {
      e.wishX = hx / hd;
      e.wishZ = hz / hd;
    } else {
      e.holdCrouch = e.team === TEAM_DEF && st.rng() < 0.02;
      e.holdYaw = Math.atan2(-(h.lookX - e.x), -(h.lookZ - e.z));
    }
    return;
  }
  if (d > 0.001) {
    e.wishX = dx / d;
    e.wishZ = dz / d;
  }
}

/** Swing the body onto the aim point at a finite turn rate, and hold the aim while it is there. */
function aim(st, e, dt) {
  const t = e.targetId >= 0 ? st.entities[e.targetId] : null;
  let wantYaw = e.yaw;
  let wantPitch = e.pitch;
  let rate = 3.4;

  if (t && t.alive && st.time - e.targetSeen < 0.55) {
    const dx = t.x - e.x;
    const dz = t.z - e.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const aimY = e.aimHead ? t.y + t.height - 0.17 : t.y + t.height * 0.58;
    wantYaw = Math.atan2(-dx, -dz) + e.aimErrYaw;
    wantPitch = Math.atan2(aimY - (e.y + e.eye), dist) + e.aimErrPitch;
    rate = TURN_RATE;
  } else if (e.mode === MODE_INVESTIGATE && e.alertTimer > 0) {
    wantYaw = Math.atan2(-(e.alertX - e.x), -(e.alertZ - e.z));
    wantPitch = 0;
    rate = 4.6;
  } else if (e.mode === MODE_ROUTE) {
    // walk where the body is going: a bot that stares at a fixed heading while it runs a lane
    // never sees the thing standing beside the lane
    if (e.path && e.path.length > 0) {
      const n = NODES[e.path[e.pathStep]];
      const dx = n.x - e.x;
      const dz = n.z - e.z;
      if (dx * dx + dz * dz > 0.4) wantYaw = Math.atan2(-dx, -dz);
      else wantYaw = e.holdYaw;
    } else wantYaw = e.holdYaw;
    wantPitch = 0;
  }

  const step = rate * dt;
  const dyaw = angleDiff(wantYaw, e.yaw);
  e.yaw += Math.abs(dyaw) < step ? dyaw : Math.sign(dyaw) * step;
  const dpitch = wantPitch - e.pitch;
  e.pitch += Math.abs(dpitch) < step ? dpitch : Math.sign(dpitch) * step;
  e.pitch = Math.max(-1.2, Math.min(1.2, e.pitch));
}

/** Pull the trigger when the sights are actually on the body, in bursts, with a reload between. */
function shoot(st, col, e, dt) {
  if (e.reaction > 0) e.reaction = Math.max(0, e.reaction - dt);
  if (e.burstCooldown > 0) e.burstCooldown = Math.max(0, e.burstCooldown - dt);
  const w = WEAPONS[e.weapon];
  const slot = e.inv[e.weapon];

  if (w.kind === 'gun' && slot.mag === 0 && !e.reloading && slot.reserve > 0) startReload(e);
  if (e.weapon !== 0 && e.inv[0].owned && e.mode === MODE_ENGAGE) switchTo(st, e, 0);

  const t = e.targetId >= 0 ? st.entities[e.targetId] : null;
  if (!t || !t.alive || st.time - e.targetSeen > 0.3 || e.flash > 0.45 || e.reaction > 0) {
    e.trigger = false;
    return;
  }
  const dx = t.x - e.x;
  const dz = t.z - e.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > w.range) { e.trigger = false; return; }
  const wantYaw = Math.atan2(-dx, -dz);
  if (Math.abs(angleDiff(wantYaw, e.yaw)) > 0.075) { e.trigger = false; return; }
  eyeOf(e, tmp);
  if (!col.clear(tmp.x, tmp.y, tmp.z, t.x, t.y + t.height * 0.62, t.z)) { e.trigger = false; return; }
  if (e.burstLeft <= 0) {
    if (e.burstCooldown > 0) return;
    e.burstLeft = 2 + Math.floor(st.rng() * 4);
  }
  e.trigger = true;
  if (fire(st, col, e, 1.0)) {
    e.burstLeft -= 1;
    e.strafeTimer -= 0.12;
    if (e.burstLeft <= 0) {
      e.burstCooldown = 0.22 + st.rng() * 0.4;
      rollAimError(st, e, e.targetId);
    }
  }
}

/** Bot buy: what an agent with this much money and this role would take into the round. */
export function botBuy(st, e, round) {
  const riflePrice = WEAPONS[0].price;
  const armourPrice = 650;
  if (e.money >= riflePrice + armourPrice) {
    e.money -= riflePrice;
    e.inv[0].owned = true;
    e.inv[0].mag = WEAPONS[0].mag;
    e.inv[0].reserve = WEAPONS[0].reserve;
    e.money -= armourPrice;
    e.armour = 100;
    if (round > 2 && e.money >= 300) {
      e.money -= 300;
      e.inv[3].owned = true;
      e.inv[3].mag = 1;
    }
    e.weapon = 0;
  } else if (e.money >= armourPrice) {
    e.money -= armourPrice;
    e.armour = 100;
  }
  if (e.team === TEAM_DEF && e.money >= 400 && st.rng() < 0.4) {
    e.money -= 400;
    e.hasKit = true;
  }
  emit(st, 'buy', e.x, e.y, e.z, e.id, e.money, 0, 0);
}
