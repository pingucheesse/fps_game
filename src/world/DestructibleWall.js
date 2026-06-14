import * as THREE from 'three';
import { WALL_TYPES } from '../constants.js';
import { getWallTexture } from './wallTextures.js';

let _idCounter = 0;
const _wallNormal = new THREE.Vector3();

// Cap subdivisions so a map full of walls stays performant. With 4 triangles per
// cell (for smoother holes) we keep the cap lower so the triangle budget per wall
// stays close to the old 2-tri-per-cell geometry.
const MAX_SEG = 46;

export class DestructibleWall {
  constructor(scene, {
    type     = 'medium',
    width    = 3,
    height   = 3,
    position = new THREE.Vector3(),
    rotation = new THREE.Euler(),
    indestructible = false,
  } = {}) {
    this.id   = `wall_${_idCounter++}`;
    this.type = type;
    this._indestructible = indestructible;

    const p = WALL_TYPES[type] ?? WALL_TYPES.medium;
    this._params = p;

    this._group = new THREE.Group();
    this._group.position.copy(position);
    this._group.rotation.copy(rotation);
    scene.add(this._group);

    const segsX = Math.min(Math.round(width  * p.segsPerM), MAX_SEG);
    const segsY = Math.min(Math.round(height * p.segsPerM), MAX_SEG);
    this._segsX = segsX;
    this._segsY = segsY;

    // ── Start from a BoxGeometry (gives correct side faces, corner grid, UVs) ──
    const box = new THREE.BoxGeometry(width, height, p.depth, segsX, segsY, 1);

    // Bake size-based UV tiling so all walls share one texture per type (perf).
    const buv = box.attributes.uv;
    const TILE = 1.6, ru = Math.max(1, width / TILE), rv = Math.max(1, height / TILE);
    for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * ru, buv.getY(i) * rv);

    const basePos = box.attributes.position.array;
    const baseNor = box.attributes.normal.array;
    const baseUv  = box.attributes.uv.array;
    const baseIdx = box.index.array;
    const N = box.attributes.position.count;

    const faceCount  = (segsX + 1) * (segsY + 1);
    const frontStart = 4 * (segsY + 1) + 4 * (segsX + 1); // box: +X,-X,+Y,-Y then +Z
    const backStart  = frontStart + faceCount;
    const cellCount  = segsX * segsY;

    this._frontStart = frontStart;
    this._backStart  = backStart;
    this._faceCount  = faceCount;

    // ── Expanded vertex arrays: original verts + one centre vert per cell/face ──
    const M   = N + 2 * cellCount;
    const pos = new Float32Array(M * 3); pos.set(basePos);
    const nor = new Float32Array(M * 3); nor.set(baseNor);
    const uv  = new Float32Array(M * 2); uv.set(baseUv);

    const frontCenterBase = N;
    const backCenterBase  = N + cellCount;

    // Build per-cell centre verts (position/normal/uv = average of the 4 corners)
    // and record the 4 corner LOCAL indices for later z updates / culling.
    const makeCenters = (cornerStart, centerBase) => {
      const centers = new Array(cellCount);
      for (let iy = 0; iy < segsY; iy++) {
        for (let ix = 0; ix < segsX; ix++) {
          const l00 = ix + iy * (segsX + 1);
          const l10 = (ix + 1) + iy * (segsX + 1);
          const l01 = ix + (iy + 1) * (segsX + 1);
          const l11 = (ix + 1) + (iy + 1) * (segsX + 1);
          const a = [cornerStart + l00, cornerStart + l10, cornerStart + l01, cornerStart + l11];
          const cAbs = centerBase + (ix + iy * segsX);
          for (let k = 0; k < 3; k++)
            pos[cAbs * 3 + k] = (basePos[a[0]*3+k] + basePos[a[1]*3+k] + basePos[a[2]*3+k] + basePos[a[3]*3+k]) / 4;
          for (let k = 0; k < 3; k++) nor[cAbs * 3 + k] = baseNor[a[0]*3+k];
          for (let k = 0; k < 2; k++)
            uv[cAbs * 2 + k] = (baseUv[a[0]*2+k] + baseUv[a[1]*2+k] + baseUv[a[2]*2+k] + baseUv[a[3]*2+k]) / 4;
          centers[ix + iy * segsX] = { abs: cAbs, l00, l10, l01, l11 };
        }
      }
      return centers;
    };
    this._frontCenters = makeCenters(frontStart, frontCenterBase);
    this._backCenters  = makeCenters(backStart,  backCenterBase);

