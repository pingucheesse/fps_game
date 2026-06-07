import * as THREE from 'three';
import { EYE_HEIGHT } from '../constants.js';

const _origin    = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class Raycast {
  constructor(wallManager) {
    this.wallManager = wallManager;
    this._caster = new THREE.Raycaster();
    this._caster.far = 60;
  }

  // Always returns { origin, rayDir, hit, ... }.
  // remotePlayers: Map<peerId, RemotePlayer> — shooter-side player hit detection.
  fire(camera, remotePlayers) {
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_direction);
    this._caster.set(_origin, _direction);

    const origin = _origin.clone();
    const rayDir = _direction.clone();

    // Get wall hits first (used as max distance cutoff for player hits)
    const wallHits = this._caster.intersectObjects(this.wallManager.meshes, false);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    // Shooter-side player hit detection — checks against what shooter sees
    if (remotePlayers) {
      for (const [peerId, rp] of remotePlayers) {
        const res = this._playerHit(origin, rayDir, rp.group.position, wallDist);
        if (res) {
          return { origin, rayDir, hit: false, playerHit: true, peerId, hitType: res.type, hitPoint: res.point };
        }
      }
    }

    // Wall hit
    if (wallHits.length === 0) return { origin, rayDir, hit: false };

    const h      = wallHits[0];
    const wallId = h.object.userData.wallId;
    const wall   = this.wallManager.getById(wallId);
    if (!wall) return { origin, rayDir, hit: false };

    wall.applyHit(h.point, rayDir);
    return { origin, rayDir, hit: true, wallId, point: h.point };
  }

  // Checks if a ray from origin in direction hits a player's head or body sphere.
  // maxDist: don't register a hit past a wall.
  _playerHit(origin, direction, feetPos, maxDist) {
    const checks = [
      { dy: EYE_HEIGHT,          r: 0.30, type: 'head' },
      { dy: EYE_HEIGHT * 0.45,   r: 0.42, type: 'body' },
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
