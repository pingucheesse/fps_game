import * as THREE from 'three';

// Shared rear reference / muzzle so the sampled part boxes line up into a pistol.
const REAR   =  0.05;
const MUZZLE = -0.15;
const SLIDE_LEN    = REAR - MUZZLE;        // 0.20
const SLIDE_REST   = (REAR + MUZZLE) / 2;  // -0.05
const SLIDE_TRAVEL = 0.09;
const BARREL_LEN   = SLIDE_TRAVEL;
const SLIDE_BACK_DUR   = (0.208 * 0.25) / 2;
const SLIDE_RETURN_DUR = (0.208 * 0.75) / 1.5;
const SLIDE_CYCLE      = SLIDE_BACK_DUR + SLIDE_RETURN_DUR; // fire-rate gate

// The gun's parts. Particles are split across these so the barrel, slide, frame
// and grip each form as a distinct dense cluster.
const PART_BOXES = [
  { c: [0,  0.006, SLIDE_REST],              s: [0.030, 0.030, SLIDE_LEN] }, // slide
  { c: [0, -0.012, REAR - 0.08],             s: [0.024, 0.018, 0.16] },      // frame
  { c: [0,  0.006, MUZZLE + BARREL_LEN / 2], s: [0.012, 0.012, BARREL_LEN] },// barrel
  { c: [0, -0.05,  REAR - 0.025],            s: [0.022, 0.075, 0.05] },      // grip
];
const PARTICLE_COUNT = 1600;

const _m4 = new THREE.Matrix4();

export class Gun {
  constructor(camera) {
    const group = new THREE.Group();

    this._flash = new THREE.PointLight(0xff9900, 0, 2.5);
    this._flash.position.set(0, 0.006, MUZZLE);
    group.add(this._flash);
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.006, MUZZLE);
    group.add(this.muzzlePoint);
    this.ejectPoint = new THREE.Object3D();
    this.ejectPoint.position.set(0.02, 0.012, -0.01);
    group.add(this.ejectPoint);

    group.position.set(0.16, -0.13, -0.28);
    camera.add(group);

    this._group       = group;
    this._restZ       = group.position.z;
    this._flashTimer  = 0;
    this._recoilPitch = 0;
    this._slideT      = 0;
    this._time        = 0;
    this._spread      = 0;

    this._buildCloud();
  }

  // Densely sample each part box → at full ammo the instances pack together so
  // it reads as a solid gun. Each particle remembers its home (base) position
  // and a scatter direction, so reload returns every particle to its own spot.
  _buildCloud() {
    const weights = PART_BOXES.map(p => p.s[0] * p.s[1] * p.s[2]);
    const wsum = weights.reduce((a, b) => a + b, 0);

    this._geo  = new THREE.BoxGeometry(0.0052, 0.0052, 0.0052);
    this._mat  = new THREE.MeshBasicMaterial({ color: 0x0b0b0d }); // near-black, opaque
    this._inst = new THREE.InstancedMesh(this._geo, this._mat, PARTICLE_COUNT);
    this._inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._inst.frustumCulled = false;
    this._group.add(this._inst);

    this._pts = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let r = Math.random() * wsum, pi = 0;
      while (r > weights[pi] && pi < PART_BOXES.length - 1) { r -= weights[pi]; pi++; }
      const p = PART_BOXES[pi];
      const base = new THREE.Vector3(
        p.c[0] + (Math.random() - 0.5) * p.s[0],
        p.c[1] + (Math.random() - 0.5) * p.s[1],
        p.c[2] + (Math.random() - 0.5) * p.s[2],
      );
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this._pts.push({
        base,
        scatter: dir.multiplyScalar(0.018 + Math.random() * 0.06),
        phase: new THREE.Vector3(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        freq:  1.5 + Math.random() * 2.5,
        amp:   0.004 + Math.random() * 0.005,
      });
      _m4.makeTranslation(base.x, base.y, base.z);
      this._inst.setMatrixAt(i, _m4);
    }
    this._inst.instanceMatrix.needsUpdate = true;
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; }
  get canFire()  { return this._slideT <= 0; }

  // Ammo fraction 0..1. Full = packed + near-black (looks solid). As it depletes
  // the particles scatter out / float and turn blue; reload pulls them home.
  setAmmoFraction(f) {
    f = Math.max(0, Math.min(1, f));
    const dep = 1 - f;
    this._mat.color.setRGB(0.04 + 0.25 * dep, 0.05 + 0.61 * dep, 0.06 + 0.94 * dep);
    this._spread = dep;
  }

  fire() {
    if (!this.canFire) return false;
    this._flash.intensity = 4;
    this._flashTimer = 0.055;
    this._group.position.z += 0.05;
    this._recoilPitch = 0.18;
    this._slideT = SLIDE_CYCLE;
    return true;
  }

  update(dt) {
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) { this._flash.intensity = 0; this._flashTimer = 0; }
    }
    this._group.position.z += (this._restZ - this._group.position.z) * Math.min(1, dt * 14);
    this._recoilPitch      += (0 - this._recoilPitch) * Math.min(1, dt * 10);
    this._group.rotation.x  = this._recoilPitch;
    if (this._slideT > 0) this._slideT = Math.max(0, this._slideT - dt);

    // Position every instance: home when full, scattered + floating as it empties
    const t = this._time += dt;
    const sp = this._spread;
    const pts = this._pts, inst = this._inst;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      _m4.makeTranslation(
        p.base.x + p.scatter.x * sp + Math.sin(t * p.freq        + p.phase.x) * p.amp * sp,
        p.base.y + p.scatter.y * sp + Math.sin(t * p.freq * 1.13 + p.phase.y) * p.amp * sp,
        p.base.z + p.scatter.z * sp + Math.sin(t * p.freq * 0.87 + p.phase.z) * p.amp * sp,
      );
      inst.setMatrixAt(i, _m4);
    }
    inst.instanceMatrix.needsUpdate = true;
  }
}
