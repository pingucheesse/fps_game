import * as THREE from 'three';
import { Menu } from './ui/Menu.js';
import { Game } from './Game.js';

const canvas = document.getElementById('canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Simple spinning preview rendered behind the menu
const previewScene = new THREE.Scene();
previewScene.background = new THREE.Color(0x0a0a0a);
const previewCam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
previewCam.position.set(0, 6, 14);
previewCam.lookAt(0, 1, 0);
window.addEventListener('resize', () => {
  previewCam.aspect = window.innerWidth / window.innerHeight;
  previewCam.updateProjectionMatrix();
});

{
  const grid = new THREE.GridHelper(30, 30, 0x333333, 0x222222);
  previewScene.add(grid);
  const amb = new THREE.AmbientLight(0xffffff, 0.3);
  previewScene.add(amb);
}

let previewId = null;
function runPreview() {
  previewId = requestAnimationFrame(runPreview);
  previewCam.position.x = Math.sin(Date.now() * 0.00015) * 14;
  previewCam.position.z = Math.cos(Date.now() * 0.00015) * 14;
  previewCam.lookAt(0, 1, 0);
  renderer.render(previewScene, previewCam);
}
runPreview();

// Menu wires up network then calls back
const menu = new Menu();
menu.onStartGame((netManager, settings) => {
  cancelAnimationFrame(previewId);
  const game = new Game(renderer, netManager, settings);
  game.start();
});
