import * as THREE from 'three';

const BLADE_MAT  = new THREE.MeshLambertMaterial({ color: 0xd0d8e0 }); // steel
const HANDLE_MAT = new THREE.MeshLambertMaterial({ color: 0x1e0e06 }); // dark wood
const GUARD_MAT  = new THREE.MeshLambertMaterial({ color: 0x666666 }); // grey metal

export class Knife {
  constructor(camera) {
    this._group = new THREE.Group();

    // Blade — long flat bar
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.24, 0.003), BLADE_MAT);
    blade.position.set(0, 0.13, 0);
    this._group.add(blade);

    // Guard — small horizontal crosspiece
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.018), GUARD_MAT);
    guard.position.set(0, 0, 0);
    this._group.add(guard);

    // Handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.085, 0.020), HANDLE_MAT);
    handle.position.set(0, -0.048, 0);
    this._group.add(handle);

    // Rest transform: lower-right of screen, blade pointing up-left
    this._group.position.set(0.14, -0.11, -0.20);
    this._group.rotation.set(-0.30, 0.08, 0.35);

    this._restPos = this._group.position.clone();
    this._restRot = this._group.rotation.clone();

    camera.add(this._group);
    this._group.visible = false;

    this._stabbing  = false;
    this._stabTimer = 0;
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; }

  stab() {
    this._stabbing  = true;
    this._stabTimer = 0;
  }

  update(dt) {
    if (!this._stabbing) return;

    this._stabTimer += dt;
    const LUNGE  = 0.11; // seconds to fully extend
    const RETURN = 0.18; // seconds to come back

    if (this._stabTimer < LUNGE) {
      const t = this._stabTimer / LUNGE;
      const ease = Math.sin(t * Math.PI / 2); // ease-in
      this._group.position.z  = this._restPos.z - ease * 0.32;
      this._group.rotation.x  = this._restRot.x - ease * 0.4;
    } else if (this._stabTimer < LUNGE + RETURN) {
      const t = (this._stabTimer - LUNGE) / RETURN;
      const ease = 1 - Math.pow(1 - t, 2); // ease-out
      this._group.position.z = this._restPos.z - (1 - ease) * 0.32;
      this._group.rotation.x = this._restRot.x - (1 - ease) * 0.4;
    } else {
      this._group.position.z = this._restPos.z;
      this._group.rotation.x = this._restRot.x;
      this._stabbing = false;
    }
  }
}
