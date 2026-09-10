import * as THREE from 'three';

// Arena + obstacle layout. Deterministic via mulberry32 seeded with 0xDEADBEEF
// (per docs/DESIGN.md §9). Walls and obstacles are exposed as AABBs so the
// player/zombie AABB-vs-sphere collision check can stay in one place.

// --- Constants (design doc §9 defaults) ---
export const ARENA_SIZE = 50;          // 50x50 units, centered on origin
export const ARENA_HALF = ARENA_SIZE / 2;
export const WALL_HEIGHT = 3;
export const WALL_THICKNESS = 1;
export const WALL_COLOR = 0x5a4a3a;
export const FLOOR_COLOR = 0x3a3a3a;
export const OBSTACLE_COLOR = 0x6b5a3a;
export const OBSTACLE_COUNT = 10;
export const OBSTACLE_SIZE = 1.5;      // ~1.5 cube

// Keep zombies and player a bit clear of the perimeter so they don't
// spawn clipping a wall.
export const ARENA_INNER_HALF = ARENA_HALF - 1.0;

// --- Seeded PRNG (mulberry32) ---
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

// --- Public helpers ---

/**
 * Build the arena floor, 4 perimeter walls, and 10 obstacle boxes.
 *
 * Returns an object with the THREE.Group plus AABB lists:
 *  - walls:     Array<{ min: Vector3, max: Vector3 }>
 *  - obstacles: Array<{ min: Vector3, max: Vector3, mesh: Mesh }>
 *
 * Obstacle layout is fully deterministic for a given seed (DESIGN §9).
 */
export function buildWorld(scene) {
  const group = new THREE.Group();
  group.name = 'world';

  // --- Floor ---
  const floorGeom = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
  const floorMat = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    roughness: 0.95,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // --- Walls ---
  const wallMat = new THREE.MeshStandardMaterial({
    color: WALL_COLOR,
    roughness: 0.85,
    metalness: 0.0,
  });

  const spans = [
    { x: 0,                 z:  ARENA_HALF, sx: ARENA_SIZE + WALL_THICKNESS * 2 },
    { x: 0,                 z: -ARENA_HALF, sx: ARENA_SIZE + WALL_THICKNESS * 2 },
    { x:  ARENA_HALF,       z: 0,            sz: ARENA_SIZE + WALL_THICKNESS * 2 },
    { x: -ARENA_HALF,       z: 0,            sz: ARENA_SIZE + WALL_THICKNESS * 2 },
  ];

  const walls = [];
  for (const s of spans) {
    const sx = s.sx ?? WALL_THICKNESS;
    const sz = s.sz ?? WALL_THICKNESS;
    const geom = new THREE.BoxGeometry(sx, WALL_HEIGHT, sz);
    const mesh = new THREE.Mesh(geom, wallMat);
    mesh.position.set(s.x, WALL_HEIGHT / 2, s.z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);

    const half = new THREE.Vector3(sx, WALL_HEIGHT, sz).multiplyScalar(0.5);
    walls.push({
      mesh,
      min: new THREE.Vector3(s.x - half.x, s.y ?? 0, s.z - half.z),
      max: new THREE.Vector3(s.x + half.x, WALL_HEIGHT, s.z + half.z),
    });
  }

  // --- Obstacles (seeded layout) ---
  const rng = mulberry32(0xDEADBEEF);
  const obstacleMat = new THREE.MeshStandardMaterial({
    color: OBSTACLE_COLOR,
    roughness: 0.8,
    metalness: 0.0,
  });

  const obstacles = [];
  const minSeparation = OBSTACLE_SIZE * 2.5;
  const minDistFromCenter = 4.0; // keep some breathing room near player start
  let attempts = 0;
  while (obstacles.length < OBSTACLE_COUNT && attempts < 500) {
    attempts++;
    const x = (rng() * 2 - 1) * (ARENA_INNER_HALF - OBSTACLE_SIZE);
    const z = (rng() * 2 - 1) * (ARENA_INNER_HALF - OBSTACLE_SIZE);
    if (Math.hypot(x, z) < minDistFromCenter) continue;

    let ok = true;
    for (const o of obstacles) {
      const dx = o.center.x - x;
      const dz = o.center.z - z;
      if (Math.hypot(dx, dz) < minSeparation) { ok = false; break; }
    }
    if (!ok) continue;

    const geom = new THREE.BoxGeometry(OBSTACLE_SIZE, OBSTACLE_SIZE, OBSTACLE_SIZE);
    const mesh = new THREE.Mesh(geom, obstacleMat);
    mesh.position.set(x, OBSTACLE_SIZE / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const half = OBSTACLE_SIZE / 2;
    obstacles.push({
      mesh,
      center: new THREE.Vector3(x, OBSTACLE_SIZE / 2, z),
      min: new THREE.Vector3(x - half, 0, z - half),
      max: new THREE.Vector3(x + half, OBSTACLE_SIZE, z + half),
    });
  }

  scene.add(group);

  return { group, floor, walls, obstacles };
}

/**
 * Clamp a candidate XZ position to stay inside the arena bounds and outside
 * every obstacle AABB (with a margin so an entity's radius isn't sunk into a
 * crate).
 *
 * Walls are skipped because the AABB-vs-sphere check already prevents moving
 * into them; this helper is mainly used by the zombie spawner to keep spawn
 * points out of obstacle volumes.
 */
export function findOpenPosition(rng, radius, walls, obstacles, maxTries = 40) {
  const margin = radius + 0.1;
  for (let i = 0; i < maxTries; i++) {
    const x = (rng() * 2 - 1) * (ARENA_INNER_HALF - margin);
    const z = (rng() * 2 - 1) * (ARENA_INNER_HALF - margin);
    if (!insideAnyObstacle(x, z, margin, obstacles)) {
      return new THREE.Vector3(x, 0, z);
    }
  }
  return null;
}

function insideAnyObstacle(x, z, margin, obstacles) {
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
