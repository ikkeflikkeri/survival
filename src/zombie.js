import * as THREE from 'three';
import { resolveSphereAgainstAABBs, separateSpheresXZ } from './collision.js';

// Zombie entity. Per DESIGN.md §4 and §9 defaults:
//   - Upright capsule, muted green.
//   - Idle outside aggro (25u). Lock on and walk at 2 u/s when player is in
//     aggro range.
//   - Contact damage: 10 HP per 1.0s while overlapping, with a per-zombie
//     cooldown so they don't stack damage every frame.
//   - Death = scale Y to 0 over 0.3s, then despawn.

const ZOMBIE_COLOR = 0x5a7a4a;
const ZOMBIE_RADIUS = 0.45;
const ZOMBIE_HEIGHT = 1.7;     // capsule total height
const MOVE_SPEED = 2.0;
const AGGRO_RANGE = 25.0;
const DEATH_DURATION = 0.3;
const HIT_RADIUS = 0.5;        // collision sphere radius (matches player)
// Contact damage (10 HP per 1.0s while overlapping) is owned by game.js so
// it sees the post-step overlap state.

export function createZombie(scene, x, z) {
  const capsuleRadius = ZOMBIE_RADIUS;
  const capsuleLength = Math.max(0.01, ZOMBIE_HEIGHT - capsuleRadius * 2);
  const geom = new THREE.CapsuleGeometry(capsuleRadius, capsuleLength, 4, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: ZOMBIE_COLOR,
    roughness: 0.85,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.position.set(x, capsuleRadius + capsuleLength / 2, z);
  scene.add(mesh);

  return {
    mesh,
    position: mesh.position,           // alias for collision math
    radius: HIT_RADIUS,
    hp: 1,                              // 1-hit kill in slice 1
    contactCooldown: 0,                 // time until next allowed bite
    deathTimer: -1,                     // -1 = alive; otherwise seconds left
    dead: false,
    alive: true,
  };
}

/**
 * Fixed-timestep update. Contact damage is applied by game.js after the
 * zombie has moved so it always uses the post-step overlap state.
 */
export function updateZombie(zombie, dt, player, world, otherZombies) {
  if (zombie.dead) {
    // Already scheduled for removal; skip AI.
    return;
  }
  if (zombie.deathTimer >= 0) {
    zombie.deathTimer -= dt;
    const t = Math.max(0, zombie.deathTimer) / DEATH_DURATION;
    zombie.mesh.scale.y = t;
    if (zombie.deathTimer <= 0) zombie.dead = true;
    return;
  }

  // --- chase AI ---
  const dx = player.position.x - zombie.position.x;
  const dz = player.position.z - zombie.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > AGGRO_RANGE) {
    // Idle: nothing to do this tick.
    return;
  }

  // Simple straight-line chase. Slice 1 doesn't have obstacle avoidance
  // (open question §10) so zombies can bunch on crate corners. The
  // AABB-vs-sphere resolver prevents them from clipping through obstacles.
  if (dist > 0.001) {
    const nx = dx / dist;
    const nz = dz / dist;
    const step = MOVE_SPEED * dt;
    zombie.position.x += nx * step;
    zombie.position.z += nz * step;
  }

  // --- collision: zombies vs walls/obstacles (AABB-vs-sphere) ---
  resolveSphereAgainstAABBs(zombie.position, zombie.radius, world.walls, world.obstacles);

  // --- collision: zombie vs other zombies (sphere-vs-sphere) ---
  for (const other of otherZombies) {
    if (other === zombie || other.dead) continue;
    separateSpheresXZ(zombie, other);
  }

  // Face the player (purely cosmetic). yaw 0 = facing -Z, so the
  // formula is the same as the player's.
  if (dist > 0.001) {
    const yaw = Math.atan2(-dx, -dz);
    zombie.mesh.rotation.y = yaw;
  }

  // Decrement contact cooldown; game.js owns the bite application.
  zombie.contactCooldown = Math.max(0, zombie.contactCooldown - dt);
}

/**
 * Apply a melee hit. Returns true if the zombie dies from this swing.
 */
export function damageZombie(zombie, amount = 1) {
  if (zombie.dead) return false;
  zombie.hp -= amount;
  if (zombie.hp <= 0 && zombie.deathTimer < 0) {
    zombie.deathTimer = DEATH_DURATION;
    return true;
  }
  return false;
}

export function disposeZombie(zombie, scene) {
  scene.remove(zombie.mesh);
  zombie.mesh.geometry.dispose();
  zombie.mesh.material.dispose();
}
