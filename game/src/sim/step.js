// The fixed step. One tick, in the only order that keeps the score honest: look and move the
// player, run every bot brain, fly the grenades, then let the match read the world and decide
// whether the round is over. This file never touches three.js.
import { WEAPONS } from '../weapons/defs.js';
import { fire, updateWeapon, startReload, switchTo, resolveFlash } from '../weapons/combat.js';
import { drive, jump, WALK_SPEED } from './movement.js';
import { updateBots } from '../ai/bots.js';
import { PHASE_LIVE, TEAM_DEF, TICK } from './state.js';
import { createMatch, insideSite } from '../match/match.js';

const SENSITIVITY = 0.0022;
const PITCH_LIMIT = 1.52;

/** A command is read once per frame and consumed by the first substep of that frame. */
export function createCommand() {
  return {
    lookX: 0, lookY: 0, forward: 0, strafe: 0,
    crouch: false, jump: false, walk: false, fire: false, reload: false, use: false,
    slot: -1, grenade: false,
  };
}

export function createSim(st, col, nav) {
  const match = createMatch();

  function stepPlayer(dt, cmd) {
    const e = st.player;
    if (!e.alive) return;
    const lookScale = 1 / (1 + (e.flash > 0.5 ? 2.5 : 0));
    e.yaw -= cmd.lookX * SENSITIVITY * lookScale;
    e.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, e.pitch - cmd.lookY * SENSITIVITY * lookScale));

    const sin = Math.sin(e.yaw);
    const cos = Math.cos(e.yaw);
    const wishX = -sin * cmd.forward + cos * cmd.strafe;
    const wishZ = -cos * cmd.forward - sin * cmd.strafe;
    drive(st, col, e, wishX, wishZ, dt, cmd.crouch, cmd.walk ? 2.5 : WALK_SPEED);
    if (cmd.jump) jump(st, col, e);

    if (cmd.slot >= 0) switchTo(st, e, cmd.slot);
    if (cmd.reload) startReload(e);
    if (cmd.grenade) {
      // a quick-throw: draw the flash and leave with it in one motion, ignoring the draw time
      if (e.weapon !== 3) switchTo(st, e, 3);
      e.switching = 0;
      e.shotTimer = 0;
      e.trigger = false;
      if (st.phase === PHASE_LIVE) fire(st, col, e);
      cmd.grenade = false;
    }

    const w = WEAPONS[e.weapon];
    const wantsFire = w.auto ? cmd.fire : cmd.fire && !e.trigger;
    if (wantsFire && st.phase === PHASE_LIVE) fire(st, col, e);
    e.trigger = cmd.fire;
  }

  function stepProjectiles(dt) {
    const list = st.projectiles;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      p.vy -= 20 * dt;
      p.spin += dt * 9;
      const nx = p.x + p.vx * dt;
      if (!col.blocked(nx, p.y, p.z, 0.1, 0.1)) p.x = nx;
      else p.vx *= -0.42;
      const ny = p.y + p.vy * dt;
      if (!col.blocked(p.x, ny, p.z, 0.1, 0.1)) p.y = ny;
      else { p.vy *= -0.38; p.vx *= 0.8; p.vz *= 0.8; if (Math.abs(p.vy) < 0.6) p.vy = 0; }
      const nz = p.z + p.vz * dt;
      if (!col.blocked(p.x, p.y, nz, 0.1, 0.1)) p.z = nz;
      else p.vz *= -0.42;
      p.fuse -= dt;
      if (p.fuse <= 0) {
        list.splice(i, 1);
        resolveFlash(st, col, p.x, p.y, p.z, p.team);
      }
    }
  }

  /** One fixed tick. `cmd` is the frame's input; it is consumed on the first substep only. */
  function step(dt, cmd) {
    st.tick += 1;
    st.time += dt;
    st.hitFlash = Math.max(0, st.hitFlash - dt * 2.2);
    st.shake = Math.max(0, st.shake - dt * 2.4);

    const player = st.player;
    st.playerPlanting = cmd.use && player.alive && player.hasBomb && st.phase === PHASE_LIVE && insideSite(player.x, player.z) && player.speed < 1.4;
    st.playerDefusing = cmd.use && player.alive && player.team === TEAM_DEF && st.phase === PHASE_LIVE
      && Math.abs(player.x - st.bomb.x) < 1.7 && Math.abs(player.z - st.bomb.z) < 1.7 && player.speed < 1.4;

    for (let i = 0; i < st.entities.length; i += 1) {
      const e = st.entities[i];
      if (e.alive) updateWeapon(st, e, dt);
    }
    stepPlayer(dt, cmd);
    updateBots(st, col, nav, dt);
    stepProjectiles(dt);
    match.update(st, col, nav, dt);

    // The frame's input is spent: a render that runs two substeps must not double the mouse.
    cmd.lookX = 0;
    cmd.lookY = 0;
    cmd.slot = -1;
    cmd.jump = false;
  }

  return { match, step, TICK };
}
