// Pure, THREE-free procedural map generator.
// Returns mirror-symmetric wall definitions + spawn points from a seed, so a
// host and every joiner build the identical layout. No GPU / DOM dependency →
// unit-testable in plain Node (see scripts/test-mapgen.mjs).

// ── Seeded RNG (mulberry32) ──────────────────────────────────────────────────
export function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PI = Math.PI;

// ── Map dimensions (mirror axis is x = 0) ────────────────────────────────────
export const HX = 18;   // half width  → map spans x ∈ [-18, 18]
export const HZ = 13;   // half depth  → map spans z ∈ [-13, 13]
const WALL_H = 3;       // full wall height
const LOW_H  = 1.1;     // crouch-height cover
const DOOR_W = 1.6;     // doorway gap

// Interior grid-line positions from `start` to `end` split into `n` cells, with
// the interior lines jittered so rooms vary in size (a non-straight layout).
// Always strictly increasing with a minimum cell size → walls never cross.
function linePositions(rng, start, end, n, jitter) {
  const span = end - start, minGap = 2.6;
  const out = [start];
  for (let i = 1; i < n; i++) {
    const base = start + (span * i) / n;
    let p = base + (rng() * 2 - 1) * jitter;
    p = Math.max(out[i - 1] + minGap, Math.min(p, end - minGap * (n - i)));
    out.push(p);
  }
  out.push(end);
  return out;
}

function pickType(rng) {
  const r = rng();
  if (r < 0.35) return 'thin';
  if (r < 0.80) return 'medium';
  return 'concrete';
}

// Outer concrete perimeter (4 walls).
function perimeter(defs) {
  defs.push(
    { type: 'concrete', w: 2 * HX, h: WALL_H, pos: [0, WALL_H / 2, -HZ], rot: [0, 0, 0]     }, // N
    { type: 'concrete', w: 2 * HX, h: WALL_H, pos: [0, WALL_H / 2,  HZ], rot: [0, PI, 0]     }, // S
    { type: 'concrete', w: 2 * HZ, h: WALL_H, pos: [-HX, WALL_H / 2, 0], rot: [0,  PI / 2, 0] }, // W
    { type: 'concrete', w: 2 * HZ, h: WALL_H, pos: [ HX, WALL_H / 2, 0], rot: [0, -PI / 2, 0] }, // E
  );
}

// Add a wall segment, optionally with a centred doorway gap.
//   orient: 'v' runs along z (normal ±x), 'h' runs along x (normal ±z)
function segment(defs, orient, line, center, length, type, h, hasDoor) {
  const make = (c, len) => {
    if (len < 0.25) return;
    if (orient === 'v') defs.push({ type, w: len, h, pos: [line, h / 2, c], rot: [0, PI / 2, 0] });
    else                defs.push({ type, w: len, h, pos: [c, h / 2, line], rot: [0, 0, 0] });
  };
  if (!hasDoor) { make(center, length); return; }
  if (length <= DOOR_W) return;
  const stub = (length - DOOR_W) / 2;
  make(center - (DOOR_W + stub) / 2, stub);
  make(center + (DOOR_W + stub) / 2, stub);
}

// Mirror every left-half (x < 0) def onto the right half.
function mirror(defs) {
  const n = defs.length;
  for (let i = 0; i < n; i++) {
    const d = defs[i];
    if (d.pos[0] === 0) continue;
    defs.push({ type: d.type, w: d.w, h: d.h,
                pos: [-d.pos[0], d.pos[1], d.pos[2]], rot: d.rot.slice() });
  }
}

