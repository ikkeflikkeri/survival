import * as THREE from 'three';
import { resolveSphereAgainstAABBs } from './collision.js';

// Player entity. Owns the mesh, movement, facing, melee swing, HP, and the
// 0.5u hit sphere.
//
// Per DESIGN.md §2 and §9 defaults:
//   - WASD on XZ plane, 5 u/s.
//   - Cursor-facing around Y.
//   - Left-click melee: 90° cone, 2.0 u range, 0.4s cooldown, 1-hit kill.
//   - 100 HP, no regen, 0.5 u hit sphere.

const MOVE_SPEED = 5.0;
const HIT_RADIUS = 0.5;
const MAX_HP = 100;
// Melee swing: 2.0u range, 90° cone (45° each side of facing). The actual
// hit-test lives in game.js for clarity; these constants document the
// intent and let future tuning stay in one place.
const MELEE_RANGE = 2.0;
const MELEE_CONE_HALF = Math.PI / 4;
const MELEE_COOLDOWN = 0.4;
const SWING_DURATION = 0.18;
const PLAYER_COLOR = 0xd0d0d0;

export function createPlayer(scene) {
  // Simple upright capsule-ish body. CapsuleGeometry's full height is
  // (length + 2 * radius). We want the player to stand about 1.8u tall.
  const radius = 0.35;
  const length = 1.1;
  const geom = new THREE.CapsuleGeometry(radius, length, 4, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: PLAYER_COLOR,
    roughness: 0.6,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.position.set(0, radius + length / 2, 0);
  scene.add(mesh);

  // Subtle directional indicator (the "front" of the player). A small
  // wedge that briefly extends when swinging.
  const wedgeGeom = new THREE.ConeGeometry(0.35, 0.7, 12);
  const wedgeMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c0,
    transparent: true,
    opacity: 0.0,
    roughness: 0.5,
    metalness: 0.0,
  });
  const wedge = new THREE.Mesh(wedgeGeom, wedgeMat);
  wedge.rotation.x = -Math.PI / 2;      // cone tip points along -Z (forward) at yaw 0
  wedge.position.set(0, 0.4, -(radius + 0.35));
  mesh.add(wedge);

  return {
    mesh,
    position: mesh.position,             // alias for collision math
    facing: new THREE.Vector3(0, 0, -1), // yaw = 0 means facing -Z
    hp: MAX_HP,
    maxHp: MAX_HP,
    radius: HIT_RADIUS,
    swingCooldown: 0,
    swingTimer: 0,                       // visual remaining
  };
}

/**
 * Update the player for one fixed timestep.
 * Returns an object describing what happened so game.js can apply damage
 * to zombies or transition to the dead state.
 */
export function updatePlayer(player, dt, input, world) {
  // --- facing (twin-stick: aim is independent from movement) ---
  // Yaw 0 = facing -Z (forward). Mesh rotation.y = yaw turns the local -Z
  // forward into the desired facing direction on the XZ plane.
  const dx = input.cursorWorld.x - player.position.x;
  const dz = input.cursorWorld.z - player.position.z;
  if (dx * dx + dz * dz > 1e-4) {
    player.facing.set(dx, 0, dz).normalize();
    const yaw = Math.atan2(-player.facing.x, -player.facing.z);
    player.mesh.rotation.y = yaw;
  }

  // --- movement ---
  const mv = input.movementVector();
  if (mv.lengthSq() > 0) {
    const step = mv.clone().multiplyScalar(MOVE_SPEED * dt);
    const next = player.position.clone().add(step);
    next.y = player.position.y;
    resolveSphereAgainstAABBs(next, player.radius, world.walls, world.obstacles);
    player.position.copy(next);
  }

  // --- swing ---
  player.swingCooldown = Math.max(0, player.swingCooldown - dt);
  player.swingTimer = Math.max(0, player.swingTimer - dt);

  const swung = input.consumeClick() && player.swingCooldown <= 0;
  let hitZombies = [];
  if (swung) {
    player.swingCooldown = MELEE_COOLDOWN;
    player.swingTimer = SWING_DURATION;
    // Visual flash on the wedge.
    player.mesh.children[0].material.opacity = 0.7;
  }
  if (player.swingTimer > 0) {
    // Fade the wedge as the swing finishes.
    const t = player.swingTimer / SWING_DURATION;
    player.mesh.children[0].material.opacity = 0.7 * t;
  } else {
    player.mesh.children[0].material.opacity = 0.0;
  }

  return { swung, hitZombies };
}

/**
 * Hit-test the player against every zombie.
 * Returns true if the player is currently overlapping at least one zombie.
 * Damage application is left to game.js so per-zombie cooldowns live with
 * the zombie entities.
 */
export function playerOverlapsZombie(player, zombie) {
  const dx = player.position.x - zombie.position.x;
  const dz = player.position.z - zombie.position.z;
  const r = player.radius + zombie.radius;
  return dx * dx + dz * dz <= r * r;
}

export function damagePlayer(player, amount) {
  player.hp = Math.max(0, player.hp - amount);
  return player.hp <= 0;
}
