import * as THREE from 'three';

// Everything shares one rear reference (z = REAR) and the muzzle (z = MUZZLE),
// so the back of the slide, the frame and the grip backstrap all line up.
const REAR   =  0.05;
const MUZZLE = -0.15;

const SLIDE_LEN       = REAR - MUZZLE;             // 0.20
const SLIDE_REST      = (REAR + MUZZLE) / 2;       // centre z = -0.05
const SLIDE_TRAVEL     = 0.09;                      // rack-back distance (2x)
const BARREL_LEN       = SLIDE_TRAVEL;              // barrel rear flush with slide at full rack
const SLIDE_BACK_DUR   = (0.208 * 0.25) / 2;        // rack phase — 2x faster
const SLIDE_RETURN_DUR = (0.208 * 0.75) / 1.5;      // return phase — 1.5x faster
const SLIDE_CYCLE      = SLIDE_BACK_DUR + SLIDE_RETURN_DUR;
const SLIDE_BACK_FRAC  = SLIDE_BACK_DUR / SLIDE_CYCLE;

export class Gun {
  constructor(camera) {
    const group = new THREE.Group();

    // Per-instance materials so the ammo dissolve only affects THIS gun
    const GREY = new THREE.MeshLambertMaterial({ color: 0x2a2a2a, transparent: true });
    const DARK = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, transparent: true });
    this._mats = [GREY, DARK];

    // Slide (top) — rear at REAR, front at the muzzle; covers the barrel at rest
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.030, SLIDE_LEN), GREY);
    slide.position.set(0, 0.006, SLIDE_REST);
    group.add(slide);
    this._slide = slide;

    // Frame / lower receiver — rear aligned at REAR, sits under the slide
    const frameLen = 0.16;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, frameLen), DARK);
    frame.position.set(0, -0.012, REAR - frameLen / 2);
    group.add(frame);

    // Barrel — fixed; front flush with slide/muzzle, rear flush with slide at full rack
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, BARREL_LEN), DARK);
    barrel.position.set(0, 0.006, MUZZLE + BARREL_LEN / 2);
    group.add(barrel);

    // Grip / handle — backstrap aligned with the slide rear at REAR
    const gripLen = 0.05;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.075, gripLen), DARK);
    grip.position.set(0, -0.05, REAR - gripLen / 2);
    group.add(grip);

    // Muzzle flash + tracer origin (at the muzzle)
    this._flash = new THREE.PointLight(0xff9900, 0, 2.5);
    this._flash.position.set(0, 0.006, MUZZLE);
    group.add(this._flash);
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.006, MUZZLE);
    group.add(this.muzzlePoint);

    // Ejection port (right of the slide)
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
    this._pAlpha      = 0;

    this._buildShapeCloud();
  }

  // A cloud of small blue cubes sampled inside the gun's part volumes. Parented
  // to the gun so it follows you; it cross-fades in as the solid gun fades out,
  // and floats gently. By ~1 round the solid gun is gone and only this remains.
  _buildShapeCloud() {
    const parts = [
      { c: [0,  0.006, SLIDE_REST],              s: [0.030, 0.030, SLIDE_LEN] },
      { c: [0, -0.012, REAR - 0.08],             s: [0.024, 0.018, 0.16] },
      { c: [0,  0.006, MUZZLE + BARREL_LEN / 2], s: [0.012, 0.012, BARREL_LEN] },
      { c: [0, -0.05,  REAR - 0.025],            s: [0.022, 0.075, 0.05] },
    ];
    const weights = parts.map(p => p.s[0] * p.s[1] * p.s[2]);
    const wsum = weights.reduce((a, b) => a + b, 0);

    this._pmat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0, depthWrite: false });
    const pgeo = new THREE.BoxGeometry(0.0065, 0.0065, 0.0065);
    this._pcloud = new THREE.Group();
    this._pcloud.visible = false;
    this._group.add(this._pcloud);

    this._shapeParts = [];
    for (let i = 0; i < 64; i++) {
      let r = Math.random() * wsum, pi = 0;
      while (r > weights[pi] && pi < parts.length - 1) { r -= weights[pi]; pi++; }
      const p = parts[pi];
      const base = new THREE.Vector3(
        p.c[0] + (Math.random() - 0.5) * p.s[0],
        p.c[1] + (Math.random() - 0.5) * p.s[1],
        p.c[2] + (Math.random() - 0.5) * p.s[2],
      );
      const mesh = new THREE.Mesh(pgeo, this._pmat);
      mesh.position.copy(base);
      this._pcloud.add(mesh);
      this._shapeParts.push({
        mesh, base,
        phase: new THREE.Vector3(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        freq:  1.5 + Math.random() * 2.5,
        amp:   0.003 + Math.random() * 0.005,
      });
    }
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; }
  get canFire()  { return this._slideT <= 0; }

  // Ammo fraction 0..1. From full down to ~5 rounds the gun is solid. Below that
  // the solid mesh fades toward transparent while a gun-shaped blue particle
  // cloud cross-fades in; by ~1 round the gun is basically just the cloud.
  setAmmoFraction(f) {
    f = Math.max(0, Math.min(1, f));
    const PARTICLE_START = 0.55; // ~5 rounds (5/10 = 0.5, with a little lead)
    const GUN_GONE       = 0.12; // ~1 round
    const solid = Math.max(0, Math.min(1, (f - GUN_GONE) / (PARTICLE_START - GUN_GONE)));
    const blue  = 1 - f;
    for (const m of this._mats) {
      m.opacity = 0.05 + 0.95 * solid;            // ~transparent near 1 round
      m.emissive.setRGB(0.08 * blue, 0.35 * blue, 0.85 * blue);
    }
    this._pAlpha = 1 - solid;
    this._pmat.opacity   = this._pAlpha * 0.95;
    this._pcloud.visible = this._pAlpha > 0.02;
  }

  fire() {
    if (!this.canFire) return false;
    this._flash.intensity = 4;
    this._flashTimer = 0.055;
    this._group.position.z += 0.05; // whole-gun kickback
    this._recoilPitch = 0.18;       // muzzle climbs UP
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
    this._group.rotation.x  = this._recoilPitch; // pivot at grip → muzzle rises

    // Rack back quickly, return a bit slower; next shot only when fully home
    let offset = 0;
    if (this._slideT > 0) {
      this._slideT = Math.max(0, this._slideT - dt);
      const frac = 1 - this._slideT / SLIDE_CYCLE;
      offset = frac < SLIDE_BACK_FRAC
        ? (frac / SLIDE_BACK_FRAC) * SLIDE_TRAVEL
        : (1 - (frac - SLIDE_BACK_FRAC) / (1 - SLIDE_BACK_FRAC)) * SLIDE_TRAVEL;
    }
    this._slide.position.z = SLIDE_REST + offset;

    // Float the gun-shape particle cloud while it's showing
    this._time += dt;
    if (this._pcloud.visible) {
      const t = this._time, boost = 0.6 + this._pAlpha;
      for (const sp of this._shapeParts) {
        sp.mesh.position.set(
          sp.base.x + Math.sin(t * sp.freq        + sp.phase.x) * sp.amp * boost,
          sp.base.y + Math.sin(t * sp.freq * 1.13 + sp.phase.y) * sp.amp * boost,
          sp.base.z + Math.sin(t * sp.freq * 0.87 + sp.phase.z) * sp.amp * boost,
        );
      }
    }
  }
}
