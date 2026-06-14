import * as THREE from 'three';
import { WallManager } from './world/WallManager.js';
import { DestructibleWall } from './world/DestructibleWall.js';
import { Gun } from './weapons/Gun.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88bbdd);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(8, 20, 8); scene.add(sun);
const fill = new THREE.DirectionalLight(0xaaccff, 0.2); fill.position.set(-5, -3, -5); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'spawn';
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);

let label = '';

let _gun = null;
if (view === 'gun') {
  const holder = new THREE.Object3D();
  scene.add(holder);
  _gun = new Gun(holder); // gun group ends up at holder-local (0.16,-0.13,-0.28)
  const frac = parseFloat(params.get('ammo') ?? '0.2');
  _gun.setAmmoFraction(frac);
  for (let i = 0; i < 30; i++) _gun.update(0.05); // advance float a bit
  label = `gun ammoFrac=${frac} (rounds ≈ ${Math.round(frac * 10)})`;
  camera.position.set(0.16, -0.07, -0.05);
  camera.lookAt(0.16, -0.13, -0.30);
} else if (view === 'holes') {
  // Punch a hole in a thin and a medium wall to inspect the edge smoothness.
  const dir = new THREE.Vector3(0, 0, -1);
  const make = (type, x, shots) => {
    const w = new DestructibleWall(scene, {
      type, width: 2.5, height: 2.5,
      position: new THREE.Vector3(x, 1.25, 0), rotation: new THREE.Euler(0, 0, 0),
    });
    for (let k = 0; k < shots; k++) {
      const cx = x + (Math.random() - 0.5) * 0.5;
      const cy = 1.25 + (Math.random() - 0.5) * 0.5;
      w.applyHit(new THREE.Vector3(cx, cy, 0.1), dir, {});
    }
  };
  make('thin', -1.6, 14);
  make('medium', 1.6, 16);
  label = 'thin (left) + medium (right) — hole edge smoothness';
  camera.position.set(0, 1.4, 2.4);
  camera.lookAt(0, 1.25, 0);
} else if (view === 'concrete') {
  // Hammer a concrete wall with sustained fire and see it chip into chunks.
  const wall = new DestructibleWall(scene, {
    type: 'concrete', width: 4, height: 3,
    position: new THREE.Vector3(0, 1.5, 0), rotation: new THREE.Euler(0, 0, 0),
  });
  const dir = new THREE.Vector3(0, 0, -1);
  let shots = 0;
  for (let k = 0; k < 45; k++) {
    const cx = (Math.random() - 0.5) * 0.6;     // focused fire in a ~0.6 m patch
    const cy = 1.5 + (Math.random() - 0.5) * 0.5;
    wall.applyHit(new THREE.Vector3(cx, cy, 0.15), dir, {});
    shots++;
  }
  label = `concrete wall after ${shots} shots (front view)`;
  camera.position.set(0.6, 1.7, 4.5);
  camera.lookAt(0, 1.5, 0);
} else {
  const seed = params.get('seed') || 'ABC123';
  const wm = new WallManager(scene, seed);
  if (view === 'top') { camera.position.set(0, 36, 0.01); camera.lookAt(0, 0, 0); }
  else if (view === 'spawn') { const s = wm.spawnPoints[0]; camera.position.set(s.x, 1.6, s.z); camera.lookAt(0, 1.4, 0); }
  else { camera.position.set(0, 1.6, 6); camera.lookAt(0, 1.4, 0); }
  label = `seed=${seed} style=${wm.style} walls=${wm.meshes.length} view=${view}`;
}

document.getElementById('label').textContent = label;

let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  if (_gun) _gun.update(0.016);
  renderer.render(scene, camera);
  if (++frames === 4) window.__ready = true;
}
loop();
