import * as THREE from 'three';
import { PlayerController } from './PlayerController.js';
import { Gun } from '../weapons/Gun.js';
import { Knife } from '../weapons/Knife.js';
import { EYE_HEIGHT, CROUCH_EYE_HEIGHT, LEAN_MAX } from '../constants.js';

export class LocalPlayer {
  constructor(scene, canvas, settings = {}) {
    this.yawObj = new THREE.Object3D();
    this.yawObj.position.set(0, 0, 3);

    // Pinned at the feet — the whole body swings in an arc from this point
    this.leanPivot = new THREE.Object3D();
    this.yawObj.add(this.leanPivot);

    this.pitchObj = new THREE.Object3D();
    this.pitchObj.position.y = EYE_HEIGHT;
    this.leanPivot.add(this.pitchObj);

    const fov = settings.fov ?? 90;
    this.camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.05, 200);
    this.pitchObj.add(this.camera);
    scene.add(this.yawObj);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.gun         = new Gun(this.camera);
    this.knife       = new Knife(this.camera);
    this._stabReturn = false;
    this.controller  = new PlayerController(canvas, this.yawObj, this.pitchObj, settings);

    this._leanAngle = 0;
    this._eyeY      = EYE_HEIGHT;
  }

  get isLocked()    { return this.controller.isLocked; }
  get isCrouching() { return this.controller.isCrouching; }
  getLean()         { return this.controller.lean; }

  // V key: knife flashes on screen for the animation duration then gun returns
  quickStab() {
    if (this.knife.isStabbing) return;
    this.gun.visible   = false;
    this.knife.visible = true;
    this.knife.stab();
    this._stabReturn = true;
  }

  update(dt, wallManager) {
    this.controller.update(dt, wallManager);
    this.gun.update(dt);
    this.knife.update(dt);

    // Once the stab animation ends, restore the gun automatically
    if (this._stabReturn && !this.knife.isStabbing) {
      this.knife.visible = false;
      this.gun.visible   = true;
      this._stabReturn   = false;
    }

    const lerp = Math.min(1, dt * 10);
    const targetEyeY = this.isCrouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this._eyeY += (targetEyeY - this._eyeY) * lerp;
    this.pitchObj.position.y = this._eyeY;

    const leanTarget = this.controller.lean * LEAN_MAX;
    this._leanAngle += (leanTarget - this._leanAngle) * lerp;
    this.leanPivot.rotation.z = -this._leanAngle;
  }

  getPosition() { return this.yawObj.position.clone(); }
  getVelocity() { return this.controller.velocity.clone(); }
  getYaw()      { return this.yawObj.rotation.y; }
  getPitch()    { return this.pitchObj.rotation.x; }

  respawn(pos) {
    this.yawObj.position.set(pos.x, 0, pos.z);
    this.controller.velocityY = 0;
    this.controller.onGround  = true;
  }
}
