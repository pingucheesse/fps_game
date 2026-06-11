import * as THREE from 'three';
import { PlayerController } from './PlayerController.js';
import { Gun } from '../weapons/Gun.js';
import { Knife } from '../weapons/Knife.js';
import { EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../constants.js';

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

    this.gun        = new Gun(this.camera);
    this.knife      = new Knife(this.camera);
    this._knifeMode = false;
    this.controller = new PlayerController(canvas, this.yawObj, this.pitchObj, settings);
  }

  get isLocked()    { return this.controller.isLocked; }
  get isCrouching() { return this.controller.isCrouching; }
  get isKnifeMode() { return this._knifeMode; }

  toggleKnife() {
    this._knifeMode  = !this._knifeMode;
    this.gun.visible   = !this._knifeMode;
    this.knife.visible =  this._knifeMode;
  }

  update(dt, wallManager) {
    this.controller.update(dt, wallManager);
    this.gun.update(dt);
    this.knife.update(dt);

    // Smoothly lower / raise camera to match crouch state
    const targetY = this.isCrouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.pitchObj.position.y += (targetY - this.pitchObj.position.y) * Math.min(1, dt * 10);
  }

  getPosition() { return this.yawObj.position.clone(); }
  getYaw()      { return this.yawObj.rotation.y; }
  getPitch()    { return this.pitchObj.rotation.x; }

  respawn(pos) {
    this.yawObj.position.set(pos.x, 0, pos.z);
    this.controller.velocityY = 0;
    this.controller.onGround  = true;
  }
}
