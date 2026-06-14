// Validates the procedural map generator against the design requirements.
//   node scripts/test-mapgen.mjs
import { generateMap, HX, HZ } from '../src/world/mapgen.js';

const DEPTH = { thin: 0.04, medium: 0.12, concrete: 0.28 };
const PLAYER_R = 0.3;

// Footprint AABB of a wall in the XZ plane.
function aabb(d) {
  const L = d.w, T = DEPTH[d.type] ?? 0.12;
  const [x, , z] = d.pos;
  const runsX = Math.abs(Math.sin(d.rot[1])) < 0.5; // rot.y 0 or PI → runs along x
  if (runsX) return { x0: x - L / 2, x1: x + L / 2, z0: z - T / 2, z1: z + T / 2, orient: 'h' };
  return { x0: x - T / 2, x1: x + T / 2, z0: z - L / 2, z1: z + L / 2, orient: 'v' };
}

function overlapArea(a, b) {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return ox > 0 && oz > 0 ? ox * oz : 0;
}

// Flood-fill occupancy grid; returns reachability test fn.
function buildGrid(defs) {
  const RES = 0.2;
  const NX = Math.ceil((2 * HX) / RES), NZ = Math.ceil((2 * HZ) / RES);
  const blocked = new Uint8Array(NX * NZ);
  const toCol = (x) => Math.floor((x + HX) / RES);
  const toRow = (z) => Math.floor((z + HZ) / RES);
  for (const d of defs) {
    const b = aabb(d);
    const c0 = Math.max(0, toCol(b.x0 - PLAYER_R)), c1 = Math.min(NX - 1, toCol(b.x1 + PLAYER_R));
    const r0 = Math.max(0, toRow(b.z0 - PLAYER_R)), r1 = Math.min(NZ - 1, toRow(b.z1 + PLAYER_R));
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) blocked[c + r * NX] = 1;
  }
  function reaches(sx, sz, tx, tz, tolM = RES) {
    const tol = Math.max(1, Math.round(tolM / RES));
    const sc = toCol(sx), sr = toRow(sz), tc = toCol(tx), tr = toRow(tz);
    if (blocked[sc + sr * NX]) return false;
    const seen = new Uint8Array(NX * NZ);
    const stack = [[sc, sr]]; seen[sc + sr * NX] = 1;
    while (stack.length) {
      const [c, r] = stack.pop();
      if (Math.abs(c - tc) <= tol && Math.abs(r - tr) <= tol) return true;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= NX || nr >= NZ) continue;
        const k = nc + nr * NX;
        if (seen[k] || blocked[k]) continue;
        seen[k] = 1; stack.push([nc, nr]);
      }
    }
    return false;
  }
  return { reaches, NX, NZ, blocked, toCol, toRow };
}

function asciiTop(defs) {
  const W = 64, H = 26;
  const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
  for (const d of defs) {
    const b = aabb(d);
    const c0 = Math.round((b.x0 + HX) / (2 * HX) * (W - 1));
    const c1 = Math.round((b.x1 + HX) / (2 * HX) * (W - 1));
    const r0 = Math.round((b.z0 + HZ) / (2 * HZ) * (H - 1));
    const r1 = Math.round((b.z1 + HZ) / (2 * HZ) * (H - 1));
    const ch = d.type === 'concrete' ? '#' : d.type === 'medium' ? '+' : '.';
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++)
      if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = ch;
  }
  return grid.map(row => row.join('')).join('\n');
}

let failures = 0;
const check = (cond, msg) => { if (!cond) { console.log('  ✗ ' + msg); failures++; } else console.log('  ✓ ' + msg); };

const seeds = ['ABC123', 'ROOM99', 'XKCD42', 'sp7', 'QWERTY', 'ZZZZZZ', 'MAP001', 'HELLO8'];
const styleCount = { cqb: 0, open: 0 };

for (const seed of seeds) {
  const m = generateMap(seed);
  styleCount[m.style]++;
  console.log(`\n── seed "${seed}"  style=${m.style}  walls=${m.defs.length} ──`);

  // 1. Determinism
  const m2 = generateMap(seed);
  check(JSON.stringify(m.defs) === JSON.stringify(m2.defs), 'deterministic (same seed → same map)');

  // 2. Symmetry across x=0
  const key = (d) => `${(-d.pos[0]).toFixed(2)}|${d.pos[2].toFixed(2)}|${d.w.toFixed(2)}|${d.h.toFixed(2)}|${d.type}`;
  const present = new Set(m.defs.map(d => `${d.pos[0].toFixed(2)}|${d.pos[2].toFixed(2)}|${d.w.toFixed(2)}|${d.h.toFixed(2)}|${d.type}`));
  const asymmetric = m.defs.filter(d => !present.has(key(d)));
  check(asymmetric.length === 0, `mirror-symmetric (${asymmetric.length} unmatched)`);

  // 3. No overlapping walls at all — exhaustive pairwise search. After the
  //    resolver runs, every wall should merely butt against its neighbours, so
  //    any shared footprint area beyond a hairline tolerance is a failure.
  const boxes = m.defs.map(aabb);
  let overlaps = 0; const worst = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const ov = overlapArea(boxes[i], boxes[j]);
      if (ov > 0.02) { overlaps++; if (worst.length < 3) worst.push(ov.toFixed(3)); }
    }
  }
  check(overlaps === 0, `no overlapping walls (${overlaps} found${worst.length ? ', areas ' + worst.join(',') : ''})`);

  // 4. Every spawn reaches the middle region (within 2 m of centre)
  const grid = buildGrid(m.defs);
  let unreachable = 0;
  for (const [sx, sz] of m.spawns) if (!grid.reaches(sx, sz, 0, 0, 2.0)) unreachable++;
  check(unreachable === 0, `all ${m.spawns.length} spawns reach middle (${unreachable} blocked)`);

  // 5. Left spawn reaches right spawn (halves connected through centre)
  const left = m.spawns.find(s => s[0] < 0), right = m.spawns.find(s => s[0] > 0);
  check(grid.reaches(left[0], left[1], right[0], right[1]), 'left half connects to right half');

  // 6. Reasonable density for the style (cqb = rooms, open = sparser cover)
  const minWalls = m.style === 'cqb' ? 38 : 18;
  check(m.defs.length >= minWalls, `enough walls for style (${m.defs.length} ≥ ${minWalls})`);
}

console.log(`\nStyles seen: cqb=${styleCount.cqb} open=${styleCount.open}`);
console.log('\nTop-down preview (first CQB + first OPEN seed):');
for (const want of ['cqb', 'open']) {
  const seed = seeds.find(s => generateMap(s).style === want);
  if (seed) { console.log(`\n[${want}]  seed "${seed}"`); console.log(asciiTop(generateMap(seed).defs)); }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
