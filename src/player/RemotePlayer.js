import * as THREE from 'three';
import { PLAYER_RADIUS, EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../constants.js';

function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.65, 0.55);
}

const _matGrey  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const _matDark  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _matBlack = new THREE.MeshLambertMaterial({ color: 0x080808 });

const BODY_TOTAL  = 1.33;
const BODY_LENGTH = BODY_TOTAL - 2 * PLAYER_RADIUS;

function makeBody(mat) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, BODY_LENGTH, 4, 10),
    mat
  );
  mesh.position.y = BODY_TOTAL / 2;
  return mesh;
}

function makePistol() {
  const g = new THREE.Group();

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.040, 0.14), _matGrey);
  slide.position.set(0, 0.006, -0.02);
  g.add(slide);

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.013, 0.06), _matDark);
  barrel.position.set(0, 0.006, -0.12);
  g.add(barrel);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.070, 0.055), _matDark);
  grip.position.set(0, -0.033, 0.022);
  g.add(grip);

  g.position.set(0.35, 1.2, -0.15);
  return g;
}

function makeSunglasses() {
  const g = new THREE.Group();
  const lensGeo = new THREE.BoxGeometry(0.10, 0.06, 0.014);

  const ll = new THREE.Mesh(lensGeo, _matBlack);
  ll.position.set(-0.082, 0.01, -0.30);
  g.add(ll);

  const rl = new THREE.Mesh(lensGeo, _matBlack);
  rl.position.set(0.082, 0.01, -0.30);
  g.add(rl);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.010), _matBlack);
  bridge.position.set(0, 0.01, -0.302);
  g.add(bridge);

  const templGeo = new THREE.BoxGeometry(0.008, 0.008, 0.06);
  const lt = new THREE.Mesh(templGeo, _matBlack);
  lt.position.set(-0.135, 0.01, -0.27);
  g.add(lt);

  const rt = new THREE.Mesh(templGeo, _matBlack);
  rt.position.set(0.135, 0.01, -0.27);
  g.add(rt);

  return g;
}

export class RemotePlayer {
  constructor(scene, peerId) {
    this.peerId = peerId;

    const mat = new THREE.MeshLambertMaterial({ color: hashColor(peerId) });

    this.group = new THREE.Group();
    this.group.add(makeBody(mat));

    this._gun = makePistol();
    this.group.add(this._gun);

    this._pitchObj = new THREE.Object3D();
    this._pitchObj.position.y = EYE_HEIGHT;
    this.group.add(this._pitchObj);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat);
    this._pitchObj.add(head);
    this._pitchObj.add(makeSunglasses());

    scene.add(this.group);

    this._targetPos   = new THREE.Vector3();
    this._targetYaw   = 0;
    this._targetPitch = 0;
    this._crouching   = false;
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
    if (msg.yaw       !== undefined) this._targetYaw   = msg.yaw;
    if (msg.pitch     !== undefined) this._targetPitch = msg.pitch;
    if (msg.crouching !== undefined) this._crouching   = msg.crouching;
  }

  update(dt) {
    const t = 0.18;
    this.group.position.lerp(this._targetPos, t);
    this.group.rotation.y     += (this._targetYaw   - this.group.rotation.y)     * t;
    this._pitchObj.rotation.x += (this._targetPitch - this._pitchObj.rotation.x) * t;
    this._gun.rotation.x      += (this._targetPitch * 0.35 - this._gun.rotation.x) * t;

    // Lower head visually when crouching
    const targetHeadY = this._crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this._pitchObj.position.y += (targetHeadY - this._pitchObj.position.y) * Math.min(1, dt * 10);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
