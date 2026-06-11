import * as THREE from 'three';
import { DestructibleWall } from './DestructibleWall.js';

const { PI } = Math;

// Expanded 20 × 16 m room (x: -10…10, z: -8…8)
const WALL_DEFS = [
  // ── CONCRETE perimeter ────────────────────────────────────────────────────
  { type: 'concrete', w: 20, h: 3, pos: [  0,  1.5, -8], rot: [0,      0, 0] }, // N
  { type: 'concrete', w: 20, h: 3, pos: [  0,  1.5,  8], rot: [0,     PI, 0] }, // S
  { type: 'concrete', w: 16, h: 3, pos: [-10,  1.5,  0], rot: [0,  PI/2, 0] }, // W
  { type: 'concrete', w: 16, h: 3, pos: [ 10,  1.5,  0], rot: [0, -PI/2, 0] }, // E

  // ── CONCRETE central pillars (3 corridors: ±2.5 m sides, 5 m centre) ──────
  { type: 'concrete', w: 3, h: 3, pos: [-4.5, 1.5, 0], rot: [0, 0, 0] }, // left  (x: -6 to -3)
  { type: 'concrete', w: 3, h: 3, pos: [ 4.5, 1.5, 0], rot: [0, 0, 0] }, // right (x:  3 to  6)

  // ── MEDIUM mid-room dividers ───────────────────────────────────────────────
  { type: 'medium', w: 4, h: 3, pos: [-8, 1.5, -4], rot: [0,  PI/2, 0] }, // NW (spans z: -6 to -2)
  { type: 'medium', w: 4, h: 3, pos: [ 8, 1.5, -4], rot: [0, -PI/2, 0] }, // NE
  { type: 'medium', w: 4, h: 3, pos: [-8, 1.5,  4], rot: [0,  PI/2, 0] }, // SW
  { type: 'medium', w: 4, h: 3, pos: [ 8, 1.5,  4], rot: [0, -PI/2, 0] }, // SE

  // ── THIN cover walls (breakable) ──────────────────────────────────────────
  { type: 'thin', w: 3, h: 2.5, pos: [  0, 1.25, -5], rot: [0, PI/2, 0] }, // N-centre
  { type: 'thin', w: 3, h: 2.5, pos: [  0, 1.25,  5], rot: [0, PI/2, 0] }, // S-centre
  { type: 'thin', w: 3, h: 2.5, pos: [ -4, 1.25, -5], rot: [0,    0, 0] }, // NW cover
  { type: 'thin', w: 3, h: 2.5, pos: [  4, 1.25, -5], rot: [0,    0, 0] }, // NE cover
  { type: 'thin', w: 3, h: 2.5, pos: [ -4, 1.25,  5], rot: [0,    0, 0] }, // SW cover
  { type: 'thin', w: 3, h: 2.5, pos: [  4, 1.25,  5], rot: [0,    0, 0] }, // SE cover
];

export class WallManager {
  constructor(scene) {
    this.scene  = scene;
    this.walls  = new Map();
    this.meshes = [];

    for (const def of WALL_DEFS) {
      const wall = new DestructibleWall(scene, {
        type:     def.type,
        width:    def.w,
        height:   def.h,
        position: new THREE.Vector3(...def.pos),
        rotation: new THREE.Euler(...def.rot),
      });
      this.walls.set(wall.id, wall);
      this.meshes.push(wall.mesh);
    }
  }

  getById(id)  { return this.walls.get(id); }
  getByMesh(m) { return this.walls.get(m.userData.wallId); }

  serialize()  { return Array.from(this.walls.values()).map(w => w.serialize()); }

  loadState(wallsData) {
    for (const data of wallsData) {
      const w = this.walls.get(data.id);
      if (w) w.loadState(data);
    }
  }

  get allWalls()        { return Array.from(this.walls.values()); }
  // Only walls that should still block player movement
  get collidableWalls() { return this.allWalls.filter(w => !w._passable); }
}
