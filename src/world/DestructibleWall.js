import * as THREE from 'three';
import { WALL_TYPES } from '../constants.js';

let _idCounter = 0;
const _wallNormal = new THREE.Vector3();

export class DestructibleWall {
  constructor(scene, {
    type     = 'medium',
    width    = 3,
    height   = 3,
    position = new THREE.Vector3(),
    rotation = new THREE.Euler(),
  } = {}) {
    this.id   = `wall_${_idCounter++}`;
    this.type = type;

    const p = WALL_TYPES[type] ?? WALL_TYPES.medium;
    this._params = p;

    this._group = new THREE.Group();
    this._group.position.copy(position);
    this._group.rotation.copy(rotation);
    scene.add(this._group);

    // Cap subdivisions so a map full of walls stays performant.
    const MAX_SEG = 64;
    const segsX = Math.min(Math.round(width  * p.segsPerM), MAX_SEG);
    const segsY = Math.min(Math.round(height * p.segsPerM), MAX_SEG);

    this.geo = new THREE.BoxGeometry(width, height, p.depth, segsX, segsY, 1);
    this.geo.attributes.position.usage = THREE.DynamicDrawUsage;
    this.geo.index.usage               = THREE.DynamicDrawUsage;

    const idxArr = this.geo.index.array;

    // BoxGeometry build order: +X, -X, +Y, -Y, +Z(front), -Z(back) — no vertex sharing
    // +X/-X : 2*(segsY+1) verts each  |  +Y/-Y : (segsX+1)*2 each
    // +Z/-Z : (segsX+1)*(segsY+1) each  ← the two destructible faces
    const faceCount  = (segsX + 1) * (segsY + 1);
    const frontStart = 4 * (segsY + 1) + 4 * (segsX + 1);
    const backStart  = frontStart + faceCount;
    this._frontStart  = frontStart;
    this._backStart   = backStart;
    this._faceCount   = faceCount;
    this._segsX       = segsX;
    this._segsY       = segsY;

    const posAttr = this.geo.attributes.position;

    // Damage / displacement arrays — one per face
    this.damage       = new Float32Array(faceCount);
    this.displacement = new Float32Array(faceCount);
    this._origZ       = new Float32Array(faceCount);
    for (let i = 0; i < faceCount; i++) this._origZ[i] = posAttr.getZ(frontStart + i);

    this._damageback  = new Float32Array(faceCount);
    this._backDisp    = new Float32Array(faceCount);
    this._backOrigZ   = new Float32Array(faceCount);
    for (let i = 0; i < faceCount; i++) this._backOrigZ[i] = posAttr.getZ(backStart + i);

    // Mirror map: for face-local index i at grid (ix, iy),
    // the OTHER face's vertex at the same world XY is at index (segsX - ix) + iy*(segsX+1).
    // The back face has its X axis reversed (udir=-1), so offset T on the back face
    // is NOT the same world position as offset T on the front face.
    // mirrorMap[i] gives the LOCAL index on the opposite face that shares world XY.
    // The map is symmetric: mirrorMap[mirrorMap[i]] === i.
    this._mirrorMap = new Uint32Array(faceCount);
    for (let iy = 0; iy <= segsY; iy++) {
      for (let ix = 0; ix <= segsX; ix++) {
        this._mirrorMap[ix + iy * (segsX + 1)] = (segsX - ix) + iy * (segsX + 1);
      }
    }

    // Preserve original index data for both faces (for loadState reset)
    const g4 = this.geo.groups[4]; // +Z front
    const g5 = this.geo.groups[5]; // -Z back
    this._origFrontIdx   = new Uint32Array(idxArr.slice(g4.start, g4.start + g4.count));
    this._origBackIdx    = new Uint32Array(idxArr.slice(g5.start, g5.start + g5.count));
    this._frontIdxStart  = g4.start;
    this._backIdxStart   = g5.start;
    this._frontIdxCount  = g4.count;
    this._totalFrontTris = g4.count / 3;

    this._culledCount = 0;
    this._passable    = false;

    // Single DoubleSide material — guaranteed visible from every angle regardless
    // of wall rotation. MirrorMap culling ensures holes punch through both faces.
    const mat = new THREE.MeshLambertMaterial({ color: p.color, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.position.z    = -p.depth / 2; // places +Z face flush with group origin
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

  // ── Hit application ─────────────────────────────────────────────────────────
  applyHit(worldPoint, rayDir, overrides = {}) {
    const p = overrides && Object.keys(overrides).length
      ? Object.assign({}, this._params, overrides)
      : this._params;

    _wallNormal.set(0, 0, 1).transformDirection(this.mesh.matrixWorld);
    const dot = _wallNormal.dot(rayDir);
    if (Math.abs(dot) < 0.25) return; // ignore grazing / side-face hits

    const fromFront = dot < 0;
    const signZ     = fromFront ? -1 : 1;

    const vStart = fromFront ? this._frontStart : this._backStart;
    const dmg    = fromFront ? this.damage      : this._damageback;
    const disp   = fromFront ? this.displacement : this._backDisp;
    const origZ  = fromFront ? this._origZ       : this._backOrigZ;

    const local   = this.mesh.worldToLocal(worldPoint.clone());
    const posAttr = this.geo.attributes.position;

    // Build Gaussians: one main + 2–4 random sub-impacts for a chunky, irregular hole
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
      const vx = posAttr.getX(vi);
      const vy = posAttr.getY(vi);
      let total = 0;
      for (const g of gs) {
        const dx = vx - g.cx, dy = vy - g.cy;
        total += g.str * Math.exp(-(dx * dx + dy * dy) / g.ts);
      }
      dmg[i]  += total;
      disp[i] += signZ * total * p.maxDisplace;
      posAttr.setZ(vi, origZ[i] + disp[i]);
    }

    posAttr.needsUpdate = true;
    this._cullTriangles();
    this.geo.computeVertexNormals();
  }

  // ── Triangle culling ────────────────────────────────────────────────────────
  // A triangle is culled when all three of its vertices satisfy the damage threshold
  // on EITHER face (using mirrorMap to check the opposite face at the same world XY).
  // This ensures holes go clean through: a front-face hole also removes the back face
  // at the same world position, and vice versa, with no mirroring artefact.
  _cullTriangles() {
    const idx     = this.geo.index;
    const { threshold, passThreshold } = this._params;
    const mm      = this._mirrorMap;

    // Front face (+Z)
    const frontEnd = this._frontIdxStart + this._frontIdxCount;
    for (let t = this._frontIdxStart; t < frontEnd; t += 3) {
      if (idx.getX(t) === 0 && idx.getX(t + 1) === 0 && idx.getX(t + 2) === 0) continue;
      const a = idx.getX(t)     - this._frontStart;
      const b = idx.getX(t + 1) - this._frontStart;
      const c = idx.getX(t + 2) - this._frontStart;
      // Cull if own damage OR matching back-face damage (at same world pos) exceeds threshold
      const aCull = this.damage[a] >= threshold || this._damageback[mm[a]] >= threshold;
      const bCull = this.damage[b] >= threshold || this._damageback[mm[b]] >= threshold;
      const cCull = this.damage[c] >= threshold || this._damageback[mm[c]] >= threshold;
      if (aCull && bCull && cCull) {
        idx.setX(t, 0); idx.setX(t + 1, 0); idx.setX(t + 2, 0);
        this._culledCount++;
      }
    }

    // Back face (-Z) — same logic, symmetric
    const backEnd = this._backIdxStart + this._frontIdxCount;
    for (let t = this._backIdxStart; t < backEnd; t += 3) {
      if (idx.getX(t) === 0 && idx.getX(t + 1) === 0 && idx.getX(t + 2) === 0) continue;
      const a = idx.getX(t)     - this._backStart;
      const b = idx.getX(t + 1) - this._backStart;
      const c = idx.getX(t + 2) - this._backStart;
      // Cull if own back-face damage OR matching front-face damage exceeds threshold
      const aCull = this._damageback[a] >= threshold || this.damage[mm[a]] >= threshold;
      const bCull = this._damageback[b] >= threshold || this.damage[mm[b]] >= threshold;
      const cCull = this._damageback[c] >= threshold || this.damage[mm[c]] >= threshold;
      if (aCull && bCull && cCull) {
        idx.setX(t, 0); idx.setX(t + 1, 0); idx.setX(t + 2, 0);
      }
    }

    idx.needsUpdate = true;
    if (!this._passable && this._culledCount / this._totalFrontTris >= passThreshold) {
      this._passable = true;
    }
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

    const idx     = this.geo.index;
    const posAttr = this.geo.attributes.position;

    for (let i = 0; i < this._origFrontIdx.length; i++) {
      idx.array[this._frontIdxStart + i] = this._origFrontIdx[i];
      idx.array[this._backIdxStart  + i] = this._origBackIdx[i];
    }
    idx.needsUpdate = true;

    this.damage       = new Float32Array(damage);
    this._damageback  = new Float32Array(damageback  ?? damage.length);
    this.displacement = new Float32Array(displacement ?? damage.length);
    this._backDisp    = new Float32Array(backdisp     ?? damage.length);

    for (let i = 0; i < this._faceCount; i++) {
      posAttr.setZ(this._frontStart + i, this._origZ[i]     + this.displacement[i]);
      posAttr.setZ(this._backStart  + i, this._backOrigZ[i] + this._backDisp[i]);
    }
    posAttr.needsUpdate = true;
    this._cullTriangles();
    this.geo.computeVertexNormals();
  }

  getCollisionBox() { return this._collisionBox; }

  dispose(scene) {
    scene.remove(this._group);
    this._group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material)  o.material.dispose();
    });
  }
}
