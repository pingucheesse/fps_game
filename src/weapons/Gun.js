import * as THREE from 'three';

const GREY = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const DARK = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

// Everything shares one rear reference (z = REAR) and the muzzle (z = MUZZLE),
// so the back of the slide, the frame and the grip backstrap all line up.
const REAR   =  0.05;
const MUZZLE = -0.15;

const SLIDE_LEN    = REAR - MUZZLE;             // 0.20
const SLIDE_REST   = (REAR + MUZZLE) / 2;       // centre z = -0.05
const SLIDE_TRAVEL = 0.03;                      // rack-back distance
const SLIDE_CYCLE  = 0.13;                       // seconds for the full cycle

export class Gun {
  constructor(camera) {
    const group = new THREE.Group();

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

    // Barrel — fixed, hidden under the slide until it racks back
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.15), DARK);
    barrel.position.set(0, 0.006, -0.073); // front at ≈ -0.148, just behind the muzzle
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
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; }

  fire() {
    this._flash.intensity = 4;
    this._flashTimer = 0.055;
    this._group.position.z += 0.05; // whole-gun kickback
    this._recoilPitch = 0.18;       // muzzle climbs UP
    this._slideT = SLIDE_CYCLE;
  }

  update(dt) {
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) { this._flash.intensity = 0; this._flashTimer = 0; }
    }

    this._group.position.z += (this._restZ - this._group.position.z) * Math.min(1, dt * 14);
    this._recoilPitch      += (0 - this._recoilPitch) * Math.min(1, dt * 10);
    this._group.rotation.x  = this._recoilPitch; // pivot at grip → muzzle rises

    // Linear slide travel: back over first 40% of the cycle, forward over the rest
    let offset = 0;
    if (this._slideT > 0) {
      this._slideT = Math.max(0, this._slideT - dt);
      const frac = 1 - this._slideT / SLIDE_CYCLE;
      offset = frac < 0.4
        ? (frac / 0.4) * SLIDE_TRAVEL
        : (1 - (frac - 0.4) / 0.6) * SLIDE_TRAVEL;
    }
    this._slide.position.z = SLIDE_REST + offset;
  }
}
