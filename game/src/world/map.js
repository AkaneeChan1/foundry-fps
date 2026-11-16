// The map, as one data table. Collision, the renderer and the bot path graph all read this file, so
// a wall can never be drawn where it cannot be walked. "FOUNDRY" is an original three-lane layout:
// a long west lane, a mid corridor with a door and a window sightline, an east service lane, and a
// bomb site the two sides reach by different roads.
const T = 0.6;        // wall thickness
const OUTER_H = 6.4;  // the shell, tall enough that the skyline reads from inside
const INNER_H = 4.4;  // interior walls: just over a body, so nothing is a jump-over

/** One map box. Written as a call so the table above stays a table and not a wall of objects. */
function box(x, z, w, d, h, y0, mat) {
  return { x, z, w, d, h, y0, mat };
}

export const MAP = {
  bounds: { minX: -22, maxX: 22, minZ: -20, maxZ: 20 },

  // The shell: four walls and the floor slab. Nothing else is a boundary.
  boxes: [
    box(0, 0.2, 45.2, 41.2, 0.4, -0.4, 'deep'), // floor
    box(-22.3, 0, T, 40.6, OUTER_H, 0, 'surface'), // west wall
    box(22.3, 0, T, 40.6, OUTER_H, 0, 'surface'), // east wall
    box(0, 20.3, 45.2, T, OUTER_H, 0, 'surface'), // south wall
    box(0, -20.3, 45.2, T, OUTER_H, 0, 'surface'), // north wall

    // Two solid halls either side of mid. The west one forces the long lane, the east one the
    // service lane; both are full height, so mid is a true corridor with one exit at each end.
    box(-7, 6, 8, 12, INNER_H, 0, 'surface'), // foundry hall, west of mid
    box(7, 6, 8, 12, INNER_H, 0, 'surface'), // pump house, east of mid
    box(6, -10, 8, 8, INNER_H, 0, 'surface'), // depot, splits the defender hall

    // Bomb site: the north-west room. One door off long to the south, one door off mid to the
    // east; neither is wide, and both are watched from the defender side.
    box(-5.7, -16.35, T, 6.7, INNER_H, 0, 'surface'), // east wall, north of the door
    box(-5.7, -8, T, 4, INNER_H, 0, 'surface'), // east wall, south of the door
    box(-17.35, -5.7, 4.7, T, INNER_H, 0, 'surface'), // south wall, west of the door

    // The site's south wall east of the door, with a window through it at head height: solid
    // below, solid above, open in the middle. You can trade shots through it; you cannot walk.
    box(-11.4, -5.7, 1.2, T, INNER_H, 0, 'accent'),
    box(-6.6, -5.7, 1.2, T, INNER_H, 0, 'accent'),
    box(-9, -5.7, 3.6, T, 1.15, 0, 'accent'), // sill
    box(-9, -5.7, 3.6, T, 2.1, 2.3, 'accent'), // head

    // Mid doors: a pinch that makes the long view down mid a gamble rather than a gift.
    box(-2.4, 8, 1.2, 0.5, 3.2, 0, 'hairline'),
    box(2.4, 8, 1.2, 0.5, 3.2, 0, 'hairline'),

    // The site's back platform: a raised ledge along the north wall, up a ramp, that looks over
    // the whole plant zone and trades cover for height.
    box(-15, -18.45, 9.4, 2.5, 1.2, 0, 'steel'),

    // Long lane cover: a crate stack, a pillar and a low wall to break the sightline.
    box(-19.5, 8, 2.2, 2.2, 1.3, 0, 'hairline'),
    box(-13.6, 4, 1.6, 1.6, 1.6, 0, 'hairline'),
    box(-20, -1, 2.4, 1.4, 1.0, 0, 'hairline'),
    box(-14.2, 10.5, 3.0, 0.7, 1.1, 0, 'steel'),

    // Mid cover: an off-centre pillar and two low crates leave one clean sightline down the
    // east side and one contested one through the door.
    box(-1.6, 6, 1.2, 1.2, 3.4, 0, 'hairline'),
    box(-2.0, 3, 1.2, 1.2, 0.9, 0, 'hairline'),
    box(-2.0, 10.5, 1.2, 1.2, 0.9, 0, 'hairline'),

    // Service lane cover.
    box(14, 7, 2.0, 2.0, 1.4, 0, 'hairline'),
    box(19.5, 3, 1.6, 1.6, 1.6, 0, 'hairline'),
    box(13, 0, 2.2, 1.2, 1.0, 0, 'hairline'),
    box(18, 10, 2.6, 0.7, 1.1, 0, 'steel'),
    box(16.8, -10.5, 1.6, 1.6, 1.1, 0, 'hairline'),

    // Site cover: the plant spot stays open; everything around it does not.
    box(-18, -10, 2.0, 2.0, 1.4, 0, 'hairline'),
    box(-9.5, -16.5, 2.4, 2.4, 1.6, 0, 'hairline'),
    box(-12.0, -9.0, 1.4, 1.4, 0.9, 0, 'hairline'),
    box(-18, -14, 2.0, 2.0, 1.2, 0, 'hairline'),
    box(-8, -8.5, 1.6, 1.6, 1.0, 0, 'hairline'),

    // Defender hall and spawn cover.
    box(-2.2, -16.4, 1.6, 1.6, 1.1, 0, 'hairline'),
    box(14.6, -8.2, 1.6, 1.6, 1.2, 0, 'hairline'),
    box(18.5, -12, 2.0, 2.0, 1.4, 0, 'hairline'),
    box(6, -18.6, 2.4, 1.2, 1.0, 0, 'steel'),

    // Attacker spawn: two crates flanking the plaza and one behind, so the spawn is not a plain.
    box(-7, 14.0, 2.0, 2.0, 1.3, 0, 'hairline'),
    box(7, 14.0, 2.0, 2.0, 1.3, 0, 'hairline'),
    box(0, 19.2, 3.2, 0.8, 1.0, 0, 'steel'),
  ],

  // One wedge, the way up onto the site platform. `dir` is the axis the top surface rises along.
  ramps: [{ x: -13.25, z: -15.9, w: 3.5, d: 2.6, h: 1.2, y0: 0, dir: '-z', mat: 'steel' }],

  // Lamp housings: drawn but not collided, thin emissive strips that give the halls a scale.
  lamps: [
    { x: -7, z: 6, y: 3.9, w: 0.35, d: 9, color: 'accent' },
    { x: 7, z: 6, y: 3.9, w: 0.35, d: 9, color: 'teal' },
    { x: 1.6, z: 10.5, y: 2.6, w: 0.25, d: 4, color: 'teal' },
    { x: -13, z: -13, y: 5.2, w: 0.3, d: 0.3, color: 'accent' },
  ],

  spawns: {
    atk: [
      { x: -2.4, z: 17.6, yaw: 0 },
      { x: 0, z: 18.1, yaw: 0 },
      { x: 2.4, z: 17.6, yaw: 0 },
    ],
    def: [
      { x: 14, z: -17.2, yaw: Math.PI },
      { x: 16.4, z: -16.4, yaw: Math.PI },
      { x: 12.6, z: -14.6, yaw: Math.PI },
    ],
  },

  site: { x: -13, z: -13, radius: 3.1, name: 'SITE A' },
};

