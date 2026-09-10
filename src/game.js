import {
  createPlayer,
  updatePlayer,
  damagePlayer,
  playerOverlapsZombie,
} from './player.js';
import {
  createZombie,
  updateZombie,
  damageZombie,
  disposeZombie,
} from './zombie.js';
import { buildWorld, ARENA_HALF } from './world.js';

// --- Spawn ramp defaults (DESIGN §9) ---
const SPAWN_START_INTERVAL = 3.0;
const SPAWN_START_CAP = 10;
const SPAWN_RAMP_PERIOD = 30.0;        // every 30s, halve interval, +5 cap
const SPAWN_MIN_INTERVAL = 0.5;

// --- Spawn geometry ---
// DESIGN §4 wants a ring outside aggro (25u) but inside the arena (50x50
// half = 25u). The arena is exactly sized so the two rings touch: spawn
// candidates land at 25u (just at the wall), get clamped inside, and the
// zombie picks up aggro on the very next tick. The "outside aggro" part
// of the spec is effectively unachievable at the 50x50 arena size; this
// is a known dev in the design defaults (§9 doesn't paper over it).
const SPAWN_RING_MIN = 25.0;
const SPAWN_RING_MAX = 25.0;             // effectively a 25u radius ring

const STATE = { PLAYING: 'PLAYING', DEAD: 'DEAD' };

/**
 * Build the game state. The game owns the scene contents (player, zombies,
 * world) and exposes update/render hooks. The scene itself is passed in so
 * main.js controls the renderer/camera lifecycle.
 */
export function createGame({ scene, input }) {
  // --- world ---
  const world = buildWorld(scene);

  // --- player ---
  const player = createPlayer(scene);

  // --- entity lists ---
  const zombies = [];

  // --- game state ---
  const state = {
    state: STATE.PLAYING,
    score: 0,          // total kills
    time: 0,           // survival seconds
    elapsed: 0,        // for spawn ramp
    spawnTimer: 0,
    spawnInterval: SPAWN_START_INTERVAL,
    spawnCap: SPAWN_START_CAP,
  };

  // --- helpers ---
  const _spawnRng = mulberry32(0xC0FFEE);

  function reset() {
    // Remove every zombie mesh + entry.
    for (const z of zombies) disposeZombie(z, scene);
    zombies.length = 0;

    // Reset player.
    player.position.set(0, player.position.y, 0);
    player.hp = player.maxHp;
    player.swingCooldown = 0;
    player.swingTimer = 0;
    player.mesh.rotation.y = 0;

    // Reset state.
    state.state = STATE.PLAYING;
    state.score = 0;
    state.time = 0;
    state.elapsed = 0;
    state.spawnTimer = 0;
    state.spawnInterval = SPAWN_START_INTERVAL;
    state.spawnCap = SPAWN_START_CAP;
  }

  function spawnZombie() {
    // Don't overshoot the cap.
    if (zombies.length >= state.spawnCap) return;

    // Try a few times to find a ring position outside aggro range, inside
    // the arena, and not inside an obstacle. The ring is ~25u from the
    // player (just outside aggro, inside the arena wall).
    for (let i = 0; i < 40; i++) {
      const angle = _spawnRng() * Math.PI * 2;
      const r = SPAWN_RING_MIN + _spawnRng() * (SPAWN_RING_MAX - SPAWN_RING_MIN);
      let x = player.position.x + Math.cos(angle) * r;
      let z = player.position.z + Math.sin(angle) * r;

      // Clamp inside the 50x50 arena with a small inset.
      const inset = ARENA_HALF - 1.0;
      if (x >  inset) x =  inset;
      if (x < -inset) x = -inset;
      if (z >  inset) z =  inset;
      if (z < -inset) z = -inset;
      if (overlapsAnyObstacle(x, z, 0.6, world.obstacles)) continue;

      zombies.push(createZombie(scene, x, z));
      return;
    }
    // Fallback: drop on the arena perimeter if every candidate was bad.
    const cornerAngle = _spawnRng() * Math.PI * 2;
    const fx = Math.cos(cornerAngle) * (ARENA_HALF - 1.5);
    const fz = Math.sin(cornerAngle) * (ARENA_HALF - 1.5);
    zombies.push(createZombie(scene, fx, fz));
  }

  function update(dt) {
    if (state.state === STATE.PLAYING) {
      // --- time ---
      state.time += dt;
      state.elapsed += dt;
      // --- spawn ramp ---
      if (state.elapsed >= SPAWN_RAMP_PERIOD) {
        state.elapsed -= SPAWN_RAMP_PERIOD;
        state.spawnInterval = Math.max(SPAWN_MIN_INTERVAL, state.spawnInterval * 0.5);
        state.spawnCap += 5;
      }
      state.spawnTimer += dt;
      if (state.spawnTimer >= state.spawnInterval) {
        state.spawnTimer = 0;
        spawnZombie();
      }

      // --- player ---
      const ev = updatePlayer(player, dt, input, world);

      // --- melee: hit zombies in a 90° cone, 2.0u range ---
      if (ev.swung) {
        let killed = 0;
        for (const z of zombies) {
          if (z.dead || z.deathTimer >= 0) continue;
          const dx = z.position.x - player.position.x;
          const dz = z.position.z - player.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 2.0) continue;
          if (dist < 0.001) continue;
          // Angle between zombie and player facing on XZ plane.
          const cosA = (dx * player.facing.x + dz * player.facing.z) / dist;
          if (cosA < Math.cos(Math.PI / 4)) continue;
          if (damageZombie(z, 1)) killed++;
        }
        state.score += killed;
      }

      // --- zombies: AI + collision ---
      for (const z of zombies) {
        updateZombie(z, dt, player, world, zombies);
      }

      // --- player vs zombie sphere-sphere contact damage ---
      // Per-zombie cooldown gates damage to 10 HP every 1.0s while overlapping.
      let biteTotal = 0;
      for (const z of zombies) {
        if (z.dead || z.deathTimer >= 0) continue;
        if (z.contactCooldown > 0) continue;
        if (playerOverlapsZombie(player, z)) {
          biteTotal += 10;
          z.contactCooldown = 1.0;
        }
      }

      if (biteTotal > 0) {
        const dead = damagePlayer(player, biteTotal);
        if (dead && state.state === STATE.PLAYING) {
          state.state = STATE.DEAD;
        }
      }
    } else {
      // DEAD: still tick player visuals + zombie death animations, but no AI.
      player.swingCooldown = Math.max(0, player.swingCooldown - dt);
      player.swingTimer = Math.max(0, player.swingTimer - dt);
      for (const z of zombies) {
        if (z.deathTimer >= 0) {
          z.deathTimer -= dt;
          const t = Math.max(0, z.deathTimer) / 0.3;
          z.mesh.scale.y = t;
          if (z.deathTimer <= 0) z.dead = true;
        }
      }
    }

    // --- cleanup dead zombies ---
    for (let i = zombies.length - 1; i >= 0; i--) {
      if (zombies[i].dead) {
        disposeZombie(zombies[i], scene);
        zombies.splice(i, 1);
      }
    }
  }

  return {
    state,
    player,
    zombies,
    world,
    update,
    reset,
  };
}

function overlapsAnyObstacle(x, z, margin, obstacles) {
  for (const o of obstacles) {
    if (
      x + margin > o.min.x && x - margin < o.max.x &&
      z + margin > o.min.z && z - margin < o.max.z
    ) {
      return true;
    }
  }
  return false;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
