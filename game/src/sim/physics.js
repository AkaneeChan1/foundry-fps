// Collision, as numbers. The map is a list of axis-aligned boxes and a few wedges; a body is an
// upright cylinder approximated by a square footprint. Everything here writes into the caller's
// numbers or a reused result object, so a 60 Hz step allocates nothing.
import { MAP } from '../world/map.js';

export const GRAVITY = 20;
export const STEP_UP = 0.52; // the tallest ledge a running body climbs without jumping
export const BODY_RADIUS = 0.34;

/** The height of a ramp's top surface at (x, z), clamped to its footprint. */
export function rampTop(r, x, z) {
  let t;
  if (r.dir === '-z') t = (r.z + r.d / 2 - z) / r.d;
  else if (r.dir === '+z') t = (z - (r.z - r.d / 2)) / r.d;
  else if (r.dir === '-x') t = (r.x + r.w / 2 - x) / r.w;
  else t = (x - (r.x - r.w / 2)) / r.w;
  return r.y0 + r.h * (t < 0 ? 0 : t > 1 ? 1 : t);
}

export function createCollision(map = MAP) {
  const boxes = [];
  for (const b of map.boxes) {
    boxes.push({
      x0: b.x - b.w / 2, x1: b.x + b.w / 2,
      y0: b.y0, y1: b.y0 + b.h,
      z0: b.z - b.d / 2, z1: b.z + b.d / 2,
    });
  }
  const ramps = map.ramps.map((r) => ({
    x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2, top: r.h + r.y0, base: r.y0, ramp: r,
  }));
  const count = boxes.length;

  /** The lowest box the footprint overlaps at height y, or null. */
  function blocked(x, y, z, radius, height) {
    const top = y + height;
    for (let i = 0; i < count; i += 1) {
      const b = boxes[i];
      if (x + radius <= b.x0 || x - radius >= b.x1 || z + radius <= b.z0 || z - radius >= b.z1) continue;
      if (top <= b.y0 + 0.02 || y >= b.y1 - 0.02) continue;
      return b;
    }
    return null;
  }

  /** The highest surface under the footprint that is no higher than maxY. */
  function groundAt(x, z, radius, maxY) {
    let g = 0;
    for (let i = 0; i < count; i += 1) {
      const b = boxes[i];
      if (x + radius <= b.x0 || x - radius >= b.x1 || z + radius <= b.z0 || z - radius >= b.z1) continue;
      if (b.y1 <= maxY && b.y1 > g) g = b.y1;
    }
    for (let i = 0; i < ramps.length; i += 1) {
      const r = ramps[i];
      if (x + radius <= r.x0 || x - radius >= r.x1 || z + radius <= r.z0 || z - radius >= r.z1) continue;
      const t = rampTop(r.ramp, x, z);
      if (t <= maxY && t > g) g = t;
    }
    return g;
  }

  /**
   * A segment against every box, by the slab method. Writes the nearest hit into `out` and
   * returns it, or returns null. `out.nx/ny/nz` is the face normal, `out.t` the distance.
   */
  const out = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, index: -1 };
  function rayBoxes(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    let index = -1;
    let axis = 0;
    let sign = 1;
    for (let i = 0; i < count; i += 1) {
      const b = boxes[i];
      let tmin = 0;
      let tmax = best;
      let a = -1;
      let s = 1;
      // x slab
      if (dx === 0) {
        if (ox < b.x0 || ox > b.x1) continue;
      } else {
        const inv = 1 / dx;
        let t1 = (b.x0 - ox) * inv;
        let t2 = (b.x1 - ox) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = -s; }
        if (t1 > tmin) { tmin = t1; a = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin >= tmax) continue;
      }
      if (dy === 0) {
        if (oy < b.y0 || oy > b.y1) continue;
      } else {
        const inv = 1 / dy;
        let t1 = (b.y0 - oy) * inv;
        let t2 = (b.y1 - oy) * inv;
        let sy = 1;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sy = -1; }
        if (t1 > tmin) { tmin = t1; a = 1; s = sy; }
        if (t2 < tmax) tmax = t2;
        if (tmin >= tmax) continue;
      }
      if (dz === 0) {
        if (oz < b.z0 || oz > b.z1) continue;
      } else {
        const inv = 1 / dz;
        let t1 = (b.z0 - oz) * inv;
        let t2 = (b.z1 - oz) * inv;
        let sz = 1;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sz = -1; }
        if (t1 > tmin) { tmin = t1; a = 2; s = sz; }
        if (t2 < tmax) tmax = t2;
        if (tmin >= tmax) continue;
      }
      if (tmin < best) {
        best = tmin;
        index = i;
        axis = a;
        sign = s;
      }
    }
    if (index < 0) return null;
    out.t = best;
    out.x = ox + dx * best;
    out.y = oy + dy * best;
    out.z = oz + dz * best;
    out.nx = axis === 0 ? sign : 0;
    out.ny = axis === 1 ? sign : 0;
    out.nz = axis === 2 ? sign : 0;
    out.index = index;
    return out;
  }

  /** True when nothing solid stands between two points. Used by sight and by bot line of fire. */
  function clear(ax, ay, az, bx, by, bz) {
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    dx /= len; dy /= len; dz /= len;
    return rayBoxes(ax, ay, az, dx, dy, dz, len) === null;
  }

  /** Walk into the map: horizontal first with a step-up, then gravity with a ground snap. */
  function move(e, dt) {
    const r = BODY_RADIUS;
    const nx = e.x + e.vx * dt;
    if (!blocked(nx, e.y, e.z, r, e.height)) e.x = nx;
    else if (!blocked(nx, e.y + STEP_UP, e.z, r, e.height) && groundAt(nx, e.z, r, e.y + STEP_UP + 0.06) > e.y + 0.04) {
      e.x = nx;
      e.y = groundAt(nx, e.z, r, e.y + STEP_UP + 0.06);
    } else e.vx = 0;

    const nz = e.z + e.vz * dt;
    if (!blocked(e.x, e.y, nz, r, e.height)) e.z = nz;
    else if (!blocked(e.x, e.y + STEP_UP, nz, r, e.height) && groundAt(e.x, nz, r, e.y + STEP_UP + 0.06) > e.y + 0.04) {
      e.z = nz;
      e.y = groundAt(e.x, nz, r, e.y + STEP_UP + 0.06);
    } else e.vz = 0;

    e.vy -= GRAVITY * dt;
    const from = e.y;
    e.y += e.vy * dt;
    const g = groundAt(e.x, e.z, r, from + 0.06);
    if (e.y <= g && e.vy <= 0) {
      e.y = g;
      e.vy = 0;
      e.onGround = true;
    } else {
      e.onGround = false;
      if (e.vy > 0) {
        const b = blocked(e.x, e.y, e.z, r, e.height);
        if (b) {
          e.y = b.y0 - e.height - 0.001;
          e.vy = 0;
        }
      }
    }
    if (e.y < -4) e.y = 0;
    e.speed = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
  }

  return { boxes, ramps, blocked, groundAt, rayBoxes, clear, move, count };
}
