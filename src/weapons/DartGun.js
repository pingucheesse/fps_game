import * as THREE from 'three';

// A chunky shotgun-looking dart launcher.
//  • Left click  : fire ONE dart trailing a wire; the wire shocks instantly (50).
//                  Left click again retracts it.
//  • Right click : (needs all 3 darts) fire 3 darts in a triangle, all wired to
//                  the gun → a pyramid. Right click again electrifies it: 40 to
//                  anyone inside the triangle, +40 to anyone touching a wire.
//  Darts travel slowly and retract if they fly too far without sticking.

const DARK  = new THREE.MeshLambertMaterial({ color: 0x202024 });
const METAL = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });

const REST_Z     = -0.30;
const DART_SPEED = 11;   // m/s — not too fast
const DART_MAX   = 16;   // retract if it flies this far without sticking
export const WIRE_RADIUS = 0.6;

export class DartGun {
  constructor(camera, scene) {
    this.scene = scene;
    const g = new THREE.Group();

    const body    = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.058, 0.20), DARK);  body.position.set(0, -0.01, -0.04); g.add(body);
    const barrelL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.24), METAL); barrelL.position.set(-0.015, 0.006, -0.17); g.add(barrelL);
    const barrelR = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.24), METAL); barrelR.position.set( 0.015, 0.006, -0.17); g.add(barrelR);
    const pump    = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.032, 0.08), DARK);  pump.position.set(0, -0.034, -0.12); g.add(pump);
    const stock   = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.058, 0.11), DARK);  stock.position.set(0, -0.02, 0.11); g.add(stock);

    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.006, -0.30); g.add(this.muzzle);

    g.position.set(0.18, -0.14, REST_Z);
    g.visible = false;
    camera.add(g);

    this._group = g;
    this._kick  = 0;
    this._caster = new THREE.Raycaster();
    this._deployment = null;
    this._wireMat = new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 });
    this._wire = null;
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; if (!v) this.retract(); }
  get deployed()    { return !!this._deployment; }
  get singleOut()   { return this._deployment?.type === 'single'; }
  get triangleOut() { return this._deployment?.type === 'triangle'; }
  get muzzleWorld() { const p = new THREE.Vector3(); this.muzzle.getWorldPosition(p); return p; }

  _mkDart(dir) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.07),
      new THREE.MeshLambertMaterial({ color: 0x9fe6ff }));
    const tip = this.muzzleWorld;
    mesh.position.copy(tip);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    this.scene.add(mesh);
    return { mesh, dir: dir.clone().normalize(), tip, dist: 0, stuck: false };
  }

  fireSingle(dir) {
    this._kick = 0.1;
    this._deployment = { type: 'single', darts: [this._mkDart(dir)], electrified: false };
    this._rebuildWire();
  }

  fireTriangle(forward, up, right) {
    this._kick = 0.14;
    const a = 0.16;
    const d1 = forward.clone().addScaledVector(up,  a).normalize();                                  // apex (top)
    const d2 = forward.clone().addScaledVector(up, -a * 0.5).addScaledVector(right, -a * 0.87).normalize(); // bottom-left
    const d3 = forward.clone().addScaledVector(up, -a * 0.5).addScaledVector(right,  a * 0.87).normalize(); // bottom-right
    this._deployment = { type: 'triangle', darts: [this._mkDart(d1), this._mkDart(d2), this._mkDart(d3)], electrified: false };
    this._rebuildWire();
  }

  electrify() {
    if (!this._deployment) return;
    this._deployment.electrified = true;
    this._deployment.electrifyTime = 0;
    if (this._wire) this._wire.material.color.setHex(0xffee44);
  }

  retract() {
    if (!this._deployment) return;
    for (const d of this._deployment.darts) {
      this.scene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose();
    }
    if (this._wire) { this.scene.remove(this._wire); this._wire.geometry.dispose(); this._wire.material.dispose(); this._wire = null; }
    this._deployment = null;
  }

  getTips() { return this._deployment ? this._deployment.darts.map(d => d.tip.clone()) : []; }

  // Wire segments (world-space [a,b] pairs): pyramid sides + triangle base
  getWireSegments() {
    if (!this._deployment) return [];
    const m = this.muzzleWorld, t = this._deployment.darts.map(d => d.tip);
    if (this._deployment.type === 'single') return [[m, t[0]]];
    return [[m, t[0]], [m, t[1]], [m, t[2]], [t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
  }

  _rebuildWire() {
    const segs = this.getWireSegments();
    const pts = [];
    for (const [a, b] of segs) pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (!this._wire) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this._wire = new THREE.LineSegments(geo, this._wireMat.clone());
      this.scene.add(this._wire);
    } else {
      this._wire.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this._wire.geometry.attributes.position.needsUpdate = true;
    }
    if (this._deployment?.electrified) this._wire.material.color.setHex(0xffee44);
  }

  update(dt, wallMeshes) {
    this._kick += (0 - this._kick) * Math.min(1, dt * 12);
    this._group.position.z = REST_Z + this._kick;

    const dep = this._deployment;
    if (!dep) return;

    for (const d of dep.darts) {
      if (d.stuck) continue;
      const step = DART_SPEED * dt;
      this._caster.set(d.tip, d.dir); this._caster.far = step + 0.02;
      const hits = this._caster.intersectObjects(wallMeshes, false);
      if (hits.length > 0) { d.tip.copy(hits[0].point); d.stuck = true; }
      else {
        d.tip.addScaledVector(d.dir, step);
        d.dist += step;
        if (d.dist >= DART_MAX) { this.retract(); return; } // flew too far → retract
      }
      d.mesh.position.copy(d.tip);
    }

    if (dep.electrified) {
      dep.electrifyTime += dt;
      if (dep.electrifyTime > 0.4) { this.retract(); return; } // brief flash then consume
    }

    this._rebuildWire();
  }
}
