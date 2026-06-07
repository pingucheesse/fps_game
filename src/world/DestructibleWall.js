import * as THREE from 'three';
import {
  SIGMA, BULLET_STRENGTH, DAMAGE_THRESHOLD,
  MAX_DISPLACEMENT, WALL_SUBDIVISIONS
} from '../constants.js';

let _idCounter = 0;
const _wallNormal = new THREE.Vector3();

export class DestructibleWall {
  constructor(scene, { width = 3, height = 3, position = new THREE.Vector3(), rotation = new THREE.Euler() } = {}) {
    this.id = `wall_${_idCounter++}`;

    const segsX = Math.round(width  * WALL_SUBDIVISIONS);
    const segsY = Math.round(height * WALL_SUBDIVISIONS);

    this.geo = new THREE.PlaneGeometry(width, height, segsX, segsY);
    this.geo.attributes.position.usage = THREE.DynamicDrawUsage;
    if (this.geo.index) this.geo.index.usage = THREE.DynamicDrawUsage;

    const vCount = this.geo.attributes.position.count;
    // damage: unsigned accumulator used for triangle culling
    this.damage = new Float32Array(vCount);
    // displacement: signed per-vertex Z offset (negative = pushed toward back, positive = pushed toward front)
    this.displacement = new Float32Array(vCount);

    const posAttr = this.geo.attributes.position;
    this._origZ = new Float32Array(vCount);
    for (let i = 0; i < vCount; i++) this._origZ[i] = posAttr.getZ(i);

    this._origIndex = new Uint32Array(this.geo.index.array);

    const mat = new THREE.MeshLambertMaterial({
      color: 0xc8b89a,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.position.copy(position);
    this.mesh.rotation.copy(rotation);
    this.mesh.castShadow = true;
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

  // worldPoint: THREE.Vector3 hit position
  // rayDir:     THREE.Vector3 normalised ray direction (tells us which face was hit)
  applyHit(worldPoint, rayDir) {
    // Determine which side of the wall the shot came from.
    // Wall local +Z = front face normal. Transform to world space.
    _wallNormal.set(0, 0, 1).transformDirection(this.mesh.matrixWorld);

    // dot < 0 → ray opposes the normal → shot came from the front face (-Z displacement)
    // dot > 0 → ray aligns with normal  → shot came from the back face  (+Z displacement)
    const signZ = (_wallNormal.dot(rayDir) < 0) ? -1 : 1;

    const local = this.mesh.worldToLocal(worldPoint.clone());
    const posAttr = this.geo.attributes.position;
    const twoSigmaSq = 2 * SIGMA * SIGMA;

    for (let i = 0; i < posAttr.count; i++) {
      const dx = posAttr.getX(i) - local.x;
      const dy = posAttr.getY(i) - local.y;
      const delta = BULLET_STRENGTH * Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);

      this.damage[i]       += delta;
      // displacement accumulates with the correct sign per shot direction
      this.displacement[i] += signZ * delta * MAX_DISPLACEMENT;

      posAttr.setZ(i, this._origZ[i] + this.displacement[i]);
    }

    posAttr.needsUpdate = true;
    this._cullTriangles();
    this.geo.computeVertexNormals();
  }

  _cullTriangles() {
    const idx = this.geo.index;
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (
        this.damage[a] >= DAMAGE_THRESHOLD &&
        this.damage[b] >= DAMAGE_THRESHOLD &&
        this.damage[c] >= DAMAGE_THRESHOLD
      ) {
        idx.setX(t, 0); idx.setX(t + 1, 0); idx.setX(t + 2, 0);
      }
    }
    idx.needsUpdate = true;
  }

  serialize() {
    return {
      id: this.id,
      damage: Array.from(this.damage),
      displacement: Array.from(this.displacement),
    };
  }

  loadState({ damage, displacement }) {
    const posAttr = this.geo.attributes.position;

    this.geo.index.array.set(this._origIndex);
    this.geo.index.needsUpdate = true;

    this.damage       = new Float32Array(damage);
    this.displacement = displacement ? new Float32Array(displacement) : new Float32Array(damage.length);

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
