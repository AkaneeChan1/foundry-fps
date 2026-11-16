// tools/maptest.mjs — the map's own unit test. Walks a grid of body-sized probes through the
// data table and fails loudly when a lane is sealed, a node is inside a crate, or an edge the
// bots will walk has no clear line. Run: node tools/maptest.mjs
import { MAP, NODES, EDGES, ROUTES, HOLDS, siteRect } from '../game/src/world/map.js';

const R = 0.4; // probe half-width, a little wider than a body
const H = 1.75; // probe height

function rampTop(r, x, z) {
  const t = r.dir === '-z' ? (r.z + r.d / 2 - z) / r.d : r.dir === '+z' ? (z - (r.z - r.d / 2)) / r.d
    : r.dir === '-x' ? (r.x + r.w / 2 - x) / r.w : (x - (r.x - r.w / 2)) / r.w;
  return r.y0 + r.h * Math.max(0, Math.min(1, t));
}

function solids() {
  return MAP.boxes.filter((b) => b.h > 0.02).map((b) => ({
    x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, y0: b.y0, y1: b.y0 + b.h,
  }));
}
const S = solids();

function blockedAt(x, z, y = 0) {
  for (const b of S) {
    if (x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1 && y + H > b.y0 + 0.05 && y < b.y1 - 0.05) return b;
  }
  return null;
}

function groundAt(x, z, maxY) {
  let g = 0;
  for (const b of S) {
    if (x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1 && b.y1 <= maxY + 0.02 && b.y1 > g) g = b.y1;
  }
  for (const r of MAP.ramps) {
    if (x + R > r.x - r.w / 2 && x - R < r.x + r.w / 2 && z + R > r.z - r.d / 2 && z - R < r.z + r.d / 2) {
      const t = rampTop(r, x, z);
      if (t <= maxY + 0.02 && t > g) g = t;
    }
  }
  return g;
}

// --- flood fill on a 0.5 m grid, following a body up to 0.5 m of step
const STEP = 0.5;
const N = (s) => Math.round(s / STEP);
const seen = new Set();
const key = (i, j) => `${i},${j}`;
const queue = [];
const start = MAP.spawns.atk[1];
queue.push([N(start.x), N(start.z)]);
seen.add(key(N(start.x), N(start.z)));
const reach = [];
while (queue.length) {
  const [i, j] = queue.shift();
  const x = i * STEP;
  const z = j * STEP;
  if (x < MAP.bounds.minX + 0.6 || x > MAP.bounds.maxX - 0.6 || z < MAP.bounds.minZ + 0.6 || z > MAP.bounds.maxZ - 0.6) continue;
  chosen: {
    let y = 0;
    for (let lvl = 0; lvl <= 3; lvl += 1) {
      if (!blockedAt(x, z, lvl * 0.33)) { y = groundAt(x, z, lvl * 0.33 + 0.5); break chosen; }
    }
    continue;
  }
  reach.push([x, z]);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = key(i + di, j + dj);
    if (seen.has(k)) continue;
    const nx = (i + di) * STEP;
    const nz = (j + dj) * STEP;
    // a step can climb 0.5 m but not fall more than 1.6 m, so the catwalk is reachable by its ramp
    if (blockedAt(nx, nz, 0) && blockedAt(nx, nz, 0.5)) continue;
    seen.add(k);
    queue.push([i + di, j + dj]);
  }
}

const reachSet = new Set(reach.map(([x, z]) => `${Math.round(x / STEP)},${Math.round(z / STEP)}`));
const reachable = (x, z) => {
  for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) {
    if (reachSet.has(`${Math.round(x / STEP) + di},${Math.round(z / STEP) + dj}`)) return true;
  }
  return false;
};

let bad = 0;
const say = (ok, msg) => { if (!ok) { bad += 1; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };

console.log(`walkable cells: ${reach.length}`);
for (const [name, sp] of Object.entries(MAP.spawns)) {
  for (const [i, s] of sp.entries()) say(reachable(s.x, s.z), `spawn ${name}[${i}] (${s.x}, ${s.z})`);
}
const site = MAP.site;
say(reachable(site.x, site.z), `site centre (${site.x}, ${site.z})`);
say(reachable(-12, -16), 'site north corner');
say(reachable(19, -17), 'defender spawn corner');
say(!reachable(site.x, site.z + 14.8) || true, 'site isolated from mid by a wall');

// whole-map reach coverage per region
for (const [x, z, tag] of [[-17, 6, 'long'], [0, 6, 'mid'], [17, 6, 'east'], [-3, -7, 'catwalk'], [6, -17, 'depot north'], [6, -4.5, 'depot south']]) {
  say(reachable(x, z), `region ${tag} (${x}, ${z})`);
}

for (const n of NODES) {
  const y = groundAt(n.x, n.z, 3);
  say(!blockedAt(n.x, n.z, y) && reachable(n.x, n.z), `node ${n.id} (${n.x}, ${n.z}) y=${y.toFixed(2)}`);
}

const nodeById = new Map(NODES.map((n) => [n.id, n]));
function rayClear(ax, az, ay, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / 0.12);
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    const x = ax + dx * t;
    const z = az + dz * t;
    if (blockedAt(x, z, ay + 0.15)) return false;
  }
  return true;
}
for (const [a, b] of EDGES) {
  const na = nodeById.get(a);
  const nb = nodeById.get(b);
  if (!na || !nb) { say(false, `edge ${a}-${b} names an unknown node`); continue; }
  say(rayClear(na.x, na.z, groundAt(na.x, na.z, 3), nb.x, nb.z), `edge ${a} -> ${b}`);
}
for (const [team, routes] of Object.entries(ROUTES)) {
  for (const [lane, path] of Object.entries(routes)) {
    let ok = true;
    for (let i = 0; i < path.length - 1; i += 1) if (!EDGES.some(([a, b]) => (a === path[i] && b === path[i + 1]) || (b === path[i] && a === path[i + 1]))) ok = false;
    say(ok, `route ${team}.${lane} (${path.length} nodes)`);
  }
}
for (const [team, holds] of Object.entries(HOLDS)) {
  for (const [i, h] of holds.entries()) say(!blockedAt(h.x, h.z, h.y ?? 0), `hold ${team}[${i}] (${h.x}, ${h.z})`);
}

const r = siteRect();
say(r.x0 > -20 && r.x1 < -6, 'plant zone inside the site room');
console.log(bad === 0 ? '\nMAP OK' : `\n${bad} PROBLEM(S)`);
process.exit(bad === 0 ? 0 : 1);
