import * as THREE from 'three';
import { DestructibleWall } from './DestructibleWall.js';

const { PI } = Math;

// 32 × 24 m CQB map  (x: -16…16, z: -12…12)
// Three parallel N-S corridors separated by concrete dividers at x = ±6.
// Each divider has a 6 m gap in the middle for cross-corridor movement.
// Heavy cover fills the open flanks; thin breakable walls for breaching.
const WALL_DEFS = [
  // ── Outer concrete perimeter ─────────────────────────────────────────────
  { type:'concrete', w:32, h:3, pos:[ 0,1.5,-12], rot:[0,0,0]      }, // N
  { type:'concrete', w:32, h:3, pos:[ 0,1.5, 12], rot:[0,PI,0]     }, // S
  { type:'concrete', w:24, h:3, pos:[-16,1.5,  0], rot:[0, PI/2,0]  }, // W
  { type:'concrete', w:24, h:3, pos:[ 16,1.5,  0], rot:[0,-PI/2,0]  }, // E

  // ── Central N-S dividers at x = -6 (gap: z = -3..3) ─────────────────────
  { type:'concrete', w:9, h:3, pos:[-6,1.5,-7.5], rot:[0,PI/2,0] }, // N piece
  { type:'concrete', w:9, h:3, pos:[-6,1.5, 7.5], rot:[0,PI/2,0] }, // S piece
  // ── Central N-S dividers at x = +6 ──────────────────────────────────────
  { type:'concrete', w:9, h:3, pos:[ 6,1.5,-7.5], rot:[0,PI/2,0] }, // N piece
  { type:'concrete', w:9, h:3, pos:[ 6,1.5, 7.5], rot:[0,PI/2,0] }, // S piece

  // ── Side cross-walls (chokepoints in outer corridors) ────────────────────
  { type:'concrete', w:4, h:3, pos:[-11,1.5,-6], rot:[0,0,0] }, // NW
  { type:'concrete', w:4, h:3, pos:[-11,1.5, 6], rot:[0,0,0] }, // SW
  { type:'concrete', w:4, h:3, pos:[ 11,1.5,-6], rot:[0,0,0] }, // NE
  { type:'concrete', w:4, h:3, pos:[ 11,1.5, 6], rot:[0,0,0] }, // SE

  // ── Medium breakable dividers (room-within-corridor cover) ───────────────
  { type:'medium', w:5, h:3, pos:[-11,1.5, 0], rot:[0,0,0]    }, // W-mid
  { type:'medium', w:5, h:3, pos:[ 11,1.5, 0], rot:[0,0,0]    }, // E-mid
  { type:'medium', w:4, h:3, pos:[  0,1.5,-9], rot:[0,0,0]    }, // N-center
  { type:'medium', w:4, h:3, pos:[  0,1.5, 9], rot:[0,0,0]    }, // S-center

  // ── Low cover (crouch-height, medium) ────────────────────────────────────
  { type:'medium', w:3, h:1.1, pos:[-9,0.55,-3], rot:[0,PI/2,0] },
  { type:'medium', w:3, h:1.1, pos:[ 9,0.55,-3], rot:[0,PI/2,0] },
  { type:'medium', w:3, h:1.1, pos:[-9,0.55, 3], rot:[0,PI/2,0] },
  { type:'medium', w:3, h:1.1, pos:[ 9,0.55, 3], rot:[0,PI/2,0] },
  { type:'medium', w:3, h:1.1, pos:[ 0,0.55, 0], rot:[0,0,0]    }, // dead-center

  // ── Thin breakable cover (flanks and N/S approaches) ─────────────────────
  { type:'thin', w:3, h:2.5, pos:[-3,1.25,-9],  rot:[0,0,0]      },
  { type:'thin', w:3, h:2.5, pos:[ 3,1.25,-9],  rot:[0,0,0]      },
  { type:'thin', w:3, h:2.5, pos:[-3,1.25, 9],  rot:[0,0,0]      },
  { type:'thin', w:3, h:2.5, pos:[ 3,1.25, 9],  rot:[0,0,0]      },
  { type:'thin', w:3, h:2.5, pos:[-3,1.25, 0],  rot:[0,PI/2,0]   },
  { type:'thin', w:3, h:2.5, pos:[ 3,1.25, 0],  rot:[0,PI/2,0]   },
  { type:'thin', w:3, h:2.5, pos:[ 0,1.25,-4],  rot:[0,0,0]      },
  { type:'thin', w:3, h:2.5, pos:[ 0,1.25, 4],  rot:[0,0,0]      },
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
  get collidableWalls() { return this.allWalls.filter(w => !w._passable); }
}
