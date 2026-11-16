// Boot, wiring, and the one loop. The loop never simulates: it feeds the fixed step, then draws the
// state that step produced. Everything the game owns — the world, the bodies, the effects, the HUD —
// is built once here and handed to the modules that animate it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createScene } from './render/scene.js';
import { createWorld } from './world/world.js';
import { createEffects } from './render/effects.js';
import { createActor, poseActor } from './render/actors.js';
import { createViewModel } from './weapons/viewmodel.js';
import { createHud } from './hud/hud.js';
import { createAudio } from './audio/audio.js';
import { createInput } from './input.js';
import {
  createState, TICK, EVENT_CAPACITY, PHASE_BUY, PHASE_MATCH_END, TEAM_ATK,
} from './sim/state.js';
import { createCollision } from './sim/physics.js';
import { createNav } from './ai/nav.js';
import { createSim, createCommand } from './sim/step.js';
import { BUY_ITEMS } from './match/match.js';
import { WEAPONS } from './weapons/defs.js';
import { spreadOf, switchTo } from './weapons/combat.js';
import { MAP } from './world/map.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const view = createScene(document.getElementById('game'));
const { renderer, scene, camera } = view;
const world = createWorld(scene);
const effects = createEffects(scene);
const st = createState(seed, 3);
const col = createCollision();
const nav = createNav();
const sim = createSim(st, col, nav);
const viewmodel = createViewModel(camera);
const hud = createHud();
const audio = createAudio();
const cmd = createCommand();

// One figure per body. The player's own figure stays hidden — the camera is their body.
const actors = [];
for (const e of st.entities) {
  const actor = createActor(e.team, e.isPlayer);
  actor.root.visible = !e.isPlayer;
  scene.add(actor.root);
  actors.push(actor);
}

// The charge, on the floor or in the site, with a light that blinks faster as the fuse burns.
const bombGroup = new THREE.Group();
const bombShell = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.24, 0.26),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c4247'), roughness: 0.8, metalness: 0.3 }),
);
const bombBand = new THREE.Mesh(
  new THREE.BoxGeometry(0.36, 0.05, 0.28),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 2 }),
);
bombBand.position.y = 0.05;
const bombLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 7, 2);
bombLight.position.y = 0.45;
bombGroup.add(bombShell, bombBand, bombLight);
bombGroup.visible = false;
scene.add(bombGroup);

// Grenades in flight, drawn from a small pool rather than made per throw.
const grenadeMeshes = [];
const grenadeGeo = new THREE.SphereGeometry(0.075, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c4247'), roughness: 0.7, metalness: 0.4 });
for (let i = 0; i < 6; i += 1) {
  const m = new THREE.Mesh(grenadeGeo, grenadeMat);
  m.visible = false;
  scene.add(m);
  grenadeMeshes.push(m);
}

let started = false;
let buyMenuOpen = false;
let muted = false;
let read = 0;
let accumulator = 0;
let alpha = 0;
let lastTime = performance.now();

const input = createInput(renderer.domElement, {
  onLockChange(locked) {
    if (shotMode) return;
    if (locked) {
      started = true;
      hud.hideOverlay();
    } else if (st.phase !== PHASE_MATCH_END) {
      hud.showOverlay('pause', { atk: st.scoreAtk, def: st.scoreDef, round: st.round });
    }
  },
  onClick() {
    if (shotMode) return;
    audio.init();
    if (st.phase === PHASE_MATCH_END) restartMatch();
    input.requestLock();
  },
  onKey(code) {
    if (code === 'KeyM') muted = !muted;
    if (code === 'Escape' && !shotMode) input.release();
  },
});

const right = new THREE.Vector3();
const muzzle = new THREE.Vector3();

function panOf(x, z) {
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  const dx = x - camera.position.x;
  const dz = z - camera.position.z;
  const len = Math.hypot(dx, dz) || 1;
  return Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / len));
}

function nameOf(id) {
  const e = st.entities[id];
  return e ? e.name : '—';
}

