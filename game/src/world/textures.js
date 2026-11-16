// Every texture in the game is drawn here, on a canvas, at load: no image file, no network, no
// build step. A seeded hash gives the grain, so the concrete is the same concrete every run and a
// screenshot is reproducible. One grain function, six surfaces, one decal.
import * as THREE from 'three';

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 69069);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function finish(c, repeat) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (repeat) tex.repeat.set(repeat, repeat);
  return tex;
}

/** Value noise, coarse to fine, over a base colour. The workhorse behind every surface. */
function grain(ctx, size, base, amount, seed) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let n = 0;
      let amp = 1;
      let freq = 4;
      let total = 0;
      for (let o = 0; o < 4; o += 1) {
        const gx = Math.floor((x / size) * freq);
        const gy = Math.floor((y / size) * freq);
        const fx = ((x / size) * freq) % 1;
        const fy = ((y / size) * freq) % 1;
        const a = hash(gx, gy, seed + o);
        const b = hash(gx + 1, gy, seed + o);
        const c = hash(gx, gy + 1, seed + o);
        const d2 = hash(gx + 1, gy + 1, seed + o);
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const top = a + (b - a) * sx;
        const bot = c + (d2 - c) * sx;
        n += (top + (bot - top) * sy) * amp;
        total += amp;
        amp *= 0.5;
        freq *= 2;
      }
      n = n / total;
      const shade = 1 + (n - 0.5) * amount;
      const i = (y * size + x) * 4;
      d[i] = Math.min(255, base[0] * shade);
      d[i + 1] = Math.min(255, base[1] * shade);
      d[i + 2] = Math.min(255, base[2] * shade);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Cast concrete for the floor: grain, plus a grid of expansion joints and a few rust blooms. */
export function concreteTexture(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  grain(ctx, size, [214, 216, 212], 0.30, 11);
  ctx.strokeStyle = 'rgba(10,16,19,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(125,148,144,0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  for (let i = 0; i < 7; i += 1) {
    const x = hash(i, 3, 41) * size;
    const y = hash(i, 7, 43) * size;
    const r = 8 + hash(i, 9, 47) * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,72,46,0.16)');
    g.addColorStop(1, 'rgba(150,72,46,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return finish(c, 8);
}

/** Painted steel panel for the walls: grain, a seam, rivets, a scuff along the bottom. */
export function panelTexture(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  grain(ctx, size, [212, 216, 214], 0.24, 23);
  ctx.fillStyle = 'rgba(9,15,18,0.5)';
  ctx.fillRect(0, size - 10, size, 10);
  ctx.fillRect(0, size / 2 - 2, size, 4);
  for (let y = 0; y < 2; y += 1) {
    for (let i = 0; i < 6; i += 1) {
      const x = 20 + i * 43;
      ctx.beginPath();
      ctx.arc(x, y * (size / 2) + 18, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(125,148,144,0.28)';
      ctx.fill();
    }
  }
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(219,231,228,0.06)');
  g.addColorStop(0.5, 'rgba(219,231,228,0)');
  g.addColorStop(1, 'rgba(10,16,19,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, 3);
}

/** A crate: planks, dark banding, a stencilled corner mark. */
export function crateTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  grain(ctx, size, [216, 210, 200], 0.28, 31);
  ctx.strokeStyle = 'rgba(10,16,19,0.55)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, (size / 4) * i);
    ctx.lineTo(size, (size / 4) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(217,102,58,0.5)';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.strokeStyle = 'rgba(10,16,19,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, size - 24, size - 24);
  return finish(c, 2);
}

/** Brushed metal for the catwalks and low walls: horizontal streaks, cold. */
export function steelTexture(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  grain(ctx, size, [206, 212, 214], 0.22, 37);
  for (let i = 0; i < 90; i += 1) {
    const y = hash(i, 1, 53) * size;
    ctx.strokeStyle = `rgba(219,231,228,${0.02 + hash(i, 2, 59) * 0.06})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (hash(i, 3, 61) - 0.5) * 3);
    ctx.stroke();
  }
  return finish(c, 2);
}

/** A bullet hole: a dark core, a bright lip, a spray of dust. Alpha-cut, never a file. */
export function decalTexture(size = 64) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, size / 2);
  g.addColorStop(0, 'rgba(8,12,14,0.95)');
  g.addColorStop(0.28, 'rgba(14,22,25,0.85)');
  g.addColorStop(0.42, 'rgba(190,205,200,0.35)');
  g.addColorStop(0.62, 'rgba(70,90,94,0.14)');
  g.addColorStop(1, 'rgba(70,90,94,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c);
}

/** A soft additive dot: muzzle flash, sparks, the flashbang's burst. */
export function glowTexture(size = 64) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,246,232,1)');
  g.addColorStop(0.25, 'rgba(240,170,110,0.55)');
  g.addColorStop(0.6, 'rgba(200,90,50,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c);
}

/** The plant zone's floor stencil: a dashed ring and a chevron mark, rust on concrete. */
export function siteTexture(size = 512) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  ctx.strokeStyle = 'rgba(217,102,58,0.55)';
  ctx.lineWidth = 10;
  ctx.setLineDash([26, 20]);
  ctx.beginPath();
  ctx.arc(cx, cx, size * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(219,231,228,0.20)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cx, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(217,102,58,0.5)';
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * size * 0.37, cx + Math.sin(a) * size * 0.37);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 8);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return finish(c);
}
