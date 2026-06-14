import * as THREE from 'three';

// Procedural surface textures so walls read as real surfaces from every face and
// in any lighting (a flat-shaded solid colour looks "broken" up close / on the
// shadowed back side). One base CanvasTexture per material type, cached; each
// wall clones it (sharing the image) so it can set its own size-based repeat.

const _cache = {};

function makeCanvas(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return cv;
}

// Fill with base colour + per-pixel speckle noise.
function speckle(ctx, size, base, amount) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 2 * amount;
    d[i]     = Math.max(0, Math.min(255, d[i]     + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function makeConcrete(size) {
  const cv = makeCanvas(size), ctx = cv.getContext('2d');
  speckle(ctx, size, '#8c8c8c', 26);
  // Mottled blotches
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 4 + Math.random() * 14;
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '60,60,60' : '160,160,160'},0.06)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // Faint hairline cracks
  ctx.strokeStyle = 'rgba(50,50,50,0.25)'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return cv;
}

function makeWood(size) {
  const cv = makeCanvas(size), ctx = cv.getContext('2d');
  speckle(ctx, size, '#b89060', 16);
  // Vertical grain streaks
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '120,85,45' : '160,125,80'},0.18)`;
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath(); ctx.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= size; y += 8) { xx += (Math.random() - 0.5) * 3; ctx.lineTo(xx, y); }
    ctx.stroke();
  }
  // Plank seams (horizontal)
  ctx.strokeStyle = 'rgba(80,55,30,0.4)'; ctx.lineWidth = 1.5;
  for (let y = size / 3; y < size; y += size / 3) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  return cv;
}

function makeDrywall(size) {
  const cv = makeCanvas(size), ctx = cv.getContext('2d');
  speckle(ctx, size, '#f0dfc0', 12);
  // Subtle panel seam
  ctx.strokeStyle = 'rgba(200,185,155,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.stroke();
  return cv;
}

const BUILDERS = { concrete: makeConcrete, medium: makeWood, thin: makeDrywall };

export function getWallTexture(type) {
  if (_cache[type]) return _cache[type];
  const builder = BUILDERS[type] ?? makeWood;
  const tex = new THREE.CanvasTexture(builder(128));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _cache[type] = tex;
  return tex;
}
