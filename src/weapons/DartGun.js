import * as THREE from 'three';

// Triple-tube dart launcher.
//  • Left click  : fire ONE slow dart trailing a wire. The wire shocks (50) the
//                  moment the dart LANDS — when it sticks to a wall, or burns out
//                  its range mid-air. Left click again retracts an out dart.
//  • Right click : (needs all 3 darts) fire 3 darts in a triangle, all wired to
//                  the gun → a pyramid. Right click again electrifies it: 40 to
//                  anyone inside the triangle, +40 to anyone touching a wire.
//  Darts launch along the CAMERA rays (passed in by Game), so they land exactly
//  on the predictive reticle; the wire still visually anchors to the gun.

const DARK  = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
const METAL = new THREE.MeshLambertMaterial({ color: 0x34343e });
const GLOW  = new THREE.MeshLambertMaterial({ color: 0x0c2a3a, emissive: 0x2288ff, emissiveIntensity: 0.9 });

const REST_Z     = -0.30;
const DART_SPEED = 11;   // m/s — not too fast
export const DART_MAX   = 16;   // a single dart discharges here if it never sticks
export const WIRE_RADIUS = 0.6;

const MAX_SEGS = 6;
const DART_GEO = new THREE.BoxGeometry(0.02, 0.02, 0.07);
const DART_MAT = new THREE.MeshLambertMaterial({ color: 0x9fe6ff, emissive: 0x1177cc, emissiveIntensity: 0.5 });

// Cylinder along the z axis (barrel tube)
function tube(r, len) {
  const geo = new THREE.CylinderGeometry(r, r, len, 8);
  geo.rotateX(Math.PI / 2);
  return geo;
}

