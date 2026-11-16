// Transient geometry: tracers, impact decals, spark bursts, blast rings. Every pool is built once
// at load and recycled by a rotating index, so a firefight costs zero allocations and the renderer
// never has to sort new objects into the scene graph.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { decalTexture, glowTexture } from '../world/textures.js';

const TRACERS = 40;
const DECALS = 56;
const SPARKS = 200;
const BLASTS = 8;

export function createEffects(scene) {
  // --- tracers: one line segment per shot, faded out over a fifth of a second -------------------
  const tracerPos = new Float32Array(TRACERS * 2 * 3);
  const tracerCol = new Float32Array(TRACERS * 2 * 3);
  const tracerLife = new Float32Array(TRACERS);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
  const tracerMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tracers = new THREE.LineSegments(tracerGeo, tracerMat);
  tracers.frustumCulled = false;
  tracers.renderOrder = 4;
  scene.add(tracers);
  let tracerAt = 0;

  // --- decals: quads laid on the surface a bullet stopped on -----------------------------------
  const decalTex = decalTexture();
  const decalGeo = new THREE.PlaneGeometry(0.17, 0.17);
  const decals = [];
  for (let i = 0; i < DECALS; i += 1) {
    const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      map: decalTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    }));
    m.visible = false;
    m.renderOrder = 3;
    scene.add(m);
    decals.push(m);
  }
  let decalAt = 0;

  // --- sparks: one point cloud, recycled -------------------------------------------------------
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.ink), size: 0.055, map: glowTexture(), transparent: true,
    opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkAt = 0;

  // --- blast rings: a sprite per explosion, scaled and faded ------------------------------------
  const glow = glowTexture();
  const blasts = [];
  for (let i = 0; i < BLASTS; i += 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.visible = false;
    scene.add(s);
    blasts.push({ sprite: s, life: 0, scale: 1 });
  }
  let blastAt = 0;

  const tmpQ = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 0, 1);
  const normal = new THREE.Vector3();

  return {
    tracer(ax, ay, az, bx, by, bz, team) {
      const i = tracerAt % TRACERS;
      tracerAt += 1;
      const p = i * 6;
      tracerPos[p] = ax; tracerPos[p + 1] = ay; tracerPos[p + 2] = az;
      tracerPos[p + 3] = bx; tracerPos[p + 4] = by; tracerPos[p + 5] = bz;
      const c = team === 0 ? 1 : 0.55;
      tracerCol[p] = 1.0 * c; tracerCol[p + 1] = 0.78 * c; tracerCol[p + 2] = 0.52 * c;
      tracerCol[p + 3] = 0.9 * c; tracerCol[p + 4] = 0.55 * c; tracerCol[p + 5] = 0.35 * c;
      tracerLife[i] = 0.075;
      tracerGeo.attributes.position.needsUpdate = true;
      tracerGeo.attributes.color.needsUpdate = true;
    },

    decal(x, y, z, nx, ny, nz, scale = 1) {
      const m = decals[decalAt % DECALS];
      decalAt += 1;
      m.position.set(x + nx * 0.006, y + ny * 0.006, z + nz * 0.006);
      normal.set(nx, ny, nz);
      if (normal.lengthSq() < 0.01) normal.set(0, 1, 0);
      tmpQ.setFromUnitVectors(up, normal.normalize());
      m.quaternion.copy(tmpQ);
      m.scale.setScalar(scale);
      m.material.opacity = 0.95;
      m.visible = true;
    },

    spark(x, y, z, nx, ny, nz, count) {
      for (let k = 0; k < count; k += 1) {
        const i = sparkAt % SPARKS;
        sparkAt += 1;
        const p = i * 3;
        sparkPos[p] = x; sparkPos[p + 1] = y; sparkPos[p + 2] = z;
        const a = Math.random() * Math.PI * 2;
        const r = 0.6 + Math.random() * 2.4;
        sparkVel[p] = nx * 2 + Math.cos(a) * r;
        sparkVel[p + 1] = ny * 2 + Math.random() * 2.6;
        sparkVel[p + 2] = nz * 2 + Math.sin(a) * r;
        sparkLife[i] = 0.28 + Math.random() * 0.25;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },

    blast(x, y, z, scale) {
      const b = blasts[blastAt % BLASTS];
      blastAt += 1;
      b.sprite.position.set(x, y, z);
      b.life = 0.55;
      b.scale = scale;
      b.sprite.visible = true;
      b.sprite.material.opacity = 1;
    },

    update(dt) {
      let dirty = false;
      for (let i = 0; i < TRACERS; i += 1) {
        if (tracerLife[i] <= 0) continue;
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          const p = i * 6;
          for (let k = 0; k < 6; k += 1) tracerCol[p + k] = 0;
          dirty = true;
        }
      }
      if (dirty) tracerGeo.attributes.color.needsUpdate = true;

      for (let i = 0; i < SPARKS; i += 1) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        const p = i * 3;
        sparkVel[p + 1] -= 12 * dt;
        sparkPos[p] += sparkVel[p] * dt;
        sparkPos[p + 1] += sparkVel[p + 1] * dt;
        sparkPos[p + 2] += sparkVel[p + 2] * dt;
        if (sparkLife[i] <= 0) sparkPos[p + 1] = -999;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      for (const m of decals) {
        if (!m.visible) continue;
        m.material.opacity -= dt * 0.06;
        if (m.material.opacity <= 0) m.visible = false;
      }

      for (const b of blasts) {
        if (b.life <= 0) continue;
        b.life -= dt;
        const t = Math.max(0, b.life / 0.55);
        b.sprite.material.opacity = t;
        b.sprite.scale.setScalar(b.scale * (1.6 - t * 0.7));
        if (b.life <= 0) b.sprite.visible = false;
      }
    },
  };
}
