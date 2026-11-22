// Solmar — wanted level and the Solmar PD: patrol cars that chase and ram,
// foot officers who chase and shoot at higher heat, and getting busted.

import * as THREE from 'three';
import { Car } from './vehicles.js';
import { clamp, rand } from './util.js';

const MAX_WANTED = 5;

function buildCopMesh() {
  const g = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: 0x1e2a44, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a06a, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.36), uniform);
  torso.position.y = 1.22;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.84;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.12, 10), uniform);
  cap.position.y = 2.02;
  g.add(cap);
  const legGeo = new THREE.BoxGeometry(0.26, 0.85, 0.28);
  const legL = new THREE.Mesh(legGeo, uniform);
  legL.position.set(-0.17, 0.42, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, uniform);
  legR.position.set(0.17, 0.42, 0);
  g.add(legR);
  return { group: g, legL, legR };
}

class FootCop {
  constructor(scene, x, z) {
    this.x = x; this.z = z;
    this.heading = 0;
    this.health = 60;
    this.state = 'chase';
    this.shootCooldown = rand(Math.random, 1, 2);
    this.walkPhase = 0;
    const built = buildCopMesh();
    this.mesh = built.group;
    this.parts = built;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  update(dt, player, city, onShoot) {
    if (this.state === 'down') return;
    const dx = player.x - this.x, dz = player.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2) {
      this.heading = Math.atan2(-dz, dx);
      const speed = 6.8;
      this.x += Math.cos(this.heading) * speed * dt;
      this.z += -Math.sin(this.heading) * speed * dt;
      this.walkPhase += dt * 10;
    }
    this.shootCooldown -= dt;
    if (d < 42 && this.shootCooldown <= 0) {
      this.shootCooldown = rand(Math.random, 1.1, 2.0);
      onShoot(this);
    }
    const swing = d > 2.2 ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  knockDown() {
    this.state = 'down';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }
}

export class Police {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game;
    this.wanted = 0;
    this.cars = []; // Car instances (police model)
    this.cops = []; // FootCop instances
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.spawnTimer = 0;
    this.lastCrimeAt = -999;
  }

  addWanted(n, nowSec) {
    if (this.wanted >= MAX_WANTED) return;
    this.wanted = Math.min(MAX_WANTED, this.wanted + n);
    this.lastCrimeAt = nowSec;
    this.decayTimer = 0;
  }

  // Spawn one patrol car on a road near (x, z), now.
  spawnPatrol(x, z) {
    const p = this.city.randomRoadPoint(x, z, 55);
    const car = new Car(this.scene, 'police', 0xf0f0ee, p.x, p.z, 0);
    this.cars.push(car);
    return car;
  }

  // How many patrol cars the current heat fields.
  wantedCarCount() {
    return this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 6);
  }

  update(dt, player, nowSec) {
    // Wanted decays when the player stays clean and out of sight.
    if (this.wanted > 0 && nowSec - this.lastCrimeAt > 25) {
      this.decayTimer += dt;
      if (this.decayTimer > 12) {
        this.wanted -= 1;
        this.decayTimer = 0;
      }
    } else if (this.wanted > 0) {
      this.decayTimer = 0;
    }

    // Spawn / despawn patrol cars to match the heat.
    this.spawnTimer -= dt;
    const want = this.wantedCarCount();
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      const p = this.city.randomRoadPoint(player.x, player.z, 70);
      const car = new Car(this.scene, 'police', 0xf0f0ee, p.x, p.z, 0);
      this.cars.push(car);
    }
    while (this.cars.length > want) {
      const car = this.cars.pop();
      car.dispose(this.scene);
    }

    // Patrol cars chase the player and ram.
    for (const car of this.cars) {
      const dx = player.x - car.x, dz = player.z - car.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(-dz, dx);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.4, -1, 1);
      const throttle = d > 6 ? 1 : 0.55;
      const crashed = car.drive(dt, throttle, steer, false, this.city);
      if (crashed > 0) this.game.onCrash(crashed);
      // Ram damage when touching the player.
      if (d < 4.2) {
        if (player.mode === 'foot') {
          player.damage(9, nowSec);
          // Shove the player away from the ram.
          player.x += (dx / (d || 1)) * -2.5;
          player.z += (dz / (d || 1)) * -2.5;
        } else if (player.car) {
          player.car.speed *= 0.82;
        }
      }
    }

    // Foot officers join at 3 stars and up.
    const wantCops = this.wanted >= 3 ? Math.min(this.wanted - 1, 3) : 0;
    if (this.cops.length < wantCops && this.spawnTimer <= -1) {
      this.spawnTimer = 3;
      const p = this.city.randomRoadPoint(player.x, player.z, 30);
      this.cops.push(new FootCop(this.scene, p.x, p.z));
    }
    this.cops = this.cops.filter((c) => {
      if (c.state === 'down') {
        // Despawn a downed cop after a while (handled by timer in game).
        return this.game.timeSec - (c.downAt || 0) < 12;
      }
      return true;
    });
    for (const cop of this.cops) {
      if (cop.state === 'down') continue;
      cop.update(dt, player, this.city, () => {
        // Cop fires: inaccurate, 6 damage on a hit roll.
        if (Math.random() < 0.45) player.damage(6, nowSec);
        this.game.onCopShot(cop);
      });
    }

    // Bust check: police close and the player slow or on foot.
    const playerSpeed = player.mode === 'car' && player.car ? Math.abs(player.car.speed) : (player.moving ? 6 : 0);
    let nearest = Infinity;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < nearest) nearest = d;
    }
    if (this.wanted > 0 && nearest < 5 && playerSpeed < 2.5) {
      this.bustTimer += dt;
      if (this.bustTimer > 2.5) {
        this.bustTimer = 0;
        this.game.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
  }

  clearHeat() {
    this.wanted = 0;
    this.bustTimer = 0;
    for (const car of this.cars) car.dispose(this.scene);
    this.cars = [];
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cops = [];
  }

  // A cop that was shot or punched goes down and counts as a crime.
  hitCop(cop, nowSec) {
    cop.health -= 34;
    if (cop.health <= 0 && cop.state !== 'down') {
      cop.knockDown();
      cop.downAt = this.game.timeSec;
      this.addWanted(2, nowSec);
      return true;
    }
    return false;
  }
}