    // ── Indices: keep the 4 side faces, re-triangulate front/back as 4 tris/cell ──
    const sideIdx = [];
    for (let gi = 0; gi < 4; gi++) {
      const g = box.groups[gi];
      for (let t = g.start; t < g.start + g.count; t++) sideIdx.push(baseIdx[t]);
    }
    const build4 = (cornerStart, centers) => {
      const out = [];
      for (const c of centers) {
        const a00 = cornerStart + c.l00, a10 = cornerStart + c.l10;
        const a11 = cornerStart + c.l11, a01 = cornerStart + c.l01;
        out.push(a00, a10, c.abs,  a10, a11, c.abs,  a11, a01, c.abs,  a01, a00, c.abs);
      }
      return out;
    };
    const frontIdx = build4(frontStart, this._frontCenters);
    const backIdx  = build4(backStart,  this._backCenters);

    const allIdx = new Uint32Array(sideIdx.length + frontIdx.length + backIdx.length);
    allIdx.set(sideIdx, 0);
    this._frontIdxStart = sideIdx.length;
    allIdx.set(frontIdx, this._frontIdxStart);
    this._backIdxStart  = this._frontIdxStart + frontIdx.length;
    allIdx.set(backIdx, this._backIdxStart);
    this._frontIdxCount  = frontIdx.length;
    this._totalFrontTris = frontIdx.length / 3;
    this._origFrontIdx   = new Uint32Array(frontIdx);
    this._origBackIdx    = new Uint32Array(backIdx);

