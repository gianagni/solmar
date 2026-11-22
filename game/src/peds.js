// Solmar — pedestrians: they stroll the sidewalks, idle, and run when
// something scary happens (gunfire, a speeding car, a police chase).

import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, resolveCircleVsAABBs } from './util.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0x9a4ad8, 0xe8e8e8, 0x3a3a3a, 0xd88a4a];
const PANTS = [0x2a3a4a, 0x4a4a4a, 0x6a5a3a, 0x3a5a6a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

function buildPedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.24, 0.8, 0.26);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.16, 0.4, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.16, 0.4, 0);
  g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.18, 0.68, 0.2);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.42, 1.2, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.42, 1.2, 0);
  g.add(armR);
  return { group: g, legL, legR, armL, armR, torso };
}

export class Ped {
  constructor(scene, x, z, rng) {
    this.x = x; this.z = z;
    this.heading = rand(rng, 0, Math.PI * 2);
    this.speed = 0;
    this.state = 'walk'; // walk | idle | flee | down
    this.target = null;
    this.wait = rand(rng, 0, 3);
    this.walkPhase = rand(rng, 0, 6);
    this.downTimer = 0;
    this.fear = 0;
    const built = buildPedMesh(pick(rng, SHIRTS), pick(rng, PANTS), pick(rng, SKINS));
    this.mesh = built.group;
    this.parts = built;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.rng = rng;
  }

  // Pick a new sidewalk stroll target near the ped.
  pickTarget(city) {
    const line = pick(this.rng, city.roadsX);
    const along = rand(this.rng, -280, 280);
    const side = this.rng() < 0.5 ? 9 : -9;
    if (this.rng() < 0.5) this.target = { x: line + side, z: along };
    else this.target = { x: along, z: line + side };
  }

  scare(fromX, fromZ, amount) {
    if (this.state === 'down') return;
    this.fear = Math.min(1, this.fear + amount);
    if (this.fear > 0.35) {
      this.state = 'flee';
      const dx = this.x - fromX, dz = this.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      this.target = { x: this.x + (dx / d) * 40, z: this.z + (dz / d) * 40 };
      this.wait = 0;
    }
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 6;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }

  update(dt, city, playerPos) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // Get back up elsewhere in the city.
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        const line = pick(this.rng, city.roadsX);
        this.x = line + (this.rng() < 0.5 ? 9 : -9);
        this.z = rand(this.rng, -280, 280);
        this.state = 'idle';
        this.wait = rand(this.rng, 1, 4);
        this.fear = 0;
      }
      return;
    }
    this.fear = Math.max(0, this.fear - dt * 0.1);
    if (this.state === 'idle') {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.pickTarget(city);
        this.state = 'walk';
      }
    } else {
      if (!this.target) this.pickTarget(city);
      const dx = this.target.x - this.x, dz = this.target.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        if (this.state === 'flee') { this.state = 'idle'; this.wait = rand(this.rng, 2, 5); }
        else { this.state = 'idle'; this.wait = rand(this.rng, 1, 5); }
        this.speed = 0;
      } else {
        const want = this.state === 'flee' ? 7.5 : 2.2;
        this.speed = want;
        this.heading = Math.atan2(-dz, dx);
        const pos = {
          x: this.x + Math.cos(this.heading) * this.speed * dt,
          z: this.z - Math.sin(this.heading) * this.speed * dt,
        };
        resolveCircleVsAABBs(pos, 0.5, city.colliders);
        pos.x = clamp(pos.x, -315, 315);
        pos.z = clamp(pos.z, -315, 315);
        this.x = pos.x; this.z = pos.z;
        this.walkPhase += dt * (this.state === 'flee' ? 11 : 6);
      }
    }
    // Walk-cycle swing.
    const swing = this.speed > 0.1 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.7;
    this.parts.armR.rotation.x = swing * 0.7;
    this.mesh.position.set(this.x, this.mesh.position.y, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

export class Pedestrians {
  constructor(scene, city, seed, count = 22) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 913);
    this.peds = [];
    for (let i = 0; i < count; i++) {
      const line = pick(this.rng, city.roadsX);
      const along = rand(this.rng, -280, 280);
      const side = this.rng() < 0.5 ? 9 : -9;
      const x = this.rng() < 0.5 ? line + side : along;
      const z = this.rng() < 0.5 ? along : line + side;
      // Keep peds off the beach and out of buildings.
      if (x > 295) continue;
      this.peds.push(new Ped(scene, x, z, this.rng));
    }
  }

  update(dt, playerPos) {
    for (const p of this.peds) p.update(dt, this.city, playerPos);
  }

  scareNear(x, z, radius, amount) {
    for (const p of this.peds) {
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < radius * radius) p.scare(x, z, amount);
    }
  }

  // Nearest standing ped to a point (for punching / shooting).
  nearest(x, z, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const dx = p.x - x, dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = p; }
    }
    return best;
  }
}
