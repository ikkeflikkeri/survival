import * as THREE from 'three';

// --- Canvas + renderer ---
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

// --- Scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202733);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(3, 3, 5);
camera.lookAt(0, 0, 0);

// --- Lights ---
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const directional = new THREE.DirectionalLight(0xffffff, 0.9);
directional.position.set(5, 10, 7.5);
scene.add(directional);

// --- Ground plane ---
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x3b4252,
  roughness: 0.9,
  metalness: 0.0,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
scene.add(ground);

// --- Rotating cube ---
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubeMaterial = new THREE.MeshStandardMaterial({
  color: 0x5e81ac,
  roughness: 0.4,
  metalness: 0.2,
});
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.position.y = 0.25;
scene.add(cube);

// --- Resize handling ---
function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', handleResize);

// --- Render loop ---
const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();

  cube.rotation.x += delta * 0.6;
  cube.rotation.y += delta * 0.9;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
