// Solmar — three weapon slots (keys 1/2/3): pistol, SMG, shotgun.
// Hitscan shooting with tracers; the HUD bar shows the active slot.
import * as THREE from 'three';
import { rayHit2D, dist2 } from './util.js';
import { pedTargets, hurtPed } from './peds.js';

export const WEAPONS = [
  { name: 'Pistol', dmg: 34, interval: 0.28, range: 70, kind: 'pistol', scale: 1 },
  { name: 'SMG', dmg: 16, interval: 0.09, range: 55, kind: 'smg', scale: 1.4 },
  { name: 'Shotgun', dmg: 13, interval: 0.7, range: 32, kind: 'shotgun', pellets: 5, scale: 2.2 },
];

export function buildWeapons(G) {
  G.weapons = { tracers: [] };
  return G.weapons;
}

function spawnTracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  G.weapons.tracers.push({ line, life: 0.09 });
}

export function selectWeapon(G, slot) {
  const p = G.player;
  if (slot < 0 || slot > 2 || slot === p.weapon) return;
  p.weapon = slot;
  p.group.userData.showWeapon(slot);
  G.hud.weaponBar(slot);
  G.audio.click();
}

function shootableTargets(G) {
  const targets = pedTargets(G);
  for (const cop of G.police.cops) {
    targets.push({ x: cop.pos.x, z: cop.pos.z, r: 0.9, ref: cop, isCop: true });
  }
  for (const car of G.cars) {
    if (car.dead) continue;
    targets.push({ x: car.pos.x, z: car.pos.z, r: 2.2, ref: car, isCar: true });
  }
  return targets;
}

export function fireWeapon(G) {
  const p = G.player;
  if (G.state !== 'playing' || !p.onFoot || p.fireCooldown > 0) return;
  const w = WEAPONS[p.weapon];
  p.fireCooldown = w.interval;
  G.audio.shot(w.kind);
  // Aim from the camera through the centre of the screen.
  const cam = G.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const ox = cam.position.x;
  const oz = cam.position.z;
  const dx = dir.x;
  const dz = dir.z;
  const norm = Math.hypot(dx, dz) || 1;
  const ux = dx / norm;
  const uz = dz / norm;
  const targets = shootableTargets(G);
  const muzzle = new THREE.Vector3(p.pos.x, 1.5, p.pos.z);
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    // Pellets spread a little around the aim line.
    const spread = (Math.random() - 0.5) * 0.09 * (w.pellets ? 1 : 0);
    const px = ux * Math.cos(spread) - uz * Math.sin(spread);
    const pz = ux * Math.sin(spread) + uz * Math.cos(spread);
    const hit = rayHit2D(ox, oz, px, pz, targets, w.range);
    const end = hit
      ? new THREE.Vector3(hit.px, 1.2, hit.pz)
      : new THREE.Vector3(ox + px * w.range, 1.2, oz + pz * w.range);
    spawnTracer(G, muzzle.clone(), end);
    if (hit) {
      const t = hit.target;
      if (t.isCop) {
        t.ref.hp = (t.ref.hp || 100) - w.dmg;
        if (t.ref.hp <= 0) {
          t.ref.down = true;
          t.ref.mesh.rotation.x = -Math.PI / 2;
          G.events.addWanted(1, 'took down a cop');
          setTimeout(() => {
            const idx = G.police.cops.indexOf(t.ref);
            if (idx >= 0) {
              G.scene.remove(t.ref.mesh);
              G.police.cops.splice(idx, 1);
            }
          }, 4000);
        }
      } else if (t.isCar) {
        // Shooting a car startles its driver and draws the law.
        G.events.addWanted(1, 'shot at a car');
      } else {
        hurtPed(G, t.ref, w.dmg);
      }
    }
  }
  // A little camera kick.
  p.camPitch = Math.min(0.9, p.camPitch + 0.02);
}

export function punch(G) {
  const p = G.player;
  if (G.state !== 'playing' || !p.onFoot || p.punchCooldown > 0) return;
  p.punchCooldown = 0.5;
  G.audio.punch();
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  for (const ped of G.peds) {
    if (ped.fallen > 0) continue;
    if (dist2(ped.pos.x, ped.pos.z, p.pos.x + fx * 1.4, p.pos.z + fz * 1.4) < 1.6) {
      hurtPed(G, ped, 25);
    }
  }
  for (const cop of G.police.cops) {
    if (cop.down) continue;
    if (dist2(cop.pos.x, cop.pos.z, p.pos.x + fx * 1.4, p.pos.z + fz * 1.4) < 1.6) {
      cop.hp = (cop.hp || 100) - 25;
      if (cop.hp <= 0) {
        cop.down = true;
        cop.mesh.rotation.x = -Math.PI / 2;
        G.events.addWanted(1, 'took down a cop');
      }
    }
  }
}

export function updateWeapons(G, dt) {
  for (let i = G.weapons.tracers.length - 1; i >= 0; i--) {
    const t = G.weapons.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    if (t.life <= 0) {
      G.scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      G.weapons.tracers.splice(i, 1);
    }
  }
}
