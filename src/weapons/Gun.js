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
const SLIDE_BACK_FRAC  = SLIDE_BACK_DUR / SLIDE_CYCLE;

// The gun's parts. Particles are split across these so the barrel, slide, frame
// and grip each form as a distinct dense cluster.
const PART_BOXES = [
  { c: [0,  0.006, SLIDE_REST],              s: [0.030, 0.030, SLIDE_LEN] }, // slide
  { c: [0, -0.012, REAR - 0.08],             s: [0.024, 0.018, 0.16] },      // frame
  { c: [0,  0.006, MUZZLE + BARREL_LEN / 2], s: [0.012, 0.012, BARREL_LEN] },// barrel
  { c: [0, -0.05,  REAR - 0.025],            s: [0.022, 0.075, 0.05] },      // grip
];
const PARTICLE_COUNT = 3400;
const SLIDE_PART = 0; // index of the slide box in PART_BOXES (it racks back on fire)

const _m4 = new THREE.Matrix4();
const _v  = new THREE.Vector3();
const _s  = new THREE.Vector3();
const _q  = new THREE.Quaternion();

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
    this._spreadTarget = 0;
    this._frac        = 1;
    this._reloading   = false;
    this._reloadPr    = 0;
    this._reloadSpread0 = 0;

    this._buildCloud();

    // Converging reload-flourish particles (parented → follow the gun)
    this._fxGeo = new THREE.BoxGeometry(0.006, 0.006, 0.006);
    this._fxMat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, depthWrite: false });
    this._reloadFx = [];
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
      // ~28% of particles "stray": they fling far and bob a lot as the gun
      // morphs, so it disperses into a wispy, less-defined gun instead of a
      // tight blob. The rest stay close and hold the gun's shape.
      const stray = Math.random() < 0.28;
      // ~half the particles fade out below their dropAt ammo fraction (so the
      // more you shoot, the more vanish); the rest never fade and hold the shape.
      const fader = Math.random() < 0.5;
      this._pts.push({
        base,
        part: pi,
        scatter: dir.multiplyScalar(stray ? 0.12 + Math.random() * 0.22 : 0.012 + Math.random() * 0.04),
        phase: new THREE.Vector3(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        freq:  (stray ? 0.8 : 1.5) + Math.random() * 2.2,
        amp:   stray ? 0.012 + Math.random() * 0.02 : 0.003 + Math.random() * 0.004,
        dropAt:   fader ? 0.05 + Math.random() * 0.45 : -1, // -1 = never fades
        presence: 1,
      });
      _m4.makeTranslation(base.x, base.y, base.z);
      this._inst.setMatrixAt(i, _m4);
    }
    this._inst.instanceMatrix.needsUpdate = true;
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; }
  get canFire()  { return this._slideT <= 0; }

  // Ammo fraction 0..1. The gun stays solid + near-black for the top half of the
  // magazine; only below MORPH_START (half = ~10 of 20) do the particles begin to
  // scatter, float and turn blue. Reload pulls them back home.
  setAmmoFraction(f) {
    f = Math.max(0, Math.min(1, f));
    const MORPH_START = 0.5; // morph begins at 10/20
    // Set a TARGET spread; update() eases toward it so stepping one round at a
    // time (e.g. 6→7 on regen) glides between stages instead of snapping.
    this._spreadTarget = Math.max(0, Math.min(1, (MORPH_START - f) / MORPH_START));
    this._frac = f; // drives per-particle fade
  }

  // Begin a reload: smoothly converge from the current spread over the whole
  // reload (set via setReloadProgress) and play the converging flourish.
  startReload() {
    this._reloading     = true;
    this._reloadPr      = 0;
    this._reloadSpread0 = this._spread; // 1 if empty/spread, ~0 if still solid
    this._spawnReloadFlourish();
  }
  setReloadProgress(pr) { this._reloadPr = Math.max(0, Math.min(1, pr)); }
  finishReload() { this._reloading = false; this.setAmmoFraction(1); }

  // A short burst of the converging flourish — used when a single round trickles
  // back in (passive regen) so blue particles float into the barrel.
  flourish(n = 14) { this._spawnReloadFlourish(n); }

  // Old-style flourish: a burst of blue cubes that fly in and into the barrel /
  // slide. Parented to the gun (and never frustum-culled) so it follows you.
  _spawnReloadFlourish(N = 80) {
    for (let i = 0; i < N; i++) {
      const from = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.42, (Math.random() - 0.5) * 0.5,
      );
      // Target the slide / barrel region so particles read as going into the barrel
      const tb = Math.random() < 0.5 ? PART_BOXES[0] : PART_BOXES[2];
      const target = new THREE.Vector3(
        tb.c[0] + (Math.random() - 0.5) * tb.s[0],
        tb.c[1] + (Math.random() - 0.5) * tb.s[1],
        tb.c[2] + (Math.random() - 0.5) * tb.s[2],
      );
      const mesh = new THREE.Mesh(this._fxGeo, this._fxMat);
      mesh.position.copy(from);
      mesh.frustumCulled = false;
      this._group.add(mesh);
      this._reloadFx.push({ mesh, from, target, age: 0, life: 0.7 + Math.random() * 0.7 });
    }
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

    // Slide rack: linear back then forward over the cycle (gates fire rate too)
    let slideOffset = 0;
    if (this._slideT > 0) {
      this._slideT = Math.max(0, this._slideT - dt);
      const frac = 1 - this._slideT / SLIDE_CYCLE;
      slideOffset = frac < SLIDE_BACK_FRAC
        ? (frac / SLIDE_BACK_FRAC) * SLIDE_TRAVEL
        : (1 - (frac - SLIDE_BACK_FRAC) / (1 - SLIDE_BACK_FRAC)) * SLIDE_TRAVEL;
    }

    // Position every instance (parented to the gun, so it follows you): home when
    // full, scattered + floating as it empties, slide particles racking back. Each
    // fader particle shrinks to nothing below its dropAt and grows back on reload,
    // then rides the scatter home as the magazine refills.
    const t = this._time += dt;
    // While reloading, converge smoothly from the start-spread to 0 over the full
    // reload and force every particle present, so they glide home (no pop/snap).
    let sp, forcePresent = false;
    if (this._reloading) {
      sp = this._reloadSpread0 * (1 - this._reloadPr);
      this._spread = this._spreadTarget = sp;
      forcePresent = true;
    } else {
      // Ease the spread toward its target so per-round ammo changes glide
      this._spread += (this._spreadTarget - this._spread) * Math.min(1, dt * 5);
      sp = this._spread;
    }
    this._mat.color.setRGB(0.015 + 0.275 * sp, 0.015 + 0.645 * sp, 0.02 + 0.98 * sp);
    const fr = this._frac, fade = Math.min(1, dt * 6);
    const pts = this._pts, inst = this._inst;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const target = (forcePresent || fr >= p.dropAt) ? 1 : 0;
      p.presence += (target - p.presence) * fade;
      const slz = p.part === SLIDE_PART ? slideOffset : 0;
      _v.set(
        p.base.x + p.scatter.x * sp + Math.sin(t * p.freq        + p.phase.x) * p.amp * sp,
        p.base.y + p.scatter.y * sp + Math.sin(t * p.freq * 1.13 + p.phase.y) * p.amp * sp,
        p.base.z + slz + p.scatter.z * sp + Math.sin(t * p.freq * 0.87 + p.phase.z) * p.amp * sp,
      );
      const s = p.presence;
      _s.set(s, s, s);
      _m4.compose(_v, _q, _s);
      inst.setMatrixAt(i, _m4);
    }
    inst.instanceMatrix.needsUpdate = true;

    // Converging reload flourish — fly in from around the gun and merge in
    for (let i = this._reloadFx.length - 1; i >= 0; i--) {
      const fx = this._reloadFx[i];
      fx.age += dt;
      const tt = fx.age / fx.life;
      if (tt >= 1) { this._group.remove(fx.mesh); this._reloadFx.splice(i, 1); continue; }
      fx.mesh.position.lerpVectors(fx.from, fx.target, 1 - (1 - tt) * (1 - tt)); // easeOut
      fx.mesh.scale.setScalar(tt < 0.7 ? 1 : Math.max(0.001, 1 - (tt - 0.7) / 0.3));
    }
  }
}
