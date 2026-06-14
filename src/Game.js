import * as THREE from 'three';
import { World } from './world/World.js';
import { WallManager } from './world/WallManager.js';
import { LocalPlayer } from './player/LocalPlayer.js';
import { RemotePlayer } from './player/RemotePlayer.js';
import { Raycast } from './weapons/Raycast.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { SYNC_MS } from './constants.js';

const MAX_HP    = 100;
const MAX_ARMOR = 50;
const BODY_DMG  = 20;
const HEAD_DMG  = 40;
const KNIFE_DMG = 60;
const KNIFE_RANGE = 1.5; // metres

// Knife wall-damage — no sigma override; uses wall's natural hole size
const KNIFE_WALL = { strength: 0.9, maxDisplace: 0.003 };

export class Game {
  constructor(renderer, netManager, settings = {}) {
    this.renderer = renderer;
    this.net      = netManager;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88bbdd);
    this.scene.fog = new THREE.FogExp2(0x88bbdd, 0.012);

    // Deterministic map seed: roomCode is shared by host + joiners so everyone
    // generates the identical layout. Singleplayer gets a fresh random map.
    const seed = this.net?.roomCode ?? ('sp' + Math.floor(Math.random() * 1e9));

    this.world        = new World(this.scene);
    this.wallManager  = new WallManager(this.scene, seed);
    this.localPlayer  = new LocalPlayer(this.scene, renderer.domElement, settings);
    this.remotePlayers = new Map();
    this.raycast = new Raycast(this.wallManager);
    this.hud     = new HUD();
    this.minimap = new Minimap(document.getElementById('minimap'), this.wallManager);

    this._meleeRaycaster = new THREE.Raycaster();
    this._meleeRaycaster.far = KNIFE_RANGE;

    this.hp    = MAX_HP;
    this.armor = MAX_ARMOR;
    this.hud.setHealth(this.hp, this.armor);

    if (this.net?.isHost && this.net.roomCode) this.hud.setRoomCode(this.net.roomCode);

    // Round / score tracking
    this._kills          = 0;
    this._deaths         = 0;
    this._lastAttackerId = null;
    this.hud.setScore(0, 0);

    this._animId    = null;
    this._syncAccum = 0;
    this._prevTime  = 0;
    this._particles = [];

    // Drop the local player at a spawn point for the generated map
    this.localPlayer.respawn(this._randomSpawn());

