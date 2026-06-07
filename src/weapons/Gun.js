import * as THREE from 'three';

const GREY  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const DARK  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

export class Gun {
  constructor(camera) {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.052, 0.32), GREY);
    group.add(body);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.22), DARK);
    barrel.position.set(0, 0.016, -0.26);
    group.add(barrel);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.11), DARK);
    stock.position.set(0, -0.018, 0.19);
    group.add(stock);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.05), DARK);
    mag.position.set(0, -0.065, 0.02);
    group.add(mag);

    // Sight rail nub
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.06), DARK);
    sight.position.set(0, 0.031, -0.04);
    group.add(sight);

    // Muzzle flash light
    this._flash = new THREE.PointLight(0xff9900, 0, 2.5);
    this._flash.position.set(0, 0, -0.38);
    group.add(this._flash);

    // Muzzle world reference point
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.016, -0.38);
    group.add(this.muzzlePoint);

    // Position in camera space: slightly right, down, and forward
    group.position.set(0.16, -0.13, -0.28);
    camera.add(group);

    this._group     = group;
    this._restZ     = group.position.z;
    this._flashTimer = 0;
  }

  fire() {
    this._flash.intensity = 4;
    this._flashTimer = 0.055;
    this._group.position.z += 0.06; // recoil kick
  }

  update(dt) {
    // Fade flash
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) { this._flash.intensity = 0; this._flashTimer = 0; }
    }
    // Recover from recoil
    this._group.position.z += (this._restZ - this._group.position.z) * Math.min(1, dt * 14);
  }
}
