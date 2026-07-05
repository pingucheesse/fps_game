import * as THREE from 'three';
import { PLAYER_RADIUS, EYE_HEIGHT, CROUCH_EYE_HEIGHT, LEAN_MAX } from '../constants.js';

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

const _matGlow = new THREE.MeshLambertMaterial({ color: 0x0c2a3a, emissive: 0x2288ff, emissiveIntensity: 0.9 });

// Mini third-person dart launcher (triple tubes + glow core)
function makeDartLauncher() {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.13), _matDark);
  body.position.set(0, 0, 0.01);
  g.add(body);

  const tubeGeo = new THREE.BoxGeometry(0.016, 0.016, 0.16);
  const t1 = new THREE.Mesh(tubeGeo, _matGrey); t1.position.set(0, 0.02, -0.1);      g.add(t1);
  const t2 = new THREE.Mesh(tubeGeo, _matGrey); t2.position.set(-0.014, -0.005, -0.1); g.add(t2);
  const t3 = new THREE.Mesh(tubeGeo, _matGrey); t3.position.set( 0.014, -0.005, -0.1); g.add(t3);

  const core = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.14), _matGlow);
  core.position.set(0, 0.007, -0.09);
  g.add(core);

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

    // Feet pinned at the group origin; whole body rotates in an arc from the floor
    this.group = new THREE.Group();

    this._leanPivot = new THREE.Object3D();
    this.group.add(this._leanPivot);

    this._body = makeBody(mat);
    this._leanPivot.add(this._body);

    this._gun = makePistol();
    this._leanPivot.add(this._gun);
    this._dartLauncher = makeDartLauncher();
    this._dartLauncher.visible = false;
    this._leanPivot.add(this._dartLauncher);

    // Their deployed dart wires (synced via playerState so we can SEE them)
    this._wireBuf = new Float32Array(6 * 6);
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(this._wireBuf, 3).setUsage(THREE.DynamicDrawUsage));
    this._wire = new THREE.LineSegments(wireGeo,
      new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 }));
    this._wire.frustumCulled = false;
    this._wire.visible = false;
    scene.add(this._wire);

    this._pitchObj = new THREE.Object3D();
    this._pitchObj.position.y = EYE_HEIGHT;
    this._leanPivot.add(this._pitchObj);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat);
    this._pitchObj.add(head);
    this._pitchObj.add(makeSunglasses());

    scene.add(this.group);

    this._targetPos   = new THREE.Vector3();
    this._targetYaw   = 0;
    this._targetPitch = 0;
    this._targetLean  = 0;
    this._crouching   = false;
    this._initialized = false;
    this._leanAngle = 0;
    this._eyeY      = EYE_HEIGHT;
    this._bodyScale = 1;
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
    if (msg.lean      !== undefined) this._targetLean  = msg.lean;
    if (msg.crouching !== undefined) this._crouching   = msg.crouching;

    if (msg.weapon !== undefined) {
      this._gun.visible          = msg.weapon !== 'dart';
      this._dartLauncher.visible = msg.weapon === 'dart';
    }

    // Deployed dart wires: flattened [ax,ay,az,bx,by,bz] per segment, or absent
    if (msg.type === 'playerState') {
      if (msg.wire && msg.wire.length >= 6) {
        const n = Math.min(msg.wire.length, this._wireBuf.length);
        for (let i = 0; i < n; i++) this._wireBuf[i] = msg.wire[i];
        this._wire.geometry.attributes.position.needsUpdate = true;
        this._wire.geometry.setDrawRange(0, Math.floor(n / 3));
        this._wire.material.color.setHex(msg.wireHot ? 0xffee44 : 0x66ccff);
        this._wire.visible = true;
      } else {
        this._wire.visible = false;
      }
    }
  }

  update(dt) {
    const t = 0.18;
    this.group.position.lerp(this._targetPos, t);
    this.group.rotation.y          += (this._targetYaw   - this.group.rotation.y)          * t;
    this._pitchObj.rotation.x      += (this._targetPitch - this._pitchObj.rotation.x)      * t;
    this._gun.rotation.x           += (this._targetPitch * 0.35 - this._gun.rotation.x)    * t;

    const leanTarget = -this._targetLean * LEAN_MAX;
    this._leanAngle += (leanTarget - this._leanAngle) * Math.min(1, dt * 10);
    this._leanPivot.rotation.z = this._leanAngle;

    const k = Math.min(1, dt * 10);
    const targetEyeY = this._crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this._eyeY += (targetEyeY - this._eyeY) * k;
    this._pitchObj.position.y = this._eyeY;

    // Body shrinks when crouching (capsule scales from the feet); gun follows
    const targetScale = this._crouching ? 0.62 : 1;
    this._bodyScale += (targetScale - this._bodyScale) * k;
    this._body.scale.y    = this._bodyScale;
    this._body.position.y = (BODY_TOTAL / 2) * this._bodyScale;
    this._gun.position.y  = this._eyeY * 0.75;
    this._dartLauncher.position.y = this._eyeY * 0.75;
    this._dartLauncher.rotation.x = this._gun.rotation.x;
  }

  dispose(scene) {
    scene.remove(this.group);
    scene.remove(this._wire);
    this._wire.geometry.dispose();
    this._wire.material.dispose();
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
