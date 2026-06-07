import * as THREE from 'three';
import { MOVE_SPEED, GRAVITY, JUMP_SPEED, BASE_SENSITIVITY, PLAYER_RADIUS, PLAYER_HEIGHT } from '../constants.js';

export class PlayerController {
  constructor(canvas, yawObj, pitchObj, settings = {}) {
    this.canvas   = canvas;
    this.yawObj   = yawObj;
    this.pitchObj = pitchObj;
    this.sensitivity = ((settings.sensitivity ?? 5) / 5) * BASE_SENSITIVITY;

    this.keys      = new Set();
    this.velocityY = 0;
    this.onGround  = false;

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      const crosshair = document.getElementById('crosshair');
      const hint      = document.getElementById('lock-hint');
      if (crosshair) crosshair.style.display = locked ? 'block' : 'none';
      if (hint)      hint.style.display      = locked ? 'none'  : 'block';
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      yawObj.rotation.y -= e.movementX * this.sensitivity;
      pitchObj.rotation.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, pitchObj.rotation.x - e.movementY * this.sensitivity)
      );
    });

    document.addEventListener('keydown', (e) => { if (!e.repeat) this.keys.add(e.code); });
    document.addEventListener('keyup',   (e) => this.keys.delete(e.code));
  }

  get isLocked() { return document.pointerLockElement === this.canvas; }

  update(dt, wallManager) {
    const pos = this.yawObj.position;

    // ── Gravity & jump ──
    if (!this.onGround) {
      this.velocityY -= GRAVITY * dt;
      this.velocityY  = Math.max(this.velocityY, -25);
    }
    if (this.onGround && this.keys.has('Space')) {
      this.velocityY = JUMP_SPEED;
      this.onGround  = false;
    }

    // ── Horizontal movement ──
    const dir = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    dir.z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  dir.z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  dir.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize().applyEuler(new THREE.Euler(0, this.yawObj.rotation.y, 0));
      pos.x += dir.x * MOVE_SPEED * dt;
      pos.z += dir.z * MOVE_SPEED * dt;
    }

    // ── Vertical ──
    pos.y += this.velocityY * dt;

    // Ground check
    if (pos.y <= 0) {
      pos.y = 0;
      this.velocityY = 0;
      this.onGround  = true;
    } else {
      this.onGround = false;
    }

    // ── Wall collision (AABB push-out) ──
    if (wallManager) {
      for (const wall of wallManager.allWalls) this._pushOut(pos, wall.getCollisionBox());
    }
  }

  _pushOut(pos, box) {
    // Expand box by player radius
    const minX = box.min.x - PLAYER_RADIUS, maxX = box.max.x + PLAYER_RADIUS;
    const minZ = box.min.z - PLAYER_RADIUS, maxZ = box.max.z + PLAYER_RADIUS;
    const minY = box.min.y,                  maxY = box.max.y + PLAYER_HEIGHT;

    if (pos.x < minX || pos.x > maxX) return;
    if (pos.z < minZ || pos.z > maxZ) return;
    if (pos.y > maxY || pos.y + PLAYER_HEIGHT < minY) return;

    // Find the shallowest penetration axis (X or Z only — not Y)
    const ovX1 = pos.x - minX, ovX2 = maxX - pos.x;
    const ovZ1 = pos.z - minZ, ovZ2 = maxZ - pos.z;
    const minOv = Math.min(ovX1, ovX2, ovZ1, ovZ2);

    if (minOv === ovX1) pos.x = minX;
    else if (minOv === ovX2) pos.x = maxX;
    else if (minOv === ovZ1) pos.z = minZ;
    else pos.z = maxZ;
  }
}