// ── CQB layout: grid of enclosed rooms + doorways (maze-connected) ───────────
function generateCQB(rng) {
  const defs = [];

  const CENTER_HALF = 2.5;               // central corridor x ∈ [-2.5, 2.5]
  const COLS = 3, ROWS = 4;              // fewer cells → ~2× larger rooms

  // Jittered interior grid lines → irregular, non-straight rooms.
  const xs = linePositions(rng, -HX, -CENTER_HALF, COLS, 1.9); // length COLS+1
  const zs = linePositions(rng, -HZ,  HZ,          ROWS, 2.4); // length ROWS+1
  const cellCX = (c) => (xs[c] + xs[c + 1]) / 2;
  const cellCZ = (r) => (zs[r] + zs[r + 1]) / 2;

  // Maze (randomised DFS) → spanning tree over all left cells
  const idx = (c, r) => c + r * COLS;
  const visited = new Array(COLS * ROWS).fill(false);
  const passV = Array.from({ length: COLS + 1 }, () => new Array(ROWS).fill(false));
  const passH = Array.from({ length: COLS },     () => new Array(ROWS + 1).fill(false));

  const startR = Math.floor(ROWS / 2);
  const stack = [[0, startR]];
  visited[idx(0, startR)] = true;
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const nb = [];
    if (c > 0        && !visited[idx(c - 1, r)]) nb.push([c - 1, r]);
    if (c < COLS - 1 && !visited[idx(c + 1, r)]) nb.push([c + 1, r]);
    if (r > 0        && !visited[idx(c, r - 1)]) nb.push([c, r - 1]);
    if (r < ROWS - 1 && !visited[idx(c, r + 1)]) nb.push([c, r + 1]);
    if (nb.length === 0) { stack.pop(); continue; }
    const [nc, nr] = nb[Math.floor(rng() * nb.length)];
    if (nc !== c) passV[Math.max(c, nc)][r] = true;
    else          passH[c][Math.max(r, nr)] = true;
    visited[idx(nc, nr)] = true;
    stack.push([nc, nr]);
  }
  // Extra doorways for loops (fewer dead ends)
  for (let k = 0; k < 3; k++) {
    const c = 1 + Math.floor(rng() * (COLS - 1));
    const r = Math.floor(rng() * ROWS);
    passV[c][r] = true;
  }

  // Vertical interior walls (cc==COLS opens rooms to the central corridor)
  for (let cc = 1; cc <= COLS; cc++) {
    for (let r = 0; r < ROWS; r++) {
      const door = cc === COLS ? true : passV[cc][r];
      segment(defs, 'v', xs[cc], cellCZ(r), zs[r + 1] - zs[r], pickType(rng), WALL_H, door);
    }
  }
  // Horizontal interior walls (room region only)
  for (let rr = 1; rr < ROWS; rr++) {
    for (let c = 0; c < COLS; c++) {
      segment(defs, 'h', zs[rr], cellCX(c), xs[c + 1] - xs[c], pickType(rng), WALL_H, passH[c][rr]);
    }
  }

  mirror(defs);
  perimeter(defs);

  // Central cover (on the axis → symmetric)
  defs.push({ type: 'concrete', w: 2.6, h: LOW_H,  pos: [0, LOW_H / 2, 0], rot: [0, 0, 0] });
  defs.push({ type: 'medium',   w: 1.8, h: WALL_H, pos: [0, WALL_H / 2, zs[1]], rot: [0, PI / 2, 0] });
  defs.push({ type: 'medium',   w: 1.8, h: WALL_H, pos: [0, WALL_H / 2, zs[ROWS - 1]], rot: [0, PI / 2, 0] });

  const mid = Math.floor(ROWS / 2), last = ROWS - 1;
  const spawns = [
    [cellCX(0), cellCZ(0)], [cellCX(0), cellCZ(mid)], [cellCX(0), cellCZ(last)],
    [-cellCX(0), cellCZ(0)], [-cellCX(0), cellCZ(mid)], [-cellCX(0), cellCZ(last)],
  ];
  return { defs, spawns };
}

// ── Open layout: scattered symmetric cover (paintball-style) ─────────────────
function generateOpen(rng) {
  const defs = [];

  const COLS = 5, ROWS = 6;
  const regionW = HX - 1.5;
  const slotW = regionW / COLS;
  const slotD = (2 * HZ) / ROWS;
  const slotCX = (c) => -HX + (c + 0.5) * slotW;
  const slotCZ = (r) => -HZ + (r + 0.5) * slotD;

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (rng() < 0.5) continue;
      const len    = 1.8 + rng() * 1.0;
      const tall   = rng() < 0.45;
      const h      = tall ? 2.6 : LOW_H;
      const orient = rng() < 0.5 ? 'v' : 'h';
      const type   = pickType(rng);
      const line   = orient === 'v' ? slotCX(c) : slotCZ(r);
      const center = orient === 'v' ? slotCZ(r) : slotCX(c);
      segment(defs, orient, line, center, len, type, h, false);
    }
  }

  mirror(defs);
  perimeter(defs);

  defs.push({ type: 'concrete', w: 2.4, h: LOW_H,  pos: [0, LOW_H / 2, 0], rot: [0, 0, 0] });
  defs.push({ type: 'medium',   w: 2.4, h: WALL_H, pos: [0, WALL_H / 2, -6], rot: [0, PI / 2, 0] });
  defs.push({ type: 'medium',   w: 2.4, h: WALL_H, pos: [0, WALL_H / 2,  6], rot: [0, PI / 2, 0] });

  const spawns = [
    [-15, -8], [-15, 0], [-15, 8],
    [ 15, -8], [ 15, 0], [ 15, 8],
  ];
  return { defs, spawns };
}

// Generate a complete map from a seed string.
export function generateMap(seed = 'default') {
  const rng = mulberry32(hashStr(String(seed)));
  const style = rng() < 0.5 ? 'cqb' : 'open';
  const { defs, spawns } = style === 'cqb' ? generateCQB(rng) : generateOpen(rng);
  return { style, defs, spawns };
}
