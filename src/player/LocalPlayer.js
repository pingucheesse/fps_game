import * as THREE from 'three';
import { PlayerController } from './PlayerController.js';
import { Gun } from '../weapons/Gun.js';
import { EYE_HEIGHT } from '../constants.js';

export class LocalPlayer {
  constructor(scene, canvas, settings = {}) {
    // Rig: yawObject → pitchObject → camera
    this.yawObj   = new THREE.Object3D();
    this.yawObj.position.set(0, 0, 3); // spawn point

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
    this.controller = new PlayerController(canvas, this.yawObj, this.pitchObj, settings);
  }

  get isLocked() { return this.controller.isLocked; }

  update(dt, wallManager) {
    this.controller.update(dt, wallManager);
    this.gun.update(dt);
  }

  getPosition() { return this.yawObj.position.clone(); }
  getYaw()      { return this.yawObj.rotation.y; }
  getPitch()    { return this.pitchObj.rotation.x; }
}