// The bot path graph. Nodes are hand-placed where a body fits; edges are hand-checked by
// tools/maptest.mjs for a clear walk and a clear line. Routes are the three lanes plus the
// rotations, so a bot that hears a fight can leave its lane and answer it.

export const NODES = [
  { id: 'aSpawn', x: 0, z: 17.5 },
  { id: 'aWest', x: -9.2, z: 15.2 },
  { id: 'aEast', x: 9.2, z: 15.2 },
  { id: 'aMid', x: 0, z: 13.2 },
  { id: 'aLong', x: -16, z: 14 },
  { id: 'aTunnel', x: 16, z: 14 },

  { id: 'l1', x: -17.5, z: 9 },
  { id: 'l2', x: -17, z: 3 },
  { id: 'l3', x: -17.5, z: -2 },
  { id: 'l4', x: -14, z: -4.2 },
  { id: 'l5', x: -13.5, z: -7.8 },

  { id: 'm1', x: 1.4, z: 11.5 },
  { id: 'm2', x: 1.4, z: 6 },
  { id: 'm3', x: 1.4, z: 2 },
  { id: 'm4', x: 1.4, z: -1.8 },
  { id: 'm5', x: 0.8, z: -4.2 },
  { id: 'm6', x: -4.6, z: -11 },
  { id: 'm6b', x: -5.7, z: -11.5 },
  { id: 'm7', x: -7.8, z: -11.8 },

  { id: 'e1', x: 16, z: 9 },
  { id: 'e2', x: 16.5, z: 3 },
  { id: 'e3', x: 16, z: -1.6 },
  { id: 'e4', x: 13.6, z: -5.4 },
  { id: 'e5', x: 11.6, z: -9.5 },
  { id: 'e6', x: 15.5, z: -16.5 },

  { id: 'n1', x: 11.6, z: -4.2 },
  { id: 'n2', x: 5.2, z: -4.3 },
  { id: 'n3', x: 0.8, z: -4.3 },
  { id: 'n4', x: 0.8, z: -8.5 },
  { id: 'n5', x: 0.8, z: -12.5 },
  { id: 'n6', x: 0.8, z: -17.2 },
  { id: 'n7', x: 6, z: -17.6 },
  { id: 'n8', x: 11.6, z: -13.8 },

  { id: 's1', x: -13, z: -13 },
  { id: 's2', x: -16.6, z: -8.4 },
  { id: 's3', x: -7.4, z: -15 },
  { id: 's4', x: -15.5, z: -16.2 },
  { id: 's5', x: -10, z: -10 },
];

