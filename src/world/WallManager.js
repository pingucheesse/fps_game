import * as THREE from 'three';
import { DestructibleWall } from './DestructibleWall.js';

// Room layout: 12 × 10 m interior, walls 3 m tall
const WALL_DEFS = [
  // Perimeter
  { w: 12, h: 3, pos: [0,  1.5, -5],  rot: [0, 0, 0] },           // North
  { w: 12, h: 3, pos: [0,  1.5,  5],  rot: [0, Math.PI, 0] },     // South
  { w: 10, h: 3, pos: [-6, 1.5,  0],  rot: [0,  Math.PI / 2, 0] }, // West
  { w: 10, h: 3, pos: [ 6, 1.5,  0],  rot: [0, -Math.PI / 2, 0] }, // East

  // Interior dividers (partial — create choke points)
  { w: 4, h: 3, pos: [-4, 1.5, 0], rot: [0, 0, 0] },
  { w: 4, h: 3, pos: [ 4, 1.5, 0], rot: [0, 0, 0] },
];

export class WallManager {
  constructor(scene) {
    this.scene = scene;
    this.walls = new Map();   // id → DestructibleWall
    this.meshes = [];          // flat list for raycasting

    for (const def of WALL_DEFS) {
      const wall = new DestructibleWall(scene, {
        width:    def.w,
        height:   def.h,
        position: new THREE.Vector3(...def.pos),
        rotation: new THREE.Euler(...def.rot),
      });
      this.walls.set(wall.id, wall);
      this.meshes.push(wall.mesh);
    }
  }

  getById(id)   { return this.walls.get(id); }
  getByMesh(m)  { return this.walls.get(m.userData.wallId); }

  serialize()   { return Array.from(this.walls.values()).map(w => w.serialize()); }

  loadState(wallsData) {
    for (const data of wallsData) {
      const w = this.walls.get(data.id);
      if (w) w.loadState(data);
    }
  }

  get allWalls() { return Array.from(this.walls.values()); }
}