/** Drain the simulation's event ring: sound, light, and the pieces of HUD a step can produce. */
function drainEvents() {
  let guard = 0;
  while (read !== st.eventWrite && guard < EVENT_CAPACITY) {
    const e = st.events[read];
    read = (read + 1) % EVENT_CAPACITY;
    guard += 1;
    const dist = Math.hypot(e.x - camera.position.x, e.z - camera.position.z);
    const level = muted ? 0 : Math.max(0, 1 - dist / 44);
    switch (e.type) {
      case 'shot': {
        const w = WEAPONS[e.b] || WEAPONS[0];
        audio.play(w.kind === 'melee' ? 'knife' : w.sound, panOf(e.x, e.z), level);
        if (e.a === st.player.id) {
          viewmodel.fire(0.9);
          viewmodel.muzzleWorld(muzzle);
          effects.spark(muzzle.x, muzzle.y, muzzle.z, 0, 0, -1, 4);
        } else {
          effects.spark(e.x, e.y, e.z, 0, 0.2, 0, 3);
        }
        break;
      }
      case 'trace':
        effects.tracer(e.x, e.y, e.z, e.a, e.b, e.c, e.d);
        break;
      case 'impact':
        if (e.d === 2) {
          effects.spark(e.x, e.y, e.z, 0, 0.45, 0, 6);
        } else {
          effects.decal(e.x, e.y, e.z, e.a, e.b, e.c, 1);
          effects.spark(e.x, e.y, e.z, e.a, Math.abs(e.b) + 0.3, e.c, 4);
        }
        break;
      case 'hit':
        if (e.a === st.player.id) hud.hit(e.c === 1, false);
        if (e.b === st.player.id) {
          audio.play('flesh', 0, level);
          actors[0].flashT = 0.5;
        }
        break;
      case 'kill': {
        const killerTeam = e.a >= 0 ? st.entities[e.a].team : TEAM_ATK;
        hud.feed(nameOf(e.a >= 0 ? e.a : e.b), nameOf(e.b), WEAPONS[e.d] ? WEAPONS[e.d].name : '—', e.c === 1, killerTeam);
        if (e.a === st.player.id) hud.hit(e.c === 1, true);
        audio.play('headshot', panOf(e.x, e.z), level);
        if (e.a !== st.player.id && e.b === st.player.id) st.shake = 0.8;
        break;
      }
      case 'step':
        if (e.a === st.player.id) audio.play('step', 0, level);
        else audio.play('step', panOf(e.x, e.z), level * 0.8);
        break;
      case 'dry':
        if (e.a === st.player.id) audio.play('dry');
        break;
      case 'throw':
      case 'swing':
        if (e.a === st.player.id) audio.play('knife', 0, level);
        break;
      case 'knifehit':
        audio.play('flesh', panOf(e.x, e.z), level);
        break;
      case 'beep':
        audio.play('beep', panOf(e.x, e.z), e.a === 1 ? 0.9 : 0.35);
        break;
      case 'planted':
        audio.play('plant', 0.3, 0.8);
        hud.banner('CHARGE ARMED', `${MAP.site.name} · hold it`, true, 2.2);
        break;
      case 'defused':
        audio.play('defused', 0.3, 0.8);
        hud.banner('CHARGE DEFUSED', 'the site is held', false, 2.2);
        break;
      case 'explode':
        audio.play('explode', 0.3, 1);
        effects.blast(e.x, e.y + 0.4, e.z, 9);
        st.shake = 1;
        break;
      case 'flash':
        audio.play('flash', panOf(e.x, e.z), level);
        effects.blast(e.x, e.y, e.z, 3);
        break;
      case 'blinded':
        audio.play('ring');
        break;
      case 'roundStart':
        if (started) {
          hud.banner(`ROUND ${st.round}`, `Raiders ${st.scoreAtk} — ${st.scoreDef} Wardens`, undefined, 2.2);
          audio.play('roundStart', 0, 0.7);
        }
        break;
      case 'live':
        if (started) hud.banner('GO', 'the charge is in play', undefined, 1.2);
        break;
      case 'roundWin':
        hud.banner(e.a === TEAM_ATK ? 'ROUND WON' : 'ROUND LOST', st.roundReason, e.a === TEAM_ATK, 2.8);
        audio.play(e.a === TEAM_ATK ? 'win' : 'lose', 0, 0.8);
        break;
      case 'matchEnd':
        hud.showOverlay('end', {
          won: e.a > e.b,
          atk: st.scoreAtk,
          def: st.scoreDef,
          kills: st.player.kills,
          heads: st.stats.headshots,
          acc: st.stats.shots ? Math.round((st.stats.hits / st.stats.shots) * 100) : 0,
        });
        input.release();
        break;
      case 'buy':
        if (e.a === st.player.id) audio.play('buy', 0, 0.6);
        break;
      default:
        break;
    }
  }
  if (st.eventWrite === read) st.eventCount = 0;
}

/** Input to command: one direction, four booleans, one slot. The whole interface to the sim. */
function readInput() {
  const player = st.player;
  const look = input.consumeLook();
  cmd.lookX = look.x;
  cmd.lookY = look.y;
  player.lookDx += look.x;
  player.lookDy += look.y;
  cmd.forward = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
  cmd.strafe = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
  cmd.crouch = input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyC');
  cmd.walk = input.down('ShiftLeft') || input.down('ShiftRight');
  cmd.jump = input.down('Space');
  cmd.reload = input.down('KeyR');
  cmd.use = input.down('KeyE') || input.state.using;
  cmd.fire = input.state.firing;

  for (let i = 0; i < 4; i += 1) {
    if (!input.took(`Digit${i + 1}`)) continue;
    if (st.phase === PHASE_BUY) {
      // Re-render the menu after a buy so the card that just became unaffordable greys out.
      if (sim.match.buy(st, player, i)) {
        audio.play('buy', 0, 0.6);
        hud.showBuy(true, BUY_ITEMS, player);
      }
    } else cmd.slot = i;
  }
  if (input.took('KeyG') && player.inv[3].mag > 0 && player.alive) cmd.grenade = true;
  if (input.took('KeyQ') && player.alive) {
    const other = player.weapon === 0 ? 1 : 0;
    cmd.slot = player.inv[other].owned ? other : 2;
  }
}

