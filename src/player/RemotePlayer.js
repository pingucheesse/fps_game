import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS, EYE_HEIGHT } from '../constants.js';

function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.65, 0.55);
}

const _matGrey = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const _matDark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _matBlack = new THREE.MeshLambertMaterial({ color: 0x080808 });

function makeGun() {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.052, 0.32), _matGrey);
  g.add(body);

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.22), _matDark);
  barrel.position.set(0, 0.016, -0.26);
  g.add(barrel);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.11), _matDark);
  stock.position.set(0, -0.018, 0.19);
  g.add(stock);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.05), _matDark);
  mag.position.set(0, -0.065, 0.02);
  g.add(mag);

  // Same camera-relative offset as the local player's gun
  g.position.set(0.16, -0.13, -0.28);
  return g;
}

function makeSunglasses() {
  const g = new THREE.Group();

  // Lenses
  const ll = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.065, 0.012), _matBlack);
  ll.position.set(-0.085, 0.01, 0.255);
  g.add(ll);

  const rl = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.065, 0.012), _matBlack);
  rl.position.set(0.085, 0.01, 0.255);
  g.add(rl);

  // Bridge
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.008), _matBlack);
  bridge.position.set(0, 0.01, 0.257);
  g.add(bridge);

  // Temples (arms going to ears)
  const lt = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.175), _matBlack);
  lt.position.set(-0.14, 0.01, 0.17);
  g.add(lt);

  const rt = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.175), _matBlack);
  rt.position.set(0.14, 0.01, 0.17);
  g.add(rt);

  return g;
}

export class RemotePlayer {
  constructor(scene, peerId) {
    this.peerId = peerId;

    const color = hashColor(peerId);
    const mat = new THREE.MeshLambertMaterial({ color });

    // Root group — yaw rotation applied here, position set here
    this.group = new THREE.Group();

    // Body cylinder (feet → PLAYER_HEIGHT)
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 10),
      mat
    );
    body.position.y = PLAYER_HEIGHT / 2;
    this.group.add(body);

    // Pitch object at eye height — head, sunglasses, and gun all live here
    // so they all rotate together with vertical look direction
    this._pitchObj = new THREE.Object3D();
    this._pitchObj.position.y = EYE_HEIGHT;
    this.group.add(this._pitchObj);

    // Head sphere at eye-height origin
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat);
    this._pitchObj.add(head);

    // Sunglasses parented to pitch object (rotate with head)
    this._pitchObj.add(makeSunglasses());

    // Gun parented to pitch object (rotates with look direction)
    this._pitchObj.add(makeGun());

    scene.add(this.group);

    this._targetPos   = new THREE.Vector3();
    this._targetYaw   = 0;
    this._targetPitch = 0;
    this._initialized = false;
  }

  updateState(msg) {
    if (msg.pos) {
      this._targetPos.fromArray(msg.pos);
      if (!this._initialized) {
        this.group.position.copy(this._targetPos);
        this._initialized = true;
      }
    }
    if (msg.yaw   !== undefined) this._targetYaw   = msg.yaw;
    if (msg.pitch !== undefined) this._targetPitch = msg.pitch;
  }

  update() {
    const t = 0.18;
    this.group.position.lerp(this._targetPos, t);
    this.group.rotation.y      += (this._targetYaw   - this.group.rotation.y)      * t;
    this._pitchObj.rotation.x  += (this._targetPitch - this._pitchObj.rotation.x)  * t;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      // shared materials (_matGrey etc.) — don't dispose
    });
  }
}
