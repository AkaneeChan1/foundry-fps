// One body's motion: acceleration toward a wish direction, friction to a stop, a crouch the camera
// and the hitboxes both read, and the footstep noise that gives you away. The player and every bot
// walk through this same function, so a bot can never outrun the rules.
import { emit } from './state.js';
import { noise } from '../ai/hearing.js';

export const WALK_SPEED = 5.2;
export const CROUCH_SPEED = 2.45;
export const ACCEL = 34;
export const AIR_ACCEL = 3.2;
export const FRICTION = 9.5;
export const STAND_HEIGHT = 1.74;
export const CROUCH_HEIGHT = 1.16;
export const STAND_EYE = 1.62;
export const CROUCH_EYE = 1.06;

const STEP_NOISE = 2.6;
const STEALTH = 0.55;

/**
 * Move a body one tick. `wishX/wishZ` is a direction on the ground plane (not normalised here);
 * `crouch` is a request that is refused while something is above the body.
 */
export function drive(st, col, e, wishX, wishZ, dt, crouch, speed) {
  const wantHeight = crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
  if (crouch) {
    e.crouching = true;
  } else if (e.crouching) {
    // stand up only when the taller body fits where the short one is standing
    e.crouching = col.blocked(e.x, e.y, e.z, 0.34, STAND_HEIGHT) !== null;
  }
  const targetH = e.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
  e.height += (targetH - e.height) * Math.min(1, dt * 14);
  e.crouchT += ((e.crouching ? 1 : 0) - e.crouchT) * Math.min(1, dt * 12);
  e.eye += ((e.crouching ? CROUCH_EYE : STAND_EYE) - e.eye) * Math.min(1, dt * 12);

  const len = Math.sqrt(wishX * wishX + wishZ * wishZ);
  const maxSpeed = e.crouching ? CROUCH_SPEED : speed;
  if (len > 0.0001) {
    const tx = (wishX / len) * maxSpeed;
    const tz = (wishZ / len) * maxSpeed;
    if (e.onGround) {
      const maxStep = ACCEL * dt;
      let dx = tx - e.vx;
      let dz = tz - e.vz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > maxStep) { dx = (dx / d) * maxStep; dz = (dz / d) * maxStep; }
      e.vx += dx;
      e.vz += dz;
    } else {
      e.vx += (tx - e.vx) * Math.min(1, AIR_ACCEL * dt);
      e.vz += (tz - e.vz) * Math.min(1, AIR_ACCEL * dt);
    }
  } else if (e.onGround) {
    const damp = Math.max(0, 1 - FRICTION * dt);
    e.vx *= damp;
    e.vz *= damp;
    if (Math.abs(e.vx) < 0.02) e.vx = 0;
    if (Math.abs(e.vz) < 0.02) e.vz = 0;
  }

  e.px = e.x;
  e.py = e.y;
  e.pz = e.z;
  col.move(e, dt);

  // Footsteps: only a body actually on the ground and actually moving makes any.
  const speedNow = e.speed;
  if (e.onGround && speedNow > 2.0) {
    e.stepTimer -= dt;
    if (e.stepTimer <= 0) {
      e.stepTimer = 0.44 - Math.min(0.16, speedNow * 0.02);
      e.bob += 1;
      const loud = e.crouching ? STEALTH : 1;
      if (loud > 0.2) noise(st, e.x, e.z, STEP_NOISE * loud, e.team, 1);
      emit(st, 'step', e.x, e.y, e.z, e.id, e.crouching ? 1 : 0, speedNow, 0);
    }
  } else if (!e.onGround) {
    e.stepTimer = 0.1;
  }
}

/** A jump, if the feet are down. */
export function jump(st, col, e) {
  if (!e.onGround) return false;
  e.vy = 6.4;
  e.onGround = false;
  e.y += 0.02;
  return true;
}
