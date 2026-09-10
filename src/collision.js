// Shared sphere-vs-AABB collision helpers used by both the player and the
// zombies. Keeps the resolution algorithm in one place so we don't drift
// between the two entity types.
//
// All math is XZ-plane only; the arena is flat and entities slide on the
// ground. Y is left untouched here — callers manage vertical placement.

const EPS = 1e-3; // tiny push-out so we don't re-trigger penetration next tick
const ARENA_HALF = 25; // matches the 50x50 arena in world.js

/**
 * Resolve a sphere on the XZ plane against the arena bounds and every wall
 * or obstacle AABB. Mutates `nextPos` in place. Cheap because slice 1 has
 * at most ~14 boxes total (4 walls + 10 obstacles).
 */
export function resolveSphereAgainstAABBs(nextPos, radius, walls, obstacles) {
  // Clamp to the arena so the player/zombie can't escape the perimeter.
  const limit = ARENA_HALF - radius - 0.5;
  nextPos.x = clamp(nextPos.x, -limit, limit);
  nextPos.z = clamp(nextPos.z, -limit, limit);

  // Up to 3 iterations handles the corner case where a push along one axis
  // pushes the sphere into a second AABB.
  const allBoxes = walls.concat(obstacles);
  for (let iter = 0; iter < 3; iter++) {
    let collided = false;
    for (const box of allBoxes) {
      if (resolveOne(nextPos, radius, box)) collided = true;
    }
    if (!collided) break;
  }
}

function resolveOne(nextPos, radius, box) {
  if (!spherePenetratesAABB(nextPos, radius, box)) return false;
  pushOutOfAABB(nextPos, radius, box);
  return true;
}

/**
 * Resolve two spheres overlapping on the XZ plane by pushing each along
 * the contact normal by half the penetration. Mutates both positions.
 */
export function separateSpheresXZ(a, b) {
  const ox = a.position.x - b.position.x;
  const oz = a.position.z - b.position.z;
  const r = a.radius + b.radius;
  const d2 = ox * ox + oz * oz;
  if (d2 <= 0 || d2 >= r * r) return;
  const d = Math.sqrt(d2);
  const push = (r - d) * 0.5;
  a.position.x += (ox / d) * push;
  a.position.z += (oz / d) * push;
  b.position.x -= (ox / d) * push;
  b.position.z -= (oz / d) * push;
}

/** True if the XZ-projected sphere overlaps the AABB. */
function spherePenetratesAABB(pos, radius, box) {
  const cx = clamp(pos.x, box.min.x, box.max.x);
  const cz = clamp(pos.z, box.min.z, box.max.z);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  return dx * dx + dz * dz < radius * radius;
}

/** Push the sphere out along the axis of minimum penetration. */
function pushOutOfAABB(pos, radius, box) {
  const left  = pos.x - box.min.x;
  const right = box.max.x - pos.x;
  const front = pos.z - box.min.z;
  const back  = box.max.z - pos.z;
  const minPen = Math.min(left, right, front, back);
  if      (minPen === left)  pos.x = box.min.x - radius - EPS;
  else if (minPen === right) pos.x = box.max.x + radius + EPS;
  else if (minPen === front) pos.z = box.min.z - radius - EPS;
  else                       pos.z = box.max.z + radius + EPS;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * True if the XZ point (with a margin) sits inside any obstacle AABB.
 * Used by the spawner to keep zombies off crate interiors.
 */
export function overlapsAnyObstacle(x, z, margin, obstacles) {
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

/**
 * Deterministic 32-bit PRNG (Tommy Ettinger / bryc's mulberry32). Returns
 * numbers in [0, 1). Used to seed the obstacle layout (0xDEADBEEF) and the
 * spawn angle stream (0xC0FFEE) so a run starts reproducibly.
 */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
