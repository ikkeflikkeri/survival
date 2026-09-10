import * as THREE from 'three';

// Top-down follow camera per DESIGN.md §3 and §9 defaults:
//   - Tilt 60° off vertical (camera looks 60° away from world-up).
//   - Anchored above the player so the player sits roughly centered.
//   - Look-ahead: target = player.position + 2.5 u in the cursor direction.
//   - Position is lerped for smoothness.

const TILT_DEG = 60;                       // off vertical
const FOLLOW_HEIGHT = 22;                  // tuned so the arena reads well
const FOLLOW_DISTANCE = 14;                // horizontal offset from player
const LOOK_AHEAD = 2.5;                    // design doc §9 default
const POS_LERP = 12.0;                     // higher = snappier follow
const LOOK_LERP = 8.0;

const TILT_RAD = THREE.MathUtils.degToRad(TILT_DEG);

export function createCamera({ aspect }) {
  // Reasonable FOV for a top-down view; tilted so the whole 50u arena fits.
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
  camera.up.set(0, 0, -1);                 // world Z is "screen up"
  camera.lookAt(0, 0, 0);
  return camera;
}

/**
 * Per-frame update.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} playerPos   player's current world position
 * @param {THREE.Vector3} cursorWorld ground-plane cursor hit
 * @param {number} dt                 frame delta in seconds
 */
export function updateCamera(camera, playerPos, cursorWorld, dt) {
  // Direction from player to cursor on the XZ plane (the look-ahead axis).
  const dir = new THREE.Vector3(
    cursorWorld.x - playerPos.x,
    0,
    cursorWorld.z - playerPos.z,
  );
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
  dir.normalize();

  // Camera anchor: player + look-ahead along cursor direction, then offset
  // by FOLLOW_DISTANCE *behind* the cursor and FOLLOW_HEIGHT up.
  const anchor = new THREE.Vector3(
    playerPos.x + dir.x * LOOK_AHEAD,
    0,
    playerPos.z + dir.z * LOOK_AHEAD,
  );

  const desired = new THREE.Vector3(
    anchor.x - dir.x * FOLLOW_DISTANCE * Math.sin(TILT_RAD),
    FOLLOW_HEIGHT,
    anchor.z - dir.z * FOLLOW_DISTANCE * Math.sin(TILT_RAD),
  );

  // Frame-rate independent lerp.
  const a = 1 - Math.exp(-POS_LERP * dt);
  camera.position.lerp(desired, a);

  const lookTarget = new THREE.Vector3(anchor.x, 0, anchor.z);
  // Smooth the look target too so aim-driven camera moves feel less twitchy.
  if (!camera.userData._smoothedTarget) {
    camera.userData._smoothedTarget = lookTarget.clone();
  }
  const b = 1 - Math.exp(-LOOK_LERP * dt);
  camera.userData._smoothedTarget.lerp(lookTarget, b);
  camera.lookAt(camera.userData._smoothedTarget);
}
