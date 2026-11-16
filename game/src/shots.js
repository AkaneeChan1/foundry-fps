// The still frames. ?shot=start|play|end builds a hand-placed moment out of the same state the game
// runs on, paints it, then tells the capture tool it is ready. Every line writes fields the sim
// owns, so a screenshot shows what a player standing there would see.
import { poseActor } from './render/actors.js';
import { PHASE_LIVE, PHASE_ROUND_END } from './sim/state.js';
import { MAP } from './world/map.js';
import { BUY_ITEMS } from './match/match.js';

// x, z, lookX, lookZ, health, armour — one row per body, in entity order.
const STAGING = {
  start: [
    [0, 17.9, 0, -6, 100, 0],
    [-2.6, 17.2, -3.2, 5, 100, 0],
    [2.6, 17.2, 3.2, 5, 100, 0],
    [14, -17.2, 10, -12, 100, 0],
    [16.4, -16.4, 12, -14, 100, 0],
    [12.6, -14.6, 8, -10, 100, 0],
  ],
  // The camera stands in the east half of Site A, looking down the long axis at the Wardens' hold.
  play: [
    [-8.5, -12.0, -15.5, -11.4, 74, 100],
    [-6.2, -12.6, -14.0, -12.6, 100, 100],
    [-6.4, -10.6, -15.0, -11.0, 100, 50],
    [-15.5, -11.4, -8.5, -12.0, 100, 100],
    [-13.6, -14.4, -8.0, -12.0, 100, 100],
    [-14.6, -9.2, -11.0, -8.4, 0, 0],
  ],
  end: [
    [-8.5, -12.0, -14.6, -9.2, 41, 30],
    [-6.2, -12.6, -13.6, -14.4, 100, 100],
    [-6.4, -10.6, -15.5, -11.4, 0, 0],
    [-15.5, -11.4, -8.5, -12.0, 0, 0],
    [-13.6, -14.4, -8.0, -12.0, 100, 100],
    [-14.6, -9.2, -11.0, -8.4, 0, 0],
  ],
};
const FALLEN = { start: [], play: [5], end: [2, 3, 5] };

/** Put a body in a spot, facing a point, with the loadout a real round would hand it. */
function place(st, id, x, z, lookX, lookZ, health, armour) {
  const e = st.entities[id];
  e.x = x;
  e.z = z;
  e.y = 0;
  e.px = x;
  e.py = 0;
  e.pz = z;
  e.vx = 0;
  e.vy = 0;
  e.vz = 0;
  e.yaw = Math.atan2(-(lookX - x), -(lookZ - z));
  e.aimYaw = e.yaw;
  e.pitch = 0;
  e.health = health;
  e.armour = armour;
  e.alive = health > 0;
  e.height = 1.74;
  e.eye = 1.62;
  e.crouching = false;
  e.crouchT = 0;
  e.speed = 0;
  e.inv[0].owned = true;
  e.inv[0].mag = 21;
  e.inv[0].reserve = 60;
  e.inv[1].mag = 12;
  e.inv[1].reserve = 48;
  e.inv[3].owned = true;
  e.inv[3].mag = 1;
  e.weapon = 0;
  e.flash = 0;
  e.recoilPitch = 0;
  e.recoilYaw = 0;
  return e;
}

export function setupShot(mode, ctx) {
  const { st, hud, camera, renderer, scene, actors, effects, viewmodel } = ctx;
  st.phase = PHASE_LIVE;
  st.round = 3;
  st.scoreAtk = 2;
  st.scoreDef = 1;
  st.bomb.state = 'carried';
  st.bomb.x = MAP.site.x;
  st.bomb.z = MAP.site.z;

  STAGING[mode].forEach((row, i) => place(st, i, ...row));
  for (const i of FALLEN[mode]) {
    st.entities[i].alive = false;
    st.entities[i].health = 0;
    actors[i].death = 1;
  }
  // the player's body never renders: the camera stands in for it
  actors[0].root.visible = false;

  const me = st.entities[0];
  if (mode === 'start') {
    me.weapon = 1;
    hud.showOverlay('start');
    hud.showBuy(false, BUY_ITEMS, me);
  } else if (mode === 'play') {
    // The Wardens' half of Site A from the east door: the charge is down, two of them hold the
    // crates, one is on the floor, and the crosshair is on the far corner.
    me.weapon = 0;
    me.inv[0].mag = 17;
    me.kills = 6;
    st.stats.shots = 61;
    st.stats.hits = 29;
    st.phaseTime = 47;
    st.bomb.state = 'planted';
    st.bomb.x = -12.2;
    st.bomb.z = -12.6;
    st.bomb.timer = 18.4;
    hud.hideOverlay();
    hud.feed('Vulture', 'Rook', 'VK-7', true, 0);
    hud.feed('You', 'Pike', 'VK-7', false, 0);
    hud.hit(false, false);
    // the fight has already happened: a fresh hole in the wall and dust where a round landed
    effects.decal(-15.32, 1.6, -12.6, 1, 0, 0.2, 1);
    effects.spark(-12.4, 1.1, -12.4, 0, 1, 0, 8);
    effects.update(1 / 60);
  } else {
    st.phase = PHASE_ROUND_END;
    st.phaseTime = 2;
    st.scoreAtk = 5;
    st.scoreDef = 3;
    st.bomb.state = 'planted';
    st.bomb.x = -13;
    st.bomb.z = -13.2;
    st.bomb.timer = 21;
    hud.hideOverlay();
    hud.showOverlay('end', { won: true, atk: 5, def: 3, kills: 6, heads: 21, acc: 48 });
  }

  for (let i = 1; i < actors.length; i += 1) poseActor(actors[i], st.entities[i], 1);
  viewmodel.setSlot(me.weapon);
  viewmodel.update(1 / 60, me);
  hud.update(st, me, 0.004, 0, 0);

  // Nothing here loads asynchronously — every texture is a canvas drawn at boot — so the frame can
  // be painted synchronously and the capture tool never has to wait on a hidden tab's animation
  // frame. Two passes, so a lazily compiled shader in the first does not leave the second blank.
  camera.position.set(me.x, me.y + me.eye, me.z);
  camera.rotation.set(me.pitch + me.recoilPitch, me.yaw + me.recoilYaw, 0, 'YXZ');
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
  // Keep painting while the tab is visible, so a human looking at ?shot=play sees a live still.
  function paint() {
    requestAnimationFrame(paint);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(paint);
}
