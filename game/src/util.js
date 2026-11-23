// Solmar — small math and collision helpers shared by every system.
// All movement in the game runs through slideMove, so the player, cars and
// pedestrians all obey the same building colliders.
export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Deterministic PRNG (mulberry32) so the city, traffic and pedestrians are
// laid out the same way every run; screenshots stay reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Shortest signed turn from angle a to angle b, in (-PI, PI].
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angDiff(a, b) * clamp(t, 0, 1);
}

// Circle (x,z,r) against an axis-aligned box {minX,maxX,minZ,maxZ}.
export function circleHitsBox(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function circleHitsCircle(x, z, r, c) {
  const dx = x - c.x;
  const dz = z - c.z;
  const rr = r + c.r;
  return dx * dx + dz * dz < rr * rr;
}

// Move a circle by (dx,dz), sliding along walls: try X, then Z, each axis
// blocked only when it would overlap a box or circle collider.
export function slideMove(x, z, dx, dz, r, boxes, circles) {
  let nx = x;
  let nz = z;
  const blocked = (px, pz) => {
    for (let i = 0; i < boxes.length; i++) {
      if (circleHitsBox(px, pz, r, boxes[i])) return true;
    }
    if (circles) {
      for (let i = 0; i < circles.length; i++) {
        if (circleHitsCircle(px, pz, r, circles[i])) return true;
      }
    }
    return false;
  };
  if (!blocked(x + dx, z)) nx = x + dx;
  if (!blocked(nx, z + dz)) nz = z + dz;
  return { x: nx, z: nz, hitX: nx !== x + dx, hitZ: nz !== z + dz };
}

// Hitscan in the XZ plane: from (ox,oz) along unit direction (dx,dz),
// the nearest target whose circle is crossed within `range`. Targets carry
// {x, z, r, ref}. Returns {target, dist, px, pz} or null.
export function rayHit2D(ox, oz, dx, dz, targets, range) {
  let best = null;
  let bestD = range;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const rx = t.x - ox;
    const rz = t.z - oz;
    const along = rx * dx + rz * dz;
    if (along < 0 || along > bestD) continue;
    const perpX = rx - dx * along;
    const perpZ = rz - dz * along;
    const perp2 = perpX * perpX + perpZ * perpZ;
    if (perp2 > t.r * t.r) continue;
    const hit = along - Math.sqrt(Math.max(0, t.r * t.r - perp2));
    if (hit < bestD) {
      bestD = hit;
      best = { target: t, dist: hit, px: ox + dx * hit, pz: oz + dz * hit };
    }
  }
  return best;
}
