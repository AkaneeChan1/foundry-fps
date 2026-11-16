// One state object and nothing else. The simulation owns it, the renderer reads it, and the HUD
// samples it; there is no second copy of the truth anywhere in the game. Entities are plain
// number records on purpose — a fixed-shape object with numbers in it steps without allocating.
import { PISTOL_START, emptyInventory } from '../weapons/defs.js';
import { MAP } from '../world/map.js';

export const TEAM_ATK = 0;
export const TEAM_DEF = 1;

export const PHASE_BUY = 'buy';
export const PHASE_LIVE = 'live';
export const PHASE_ROUND_END = 'roundEnd';
export const PHASE_MATCH_END = 'match';

export const TICK = 1 / 60;
export const BUY_TIME = 20;
export const ROUND_TIME = 115;
export const BOMB_TIME = 40;
export const FREEZE_TIME = 5;
export const ROUNDS_TO_WIN = 5;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 6.5;
export const START_MONEY = 800;
export const MAX_MONEY = 16000;

export const EVENT_CAPACITY = 128;

const NAMES_ATK = ['Vulture', 'Harrow', 'Kestrel'];
const NAMES_DEF = ['Sable', 'Rook', 'Pike'];

/** A mulberry32 generator: small, seeded, and the only source of chance in the simulation. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Emit into a preallocated ring: the view drains it once a frame, the simulation never waits. */
export function emit(st, type, x, y, z, a, b, c, d) {
  const e = st.events[st.eventWrite];
  e.type = type;
  e.x = x;
  e.y = y;
  e.z = z;
  e.a = a;
  e.b = b;
  e.c = c;
  e.d = d;
  st.eventWrite = (st.eventWrite + 1) % EVENT_CAPACITY;
  if (st.eventCount < EVENT_CAPACITY) st.eventCount += 1;
}

export function makeEntity(id, team, isPlayer, name) {
  return {
    id,
    name,
    team,
    isPlayer,
    // body
    x: 0, y: 0, z: 0,
    px: 0, py: 0, pz: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0,
    height: 1.74, eye: 1.6, crouchT: 0, crouching: false,
    onGround: true, speed: 0, bob: 0, lookDx: 0, lookDy: 0,
    stepTimer: 0,
    // life
    health: 100, armour: 0, alive: true, deathAt: -99,
    hasKit: false, hasBomb: false,
    // shooting
    weapon: 0,
    inv: emptyInventory(),
    shotTimer: 0, reloadTimer: 0, reloading: false,
    spread: 0, shotSpread: 0,
    recoilPitch: 0, recoilYaw: 0, recoilIndex: 0, recoilHold: 0,
    trigger: false, triggerEdge: false, switching: 0,
    flash: 0,
    // economy and score
    money: START_MONEY, kills: 0, deaths: 0, roundKills: 0,
    // bot brain
    route: 'long', path: [], pathStep: 0,
    targetId: -1, targetSeen: -99, aimYaw: 0, aimPitch: 0,
    alertX: 0, alertZ: 0, alertTimer: 0, alertKind: 0,
    reaction: 0, burstLeft: 0, burstCooldown: 0,
    strafeSign: 1, strafeTimer: 0, think: 0,
    holdIndex: 0, holdX: 0, holdZ: 0, lookX: 0, lookZ: 0, holdYaw: 0,
    waitTimer: 0, plantedTimer: 0,
    mode: 0, wishX: 0, wishZ: 0, holdCrouch: false,
    settle: 0, aimHead: false, lastHealth: 100, goalX: 0, goalZ: 0, repath: 0,
  };
}

export function createState(seed = 1, teamSize = 3) {
  const st = {
    rng: makeRng(seed),
    seed,
    time: 0,
    tick: 0,
    phase: PHASE_BUY,
    phaseTime: BUY_TIME,
    round: 1,
    scoreAtk: 0,
    scoreDef: 0,
    roundWinner: -1,
    roundReason: '',
    lastWinAtk: false,
    lossStreakAtk: 0,
    lossStreakDef: 0,
    entities: [],
    player: null,
    events: [],
    eventWrite: 0,
    eventCount: 0,
    projectiles: [],
    // the objective
    bomb: {
      state: 'carried', // carried | planted | defused | exploded
      carrier: -1,
      x: 0, y: 0, z: 0,
      timer: 0,
      plantT: 0,
      defuseT: 0,
      defuser: -1,
      site: MAP.site.name,
      beeps: 999,
    },
    // presentation hooks the simulation sets and the view consumes
    shake: 0,
    hitFlash: 0,
    buyOpen: false,
    matchOver: false,
    stats: { shots: 0, hits: 0, headshots: 0 },
  };
  for (let i = 0; i < EVENT_CAPACITY; i += 1) {
    st.events.push({ type: '', x: 0, y: 0, z: 0, a: 0, b: 0, c: 0, d: 0 });
  }

  // The player is entity 0 and always attacks; the bots fill both teams.
  const player = makeEntity(0, TEAM_ATK, true, 'You');
  st.entities.push(player);
  st.player = player;
  let id = 1;
  for (let i = 0; i < teamSize - 1; i += 1) st.entities.push(makeEntity(id++, TEAM_ATK, false, NAMES_ATK[i % 3]));
  for (let i = 0; i < teamSize; i += 1) st.entities.push(makeEntity(id++, TEAM_DEF, false, NAMES_DEF[i % 3]));
  return st;
}

/** A round's opening loadout: pistol out, rifle gone, money and score carried over. */
export function resetEntityForRound(e) {
  e.health = 100;
  e.alive = true;
  e.armour = 0;
  e.hasKit = false;
  e.hasBomb = false;
  e.inv = emptyInventory();
  e.inv[1].mag = PISTOL_START.mag;
  e.inv[1].reserve = PISTOL_START.reserve;
  e.inv[2].mag = 1;
  e.weapon = 1;
  e.shotTimer = 0;
  e.reloadTimer = 0;
  e.reloading = false;
  e.spread = 0;
  e.shotSpread = 0;
  e.recoilPitch = 0;
  e.recoilYaw = 0;
  e.recoilIndex = 0;
  e.recoilHold = 0;
  e.trigger = false;
  e.flash = 0;
  e.vx = 0; e.vy = 0; e.vz = 0;
  e.crouching = false;
  e.crouchT = 0;
  e.height = 1.74;
  e.eye = 1.6;
  e.path = [];
  e.pathStep = 0;
  e.targetId = -1;
  e.targetSeen = -99;
  e.alertTimer = 0;
  e.burstLeft = 0;
  e.burstCooldown = 0;
  e.roundKills = 0;
}

/** Place a body on a spawn point, facing where the spawn faces. */
export function placeOnSpawn(e, spawn) {
  e.x = spawn.x;
  e.y = 0;
  e.z = spawn.z;
  e.px = e.x;
  e.py = e.y;
  e.pz = e.z;
  e.yaw = spawn.yaw;
  e.pitch = 0;
  e.aimYaw = spawn.yaw;
  e.aimPitch = 0;
  e.vy = 0;
}