    this._bindInput();
    this._setupNet();
  }

  _randomSpawn() {
    const pts = this.wallManager.spawnPoints;
    return pts[Math.floor(Math.random() * pts.length)].clone();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _bindInput() {
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.localPlayer.isLocked) return;
      this._fire();
    });

    document.addEventListener('keydown', (e) => {
      if (e.repeat || !this.localPlayer.isLocked) return;
      if (e.code === 'KeyV') this._quickStab();
    });
  }

  // ── Gun fire ──────────────────────────────────────────────────────────────
  _fire() {
    const result = this.raycast.fire(this.localPlayer.camera, this.remotePlayers);
    this.localPlayer.gun.fire();
    this._spawnShell();

    let tracerEnd;
    if (result.playerHit)  tracerEnd = result.hitPoint.clone();
    else if (result.hit)   tracerEnd = result.point.clone();
    else                   tracerEnd = result.origin.clone().addScaledVector(result.rayDir, 50);

    const muzzlePos = new THREE.Vector3();
    this.localPlayer.gun.muzzlePoint.getWorldPosition(muzzlePos);
    this._spawnTracer(muzzlePos, tracerEnd);

    if (result.playerHit) {
      const hs = result.hitType === 'head';
      this.hud.showHitMarker(hs);
      this._spawnSparks(result.hitPoint, hs);
    }

    if (result.hit) {
      const wall = this.wallManager.getById(result.wallId);
      if (wall?.type === 'concrete') { this._spawnChunks(result.point); this._spawnChips(result.point); }
    }

    if (this.net) {
      const GUN_OFFSET = new THREE.Vector3(0.35, 1.2, -0.15);
      GUN_OFFSET.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.localPlayer.getYaw());
      const netOrigin = this.localPlayer.getPosition().clone().add(GUN_OFFSET);
      const msg = { type: 'shoot', origin: netOrigin.toArray(), end: tracerEnd.toArray() };

      if (result.playerHit) {
        msg.playerHit = true;
        msg.targetId  = result.peerId;
        msg.hitType   = result.hitType;
      } else if (result.hit) {
        msg.wallId   = result.wallId;
        msg.hitPoint = result.point.toArray();
        msg.rayDir   = result.rayDir.toArray();
      }
      this.net.send(msg);
    }
  }

  // ── Quick melee (V) — shows knife briefly, auto-returns to gun ───────────
  _quickStab() {
    this.localPlayer.quickStab();

    const camera = this.localPlayer.camera;
    const origin = new THREE.Vector3();
    const dir    = new THREE.Vector3();
    camera.getWorldPosition(origin);
    camera.getWorldDirection(dir);

    this._meleeRaycaster.set(origin, dir);

    // Player hit (melee range)
    let hitPlayer = false;
    for (const [peerId, rp] of this.remotePlayers) {
      const res = this.raycast._playerHit(origin, dir, rp.group.position, KNIFE_RANGE, rp._crouching);
      if (res) {
        this.hud.showHitMarker(false);
        this._spawnSparks(res.point, false);
        if (this.net) {
          this.net.send({
            type: 'shoot', playerHit: true,
            targetId: peerId, hitType: 'body',
            knifeDmg: KNIFE_DMG,
            origin: origin.toArray(), end: res.point.toArray(),
          });
        }
        hitPlayer = true;
        break;
      }
    }

    if (!hitPlayer) {
      // Wall hit (melee range, large-area knife damage)
      const hits = this._meleeRaycaster.intersectObjects(this.wallManager.meshes, false);
      if (hits.length > 0) {
        const h      = hits[0];
        const wallId = h.object.userData.wallId;
        const wall   = this.wallManager.getById(wallId);
        if (wall) {
          wall.applyHit(h.point, dir, KNIFE_WALL);
          if (this.net) {
            this.net.send({
              type: 'shoot',
              wallId, hitPoint: h.point.toArray(), rayDir: dir.toArray(),
              knifeHit: true,
              origin: origin.toArray(), end: h.point.toArray(),
            });
          }
        }
      }
    }
  }

  // ── Tracer ────────────────────────────────────────────────────────────────
  _spawnTracer(start, end) {
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffee88, transparent: true, opacity: 0.9,
      depthTest: false, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    const t0 = performance.now();
    const tick = () => {
      const e = performance.now() - t0;
      if (e >= 120) { this.scene.remove(line); geo.dispose(); mat.dispose(); return; }
      mat.opacity = 0.9 * (1 - e / 120);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Sparks (player hits) ──────────────────────────────────────────────────
  _spawnSparks(position, isHeadshot) {
    const count = isHeadshot ? 10 : 6;
    const base  = isHeadshot ? 0.038 : 0.022;

    for (let i = 0; i < count; i++) {
      const s   = base * (0.7 + Math.random() * 0.6);
      const geo = new THREE.BoxGeometry(s * 2.8, s * 0.32, s * 0.32);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.06 + Math.random() * 0.07, 1, 0.52 + Math.random() * 0.22),
        transparent: true, opacity: 1, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);

      const theta  = Math.random() * Math.PI * 2;
      const hSpd   = 1.8 + Math.random() * 2.8;
      const upBias = isHeadshot ? 3.8 : 0.9;

      this._particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(theta) * hSpd,
          Math.random() * 1.5 + upBias,
          Math.sin(theta) * hSpd
        ),
        rotV: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14
        ),
        age: 0,
        maxAge: 0.36 + Math.random() * 0.22,
      });
      this.scene.add(mesh);
    }
  }

  // ── Ejected shell casing (rigid, with physics) ────────────────────────────
  _spawnShell() {
    const cam = this.localPlayer.camera;
    const pos = new THREE.Vector3();
    this.localPlayer.gun.ejectPoint.getWorldPosition(pos);

    const q     = cam.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up    = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const fwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(q);

    // Low-poly brass casing — a rectangular prism, long axis horizontal
    const geo  = new THREE.BoxGeometry(0.024, 0.0095, 0.0095);
    const mat  = new THREE.MeshLambertMaterial({ color: 0xc9a227, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

    const vel = new THREE.Vector3()
      .addScaledVector(right, 1.7 + Math.random() * 0.9)   // flicks right
      .addScaledVector(up,    1.3 + Math.random() * 0.7)   // and up
      .addScaledVector(fwd,  -0.3 + Math.random() * 0.3);

    this._particles.push({
      mesh, vel,
      rotV: new THREE.Vector3(
        (Math.random() - 0.5) * 34, (Math.random() - 0.5) * 34, (Math.random() - 0.5) * 34
      ),
      age: 0, maxAge: 2.4, fadeDur: 0.5, gravity: 9.8, bounce: true, floorY: 0.012,
    });
    this.scene.add(mesh);
  }

  // ── Concrete chunk debris (bigger rigid pieces, bounce off floor) ─────────
  _spawnChunks(position) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const s   = 0.04 + Math.random() * 0.06;
      const geo = new THREE.BoxGeometry(s * (0.7 + Math.random()), s * (0.7 + Math.random()), s * (0.7 + Math.random()));
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(0, 0, 0.34 + Math.random() * 0.22), transparent: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);

      const theta = Math.random() * Math.PI * 2;
      const spd   = 1.2 + Math.random() * 2.2;
      this._particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(theta) * spd, 1.0 + Math.random() * 2.0, Math.sin(theta) * spd),
        rotV: new THREE.Vector3(
          (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18
        ),
        age: 0, maxAge: 1.6, fadeDur: 0.45, gravity: 9.8, bounce: true, floorY: 0.02,
      });
      this.scene.add(mesh);
    }
  }

  // ── Concrete chip debris ──────────────────────────────────────────────────
  _spawnChips(position) {
    const count = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const s   = 0.018 + Math.random() * 0.030;
      const geo = new THREE.BoxGeometry(s * (1.2 + Math.random()), s, s * (1.2 + Math.random()));
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0, 0, 0.36 + Math.random() * 0.28),
        transparent: true, opacity: 1, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);

      const theta = Math.random() * Math.PI * 2;
      const spd   = 0.6 + Math.random() * 1.4;

      this._particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(theta) * spd,
          Math.random() * 1.2 + 0.3,
          Math.sin(theta) * spd
        ),
        rotV: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        ),
        age: 0,
        maxAge: 0.4 + Math.random() * 0.25,
      });
      this.scene.add(mesh);
    }
  }

  _updateParticles(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this._particles.splice(i, 1);
        continue;
      }
      p.vel.y -= (p.gravity ?? 9.8) * dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      // Floor bounce for rigid debris (shells, chunks)
      if (p.bounce && p.mesh.position.y <= p.floorY) {
        p.mesh.position.y = p.floorY;
        if (p.vel.y < 0) {
          p.vel.y *= -0.32; p.vel.x *= 0.55; p.vel.z *= 0.55;
          p.rotV.multiplyScalar(0.5);
        }
      }

      p.mesh.rotation.x += p.rotV.x * dt;
      p.mesh.rotation.y += p.rotV.y * dt;
      p.mesh.rotation.z += p.rotV.z * dt;
      p.mesh.material.opacity = Math.min(1, (p.maxAge - p.age) / (p.fadeDur ?? p.maxAge));
    }
  }

  // ── Damage / respawn ──────────────────────────────────────────────────────
  _takeDamage(rawDmg, attackerId) {
    if (attackerId) this._lastAttackerId = attackerId;
    let dmg = rawDmg;
    if (this.armor > 0) {
      const blocked = dmg * 0.5;
      this.armor = Math.max(0, this.armor - blocked);
      dmg -= blocked;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.hud.setHealth(this.hp, this.armor);
    if (this.hp <= 0) this._die();
  }

  _die() {
    this._deaths++;
    this.hud.setScore(this._kills, this._deaths);
    this.hud.showNotification('You died');

    if (this.net && this._lastAttackerId) {
      this.net.send({ type: 'playerDied', killerId: this._lastAttackerId });
    }
    this._lastAttackerId = null;

    this.hp    = MAX_HP;
    this.armor = MAX_ARMOR;
    this.localPlayer.respawn(this._randomSpawn());
    this.hud.setHealth(this.hp, this.armor);
  }

  // ── Network ───────────────────────────────────────────────────────────────
  _setupNet() {
    const net = this.net;
    if (!net) return;

    net.on('playerState', (msg) => {
      if (msg.id === net.myId) return;
      let rp = this.remotePlayers.get(msg.id);
      if (!rp) { rp = new RemotePlayer(this.scene, msg.id); this.remotePlayers.set(msg.id, rp); }
      rp.updateState(msg);
    });

    net.on('shoot', (msg) => {
      if (msg._from === net.myId) return;

      this._spawnTracer(
        new THREE.Vector3().fromArray(msg.origin),
        new THREE.Vector3().fromArray(msg.end)
      );

      if (msg.wallId) {
        const wall = this.wallManager.getById(msg.wallId);
        if (wall) {
          const overrides = msg.knifeHit ? KNIFE_WALL : {};
          wall.applyHit(
            new THREE.Vector3().fromArray(msg.hitPoint),
            new THREE.Vector3().fromArray(msg.rayDir),
            overrides
          );
          if (wall.type === 'concrete') {
            const cp = new THREE.Vector3().fromArray(msg.hitPoint);
            this._spawnChunks(cp); this._spawnChips(cp);
          }
        }
      }

      if (msg.playerHit && msg.targetId === net.myId) {
        this.hud.showHitFlash();
        const dmg = msg.knifeDmg ?? (msg.hitType === 'head' ? HEAD_DMG : BODY_DMG);
        this._takeDamage(dmg, msg._from);
      }
    });

    net.on('playerDied', (msg) => {
      if (msg.killerId === net.myId) {
        this._kills++;
        this.hud.setScore(this._kills, this._deaths);
        this.hud.showNotification('Kill!');
      }
    });

    net.on('worldState', (msg) => {
      if (msg.walls)   this.wallManager.loadState(msg.walls);
      if (msg.players) {
        for (const p of msg.players) {
          if (p.id === net.myId) continue;
          let rp = this.remotePlayers.get(p.id);
          if (!rp) { rp = new RemotePlayer(this.scene, p.id); this.remotePlayers.set(p.id, rp); }
          rp.updateState(p);
        }
      }
    });

    net.on('newPeer', (msg) => {
      this.hud.setPeerCount(net.peerCount);
      this.hud.showNotification('Player joined');
      if (net.isHost) net.sendTo(msg.id, { type: 'worldState', walls: this.wallManager.serialize(), players: [] });
    });

    net.on('peerLeft', (msg) => {
      const rp = this.remotePlayers.get(msg.id);
      if (rp) { rp.dispose(this.scene); this.remotePlayers.delete(msg.id); }
      this.hud.setPeerCount(net.peerCount);
      this.hud.showNotification('Player left');
    });

    if (!net.isHost) net.send({ type: 'requestWorldState', id: net.myId });

    net.on('requestWorldState', (msg) => {
      if (!net.isHost) return;
      net.sendTo(msg._from || msg.id, { type: 'worldState', walls: this.wallManager.serialize(), players: [] });
    });
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  start() {
    this._prevTime = performance.now();
    this._loop();
  }

  _loop() {
    this._animId = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt  = Math.min((now - this._prevTime) / 1000, 0.05);
    this._prevTime = now;

    this.localPlayer.update(dt, this.wallManager);
    for (const rp of this.remotePlayers.values()) rp.update(dt);
    this._updateParticles(dt);
    this.hud.update(dt);

    const mpos = this.localPlayer.getPosition();
    this.minimap.update(mpos.x, mpos.z, this.localPlayer.getYaw());

    if (this.net) {
      this._syncAccum += dt * 1000;
      if (this._syncAccum >= SYNC_MS) {
        this._syncAccum -= SYNC_MS;
        this.net.send({
          type:      'playerState',
          id:        this.net.myId,
          pos:       this.localPlayer.getPosition().toArray(),
          yaw:       this.localPlayer.getYaw(),
          pitch:     this.localPlayer.getPitch(),
          crouching: this.localPlayer.isCrouching,
          lean:      this.localPlayer.getLean(),
        });
      }
    }

    this.renderer.render(this.scene, this.localPlayer.camera);
  }

  dispose() {
    cancelAnimationFrame(this._animId);
    if (this.net) this.net.disconnect();
  }
}