    this.geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3); posAttr.usage = THREE.DynamicDrawUsage;
    this.geo.setAttribute('position', posAttr);
    this.geo.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
    this.geo.setAttribute('uv',       new THREE.BufferAttribute(uv, 2));
    const idxAttr = new THREE.BufferAttribute(allIdx, 1); idxAttr.usage = THREE.DynamicDrawUsage;
    this.geo.setIndex(idxAttr);
    box.dispose();

    // ── Damage / displacement (per corner vertex, one set per face) ──
    this.damage       = new Float32Array(faceCount);
    this.displacement = new Float32Array(faceCount);
    this._origZ       = new Float32Array(faceCount);
    for (let i = 0; i < faceCount; i++) this._origZ[i] = pos[(frontStart + i) * 3 + 2];

    this._damageback = new Float32Array(faceCount);
    this._backDisp   = new Float32Array(faceCount);
    this._backOrigZ  = new Float32Array(faceCount);
    for (let i = 0; i < faceCount; i++) this._backOrigZ[i] = pos[(backStart + i) * 3 + 2];

    // Mirror map: front corner i ↔ back corner at the same world XY (back face has
    // its X axis reversed). Symmetric: mirrorMap[mirrorMap[i]] === i.
    this._mirrorMap = new Uint32Array(faceCount);
    for (let iy = 0; iy <= segsY; iy++)
      for (let ix = 0; ix <= segsX; ix++)
        this._mirrorMap[ix + iy * (segsX + 1)] = (segsX - ix) + iy * (segsX + 1);

    this._culledCount = 0;
    this._passable    = false;

    const mat = new THREE.MeshLambertMaterial({ map: getWallTexture(type), side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.wallId = this.id;
    this._group.add(this.mesh);

    this._group.updateMatrixWorld(true);
    this._collisionBox = new THREE.Box3().setFromObject(this._group);
    const MIN_THICK = 0.35;
    const sz = this._collisionBox.getSize(new THREE.Vector3());
    if (sz.x < MIN_THICK) { this._collisionBox.min.x -= MIN_THICK / 2; this._collisionBox.max.x += MIN_THICK / 2; }
    if (sz.z < MIN_THICK) { this._collisionBox.min.z -= MIN_THICK / 2; this._collisionBox.max.z += MIN_THICK / 2; }
  }

  // Update each cell centre vertex z to the average of its 4 corners (keeps the
  // subdivided surface continuous as it dents).
  _syncCenters(vStart, centers, posAttr) {
    for (const c of centers) {
      const z = (posAttr.getZ(vStart + c.l00) + posAttr.getZ(vStart + c.l10)
               + posAttr.getZ(vStart + c.l01) + posAttr.getZ(vStart + c.l11)) / 4;
      posAttr.setZ(c.abs, z);
    }
  }

  // ── Hit application ─────────────────────────────────────────────────────────
  applyHit(worldPoint, rayDir, overrides = {}) {
    if (this._indestructible) return;

    const p = overrides && Object.keys(overrides).length
      ? Object.assign({}, this._params, overrides)
      : this._params;

    _wallNormal.set(0, 0, 1).transformDirection(this.mesh.matrixWorld);
    const dot = _wallNormal.dot(rayDir);
    if (Math.abs(dot) < 0.25) return;

    const fromFront = dot < 0;
    const signZ     = fromFront ? -1 : 1;
    const vStart    = fromFront ? this._frontStart   : this._backStart;
    const dmg       = fromFront ? this.damage        : this._damageback;
    const disp      = fromFront ? this.displacement  : this._backDisp;
    const origZ     = fromFront ? this._origZ        : this._backOrigZ;
    const centers   = fromFront ? this._frontCenters : this._backCenters;

    const local   = this.mesh.worldToLocal(worldPoint.clone());
    const posAttr = this.geo.attributes.position;

    // Main Gaussian + 2–4 random sub-impacts → chunky, irregular hole
    const gs = [{ cx: local.x, cy: local.y, str: p.strength, ts: 2 * p.sigma * p.sigma }];
    const nChunks = 2 + Math.floor(Math.random() * 3);
    for (let c = 0; c < nChunks; c++) {
      const a = Math.random() * Math.PI * 2;
      const d = p.sigma * (0.4 + Math.random() * 0.7);
      const s = p.sigma * (0.15 + Math.random() * 0.25);
      gs.push({ cx: local.x + Math.cos(a) * d, cy: local.y + Math.sin(a) * d,
                str: p.strength * (0.20 + Math.random() * 0.30), ts: 2 * s * s });
    }

    for (let i = 0; i < this._faceCount; i++) {
      const vi = vStart + i;
      const vx = posAttr.getX(vi), vy = posAttr.getY(vi);
      let total = 0;
      for (const g of gs) {
        const dx = vx - g.cx, dy = vy - g.cy;
        total += g.str * Math.exp(-(dx * dx + dy * dy) / g.ts);
      }
      dmg[i]  += total;
      disp[i] += signZ * total * p.maxDisplace;
      posAttr.setZ(vi, origZ[i] + disp[i]);
    }
    this._syncCenters(vStart, centers, posAttr);

    posAttr.needsUpdate = true;
    this._cullTriangles();
    this.geo.computeVertexNormals();
  }

  // ── Cell culling ──────────────────────────────────────────────────────────
  // Hybrid square + triangle removal. Each cell is 4 triangles around a centre:
  //   tri0 = bottom edge (l00,l10)   tri2 = top edge   (l11,l01)
  //   tri1 = right edge  (l10,l11)   tri3 = left edge  (l01,l00)
  // • 3–4 damaged corners → remove the whole cell  → clean SQUARE (the voxel).
  // • exactly 2 adjacent damaged corners → remove just that edge triangle, which
  //   shaves the stair-step → TRIANGLE smoothing along the hole boundary.
  _cullTriangles() {
    const idx = this.geo.index;
    const arr = idx.array;
    const { threshold, passThreshold, independentCull } = this._params;
    const mm = this._mirrorMap, xface = !independentCull;

    const cullTri = (base, ti) => {
      const p = base + ti * 3;
      if (arr[p] === 0 && arr[p + 1] === 0 && arr[p + 2] === 0) return 0;
      arr[p] = 0; arr[p + 1] = 0; arr[p + 2] = 0; return 1;
    };
    const cullCell = (base, d00, d10, d01, d11) => {
      const count = d00 + d10 + d01 + d11;
      let n = 0;
      if (count >= 3) { for (let ti = 0; ti < 4; ti++) n += cullTri(base, ti); }   // square
      else if (count === 2) {                                                       // edge triangle
        if (d00 && d10)      n += cullTri(base, 0);
        else if (d10 && d11) n += cullTri(base, 1);
        else if (d11 && d01) n += cullTri(base, 2);
        else if (d01 && d00) n += cullTri(base, 3);
        // diagonal pair → leave the cell intact
      }
      return n;
    };

    const cornerF = (l) => (this.damage[l]      >= threshold || (xface && this._damageback[mm[l]] >= threshold)) ? 1 : 0;
    const cornerB = (l) => (this._damageback[l]  >= threshold || (xface && this.damage[mm[l]]      >= threshold)) ? 1 : 0;

    const fc = this._frontCenters, bc = this._backCenters;
    for (let k = 0; k < fc.length; k++) {
      const c = fc[k], base = this._frontIdxStart + k * 12;
      this._culledCount += cullCell(base, cornerF(c.l00), cornerF(c.l10), cornerF(c.l01), cornerF(c.l11));
    }
    for (let k = 0; k < bc.length; k++) {
      const c = bc[k], base = this._backIdxStart + k * 12;
      cullCell(base, cornerB(c.l00), cornerB(c.l10), cornerB(c.l01), cornerB(c.l11));
    }

    idx.needsUpdate = true;
    if (!this._passable && this._culledCount / this._totalFrontTris >= passThreshold) this._passable = true;
  }

  // ── Network sync ────────────────────────────────────────────────────────────
  serialize() {
    return {
      id:           this.id,
      damage:       Array.from(this.damage),
      damageback:   Array.from(this._damageback),
      displacement: Array.from(this.displacement),
      backdisp:     Array.from(this._backDisp),
    };
  }

  loadState({ damage, damageback, displacement, backdisp }) {
    this._culledCount = 0;
    this._passable    = false;

    const idx = this.geo.index;
    for (let i = 0; i < this._origFrontIdx.length; i++) {
      idx.array[this._frontIdxStart + i] = this._origFrontIdx[i];
      idx.array[this._backIdxStart  + i] = this._origBackIdx[i];
    }
    idx.needsUpdate = true;

    this.damage       = new Float32Array(damage);
    this._damageback  = new Float32Array(damageback   ?? damage.length);
    this.displacement = new Float32Array(displacement ?? damage.length);
    this._backDisp    = new Float32Array(backdisp     ?? damage.length);

    const posAttr = this.geo.attributes.position;
    for (let i = 0; i < this._faceCount; i++) {
      posAttr.setZ(this._frontStart + i, this._origZ[i]     + this.displacement[i]);
      posAttr.setZ(this._backStart  + i, this._backOrigZ[i] + this._backDisp[i]);
    }
    this._syncCenters(this._frontStart, this._frontCenters, posAttr);
    this._syncCenters(this._backStart,  this._backCenters,  posAttr);
    posAttr.needsUpdate = true;
    this._cullTriangles();
    this.geo.computeVertexNormals();
  }

  getCollisionBox() { return this._collisionBox; }

  dispose(scene) {
    scene.remove(this._group);
    this._group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose(); // shared per-type texture is NOT disposed
    });
  }
}
