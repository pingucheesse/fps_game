import * as THREE from 'three';

export class World {
  constructor(scene) {
    this._addLights(scene);
    this._addFloor(scene);
  }

  _addLights(scene) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(8, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    scene.add(sun);

    // Soft fill from below
    const fill = new THREE.DirectionalLight(0xaaccff, 0.2);
    fill.position.set(-5, -3, -5);
    scene.add(fill);
  }

  _addFloor(scene) {
    const geo = new THREE.PlaneGeometry(50, 50);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.floor = floor;   // exposed so darts/reticle can stick to / aim at the ground

    // Grey grid lines sitting just above the floor
    const grid = new THREE.GridHelper(50, 50, 0xbbbbbb, 0xcccccc);
    grid.position.y = 0.002;
    scene.add(grid);
  }
}
