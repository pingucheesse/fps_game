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
      // Check every player and take the NEAREST hit along the ray, so a player
      // standing behind another can't soak the shot meant for the front one.
      let best = null;
      for (const [peerId, rp] of remotePlayers) {
        const res = this._playerHit(origin, rayDir, rp, wallDist);
        if (res && (!best || res.t < best.t)) best = { peerId, ...res };
      }
      if (best) {
        return { origin, rayDir, hit: false, playerHit: true, peerId: best.peerId, hitType: best.type, hitPoint: best.point };
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

  _playerHit(origin, direction, rp, maxDist) {
    const crouching = rp._crouching;
    const feet = rp.group.position;
    const yaw  = rp.group.rotation.y;
    const phi  = rp._leanAngle || 0;           // lean roll → hitbox follows the body
    const sinP = Math.sin(phi), cosP = Math.cos(phi);
    const cosY = Math.cos(yaw),  sinY = Math.sin(yaw);

    const eyeH = crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    const checks = [
      { dy: eyeH,          r: crouching ? 0.22 : 0.30, type: 'head' },
      { dy: eyeH * 0.45,  r: crouching ? 0.26 : 0.42, type: 'body' },
    ];
    for (const { dy, r, type } of checks) {
      // Body point (0,dy,0) rolled by the lean then yawed into world — matches the visual
      const lx = -dy * sinP, ly = dy * cosP;
      const centre = new THREE.Vector3(
        feet.x + lx * cosY,
        feet.y + ly,
        feet.z - lx * sinY
      );
      const toC = centre.clone().sub(origin);
      const t   = toC.dot(direction);
      if (t < 0 || t > maxDist) continue;
      const closest = origin.clone().addScaledVector(direction, t);
      if (closest.distanceTo(centre) < r) return { type, point: closest, t };
    }
    return null;
  }
}
