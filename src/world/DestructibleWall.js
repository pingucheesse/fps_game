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

    const segsX = Math.round(width  * p.segsPerM);
    const segsY = Math.round(height * p.segsPerM);

    this.geo = new THREE.PlaneGeometry(width, height, segsX, segsY);
    this.geo.attributes.position.usage = THREE.DynamicDrawUsage;
    if (this.geo.index) this.geo.index.usage = THREE.DynamicDrawUsage;

    const vCount = this.geo.attributes.position.count;
    this.damage       = new Float32Array(vCount);
    this.displacement = new Float32Array(vCount);

    const posAttr = this.geo.attributes.position;
    this._origZ = new Float32Array(vCount);
    for (let i = 0; i < vCount; i++) this._origZ[i] = posAttr.getZ(i);

    this._origIndex   = new Uint32Array(this.geo.index.array);
    this._culledCount = 0;
    this._passable    = false;

    const mat = new THREE.MeshLambertMaterial({ color: p.color, side: THREE.DoubleSide });

    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.position.copy(position);
    this.mesh.rotation.copy(rotation);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.wallId = this.id;
    scene.add(this.mesh);

    this.mesh.updateMatrixWorld(true);
    this._collisionBox = new THREE.Box3().setFromObject(this.mesh);
    const MIN_THICK = 0.35;
    const sz = this._collisionBox.getSize(new THREE.Vector3());
    if (sz.x < MIN_THICK) { this._collisionBox.min.x -= MIN_THICK / 2; this._collisionBox.max.x += MIN_THICK / 2; }
    if (sz.z < MIN_THICK) { this._collisionBox.min.z -= MIN_THICK / 2; this._collisionBox.max.z += MIN_THICK / 2; }
  }

  applyHit(worldPoint, rayDir) {
    const p = this._params;

    _wallNormal.set(0, 0, 1).transformDirection(this.mesh.matrixWorld);
    const signZ = (_wallNormal.dot(rayDir) < 0) ? -1 : 1;

    const local    = this.mesh.worldToLocal(worldPoint.clone());
    const posAttr  = this.geo.attributes.position;
    const twoSig2  = 2 * p.sigma * p.sigma;

    for (let i = 0; i < posAttr.count; i++) {
      const dx    = posAttr.getX(i) - local.x;
      const dy    = posAttr.getY(i) - local.y;
      const delta = p.strength * Math.exp(-(dx * dx + dy * dy) / twoSig2);

      this.damage[i]       += delta;
      this.displacement[i] += signZ * delta * p.maxDisplace;
      posAttr.setZ(i, this._origZ[i] + this.displacement[i]);
    }

    posAttr.needsUpdate = true;
    this._cullTriangles();
    this.geo.computeVertexNormals();
  }

  _cullTriangles() {
    const idx = this.geo.index;
    const { threshold, passThreshold } = this._params;

    for (let t = 0; t < idx.count; t += 3) {
      // Skip already-culled (degenerate all-zero) triangles
      if (idx.getX(t) === 0 && idx.getX(t + 1) === 0 && idx.getX(t + 2) === 0) continue;

      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (this.damage[a] >= threshold && this.damage[b] >= threshold && this.damage[c] >= threshold) {
        idx.setX(t, 0); idx.setX(t + 1, 0); idx.setX(t + 2, 0);
        this._culledCount++;
      }
    }
    idx.needsUpdate = true;

    if (!this._passable) {
      const totalTris = this._origIndex.length / 3;
      if (this._culledCount / totalTris >= passThreshold) {
        this._passable = true;
      }
    }
  }

  serialize() {
    return {
      id:           this.id,
      damage:       Array.from(this.damage),
      displacement: Array.from(this.displacement),
    };
  }

  loadState({ damage, displacement }) {
    this._culledCount = 0;
    this._passable    = false;

    const posAttr = this.geo.attributes.position;
    this.geo.index.array.set(this._origIndex);
    this.geo.index.needsUpdate = true;

    this.damage       = new Float32Array(damage);
    this.displacement = displacement
      ? new Float32Array(displacement)
      : new Float32Array(damage.length);

    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setZ(i, this._origZ[i] + this.displacement[i]);
    }
    posAttr.needsUpdate = true;
    this._cullTriangles();
    this.geo.computeVertexNormals();
  }

  getCollisionBox() { return this._collisionBox; }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}
