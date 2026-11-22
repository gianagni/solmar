// Solmar — the player: on-foot movement, stealing and driving cars,
// punching and shooting, health and getting busted or wasted.

import * as THREE from 'three';
import { clamp, resolveCircleVsAABBs, dist2 } from './util.js';
import { WEAPONS } from './weapons.js';

function buildPlayerMesh() {
  // The mesh's local +X is the character's forward (mesh.rotation.y =
  // heading maps local +X onto the facing direction): shoulder width runs
  // along local Z, chest depth along local X. Legs and arms hang at the
  // sides (local Z) and swing around local Z so they step forward and back.
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a6a8a, roughness: 0.8 });
  const jacketDark = new THREE.MeshStandardMaterial({ color: 0x1d4a61, roughness: 0.8 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2e3a4a, roughness: 0.9 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1e1410, roughness: 0.9 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.9 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 });
  // Torso: jacket with a shirt V at the front and a belt.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.66), jacket);
  torso.position.y = 1.22;
  torso.castShadow = true;
  g.add(torso);
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.3), shirtMat);
  shirt.position.set(0.19, 1.48, 0);
  g.add(shirt);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.68), shoeMat);
  belt.position.y = 0.84;
  g.add(belt);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.5), jacketDark);
  collar.position.y = 1.64;
  g.add(collar);
  // Head: skin, hair cap, and a flat cap with a brim at the front.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.84;
  head.castShadow = true;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairM.position.y = 1.88;
  g.add(hairM);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.1, 12), jacketDark);
  cap.position.y = 2.04;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.3), jacketDark);
  brim.position.set(0.28, 2.0, 0);
  g.add(brim);
  // Legs with shoes pointing forward.
  const legGeo = new THREE.BoxGeometry(0.28, 0.85, 0.26);
  const legL = new THREE.Mesh(legGeo, jeans);
  legL.position.set(0, 0.42, -0.17);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, jeans);
  legR.position.set(0, 0.42, 0.17);
  g.add(legR);
  const shoeGeo = new THREE.BoxGeometry(0.44, 0.12, 0.28);
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
  shoeL.position.set(0.06, 0.07, -0.17);
  g.add(shoeL);
  const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
  shoeR.position.set(0.06, 0.07, 0.17);
  g.add(shoeR);
  // Arms at the sides; the right hand holds the current gun, pointing forward.
  const armGeo = new THREE.BoxGeometry(0.22, 0.72, 0.19);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(0, 1.24, -0.44);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0, 1.24, 0.44);
  g.add(armR);
  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.1), gunMat);
  gun.add(gunBody);
  const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.09), gunMat);
  gunGrip.position.set(-0.08, -0.12, 0);
  gun.add(gunGrip);
  gun.position.set(0.12, -0.42, 0);
  armR.add(gun);
  return { group: g, legL, legR, armL, armR, gun };
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
    this.weaponIndex = 0;
    this.weapon = WEAPONS[0];
    this.tracers = [];
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
    this.parts.legL.rotation.z = swing;
    this.parts.legR.rotation.z = -swing;
    this.parts.armL.rotation.z = -swing * 0.7;
    this.parts.armR.rotation.z = swing * 0.7;
    // Torso bob while moving; the gun arm steadies when shooting.
    this.mesh.position.set(this.x, this.moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = true;
    this.updateTracers(dt);
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
    // Sync at once: staged shots (and anything else that reads the player
    // right after entering) must see the car's position, not the last
    // on-foot one — the per-frame sync only runs once the loop starts.
    this.x = car.x;
    this.z = car.z;
    this.heading = car.heading;
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

  // Switch to a weapon slot (0-2). Returns the new weapon.
  switchWeapon(index) {
    const i = ((index % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    this.weaponIndex = i;
    this.weapon = WEAPONS[i];
    // The gun in hand changes size with the weapon: pistol small, SMG
    // long, shotgun long and thick.
    const gun = this.parts.gun;
    if (gun) {
      const s = this.weapon.id === 'pistol' ? 1 : this.weapon.id === 'smg' ? 1.5 : 1.8;
      gun.scale.set(s, this.weapon.id === 'shotgun' ? 1.4 : 1, 1);
    }
    return this.weapon;
  }

  updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = t.life / 0.09;
      }
    }
  }

  // Hitscan shot toward the camera aim, using the current weapon's fire
  // rate, pellet count, spread and range. targets: [{x, z, radius, ref}].
  // Returns the hit target or null. Range 70, narrow cone.
  shoot(camDir, targets, weapon = this.weapon) {
    if (this.shootCooldown > 0) return null;
    this.shootCooldown = weapon.cooldown;
    let best = null, bestD = weapon.range;
    let hitPoint = null;
    for (let p = 0; p < weapon.pellets; p++) {
      const err = (Math.random() * 2 - 1) * weapon.spread;
      const ax = camDir.x * Math.cos(err) - camDir.z * Math.sin(err);
      const az = camDir.x * Math.sin(err) + camDir.z * Math.cos(err);
      for (const t of targets) {
        const dx = t.x - this.x, dz = t.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d > weapon.range || d < 0.5) continue;
        const dot = (dx / d) * ax + (dz / d) * az;
        const perp = Math.abs((dx / d) * az - (dz / d) * ax) * d;
        if (dot > 0.9 && perp < (t.radius || 1.2) + 0.6 && d < bestD) {
          bestD = d; best = t;
          hitPoint = { x: t.x, z: t.z };
        }
      }
    }
    // Tracer from the muzzle to the hit (or to max range on a miss).
    const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
    const from = new THREE.Vector3(this.x + fx * 0.8, 1.35, this.z + fz * 0.8);
    const to = hitPoint
      ? new THREE.Vector3(hitPoint.x, 1.2, hitPoint.z)
      : new THREE.Vector3(this.x + camDir.x * weapon.range, 1.2, this.z + camDir.z * weapon.range);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({
      color: weapon.tracer, transparent: true, opacity: 1,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    return best;
  }
}
