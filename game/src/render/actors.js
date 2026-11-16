// Bodies on screen: one low-poly figure per entity, built from boxes so the art matches the map's
// language and the hitboxes match the model. A dead body falls over and stays; a crouched one
// shrinks vertically, which is exactly what its hitbox does too.
import * as THREE from 'three';
import { PALETTE, TEAM_COLOR } from '../palette.js';

const STAND = 1.74;

function boxPart(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A figure: legs, torso, arms, head, a slung rifle and a team band. */
export function createActor(team, isPlayer) {
  // A body is a dark silhouette with one bright team mark, so it reads against both the pale walls
  // and the deep floor. Never the wall colour: a figure must not dissolve into the architecture.
  const cloth = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#333f44'), roughness: 0.9, metalness: 0.05,
  });
  const armourMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 0 ? '#4a2f26' : '#20393c'), roughness: 0.75, metalness: 0.2,
  });
  const teamMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(TEAM_COLOR[team]), emissive: new THREE.Color(TEAM_COLOR[team]),
    emissiveIntensity: 1.1, roughness: 0.45, metalness: 0.1,
  });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a6455'), roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.45, metalness: 0.7 });

  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const legL = boxPart(0.17, 0.78, 0.2, cloth);
  const legR = boxPart(0.17, 0.78, 0.2, cloth);
  legL.position.set(-0.12, 0.39, 0);
  legR.position.set(0.12, 0.39, 0);
  rig.add(legL, legR);

  const torso = boxPart(0.48, 0.62, 0.3, armourMat);
  torso.position.set(0, 1.12, 0);
  rig.add(torso);

  const belt = boxPart(0.5, 0.09, 0.32, teamMat);
  belt.position.set(0, 0.83, 0);
  rig.add(belt);

  const armL = boxPart(0.13, 0.5, 0.15, cloth);
  const armR = boxPart(0.13, 0.5, 0.15, cloth);
  armL.position.set(-0.3, 1.16, 0.02);
  armR.position.set(0.3, 1.16, 0.02);
  rig.add(armL, armR);

  const head = boxPart(0.26, 0.3, 0.26, skin);
  head.position.set(0, 1.6, 0);
  rig.add(head);

  const visor = boxPart(0.28, 0.07, 0.06, teamMat);
  visor.position.set(0, 1.63, -0.13);
  rig.add(visor);

  const helmet = boxPart(0.3, 0.12, 0.3, armourMat);
  helmet.position.set(0, 1.75, 0);
  rig.add(helmet);

  const gun = boxPart(0.07, 0.1, 0.62, steel);
  gun.position.set(0.14, 1.2, -0.28);
  gun.rotation.y = 0.12;
  rig.add(gun);

  root.visible = isPlayer;
  return {
    root, rig, legL, legR, armL, armR, head, torso, gun,
    cloth, armourMat, teamMat, skin,
    walk: 0,
    death: 0,
    flashT: 0,
  };
}

/** Push one entity into its figure. `alpha` blends the previous tick for a smooth render. */
export function poseActor(actor, e, alpha) {
  const x = e.px + (e.x - e.px) * alpha;
  const y = e.py + (e.y - e.py) * alpha;
  const z = e.pz + (e.z - e.pz) * alpha;
  actor.root.position.set(x, y, z);
  actor.root.rotation.y = e.yaw;

  if (!e.alive) {
    // a body drops: rotate onto its back over a quarter second, then stay there
    actor.death = Math.min(1, actor.death + 0.045);
    actor.rig.rotation.x = -actor.death * 1.52;
    actor.rig.position.y = actor.death * 0.1;
    actor.legL.rotation.x *= 0.9;
    actor.legR.rotation.x *= 0.9;
    actor.armL.rotation.z = actor.death * 0.7;
    actor.armR.rotation.z = -actor.death * 0.7;
    actor.root.scale.y = 1;
    return;
  }
  actor.death = 0;
  actor.rig.rotation.x = 0;
  actor.rig.position.y = 0;

  // crouch squashes the whole figure, so the head lands where the head hitbox is
  const squash = e.height / STAND;
  actor.root.scale.y = squash;

  const speed = e.speed;
  actor.walk += speed * 0.028;
  const swing = Math.min(1, speed / 5.0) * 0.55;
  actor.legL.rotation.x = Math.sin(actor.walk) * swing;
  actor.legR.rotation.x = -Math.sin(actor.walk) * swing;
  actor.armL.rotation.x = -Math.sin(actor.walk) * swing * 0.6;
  actor.armR.rotation.x = Math.sin(actor.walk) * swing * 0.4;
  actor.rig.rotation.z = Math.sin(actor.walk * 0.5) * 0.02 * swing;

  // a hit lights the armour up for a moment, so a trade reads even without sound
  if (actor.flashT > 0) {
    actor.flashT -= 0.06;
    actor.armourMat.emissive.setHex(0xd9663a);
    actor.armourMat.emissiveIntensity = Math.max(0, actor.flashT) * 2.2;
  } else if (actor.armourMat.emissiveIntensity !== 0) {
    actor.armourMat.emissiveIntensity = 0;
  }
}
