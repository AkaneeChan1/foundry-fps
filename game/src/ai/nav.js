// The route graph and the walk through it. Nodes are hand-placed in map.js and hand-checked by
// tools/maptest.mjs; this module only turns an edge list into a breadth-first walk. Paths are
// cached per node pair, so a bot re-pathing every few seconds costs a map lookup, not a search.
import { NODES, EDGES, ROUTES } from '../world/map.js';

export function createNav() {
  const index = new Map();
  for (let i = 0; i < NODES.length; i += 1) index.set(NODES[i].id, i);

  const adj = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined) continue;
    adj[i].push(j);
    adj[j].push(i);
  }

  const prev = new Int32Array(NODES.length);
  const queue = new Int32Array(NODES.length);
  const seen = new Int32Array(NODES.length);
  const cache = new Map();
  let stamp = 0;

  /** Node indices from -> to, inclusive, or an empty array when there is no route. */
  function find(from, to) {
    if (from === to) return [from];
    const key = from * 1000 + to;
    const cached = cache.get(key);
    if (cached) return cached;
    stamp += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = from;
    seen[from] = stamp;
    prev[from] = -1;
    let found = false;
    while (head < tail) {
      const at = queue[head++];
      if (at === to) { found = true; break; }
      const next = adj[at];
      for (let i = 0; i < next.length; i += 1) {
        const n = next[i];
        if (seen[n] === stamp) continue;
        seen[n] = stamp;
        prev[n] = at;
        queue[tail++] = n;
      }
    }
    if (!found) {
      cache.set(key, []);
      return [];
    }
    const out = [];
    let at = to;
    while (at !== -1) {
      out.push(at);
      at = prev[at];
    }
    out.reverse();
    cache.set(key, out);
    return out;
  }

  function routeIds(team, lane) {
    const table = ROUTES[team];
    return table[lane] ?? table[Object.keys(table)[0]];
  }

  return { NODES, find, routeIds, index };
}
