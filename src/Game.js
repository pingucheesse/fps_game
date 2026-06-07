import * as THREE from 'three';
import { World } from './world/World.js';
import { WallManager } from './world/WallManager.js';
import { LocalPlayer } from './player/LocalPlayer.js';
import { RemotePlayer } from './player/RemotePlayer.js';
import { Raycast } from './weapons/Raycast.js';
import { HUD } from './ui/HUD.js';
import { SYNC_MS, EYE_HEIGHT, PLAYER_RADIUS } from './constants.js';

export class Game {
  constructor(renderer, netManager, settings = {}) {
    this.renderer = renderer;
    this.net      = netManager; // null for singleplayer

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88bbdd);
    this.scene.fog = new THREE.FogExp2(0x88bbdd, 0.018);

    this.world       = new World(this.scene);
    this.wallManager = new WallManager(this.scene);
    this.localPlayer = new LocalPlayer(this.scene, renderer.domElement, settings);
    this.remotePlayers = new Map(); // peerId → RemotePlayer
    this.raycast = new Raycast(this.wallManager);
    this.hud     = new HUD();

    this._animId       = null;
    this._syncInterval = null;
    this._prevTime     = 0;

    this._bindInput();
    this._setupNet();
  }

  // ── Shooting ──
  _bindInput() {
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.localPlayer.isLocked) return;
      this._fire();
    });
  }

  _fire() {
    const result = this.raycast.fire(this.localPlayer.camera);
    this.localPlayer.gun.fire();

    // Tracer end: actual hit point or 50m along ray
    const tracerEnd = result.hit
      ? result.point.clone()
      : result.origin.clone().addScaledVector(result.rayDir, 50);

    this._spawnTracer(result.origin, tracerEnd);

    if (this.net) {
      const msg = {
        type: 'shoot',
        origin: result.origin.toArray(),
        end: tracerEnd.toArray(),
      };
      if (result.hit) {
        msg.wallId   = result.wallId;
        msg.hitPoint = result.point.toArray();
        msg.rayDir   = result.rayDir.toArray();
      }
      this.net.send(msg);
    }
  }

  // Short-lived yellow tracer line
  _spawnTracer(start, end) {
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    const t0 = performance.now();
    const DURATION = 120; // ms

    const tick = () => {
      const elapsed = performance.now() - t0;
      if (elapsed >= DURATION) {
        this.scene.remove(line);
        geo.dispose();
        mat.dispose();
        return;
      }
      mat.opacity = 0.9 * (1 - elapsed / DURATION);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Check if a shot line from a remote player passed through local player
  _checkLocalPlayerHit(origin, end) {
    const playerPos = this.localPlayer.getPosition().clone();
    playerPos.y += EYE_HEIGHT * 0.5; // aim at body centre

    const AB = new THREE.Vector3().subVectors(end, origin);
    const lenSq = AB.dot(AB);
    if (lenSq === 0) return;
    const AP = new THREE.Vector3().subVectors(playerPos, origin);
    const t  = Math.max(0, Math.min(1, AP.dot(AB) / lenSq));
    const closest = origin.clone().addScaledVector(AB, t);

    if (closest.distanceTo(playerPos) < PLAYER_RADIUS + 0.15) {
      this.hud.showHitFlash();
    }
  }

  // ── Network event wiring ──
  _setupNet() {
    const net = this.net;
    if (!net) return;

    net.on('playerState', (msg) => {
      if (msg.id === net.myId) return;
      let rp = this.remotePlayers.get(msg.id);
      if (!rp) {
        rp = new RemotePlayer(this.scene, msg.id);
        this.remotePlayers.set(msg.id, rp);
      }
      rp.updateState(msg);
    });

    net.on('shoot', (msg) => {
      if (msg._from === net.myId) return; // ignore relayed copies of own shots

      const origin = new THREE.Vector3().fromArray(msg.origin);
      const end    = new THREE.Vector3().fromArray(msg.end);

      this._spawnTracer(origin, end);

      if (msg.wallId) {
        const wall = this.wallManager.getById(msg.wallId);
        if (wall) wall.applyHit(
          new THREE.Vector3().fromArray(msg.hitPoint),
          new THREE.Vector3().fromArray(msg.rayDir)
        );
      }

      this._checkLocalPlayerHit(origin, end);
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
      if (net.isHost) {
        net.sendTo(msg.id, {
          type: 'worldState',
          walls: this.wallManager.serialize(),
          players: [],
        });
      }
    });

    net.on('peerLeft', (msg) => {
      const rp = this.remotePlayers.get(msg.id);
      if (rp) { rp.dispose(this.scene); this.remotePlayers.delete(msg.id); }
      this.hud.setPeerCount(net.peerCount);
    });

    if (!net.isHost) {
      net.send({ type: 'requestWorldState', id: net.myId });
    }

    net.on('requestWorldState', (msg) => {
      if (!net.isHost) return;
      net.sendTo(msg._from || msg.id, {
        type: 'worldState',
        walls: this.wallManager.serialize(),
        players: [],
      });
    });

    this._syncInterval = setInterval(() => {
      net.send({
        type: 'playerState',
        id: net.myId,
        pos: this.localPlayer.getPosition().toArray(),
        yaw: this.localPlayer.getYaw(),
        pitch: this.localPlayer.getPitch(),
      });
    }, SYNC_MS);
  }

  // ── Game loop ──
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

    this.renderer.render(this.scene, this.localPlayer.camera);
  }

  dispose() {
    cancelAnimationFrame(this._animId);
    clearInterval(this._syncInterval);
    if (this.net) this.net.disconnect();
  }
}
