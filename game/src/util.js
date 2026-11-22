// Solmar — shared math and random helpers. No game state lives here.

// Deterministic RNG (mulberry32) so a ?seed= run rebuilds the same city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest-arc interpolation between two headings (radians).
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

export function rand(rng, a, b) { return a + rng() * (b - a); }
export function randInt(rng, a, b) { return Math.floor(rand(rng, a, b + 1)); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Push a circle (px, pz, radius r) out of an axis-aligned box {x0, z0, x1, z1}.
// Returns true when a push happened; mutates the pos object {x, z}.
export function circleVsAABB(pos, r, box) {
  const cx = clamp(pos.x, box.x0, box.x1);
  const cz = clamp(pos.z, box.z0, box.z1);
  let dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
    return true;
  }
  // Center inside the box: push out along the smallest penetration axis.
  const pl = pos.x - box.x0, pr = box.x1 - pos.x;
  const pt = pos.z - box.z0, pb = box.z1 - pos.z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) pos.x = box.x0 - r;
  else if (m === pr) pos.x = box.x1 + r;
  else if (m === pt) pos.z = box.z0 - r;
  else pos.z = box.z1 + r;
  return true;
}

// Resolve a circle against every collider. Returns true if any push happened.
export function resolveCircleVsAABBs(pos, r, colliders) {
  let hit = false;
  for (const box of colliders) {
    if (circleVsAABB(pos, r, box)) hit = true;
  }
  return hit;
}

// Point-in-box test (for mission zones and pickups).
export function pointInBox(x, z, box) {
  return x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}
