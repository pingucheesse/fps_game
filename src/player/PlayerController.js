import * as THREE from 'three';
import {
  MOVE_SPEED, GRAVITY, BASE_SENSITIVITY,
  PLAYER_RADIUS, PLAYER_HEIGHT, CROUCH_SPEED_MULT,
} from '../constants.js';

export class PlayerController {
  constructor(canvas, yawObj, pitchObj, settings = {}) {
    this.canvas   = canvas;
    this.yawObj   = yawObj;
    this.pitchObj = pitchObj;
    this.sensitivity = ((settings.sensitivity ?? 5) / 5) * BASE_SENSITIVITY;

    this.keys      = new Set();
    this._crouching = false;
    this._lean       = 0;   // -1 left, 0 upright, +1 right
    this.velocityY = 0;
    this.onGround  = false;
    this.velocity  = new THREE.Vector3(); // current world-space velocity (m/s)

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
      // Browsers (esp. Chromium) can emit a single huge movementX/Y spike — most
      // often right after pointer lock engages — which snaps the view instantly.
      // Drop clearly-spurious deltas so the camera never flicks.
      let dx = e.movementX, dy = e.movementY;
      const SPIKE = 400;
      if (Math.abs(dx) > SPIKE || Math.abs(dy) > SPIKE) return;
      yawObj.rotation.y -= dx * this.sensitivity;
      pitchObj.rotation.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, pitchObj.rotation.x - dy * this.sensitivity)
      );
    });

    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyC') { this._crouching = !this._crouching; return; }
      if (e.code === 'KeyQ') { this._lean = this._lean === -1 ? 0 : -1; return; }
      if (e.code === 'KeyE') { this._lean = this._lean ===  1 ? 0 :  1; return; }
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'KeyC' || e.code === 'KeyQ' || e.code === 'KeyE') return;
      this.keys.delete(e.code);
    });
  }

  get isLocked()   { return document.pointerLockElement === this.canvas; }
  get isCrouching(){ return this._crouching; }

  // -1 = lean left (Q), 0 = upright, +1 = lean right (E) — toggled per key
  get lean() { return this._lean; }

  update(dt, wallManager, dividers = []) {
    const pos = this.yawObj.position;

    const crouching  = this.isCrouching;
    const speed      = MOVE_SPEED * (crouching ? CROUCH_SPEED_MULT : 1.0);
    const playerH    = crouching ? PLAYER_HEIGHT * 0.6 : PLAYER_HEIGHT;

    // ── Gravity (no jump) ──
    if (!this.onGround) {
      this.velocityY -= GRAVITY * dt;
      this.velocityY  = Math.max(this.velocityY, -25);
    }

    // ── Horizontal movement ──
    const dir = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    dir.z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  dir.z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  dir.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize().applyEuler(new THREE.Euler(0, this.yawObj.rotation.y, 0));
      pos.x += dir.x * speed * dt;
      pos.z += dir.z * speed * dt;
    }
    // Record current world velocity (dir is unit world dir, or zero when still)
    this.velocity.set(dir.x * speed, this.velocityY, dir.z * speed);

    // ── Vertical ──
    pos.y += this.velocityY * dt;

    if (pos.y <= 0) {
      pos.y = 0;
      this.velocityY = 0;
      this.onGround  = true;
    } else {
      this.onGround = false;
    }

    // ── Wall collision (AABB push-out — skip passable walls) ──
    if (wallManager) {
      for (const wall of wallManager.collidableWalls) {
        this._pushOut(pos, wall.getCollisionBox(), playerH);
      }
    }
    // ── Intermission dividing walls ──
    for (const d of dividers) this._pushOut(pos, d.box, playerH);
  }

  _pushOut(pos, box, playerH) {
    const minX = box.min.x - PLAYER_RADIUS, maxX = box.max.x + PLAYER_RADIUS;
    const minZ = box.min.z - PLAYER_RADIUS, maxZ = box.max.z + PLAYER_RADIUS;
    const minY = box.min.y,                  maxY = box.max.y + playerH;

    if (pos.x < minX || pos.x > maxX) return;
    if (pos.z < minZ || pos.z > maxZ) return;
    if (pos.y > maxY || pos.y + playerH < minY) return;

    const ovX1 = pos.x - minX, ovX2 = maxX - pos.x;
    const ovZ1 = pos.z - minZ, ovZ2 = maxZ - pos.z;
    const minOv = Math.min(ovX1, ovX2, ovZ1, ovZ2);

    if (minOv === ovX1)      pos.x = minX;
    else if (minOv === ovX2) pos.x = maxX;
    else if (minOv === ovZ1) pos.z = minZ;
    else                     pos.z = maxZ;
  }
}
