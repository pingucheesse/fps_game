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

// Outer concrete perimeter (4 walls). `fixed` → never trimmed by the resolver.
function perimeter(defs) {
  defs.push(
    { type: 'concrete', w: 2 * HX, h: WALL_H, pos: [0, WALL_H / 2, -HZ], rot: [0, 0, 0],      fixed: true }, // N
    { type: 'concrete', w: 2 * HX, h: WALL_H, pos: [0, WALL_H / 2,  HZ], rot: [0, PI, 0],      fixed: true }, // S
    { type: 'concrete', w: 2 * HZ, h: WALL_H, pos: [-HX, WALL_H / 2, 0], rot: [0,  PI / 2, 0], fixed: true }, // W
    { type: 'concrete', w: 2 * HZ, h: WALL_H, pos: [ HX, WALL_H / 2, 0], rot: [0, -PI / 2, 0], fixed: true }, // E
  );
}

// ── Overlap resolver ─────────────────────────────────────────────────────────
// Detects any pair of walls whose footprints overlap and trims the offending
// wall along its length so it just butts against the other (no shared volume).
// The "poking" wall (the one whose END sits inside the other) is trimmed; at an
// L-corner where both ends meet, the thinner / non-perimeter / vertical wall is
// trimmed. Walls trimmed below MIN_LEN are deleted entirely.
const DEPTH = { thin: 0.04, medium: 0.12, concrete: 0.28 };
const MIN_LEN = 0.3;
const EPS = 1e-3;

const runsAlongX = (d) => Math.abs(Math.sin(d.rot[1])) < 0.5; // true → 'h'

function foot(d) {
  const L = d.w, T = DEPTH[d.type] ?? 0.12, [x, , z] = d.pos;
  return runsAlongX(d)
    ? { x0: x - L / 2, x1: x + L / 2, z0: z - T / 2, z1: z + T / 2 }
    : { x0: x - T / 2, x1: x + T / 2, z0: z - L / 2, z1: z + L / 2 };
}

function overlap(a, b) {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
  if (x1 - x0 <= EPS || z1 - z0 <= EPS) return null;
  return { x0, x1, z0, z1 };
}

// Overlap interval projected onto a wall's running axis, and whether it hits an end.
function span(d, ov) {
  const rx = runsAlongX(d), c = rx ? d.pos[0] : d.pos[2];
  const lo = rx ? ov.x0 : ov.z0, hi = rx ? ov.x1 : ov.z1;
  const a0 = c - d.w / 2, a1 = c + d.w / 2;
  return { lo, hi, a0, a1, ends: lo <= a0 + EPS || hi >= a1 - EPS };
}

function trim(d, ov) {
  const rx = runsAlongX(d), c = rx ? d.pos[0] : d.pos[2];
  let a0 = c - d.w / 2, a1 = c + d.w / 2;
  const lo = rx ? ov.x0 : ov.z0, hi = rx ? ov.x1 : ov.z1;
  const loEnd = lo <= a0 + EPS, hiEnd = hi >= a1 - EPS;
  if (loEnd && hiEnd)      a1 = a0;                       // fully covered → delete
  else if (loEnd)          a0 = hi;                       // retract low end
  else if (hiEnd)          a1 = lo;                       // retract high end
  else if (lo - a0 >= a1 - hi) a1 = lo; else a0 = hi;     // middle → keep larger side
  d.w = a1 - a0;
  const mid = (a0 + a1) / 2;
  if (rx) d.pos[0] = mid; else d.pos[2] = mid;
}

function resolveOverlaps(defs) {
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 0; i < defs.length; i++) {
      const A = defs[i]; if (A._dead) continue;
      for (let j = i + 1; j < defs.length; j++) {
        const B = defs[j]; if (B._dead) continue;
        const ov = overlap(foot(A), foot(B));
        if (!ov) continue;

        let t;                                            // wall to trim
        if (A.fixed && B.fixed) continue;                 // two perimeter ends — leave
        else if (A.fixed) t = B;
        else if (B.fixed) t = A;
        else {
          const sa = span(A, ov), sb = span(B, ov);
          if (sa.ends && !sb.ends) t = A;                 // A pokes into B
          else if (sb.ends && !sa.ends) t = B;
          else if (runsAlongX(A) !== runsAlongX(B)) t = runsAlongX(A) ? B : A; // trim the 'v'
          else t = A.w <= B.w ? A : B;                    // trim the shorter
        }
        trim(t, ov);
        changed = true;
        if (t.w < MIN_LEN) t._dead = true;
      }
    }
    if (!changed) break;
  }
  return defs.filter((d) => !d._dead);
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
  return { style, defs: resolveOverlaps(defs), spawns };
}
