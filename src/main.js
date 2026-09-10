import * as THREE from 'three';
import { createInput } from './input.js';
import { createCamera, updateCamera } from './camera.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';

// --- Boot ---

const canvas = document.getElementById('scene');
if (!canvas) throw new Error('Missing #scene canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a22);

// --- Lights ---
// Defaults from DESIGN §9: ambient intensity 0.5, directional 0.8 from
// above-front. We give the directional light a shadow camera that covers
// the 50u arena.
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const directional = new THREE.DirectionalLight(0xffffff, 0.8);
directional.position.set(15, 25, 10);
directional.target.position.set(0, 0, 0);
directional.castShadow = true;
directional.shadow.mapSize.set(1024, 1024);
directional.shadow.camera.left = -30;
directional.shadow.camera.right = 30;
directional.shadow.camera.top = 30;
directional.shadow.camera.bottom = -30;
directional.shadow.camera.near = 1;
directional.shadow.camera.far = 80;
scene.add(directional);
scene.add(directional.target);

// --- Camera ---
const camera = createCamera({ aspect: window.innerWidth / window.innerHeight });

// --- Input + HUD + Game ---
const input = createInput({ canvas, camera });
const hud = createHud();
const game = createGame({ scene, input });

// Restart wiring: HUD button -> game.reset() + push initial HUD state.
hud.onRestart(() => {
  game.reset();
  hud.hideGameOver();
  hud.setHealth(game.player.hp, game.player.maxHp);
  hud.setKills(game.state.score);
  hud.setTime(game.state.time);
});

function pushHud() {
  hud.setHealth(game.player.hp, game.player.maxHp);
  hud.setKills(game.state.score);
  hud.setTime(game.state.time);
  if (game.state.state === 'DEAD') {
    hud.showGameOver(game.state.score, game.state.time);
  }
}
pushHud();

// --- Resize ---
function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', handleResize);

// --- Game loop ---
// Fixed-timestep update with accumulator, clamp 0.25s to avoid spiral of
// death on tab switch. Render at rAF rate using the latest state.
const FIXED_DT = 1 / 60;
const MAX_ACC = 0.25;
let acc = 0;
let last = performance.now();

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_ACC) dt = MAX_ACC;
  acc += dt;

  while (acc >= FIXED_DT) {
    game.update(FIXED_DT);
    acc -= FIXED_DT;
  }

  input.refreshCursor();
  updateCamera(camera, game.player.position, input.cursorWorld, dt);
  pushHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