export class DartGun {
  constructor(camera, scene) {
    this.scene = scene;
    const g = new THREE.Group();

    // Receiver — chunky boxy core
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.052, 0.16), DARK);
    receiver.position.set(0, -0.008, -0.02); g.add(receiver);

    // Three dart tubes in TRIANGLE formation (matches the 3-dart special):
    // one on top, two below.
    const tubeGeo = tube(0.011, 0.26);
    const t1 = new THREE.Mesh(tubeGeo, METAL); t1.position.set(0, 0.024, -0.16); g.add(t1);
    const t2 = new THREE.Mesh(tubeGeo, METAL); t2.position.set(-0.017, -0.002, -0.16); g.add(t2);
    const t3 = new THREE.Mesh(tubeGeo, METAL); t3.position.set( 0.017, -0.002, -0.16); g.add(t3);

    // Muzzle plate tying the tubes together
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.052, 0.016), DARK);
    plate.position.set(0, 0.01, -0.284); g.add(plate);

    // Glowing energy strips on the receiver flanks + a core glow between tubes
    const stripGeo = new THREE.BoxGeometry(0.004, 0.012, 0.12);
    const s1 = new THREE.Mesh(stripGeo, GLOW); s1.position.set(-0.033, 0.002, -0.03); g.add(s1);
    const s2 = new THREE.Mesh(stripGeo, GLOW); s2.position.set( 0.033, 0.002, -0.03); g.add(s2);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.2), GLOW);
    core.position.set(0, 0.008, -0.16); g.add(core);

    // Pump foregrip, angled grip, stock, front sight
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.028, 0.07), METAL);
    pump.position.set(0, -0.048, -0.16); g.add(pump);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.062, 0.045), DARK);
    grip.position.set(0, -0.058, 0.035); grip.rotation.x = 0.28; g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.046, 0.09), DARK);
    stock.position.set(0, -0.012, 0.10); g.add(stock);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.018), DARK);
    sight.position.set(0, 0.042, -0.26); g.add(sight);

    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.01, -0.30); g.add(this.muzzle);

    g.position.set(0.18, -0.14, REST_Z);
    g.visible = false;
    camera.add(g);

    this._group = g;
    this._kick  = 0;
    this._caster = new THREE.Raycaster();
    this._deployment = null;
    this.onLand = null;   // called once with (this) when a single dart discharges

    // Wire: one LineSegments with a preallocated buffer (no per-frame allocation)
    this._wireBuf = new Float32Array(MAX_SEGS * 6);
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(this._wireBuf, 3).setUsage(THREE.DynamicDrawUsage));
    this._wire = new THREE.LineSegments(wireGeo,
      new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 }));
    this._wire.frustumCulled = false;
    this._wire.visible = false;
    scene.add(this._wire);
  }

  get visible()  { return this._group.visible; }
  set visible(v) { this._group.visible = v; if (!v) this.retract(); }
  get deployed()    { return !!this._deployment; }
  get singleOut()   { return this._deployment?.type === 'single'; }
  get triangleOut() { return this._deployment?.type === 'triangle'; }
  get electrified() { return !!this._deployment?.electrified; }
  get muzzleWorld() { const p = new THREE.Vector3(); this.muzzle.getWorldPosition(p); return p; }
  // Wire anchor: the launch point, frozen at fire time so walking around
  // afterwards never moves/erases the line. Falls back to the live muzzle.
  get anchor() { return this._deployment ? this._deployment.origin.clone() : this.muzzleWorld; }

  _mkDart(start, dir) {
    const mesh = new THREE.Mesh(DART_GEO, DART_MAT);
    const tip = start.clone();
    mesh.position.copy(tip);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    this.scene.add(mesh);
    return { mesh, dir: dir.clone().normalize(), tip, dist: 0, stuck: false };
  }

  // start: launch position on the camera ray (Game passes eye + small offset) so
  // the dart's path IS the reticle ray → it lands exactly where the ring shows.
  fireSingle(start, dir) {
    this._kick = 0.1;
    this._deployment = { type: 'single', origin: this.muzzleWorld, darts: [this._mkDart(start, dir)], electrified: false };
    this._rebuildWire();
  }

  fireTriangle(start, dirs) {
    this._kick = 0.14;
    this._deployment = { type: 'triangle', origin: this.muzzleWorld, darts: dirs.map(d => this._mkDart(start, d)), electrified: false };
    this._rebuildWire();
  }

  electrify() {
    if (!this._deployment || this._deployment.electrified) return false;
    this._deployment.electrified = true;
    this._deployment.electrifyTime = 0;
    this._wire.material.color.setHex(0xffee44);
    return true;
  }

  retract() {
    if (!this._deployment) return;
    for (const d of this._deployment.darts) this.scene.remove(d.mesh); // shared geo/mat — no dispose
    this._deployment = null;
    this._wire.visible = false;
    this._wire.material.color.setHex(0x66ccff);
  }

  getTips() { return this._deployment ? this._deployment.darts.map(d => d.tip.clone()) : []; }

  // Wire segments (world-space [a,b] pairs): pyramid sides + triangle base
  getWireSegments() {
    if (!this._deployment) return [];
    const m = this._deployment.origin, t = this._deployment.darts.map(d => d.tip);
    if (this._deployment.type === 'single') return [[m, t[0]]];
    return [[m, t[0]], [m, t[1]], [m, t[2]], [t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
  }

  _rebuildWire() {
    const segs = this.getWireSegments();
    const buf = this._wireBuf;
    let o = 0;
    for (const [a, b] of segs) {
      buf[o++] = a.x; buf[o++] = a.y; buf[o++] = a.z;
      buf[o++] = b.x; buf[o++] = b.y; buf[o++] = b.z;
    }
    const attr = this._wire.geometry.attributes.position;
    attr.needsUpdate = true;
    this._wire.geometry.setDrawRange(0, segs.length * 2);
    this._wire.visible = segs.length > 0;
  }

  update(dt, wallMeshes) {
    this._kick += (0 - this._kick) * Math.min(1, dt * 12);
    this._group.position.z = REST_Z + this._kick;

    const dep = this._deployment;
    if (!dep) return;

    let justLanded = false;
    for (const d of dep.darts) {
      if (d.stuck) continue;
      const step = DART_SPEED * dt;
      this._caster.set(d.tip, d.dir); this._caster.far = step + 0.02;
      const hits = this._caster.intersectObjects(wallMeshes, false);
      if (hits.length > 0) {
        d.tip.copy(hits[0].point); d.stuck = true;
        if (dep.type === 'single') justLanded = true;
      } else {
        d.tip.addScaledVector(d.dir, step);
        d.dist += step;
        if (d.dist >= DART_MAX) {
          if (dep.type === 'single') { d.stuck = true; justLanded = true; } // burn out & shock here
          else { this.retract(); return; }                                  // triangle: too far → drop
        }
      }
      d.mesh.position.copy(d.tip);
    }

    // A single dart discharges the instant it lands (sticks or burns out).
    if (justLanded && !dep.electrified) {
      this.electrify();
      if (this.onLand) this.onLand(this);
    }

    if (dep.electrified) {
      dep.electrifyTime += dt;
      if (dep.electrifyTime > 0.4) { this.retract(); return; } // brief flash then consume
    }

    this._rebuildWire();
  }
}
