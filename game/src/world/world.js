// The world as three.js sees it: one mesh per box in the map table, one wedge per ramp, the
// stencilled plant zone, and the light rig that decides how the whole palette reads. Collision
// already knows these boxes; this file only gives them a surface, so the two can never disagree.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { MAP, siteRect } from './map.js';
import { concreteTexture, panelTexture, crateTexture, steelTexture, siteTexture } from './textures.js';

/** A wedge from a map ramp entry: a triangular prism whose top runs from y0 up to y0 + h. */
function wedgeGeometry(r) {
  const x0 = r.x - r.w / 2;
  const x1 = r.x + r.w / 2;
  const lowZ = r.dir === '-z' ? r.z + r.d / 2 : r.z - r.d / 2;
  const highZ = r.dir === '-z' ? r.z - r.d / 2 : r.z + r.d / 2;
  const y0 = r.y0;
  const y1 = r.y0 + r.h;
  const faces = [
    // sloped top, two triangles
    x0, y0, lowZ, x1, y0, lowZ, x1, y1, highZ,
    x0, y0, lowZ, x1, y1, highZ, x0, y1, highZ,
    // the floor of the prism
    x0, y0, lowZ, x1, y0, highZ, x1, y0, lowZ,
    x0, y0, lowZ, x0, y0, highZ, x1, y0, highZ,
    // the tall back wall, flush with whatever the ramp climbs to
    x0, y0, highZ, x1, y0, highZ, x1, y1, highZ,
    x0, y0, highZ, x1, y1, highZ, x0, y1, highZ,
    // the two triangular sides
    x0, y0, lowZ, x0, y0, highZ, x0, y1, highZ,
    x1, y0, lowZ, x1, y1, highZ, x1, y0, highZ,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faces), 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  group.name = 'foundry';
  scene.add(group);

  const concrete = concreteTexture();
  const panel = panelTexture();
  const crate = crateTexture();
  const steel = steelTexture();

  const materials = {
    deep: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.deep), map: concrete, roughness: 0.96, metalness: 0.04 }),
    surface: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), map: panel, roughness: 0.86, metalness: 0.12 }),
    hairline: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), map: crate, roughness: 0.92, metalness: 0.05 }),
    steel: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), map: steel, roughness: 0.72, metalness: 0.3 }),
    accent: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), map: steel, roughness: 0.6, metalness: 0.3 }),
    teal: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.5, metalness: 0.3 }),
  };

  const geoCache = new Map();
  function boxGeometry(w, h, d) {
    const key = `${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`;
    let g = geoCache.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(w, h, d);
      geoCache.set(key, g);
    }
    return g;
  }

  for (const b of MAP.boxes) {
    const mesh = new THREE.Mesh(boxGeometry(b.w, b.h, b.d), materials[b.mat] ?? materials.surface);
    mesh.position.set(b.x, b.y0 + b.h / 2, b.z);
    mesh.castShadow = b.mat !== 'deep';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }

  for (const r of MAP.ramps) {
    const mesh = new THREE.Mesh(wedgeGeometry(r), materials[r.mat] ?? materials.steel);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }

  // Emissive strips give the halls a scale and a colour temperature without a light each.
  for (const lamp of MAP.lamps) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[lamp.color]),
      emissive: new THREE.Color(PALETTE[lamp.color]),
      emissiveIntensity: 2.2,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(lamp.w, 0.12, lamp.d), mat);
    mesh.position.set(lamp.x, lamp.y, lamp.z);
    group.add(mesh);
  }

  // The plant zone: a stencil on the floor, additive, so it reads from any angle.
  const rect = siteRect();
  const siteMat = new THREE.MeshBasicMaterial({
    map: siteTexture(),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const siteMesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.z1 - rect.z0), siteMat);
  siteMesh.rotation.x = -Math.PI / 2;
  siteMesh.position.set((rect.x0 + rect.x1) / 2, 0.012, (rect.z0 + rect.z1) / 2);
  siteMesh.renderOrder = 2;
  group.add(siteMesh);

  // Light: a cold hemisphere fill for the whole palette, one warm key that casts the shadows.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#9fc0c4'), new THREE.Color('#2d3d43'), 3.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffe9d2'), 3.0);
  key.position.set(16, 26, 18);
  key.target.position.set(-3, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0007;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);

  // Two warm practicals: the site lamp and the mid strip, so the far corners are not flat black.
  const siteLamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 34, 26, 2);
  siteLamp.position.set(-13, 4.4, -13);
  scene.add(siteLamp);
  const midLamp = new THREE.PointLight(new THREE.Color(PALETTE.teal), 20, 20, 2);
  midLamp.position.set(1.4, 3.0, 9);
  scene.add(midLamp);

  return { group, materials, siteMesh, key, hemi };
}