function syncActors(blend) {
  for (let i = 0; i < actors.length; i += 1) {
    const e = st.entities[i];
    if (e.isPlayer) continue;
    poseActor(actors[i], e, blend);
  }
}

function syncBomb(now) {
  const b = st.bomb;
  const visible = b.state === 'planted' || b.state === 'dropped' || b.state === 'defused';
  bombGroup.visible = visible;
  if (!visible) return;
  bombGroup.position.set(b.x, b.y + 0.13, b.z);
  bombGroup.rotation.y = b.state === 'dropped' ? 0.6 : 0;
  const blink = b.state === 'planted' ? (Math.sin(now * (b.timer < 10 ? 24 : 9)) > 0 ? 1 : 0) : 0;
  bombBand.material.emissiveIntensity = 0.5 + blink * 3.5;
  bombLight.intensity = blink * (b.timer < 10 ? 7 : 3);
  bombLight.color.setHex(b.state === 'defused' ? 0x3fa39b : 0xd9663a);
}

function syncGrenades() {
  for (let i = 0; i < grenadeMeshes.length; i += 1) {
    const p = st.projectiles[i];
    grenadeMeshes[i].visible = !!p;
    if (p) grenadeMeshes[i].position.set(p.x, p.y, p.z);
  }
}

function syncCamera(blend, now) {
  const p = st.player;
  const x = p.px + (p.x - p.px) * blend;
  const y = p.py + (p.y - p.py) * blend;
  const z = p.pz + (p.z - p.pz) * blend;
  if (!p.alive) {
    camera.position.set(x, y + 0.32, z);
    camera.rotation.set(-0.32, p.yaw, 0.6, 'YXZ');
    return;
  }
  const shake = st.shake * 0.05;
  camera.position.set(
    x + Math.sin(now * 51) * shake,
    y + p.eye + Math.sin(now * 33) * shake + Math.sin(p.bob * 1.6) * 0.011 * Math.min(1, p.speed / 5),
    z + Math.cos(now * 47) * shake,
  );
  camera.rotation.set(p.pitch + p.recoilPitch, p.yaw + p.recoilYaw, 0, 'YXZ');
}

function restartMatch() {
  sim.match.restart(st, col, nav);
  hud.reset();
  for (const a of actors) {
    a.death = 0;
    a.rig.rotation.x = 0;
  }
  accumulator = 0;
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (nowMs - lastTime) / 1000);
  lastTime = nowMs;
  const now = nowMs / 1000;

  const running = started && input.state.locked && st.phase !== PHASE_MATCH_END;
  if (running) {
    readInput();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= TICK && steps < 5) {
      sim.step(TICK, cmd);
      accumulator -= TICK;
      steps += 1;
    }
    if (accumulator > TICK * 5) accumulator = 0;
    alpha = accumulator / TICK;
    input.endFrame();
  } else {
    alpha = 1;
    cmd.lookX = 0;
    cmd.lookY = 0;
    input.endFrame();
  }

  drainEvents();
  syncCamera(alpha, now);
  syncActors(alpha);
  syncBomb(now);
  syncGrenades();
  viewmodel.update(dt, st.player);
  viewmodel.setReload(st.player.reloading ? 1 - st.player.reloadTimer / (WEAPONS[st.player.weapon].reload || 1) : 0);
  viewmodel.setSlot(st.player.weapon);
  effects.update(dt);
  renderer.render(scene, camera);

  const me = st.player;
  hud.update(st, me, spreadOf(me, WEAPONS[me.weapon]), me.flash, dt);
  // The buy menu belongs to the buy phase and nothing else: it opens with the round and closes when
  // the clock turns live, so it can never sit on top of a firefight.
  const buying = st.phase === PHASE_BUY && started;
  if (buying !== buyMenuOpen) {
    buyMenuOpen = buying;
    hud.showBuy(buying, BUY_ITEMS, me);
  }
}

// `node serve.ts`, open the page, click. `?shot=start|play|end` draws a still instead.
if (shotMode) {
  setupShot(shotMode, { st, sim, hud, camera, scene, renderer, actors, effects, viewmodel, col, nav, now: performance.now() / 1000 });
} else {
  sim.match.beginRound(st, col, nav, true);
  hud.showOverlay('start');
  hud.showBuy(true, BUY_ITEMS, st.player);
  requestAnimationFrame(frame);
}

// Handy for the operator's own screenshots and for a smoke test from the console.
window.game = { st, sim, col, nav, view, restart: restartMatch, hud, BUY_ITEMS };
