import * as THREE from 'three';
import { WallManager } from './world/WallManager.js';

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
const seed = params.get('seed') || 'ABC123';
const wm = new WallManager(scene, seed);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);
const view = params.get('view') || 'spawn';

if (view === 'top') {
  camera.position.set(0, 34, 0.01);
  camera.lookAt(0, 0, 0);
} else if (view === 'spawn') {
  const s = wm.spawnPoints[0];
  camera.position.set(s.x, 1.6, s.z);
  camera.lookAt(0, 1.4, 0);          // look toward middle
} else { // 'center'
  camera.position.set(0, 1.6, 6);
  camera.lookAt(0, 1.4, 0);
}

document.getElementById('label').textContent =
  `seed=${seed} style=${wm.style} walls=${wm.meshes.length} view=${view}`;

let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  renderer.render(scene, camera);
  if (++frames === 4) window.__ready = true;
}
loop();
