import * as THREE from 'three';

const GREY  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const DARK  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

const SLIDE_REST   = -0.065; // z of slide at rest (covers the barrel)
const SLIDE_TRAVEL = 0.03;   // how far the slide racks back
const SLIDE_CYCLE  = 0.13;   // seconds for the full back-and-forth

export class Gun {
  constructor(camera) {
    const group = new THREE.Group();

    // Lower frame / receiver
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.020, 0.135), DARK);
    frame.position.set(0, -0.013, -0.02);
    group.add(frame);

    // Barrel — fixed, tucked under the slide so it is hidden until the slide racks back
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.15), DARK);
    barrel.position.set(0, 0.006, -0.073); // spans z ≈ -0.148 … 0.002
    group.add(barrel);

    // Slide — covers the barrel at rest (front face at -0.15), recoils backwards on fire
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.030, 0.17), GREY);
    slide.position.set(0, 0.006, SLIDE_REST); // spans z ≈ -0.15 … 0.02
    group.add(slide);
    this._slide = slide;

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.070, 0.055), DARK);
    grip.position.set(0, -0.045, 0.022);
    group.add(grip);

    // Muzzle flash + tracer origin (at the barrel tip)
    this._flash = new THREE.PointLight(0xff9900, 0, 2.5);
    this._flash.position.set(0, 0.006, -0.15);
    group.add(this._flash);
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.006, -0.15);
    group.add(this.muzzlePoint);

    // Ejection port (right side of the slide)
    this.ejectPoint = new THREE.Object3D();
    this.ejectPoint.position.set(0.02, 0.012, -0.01);
    group.add(this.ejectPoint);

    group.position.set(0.16, -0.13, -0.28);
    camera.add(group);

    this._group       = group;
    this._restZ       = group.position.z;
    this._flashTimer  = 0;
    this._recoilPitch = 0;
    this._slideT      = 0; // time remaining in the slide cycle
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; }

  fire() {
    this._flash.intensity = 4;
    this._flashTimer = 0.055;
    this._group.position.z += 0.05; // whole-gun kickback
    this._recoilPitch = 0.18;       // muzzle climbs UP
    this._slideT = SLIDE_CYCLE;     // start the slide cycle
  }

  update(dt) {
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) { this._flash.intensity = 0; this._flashTimer = 0; }
    }

    // Kickback returns; muzzle pitches UP then settles (pivot at the grip → tip rises)
    this._group.position.z += (this._restZ - this._group.position.z) * Math.min(1, dt * 14);
    this._recoilPitch      += (0 - this._recoilPitch) * Math.min(1, dt * 10);
    this._group.rotation.x  = this._recoilPitch;

    // Linear slide travel: back over the first 40% of the cycle, forward over the rest
    let offset = 0;
    if (this._slideT > 0) {
      this._slideT = Math.max(0, this._slideT - dt);
      const frac = 1 - this._slideT / SLIDE_CYCLE; // 0 → 1
      offset = frac < 0.4
        ? (frac / 0.4) * SLIDE_TRAVEL              // racking back
        : (1 - (frac - 0.4) / 0.6) * SLIDE_TRAVEL; // returning forward
    }
    this._slide.position.z = SLIDE_REST + offset;
  }
}
