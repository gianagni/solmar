// Solmar — pedestrians: 22 walkers on the sidewalks, with a fall-and-flee
// reaction when a car hits them or a bullet finds them.
import * as THREE from 'three';
import { makePersonMesh } from './player.js';
import { mulberry32, pick, dist2 } from './util.js';

const SHIRTS = [0xd9a441, 0x7fb3c8, 0xc65b4e, 0x9db8c4, 0xe8e0d0, 0xb8d4a0, 0x8a6fa8];

export function buildPeds(G) {
  const rng = mulberry32(99173);
  G.peds = [];
  for (let i = 0; i < 22; i++) {
    const mesh = makePersonMesh({
      skin: pick(rng, [0xd9a184, 0xc98a68, 0xe8b898]),
      shirt: pick(rng, SHIRTS),
      jacket: pick(rng, SHIRTS),
      pants: pick(rng, [0x2a2a30, 0x3a3a4a, 0x5a4a3a]),
      cap: pick(rng, [0x2e5a6b, 0xc65b4e, 0xd9a441, 0x4a4a4a]),
    });
    mesh.userData.hideWeapon();
    const x = -190 + rng() * 380;
    const z = -190 + rng() * 380;
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, pos: mesh.position, yaw: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 0.7, target: null, phase: rng() * 6,
      fallen: 0, hp: 50, crimeAt: -99, fleeing: false,
    });
  }
  return G.peds;
}

function newTarget(G, ped, rng) {
  // A point on a sidewalk: near a road line, offset 9-11 from its centre.
  const line = pick(rng, G.city.roads);
  const along = -190 + rng() * 380;
  const off = 9.5 + rng() * 1.5;
  if (rng() > 0.5) return { x: line + (rng() > 0.5 ? off : -off), z: along };
  return { x: along, z: line + (rng() > 0.5 ? off : -off) };
}

export function updatePeds(G, dt) {
  const rng = G.pedRng || (G.pedRng = mulberry32(4451));
  for (const ped of G.peds) {
    if (ped.fallen > 0) {
      ped.fallen -= dt;
      ped.mesh.rotation.x = ped.fallen > 0 ? -Math.PI / 2 : 0;
      if (ped.fallen <= 0) {
        ped.mesh.rotation.x = 0;
        ped.fleeing = true;
        ped.target = {
          x: ped.pos.x + (ped.pos.x - G.player.pos.x),
          z: ped.pos.z + (ped.pos.z - G.player.pos.z),
        };
      }
      continue;
    }
    if (!ped.target) ped.target = newTarget(G, ped, rng);
    const dx = ped.target.x - ped.pos.x;
    const dz = ped.target.z - ped.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      ped.target = null;
      continue;
    }
    const sp = ped.fleeing ? 4.5 : ped.speed;
    ped.yaw = Math.atan2(dx, dz);
    ped.pos.x += (dx / d) * sp * dt;
    ped.pos.z += (dz / d) * sp * dt;
    ped.phase += dt * sp * 2.4;
    const swing = Math.sin(ped.phase) * 0.5;
    const u = ped.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    ped.mesh.rotation.y = ped.yaw;
    if (ped.fleeing && dist2(ped.pos.x, ped.pos.z, G.player.pos.x, G.player.pos.z) > 45) {
      ped.fleeing = false;
      ped.target = null;
    }
    // Hit by a fast car: knocked down, and the law notices.
    for (const car of G.cars) {
      if (Math.abs(car.speed) < 5) continue;
      if (dist2(ped.pos.x, ped.pos.z, car.pos.x, car.pos.z) < car.radius + 0.6) {
        ped.fallen = 4;
        ped.mesh.rotation.x = -Math.PI / 2;
        if (G.time - ped.crimeAt > 10) {
          ped.crimeAt = G.time;
          G.events.addWanted(1, 'hit a pedestrian');
          G.events.toast('You hit a pedestrian!');
        }
        break;
      }
    }
  }
}

// A pedestrian the shooting code can hit: {x, z, r, ref}.
export function pedTargets(G) {
  return G.peds
    .filter((p) => p.fallen <= 0)
    .map((p) => ({ x: p.pos.x, z: p.pos.z, r: 0.9, ref: p }));
}

export function hurtPed(G, ped, dmg) {
  ped.hp -= dmg;
  if (ped.hp <= 0 && ped.fallen <= 0) {
    ped.fallen = 8;
    ped.mesh.rotation.x = -Math.PI / 2;
    G.events.addWanted(1, 'shot a pedestrian');
  }
}
