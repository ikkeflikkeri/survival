import * as THREE from 'three';

// Centralized input state.
//  - Keyboard: tracked via a Set of held WASD keys + arbitrary extras.
//  - Mouse:   cursor position in NDC and a click-edge flag for the melee
//             trigger. We also expose `cursorWorld`: the ground-plane hit
//             point under the mouse, refreshed each render frame.

const GROUND_Y = 0;
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();

export function createInput({ canvas, camera }) {
  const keys = new Set();
  /** @type {THREE.Vector3} last cursor → world hit point on the ground. */
  const cursorWorld = new THREE.Vector3(0, 0, 0);
  let cursorActive = false; // becomes true on first mousemove
  let mouseDownThisFrame = false;

  function onKeyDown(e) {
    const k = normalizeKey(e);
    if (k) keys.add(k);
  }
  function onKeyUp(e) {
    const k = normalizeKey(e);
    if (k) keys.delete(k);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _ndc.set(x, y);
    updateCursorWorld();
    cursorActive = true;
  }
  function onMouseLeave() {
    cursorActive = false;
  }
  function onMouseDown(e) {
    if (e.button === 0) mouseDownThisFrame = true;
  }

  function normalizeKey(e) {
    const c = e.code;
    // Drop modifiers we don't care about
    if (c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD') return c;
    return null;
  }

  function updateCursorWorld() {
    _raycaster.setFromCamera(_ndc, camera);
    const ok = _raycaster.ray.intersectPlane(_groundPlane, _hit);
    if (ok) cursorWorld.copy(_hit);
  }

  function movementVector() {
    // World-space WASD: W = forward = -Z, A = left = -X, etc.
    // (Y stays 0 so we move purely on the XZ plane.)
    let x = 0;
    let z = 0;
    if (keys.has('KeyW')) z -= 1;
    if (keys.has('KeyS')) z += 1;
    if (keys.has('KeyA')) x -= 1;
    if (keys.has('KeyD')) x += 1;
    const v = new THREE.Vector3(x, 0, z);
    if (v.lengthSq() > 0) v.normalize();
    return v;
  }

  /** Call once per frame after game logic to drain the click edge. */
  function consumeClick() {
    const down = mouseDownThisFrame;
    mouseDownThisFrame = false;
    return down;
  }

  // --- attach listeners ---
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('mousedown', onMouseDown);
  // Prevent the context menu on right-click; harmless for slice 1.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    keys,
    cursorWorld,
    isCursorActive: () => cursorActive,
    movementVector,
    consumeClick,
    refreshCursor: updateCursorWorld,
  };
}
