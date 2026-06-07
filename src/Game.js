import * as THREE from 'three';
import { World } from './world/World.js';
import { WallManager } from './world/WallManager.js';
import { LocalPlayer } from './player/LocalPlayer.js';
import { RemotePlayer } from './player/RemotePlayer.js';
import { Raycast } from './weapons/Raycast.js';
import { HUD } from './ui/HUD.js';
import { SYNC_MS } from './constants.js';

const MAX_HP    = 100;
const MAX_ARMOR = 50;
const BODY_DMG  = 20;
const HEAD_DMG  = 40;

// Safe in-room spawn points (room is 12×10m; dividers block z=0 outside x ±2)
const SPAWNS = [
  new THREE.Vector3(-3, 0,  3.5),
  new THREE.Vector3( 3, 0,  3.5),
  new THREE.Vector3(-3, 0, -3.5),
  new THREE.Vector3( 3, 0, -3.5),
];

export class Game {
  constructor(renderer, netManager, settings = {}) {
    this.renderer = renderer;
    this.net      = netManager;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88bbdd);
    this.scene.fog = new THREE.FogExp2(0x88bbdd, 0.018);

    this.world        = new World(this.scene);
    this.wallManager  = new WallManager(this.scene);
    this.localPlayer  = new LocalPlayer(this.scene, renderer.domElement, settings);
    this.remotePlayers = new Map();
    this.raycast = new Raycast(this.wallManager);
    this.hud     = new HUD();

    this.hp    = MAX_HP;
    this.armor = MAX_ARMOR;
    this.hud.setHealth(this.hp, this.armor);

    // Show room code at top of screen for the host
    if (this.net?.isHost && this.net.roomCode) this.hud.setRoomCode(this.net.roomCode);

    this._animId   = null;
    this._syncAccum = 0; // ms accumulator for network sync (in-loop, no setInterval)
    this._prevTime = 0;

    this._bindInput();
    this._setupNet();
  }

  // ── Shooting ──────────────────────────────────────────────────────────────
  _bindInput() {
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.localPlayer.isLocked) return;
      this._fire();
    });
  }

  _fire() {
    const result = this.raycast.fire(this.localPlayer.camera, this.remotePlayers);
    this.localPlayer.gun.fire();

    // Tracer end
    let tracerEnd;
    if (result.playerHit)  tracerEnd = result.hitPoint.clone();
    else if (result.hit)   tracerEnd = result.point.clone();
    else                   tracerEnd = result.origin.clone().addScaledVector(result.rayDir, 50);

    const muzzlePos = new THREE.Vector3();
    this.localPlayer.gun.muzzlePoint.getWorldPosition(muzzlePos);
    this._spawnTracer(muzzlePos, tracerEnd);

    if (this.net) {
      // Network tracer origin: body-relative gun position matching remote visual
      const GUN_OFFSET = new THREE.Vector3(0.35, 1.2, -0.15);
      GUN_OFFSET.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.localPlayer.getYaw());
      const netOrigin = this.localPlayer.getPosition().clone().add(GUN_OFFSET);

      const msg = { type: 'shoot', origin: netOrigin.toArray(), end: tracerEnd.toArray() };

      if (result.playerHit) {
        // Shooter tells victim they were hit — no victim-side position check needed
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

  // ── Damage / respawn ──────────────────────────────────────────────────────
  _takeDamage(rawDmg) {
    let dmg = rawDmg;
    if (this.armor > 0) {
      const blocked = dmg * 0.5;
      this.armor = Math.max(0, this.armor - blocked);
      dmg -= blocked;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.hud.setHealth(this.hp, this.armor);
    if (this.hp <= 0) this._respawn();
  }

  _respawn() {
    this.hp    = MAX_HP;
    this.armor = MAX_ARMOR;
    this.localPlayer.respawn(SPAWNS[Math.floor(Math.random() * SPAWNS.length)]);
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

      // Show tracer from remote shooter's gun
      this._spawnTracer(
        new THREE.Vector3().fromArray(msg.origin),
        new THREE.Vector3().fromArray(msg.end)
      );

      // Apply wall damage
      if (msg.wallId) {
        const wall = this.wallManager.getById(msg.wallId);
        if (wall) wall.applyHit(
          new THREE.Vector3().fromArray(msg.hitPoint),
          new THREE.Vector3().fromArray(msg.rayDir)
        );
      }

      // Shooter-determined player hit — apply if we are the target
      if (msg.playerHit && msg.targetId === net.myId) {
        this.hud.showHitFlash();
        this._takeDamage(msg.hitType === 'head' ? HEAD_DMG : BODY_DMG);
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
    this.hud.update(dt);

    // Position sync tied to render loop — avoids setInterval/rAF timer conflicts
    if (this.net) {
      this._syncAccum += dt * 1000;
      if (this._syncAccum >= SYNC_MS) {
        this._syncAccum -= SYNC_MS;
        this.net.send({
          type: 'playerState', id: this.net.myId,
          pos:   this.localPlayer.getPosition().toArray(),
          yaw:   this.localPlayer.getYaw(),
          pitch: this.localPlayer.getPitch(),
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
