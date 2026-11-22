// Solmar — the player: on-foot movement, stealing and driving cars,
// punching and shooting, health and getting busted or wasted.

import * as THREE from 'three';
import { clamp, resolveCircleVsAABBs, dist2 } from './util.js';

function buildPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a6a8a, roughness: 0.8 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2e3a4a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1e1410, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.36), jacket);
  torso.position.y = 1.22;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.84;
  head.castShadow = true;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairM.position.y = 1.88;
  g.add(hairM);
  const legGeo = new THREE.BoxGeometry(0.26, 0.85, 0.28);
  const legL = new THREE.Mesh(legGeo, jeans);
  legL.position.set(-0.17, 0.42, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, jeans);
  legR.position.set(0.17, 0.42, 0);
  g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.19, 0.72, 0.22);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.44, 1.24, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.44, 1.24, 0);
  g.add(armR);
  return { group: g, legL, legR, armL, armR };
}

export class Player {
  constructor(scene, x, z) {
    this.x = x; this.z = z;
    this.heading = 0;
    this.mode = 'foot'; // 'foot' | 'car'
    this.car = null;
    this.health = 100;
    this.money = 250;
    this.walkPhase = 0;
    this.speed = 0;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.hurtCooldown = 0;
    this.regenTimer = 0;
    this.moving = false;
    const built = buildPlayerMesh();
    this.mesh = built.group;
    this.parts = built;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.scene = scene;
  }

  get pos() { return { x: this.x, z: this.z }; }

  // On-foot step. camYaw is the camera's yaw; movement is relative to it.
  // Returns nothing; main.js reads this.speed / this.moving for the camera.
  updateFoot(dt, input, camYaw, city) {
    let ix = 0, iz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const mag = Math.hypot(ix, iz);
    this.moving = mag > 0;
    if (mag > 0) {
      ix /= mag; iz /= mag;
      // Camera-relative: forward on screen is -z rotated by camYaw.
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const mx = ix * cos - iz * sin;
      const mz = ix * sin + iz * cos;
      const targetHeading = Math.atan2(-mz, mx);
      // Turn toward movement smoothly.
      let d = targetHeading - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += clamp(d, -9 * dt, 9 * dt);
      const speed = sprint ? 10.5 : 6.5;
      this.speed = speed;
      const pos = {
        x: this.x + mx * speed * dt,
        z: this.z + mz * speed * dt,
      };
      resolveCircleVsAABBs(pos, 0.55, city.colliders);
      pos.x = clamp(pos.x, -315, 315);
      pos.z = clamp(pos.z, -315, 315);
      this.x = pos.x; this.z = pos.z;
      this.walkPhase += dt * (sprint ? 13 : 9);
    } else {
      this.speed = 0;
      this.walkPhase += dt * 2;
    }
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.6 : Math.sin(this.walkPhase) * 0.05;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.7;
    this.parts.armR.rotation.x = swing * 0.7;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = true;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    // Slow health regen after 8 s without damage.
    this.regenTimer = Math.max(0, this.regenTimer - dt);
    if (this.health > 0 && this.health < 100 && this.regenTimer <= 0) {
      this.health = Math.min(100, this.health + 2.5 * dt);
    }
  }

  enterCar(car) {
    this.car = car;
    this.mode = 'car';
    this.mesh.visible = false;
    this.speed = 0;
  }

  exitCar() {
    if (!this.car) return null;
    const car = this.car;
    this.car = null;
    this.mode = 'foot';
    // Step out on the car's left side.
    const side = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
    this.x = car.x + side.x * 2.2;
    this.z = car.z + side.z * 2.2;
    this.heading = car.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    return car;
  }

  damage(amount, nowSec) {
    if (this.hurtCooldown > 0 || this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.regenTimer = 8;
    this.hurtCooldown = 0.35;
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  // Melee: nearest standing ped or cop within 2.4 units in front.
  punch(targets) {
    if (this.punchCooldown > 0 || this.mode !== 'foot') return null;
    this.punchCooldown = 0.45;
    const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
    let best = null, bestD = 2.4 * 2.4;
    for (const t of targets) {
      if (!t || t.state === 'down') continue;
      const dx = t.x - this.x, dz = t.z - this.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD && dx * fx + dz * fz > 0) { bestD = d2; best = t; }
    }
    return best;
  }

  // Hitscan shot toward the camera aim. targets: [{x, z, radius, ref}].
  // Returns the hit target or null. Range 70, narrow cone.
  shoot(camDir, targets) {
    if (this.shootCooldown > 0) return null;
    this.shootCooldown = 0.28;
    let best = null, bestD = 70;
    for (const t of targets) {
      const dx = t.x - this.x, dz = t.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 70 || d < 0.5) continue;
      const dot = (dx / d) * camDir.x + (dz / d) * camDir.z;
      const perp = Math.abs((dx / d) * camDir.z - (dz / d) * camDir.x) * d;
      if (dot > 0.9 && perp < (t.radius || 1.2) + 0.6 && d < bestD) {
        bestD = d; best = t;
      }
    }
    return best;
  }
}
