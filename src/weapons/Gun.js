import * as THREE from 'three';

const GREY  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const DARK  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

export class Gun {
  constructor(camera) {
    const group = new THREE.Group();

    // Frame / lower receiver (static)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.020, 0.135), DARK);
    frame.position.set(0, -0.013, -0.02);
    group.add(frame);

    // Barrel (extends forward; exposed when the slide racks back)
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.011, 0.07), DARK);
    barrel.position.set(0, 0.004, -0.125);
    group.add(barrel);

    // Slide (top — recoils backwards when fired, revealing the barrel)
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.12), GREY);
    slide.position.set(0, 0.006, -0.02);
    group.add(slide);
    this._slide     = slide;
    this._slideRest = slide.position.z;

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.070, 0.055), DARK);
    grip.position.set(0, -0.045, 0.022);
    group.add(grip);

    // Muzzle flash
    this._flash = new THREE.PointLight(0xff9900, 0, 2.5);
    this._flash.position.set(0, 0.006, -0.15);
    group.add(this._flash);

    // Muzzle reference — tracer starts here
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.006, -0.15);
    group.add(this.muzzlePoint);

    // Ejection port — shells spawn here (right side of the slide)
    this.ejectPoint = new THREE.Object3D();
    this.ejectPoint.position.set(0.02, 0.012, -0.01);
    group.add(this.ejectPoint);

    group.position.set(0.16, -0.13, -0.28);
    camera.add(group);

    this._group       = group;
    this._restZ       = group.position.z;
    this._flashTimer  = 0;
    this._recoilPitch = 0;
    this._slideBack   = 0;
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; }

  fire() {
    this._flash.intensity = 4;
    this._flashTimer = 0.055;
    this._group.position.z += 0.05;   // whole-gun kickback
    this._recoilPitch = 0.18;         // muzzle climb
    this._slideBack   = 0.022;        // slide racks back
  }

  update(dt) {
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) { this._flash.intensity = 0; this._flashTimer = 0; }
    }
    this._group.position.z += (this._restZ - this._group.position.z) * Math.min(1, dt * 14);
    this._recoilPitch      += (0 - this._recoilPitch) * Math.min(1, dt * 10);
    this._group.rotation.x  = -this._recoilPitch;

    // Slide snaps back fast, returns quickly (spring)
    this._slideBack      += (0 - this._slideBack) * Math.min(1, dt * 22);
    this._slide.position.z = this._slideRest + this._slideBack;
  }
}