export const EDGES = [
  ['aSpawn', 'aWest'], ['aSpawn', 'aEast'], ['aSpawn', 'aMid'],
  ['aWest', 'aLong'], ['aEast', 'aTunnel'],
  ['aLong', 'l1'], ['l1', 'l2'], ['l2', 'l3'], ['l3', 'l4'], ['l4', 'l5'],
  ['l5', 's1'], ['l5', 's2'],
  ['aMid', 'm1'], ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm4'], ['m4', 'm5'],
  ['m5', 'm6'], ['m6', 'm6b'], ['m6b', 'm7'], ['m7', 's1'], ['m7', 's5'],
  ['aTunnel', 'e1'], ['e1', 'e2'], ['e2', 'e3'], ['e3', 'e4'], ['e4', 'e5'],
  ['e5', 'e6'], ['e5', 'n1'], ['e5', 'n8'],
  ['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'n6'],
  ['n6', 'n7'], ['n7', 'n8'], ['n8', 'e6'], ['n4', 'm6'],
  ['s1', 's2'], ['s1', 's3'], ['s1', 's5'], ['s2', 's4'], ['s1', 's4'],
];

/** Three lanes from the attacker spawn, and the rotations a defender uses to retake. */
export const ROUTES = {
  atk: {
    long: ['aSpawn', 'aWest', 'aLong', 'l1', 'l2', 'l3', 'l4', 'l5', 's2'],
    mid: ['aSpawn', 'aMid', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm6b', 'm7', 's5'],
    east: ['aSpawn', 'aEast', 'aTunnel', 'e1', 'e2', 'e3', 'e4', 'e5', 'n8', 'n7', 'n6', 'n5', 'n4', 'm6', 'm6b', 'm7', 's5'],
  },
  def: {
    site: ['e6', 'n8', 'n7', 'n6', 'n5', 'n4', 'm6', 'm6b', 'm7', 's5'],
    mid: ['e6', 'n8', 'e5', 'n1', 'n2', 'n3', 'n4', 'm6'],
    hall: ['e6', 'n8', 'n7', 'n6', 'n5', 'n4', 'm6'],
  },
};

/** Where a bot stops and holds an angle: a spot plus the point it watches. */
export const HOLDS = {
  atk: [
    { x: -17, z: -3.4, lookX: -14, lookZ: -8 },
    { x: -15.4, z: -4.3, lookX: -12, lookZ: -9 },
    { x: -9.6, z: -11.4, lookX: -13, lookZ: -14 },
    { x: -4.2, z: -9.4, lookX: -8, lookZ: -12 },
    { x: 0.8, z: -4.6, lookX: 0, lookZ: 4 },
  ],
  def: [
    { x: -16.4, z: -8.2, lookX: -13, lookZ: -3 },
    { x: -8.6, z: -10.8, lookX: -11, lookZ: -5 },
    { x: -12.4, z: -16.6, lookX: -12, lookZ: -9 },
    { x: -5.2, z: -12.6, lookX: -9, lookZ: -12 },
    { x: 0.4, z: -6.2, lookX: 0, lookZ: 4 },
    { x: -13, z: -18.4, y: 1.2, lookX: -10, lookZ: -13 },
  ],
};

/** The plant zone's corners, used to draw the floor marking. */
export function siteRect() {
  const s = MAP.site;
  return { x0: s.x - s.radius, x1: s.x + s.radius, z0: s.z - s.radius, z1: s.z + s.radius };
}
