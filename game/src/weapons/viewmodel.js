// The first-person view model: four weapons in the player's hands, one visible at a time, with the
// kick of every shot, the sway of a walk and the dip of a reload. It is parented to the camera, so
// it can never drift out of the view it is meant to be held in.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { glowTexture } from '../world/textures.js';

const REST = new THREE.Vector3(0.245, -0.232, -0.6);

function mat(color, roughness = 0.6, metalness = 0.3) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
}

/** One box, placed: every weapon below is a handful of these, which is all a view model needs. */
function box(w, h, d, material, x, y, z, tilt = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.x = tilt;
  return m;
}

function buildRifle() {
  const g = new THREE.Group();
  const dark = mat('#20302f', 0.75, 0.35);
  const body = mat('#3c5155', 0.55, 0.55);
  const accent = mat(PALETTE.accent, 0.5, 0.3);
  g.add(
    box(0.075, 0.085, 0.4, body, 0, 0, -0.06),        // receiver
    box(0.035, 0.035, 0.44, dark, 0, 0.016, -0.44),   // barrel
    box(0.055, 0.055, 0.2, body, 0, 0.012, -0.28),    // shroud
    box(0.05, 0.17, 0.08, dark, 0, -0.11, -0.02, 0.18),
    box(0.045, 0.14, 0.06, dark, 0, -0.09, 0.12, -0.28),
    box(0.06, 0.07, 0.22, body, 0, -0.01, 0.24),      // stock
    box(0.012, 0.05, 0.012, accent, 0, 0.062, -0.18), // front post
    box(0.008, 0.008, 0.5, accent, 0.04, -0.03, 0),   // sling
  );
  return { group: g, muzzle: new THREE.Vector3(0, 0.016, -0.66) };
}

function buildPistol() {
  const g = new THREE.Group();
  const dark = mat('#20302f', 0.75, 0.35);
  const body = mat('#3c5155', 0.55, 0.55);
  const accent = mat(PALETTE.accent, 0.5, 0.3);
  g.add(
    box(0.05, 0.06, 0.24, body, 0, 0.01, -0.08),
    box(0.045, 0.16, 0.07, dark, 0, -0.1, 0.03, -0.22),
    box(0.012, 0.03, 0.01, accent, 0, -0.04, -0.02),
    box(0.01, 0.01, 0.01, accent, 0, 0.045, -0.18),
  );
  return { group: g, muzzle: new THREE.Vector3(0, 0.01, -0.2) };
}

function buildKnife() {
  const g = new THREE.Group();
  const dark = mat('#20302f', 0.8, 0.2);
  const blade = mat('#9fb4b2', 0.25, 0.9);
  g.add(
    box(0.012, 0.05, 0.3, blade, 0, 0.03, -0.16),
    box(0.012, 0.02, 0.06, blade, 0, 0.018, -0.32, 0.4),
    box(0.03, 0.04, 0.13, dark, 0, 0.01, 0.03),
    box(0.05, 0.015, 0.02, dark, 0, 0.025, -0.04),
  );
  g.rotation.z = 0.12;
  return { group: g, muzzle: new THREE.Vector3(0, 0.02, -0.3) };
}

function buildGrenade() {
  const g = new THREE.Group();
  const shell = mat('#2c4247', 0.85, 0.15);
  const band = mat(PALETTE.accent, 0.5, 0.3);
  g.add(
    box(0.07, 0.1, 0.07, shell, 0, 0, 0),
    box(0.035, 0.03, 0.035, mat('#7d9490', 0.4, 0.7), 0, 0.064, 0),
    box(0.075, 0.012, 0.075, band, 0, 0.03, 0),
  );
  return { group: g, muzzle: new THREE.Vector3(0, 0, -0.1) };
}

export function createViewModel(camera) {
  const root = new THREE.Group();
  // Slightly under life size and set low: it must never eat the sightline it is aiming down.
  root.scale.setScalar(0.84);
  camera.add(root);

  const built = [buildRifle(), buildPistol(), buildKnife(), buildGrenade()];
  for (const b of built) {
    b.group.visible = false;
    b.group.traverse((o) => {
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 10; o.material.depthTest = true; }
    });
    root.add(b.group);
  }
  built[0].group.visible = true;

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color('#ffd9a8'), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.scale.setScalar(0.34);
  root.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color('#ffb072'), 0, 6, 2);
  camera.add(flashLight);

  const state = { slot: 0, kick: 0, kickYaw: 0, flash: 0, swayX: 0, swayY: 0, bob: 0, reload: 0, throw: 0 };

  return {
    state,
    setSlot(slot) {
      if (slot === state.slot) return;
      state.slot = slot;
      for (let i = 0; i < built.length; i += 1) built[i].group.visible = i === slot;
      state.swing = 1;
    },
    fire(kick) {
      state.kick = Math.min(1.4, state.kick + kick);
      state.flash = 1;
    },
    setReload(t) {
      state.reload = t;
    },
    update(dt, player) {
      const model = built[state.slot].group;
      state.kick *= Math.max(0, 1 - dt * 11);
      state.flash = Math.max(0, state.flash - dt * 9);
      state.swayX += (-player.lookDx * 0.0009 - state.swayX) * Math.min(1, dt * 9);
      state.swayY += (player.lookDy * 0.0009 - state.swayY) * Math.min(1, dt * 9);
      player.lookDx = 0;
      player.lookDy = 0;

      const speed = Math.min(1, player.speed / 5.2);
      state.bob += dt * (6 + speed * 9);
      const bobX = Math.cos(state.bob) * 0.011 * speed;
      const bobY = Math.abs(Math.sin(state.bob)) * 0.009 * speed;
      const reloadT = state.reload > 0 ? Math.min(1, state.reload) : 0;

      model.position.set(
        REST.x + state.swayX + bobX,
        REST.y + state.swayY - bobY - reloadT * 0.16 - state.kick * 0.01,
        REST.z + state.kick * 0.09,
      );
      model.rotation.set(
        state.kick * 0.22 - reloadT * 0.7,
        state.swayX * 1.6,
        reloadT * 0.5,
      );

      const muzzle = built[state.slot].muzzle;
      flash.position.set(model.position.x + muzzle.x, model.position.y + muzzle.y, model.position.z + muzzle.z);
      flash.material.opacity = state.flash * 0.9;
      flash.scale.setScalar(0.24 + state.flash * 0.3);
      flash.visible = state.flash > 0.02;
      flashLight.position.copy(flash.position);
      flashLight.intensity = state.flash * 9;
    },
    muzzleWorld(out) {
      const model = built[state.slot].group;
      const muzzle = built[state.slot].muzzle;
      out.set(model.position.x + muzzle.x, model.position.y + muzzle.y, model.position.z + muzzle.z);
      camera.localToWorld(out);
      return out;
    },
  };
}
