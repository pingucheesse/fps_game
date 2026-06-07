import * as THREE from 'three';
import { PLAYER_RADIUS, EYE_HEIGHT } from '../constants.js';

function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.65, 0.55);
}

const _matGrey  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const _matDark  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _matBlack = new THREE.MeshLambertMaterial({ color: 0x080808 });

// ── Body: capsule so top & bottom edges are rounded ──────────────────────────
// Head radius = 0.27, head centre = EYE_HEIGHT (1.6m)
// → head bottom = 1.6 - 0.27 = 1.33m  ← body top must end here, no higher
// CapsuleGeometry(radius, length, capSegs, radialSegs)
// total height = length + 2*radius  →  length = 1.33 - 2*0.3 = 0.73
const BODY_TOTAL = 1.33;
const BODY_LENGTH = BODY_TOTAL - 2 * PLAYER_RADIUS; // 0.73

function makeBody(mat) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, BODY_LENGTH, 4, 10),
    mat
  );
  // CapsuleGeometry is centred at 0; shift so bottom sits at y=0 (feet)
  mesh.position.y = BODY_TOTAL / 2; // 0.665
  return mesh;
}

// ── Gun (same geometry as local player) ──────────────────────────────────────
function makeGun() {
  const g = new THREE.Group();

  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.052, 0.32), _matGrey));

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.22), _matDark);
  barrel.position.set(0, 0.016, -0.26);
  g.add(barrel);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.11), _matDark);
  stock.position.set(0, -0.018, 0.19);
  g.add(stock);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.05), _matDark);
  mag.position.set(0, -0.065, 0.02);
  g.add(mag);

  g.position.set(0.16, -0.13, -0.28); // camera-relative, same as LocalPlayer
  return g;
}

// ── Sunglasses ────────────────────────────────────────────────────────────────
// Camera / pitchObj looks in -Z, so FRONT of head = -Z direction.
// Head radius = 0.27 → place lenses at z = -0.30 (safely outside sphere).
// No temples: they'd route back through the head and clip.
function makeSunglasses() {
  const g = new THREE.Group();

  // Verify lens corners clear the head sphere (radius 0.27):
  //   lens centre (-0.085, 0.01, -0.30) → distance ≈ 0.31 > 0.27 ✓
  //   far corner  (-0.135, 0.04, -0.30) → distance ≈ 0.33 > 0.27 ✓
  const lensGeo = new THREE.BoxGeometry(0.10, 0.06, 0.014);

  const ll = new THREE.Mesh(lensGeo, _matBlack);
  ll.position.set(-0.082, 0.01, -0.30);
  g.add(ll);

  const rl = new THREE.Mesh(lensGeo, _matBlack);
  rl.position.set(0.082, 0.01, -0.30);
  g.add(rl);

  // Nose bridge connecting the two lenses
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.010), _matBlack);
  bridge.position.set(0, 0.01, -0.302);
  g.add(bridge);

  // Short temple stubs — only extend outward from the lens outer edge, not back
  // through the head. Length kept small so they stay clear of the sphere.
  const templGeo = new THREE.BoxGeometry(0.008, 0.008, 0.06);
  const lt = new THREE.Mesh(templGeo, _matBlack);
  lt.position.set(-0.135, 0.01, -0.27);
  g.add(lt);

  const rt = new THREE.Mesh(templGeo, _matBlack);
  rt.position.set(0.135, 0.01, -0.27);
  g.add(rt);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────────

export class RemotePlayer {
  constructor(scene, peerId) {
    this.peerId = peerId;

    const mat = new THREE.MeshLambertMaterial({ color: hashColor(peerId) });

    // Root group — yaw applied here, world position set here
    this.group = new THREE.Group();
    this.group.add(makeBody(mat));

    // Pitch object at eye height: head + sunglasses + gun all rotate with it
    this._pitchObj = new THREE.Object3D();
    this._pitchObj.position.y = EYE_HEIGHT;
    this.group.add(this._pitchObj);

    // Head sphere — centre exactly at EYE_HEIGHT, bottom just touches body top
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat);
    this._pitchObj.add(head);

    this._pitchObj.add(makeSunglasses());
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
    this.group.rotation.y     += (this._targetYaw   - this.group.rotation.y)     * t;
    this._pitchObj.rotation.x += (this._targetPitch - this._pitchObj.rotation.x) * t;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
