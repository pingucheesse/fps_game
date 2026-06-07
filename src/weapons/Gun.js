import * as THREE from 'three';

const GREY  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const DARK  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

export class Gun {
  constructor(camera) {
    const group = new THREE.Group();

    // Slide
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.040, 0.14), GREY);
    slide.position.set(0, 0.006, -0.02);
    group.add(slide);

    // Barrel (extends forward of slide)
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.013, 0.06), DARK);
    barrel.position.set(0, 0.006, -0.12);
    group.add(barrel);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.070, 0.055), DARK);
    grip.position.set(0, -0.033, 0.022);
    group.add(grip);

    // Muzzle flash
    this._flash = new THREE.PointLight(0xff9900, 0, 2.5);
    this._flash.position.set(0, 0.006, -0.15);
    group.add(this._flash);

    // Muzzle world reference — tracer starts here
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.006, -0.15);
    group.add(this.muzzlePoint);

    group.position.set(0.16, -0.13, -0.28);
    camera.add(group);

    this._group      = group;
    this._restZ      = group.position.z;
    this._flashTimer = 0;
  }

  fire() {
    this._flash.intensity = 4;
    this._flashTimer = 0.055;
    this._group.position.z += 0.05;
  }

  update(dt) {
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) { this._flash.intensity = 0; this._flashTimer = 0; }
    }
    this._group.position.z += (this._restZ - this._group.position.z) * Math.min(1, dt * 14);
  }
}
