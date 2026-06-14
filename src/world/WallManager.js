import * as THREE from 'three';
import { DestructibleWall } from './DestructibleWall.js';
import { generateMap } from './mapgen.js';

export class WallManager {
  constructor(scene, seed = 'default') {
    this.scene  = scene;
    this.walls  = new Map();
    this.meshes = [];

    const { style, defs, spawns } = generateMap(seed);
    this.style       = style;
    this.spawnPoints = spawns.map(([x, z]) => new THREE.Vector3(x, 0, z));

    for (const def of defs) {
      const wall = new DestructibleWall(scene, {
        type:     def.type,
        width:    def.w,
        height:   def.h,
        position: new THREE.Vector3(...def.pos),
        rotation: new THREE.Euler(...def.rot),
        indestructible: !!def.fixed, // outer perimeter stays solid
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
  get collidableWalls() { return this.allWalls.filter(w => !w._passable); }
}
