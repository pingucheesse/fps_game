import * as THREE from 'three';
import { World } from './world/World.js';
import { WallManager } from './world/WallManager.js';
import { LocalPlayer } from './player/LocalPlayer.js';
import { RemotePlayer } from './player/RemotePlayer.js';
import { Raycast } from './weapons/Raycast.js';
import { HUD } from './ui/HUD.js';
import { SYNC_MS } from './constants.js';

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
    const hit = this.raycast.fire(this.localPlayer.camera);
    this.localPlayer.gun.fire();

    if (hit && this.net) {
      this.net.send({
        type: 'wallHit',
        wallId: hit.wallId,
        hitPoint: hit.point.toArray(),
        rayDir: hit.rayDir.toArray(),
      });
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

    net.on('wallHit', (msg) => {
      if (msg._from === net.myId) return; // already applied locally
      const wall = this.wallManager.getById(msg.wallId);
      if (wall) wall.applyHit(
        new THREE.Vector3().fromArray(msg.hitPoint),
        new THREE.Vector3().fromArray(msg.rayDir ?? [0, 0, -1])
      );
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

    // If we are a joiner, request world state once Game is ready
    if (!net.isHost) {
      net.send({ type: 'requestWorldState', id: net.myId });
    }

    // Handle worldState requests (host side)
    net.on('requestWorldState', (msg) => {
      if (!net.isHost) return;
      net.sendTo(msg._from || msg.id, {
        type: 'worldState',
        walls: this.wallManager.serialize(),
        players: [],
      });
    });

    // Broadcast local player state at ~30 fps
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

    this.renderer.render(this.scene, this.localPlayer.camera);
  }

  dispose() {
    cancelAnimationFrame(this._animId);
    clearInterval(this._syncInterval);
    if (this.net) this.net.disconnect();
  }
}
