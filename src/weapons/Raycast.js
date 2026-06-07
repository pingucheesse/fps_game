import * as THREE from 'three';

const _origin    = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class Raycast {
  constructor(wallManager) {
    this.wallManager = wallManager;
    this._caster = new THREE.Raycaster();
    this._caster.far = 60;
  }

  // Always returns { origin, rayDir, hit, wallId?, point? }.
  // Applies wall damage locally when a wall is struck.
  fire(camera) {
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_direction);
    this._caster.set(_origin, _direction);

    const origin = _origin.clone();
    const rayDir = _direction.clone();

    const hits = this._caster.intersectObjects(this.wallManager.meshes, false);
    if (hits.length === 0) return { origin, rayDir, hit: false };

    const h      = hits[0];
    const wallId = h.object.userData.wallId;
    const wall   = this.wallManager.getById(wallId);
    if (!wall) return { origin, rayDir, hit: false };

    wall.applyHit(h.point, rayDir);
    return { origin, rayDir, hit: true, wallId, point: h.point };
  }
}
