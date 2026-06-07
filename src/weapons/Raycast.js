import * as THREE from 'three';

const _origin    = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class Raycast {
  constructor(wallManager) {
    this.wallManager = wallManager;
    this._caster = new THREE.Raycaster();
    this._caster.far = 60;
  }

  // Returns { wallId, point, rayDir } or null.  Also applies damage locally.
  fire(camera) {
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_direction);
    this._caster.set(_origin, _direction);

    const hits = this._caster.intersectObjects(this.wallManager.meshes, false);
    if (hits.length === 0) return null;

    const hit    = hits[0];
    const wallId = hit.object.userData.wallId;
    const wall   = this.wallManager.getById(wallId);
    if (!wall) return null;

    const rayDir = _direction.clone(); // normalised camera look direction
    wall.applyHit(hit.point, rayDir);
    return { wallId, point: hit.point, rayDir };
  }
}
