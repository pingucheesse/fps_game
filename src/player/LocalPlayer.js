import * as THREE from 'three';
import { PlayerController } from './PlayerController.js';
import { Gun } from '../weapons/Gun.js';
import { Knife } from '../weapons/Knife.js';
import { EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../constants.js';

const LEAN_MAX   = 0.20;  // max camera roll (radians ~11°)
const LEAN_SHIFT = 0.22;  // max sideways camera shift (metres)

export class LocalPlayer {
  constructor(scene, canvas, settings = {}) {
    this.yawObj = new THREE.Object3D();
    this.yawObj.position.set(0, 0, 3);

    this.pitchObj = new THREE.Object3D();
    this.pitchObj.position.y = EYE_HEIGHT;
    this.yawObj.add(this.pitchObj);

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

    // Smoothly lower / raise camera to match crouch state
    const targetY = this.isCrouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.pitchObj.position.y += (targetY - this.pitchObj.position.y) * Math.min(1, dt * 10);

    // Q/E lean: roll camera and shift sideways
    const leanTarget = this.controller.lean * LEAN_MAX;
    this._leanAngle += (leanTarget - this._leanAngle) * Math.min(1, dt * 10);
    this.camera.rotation.z = -this._leanAngle;

    const shiftTarget = this.controller.lean * LEAN_SHIFT;
    this.pitchObj.position.x += (shiftTarget - this.pitchObj.position.x) * Math.min(1, dt * 10);
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
