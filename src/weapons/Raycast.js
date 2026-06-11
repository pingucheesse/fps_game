import * as THREE from 'three';
import { EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../constants.js';

const _origin    = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class Raycast {
  constructor(wallManager) {
    this.wallManager = wallManager;
    this._caster = new THREE.Raycaster();
    this._caster.far = 60;
  }

  fire(camera, remotePlayers) {
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_direction);
    this._caster.set(_origin, _direction);

    const origin = _origin.clone();
    const rayDir = _direction.clone();

    const wallHits = this._caster.intersectObjects(this.wallManager.meshes, false);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    if (remotePlayers) {
      for (const [peerId, rp] of remotePlayers) {
        const res = this._playerHit(origin, rayDir, rp.group.position, wallDist, rp._crouching);
        if (res) {
          return { origin, rayDir, hit: false, playerHit: true, peerId, hitType: res.type, hitPoint: res.point };
        }
      }
    }

    if (wallHits.length === 0) return { origin, rayDir, hit: false };

    const h      = wallHits[0];
    const wallId = h.object.userData.wallId;
    const wall   = this.wallManager.getById(wallId);
    if (!wall) return { origin, rayDir, hit: false };

    wall.applyHit(h.point, rayDir);
    return { origin, rayDir, hit: true, wallId, point: h.point };
  }

  _playerHit(origin, direction, feetPos, maxDist, crouching) {
    const eyeH = crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    const checks = [
      { dy: eyeH,          r: crouching ? 0.22 : 0.30, type: 'head' },
      { dy: eyeH * 0.45,  r: crouching ? 0.26 : 0.42, type: 'body' },
    ];
    for (const { dy, r, type } of checks) {
      const centre = new THREE.Vector3(feetPos.x, feetPos.y + dy, feetPos.z);
      const toC    = centre.clone().sub(origin);
      const t      = toC.dot(direction);
      if (t < 0 || t > maxDist) continue;
      const closest = origin.clone().addScaledVector(direction, t);
      if (closest.distanceTo(centre) < r) return { type, point: closest };
    }
    return null;
  }
}
