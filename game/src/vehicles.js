// Solmar — cars: arcade physics, meshes, traffic that follows the road grid,
// and parked cars waiting to be stolen.

import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, angleLerp, wrapAngle, resolveCircleVsAABBs } from './util.js';

export const CAR_MODELS = {
  sedan: { length: 4.6, width: 2.0, topSpeed: 46, accel: 16, colors: [0x8a2a2a, 0x2a4a8a, 0x3a3a3a, 0x7a7a72, 0x2a6a4a] },
  taxi: { length: 4.6, width: 2.0, topSpeed: 44, accel: 15, colors: [0xe8c832] },
  sports: { length: 4.4, width: 2.0, topSpeed: 62, accel: 24, colors: [0xd81e2a, 0xffd21e, 0x1e6ad8] },
  van: { length: 5.2, width: 2.2, topSpeed: 38, accel: 12, colors: [0xd8d2c2, 0x5a6a7a] },
  truck: { length: 6.4, width: 2.4, topSpeed: 34, accel: 10, colors: [0x8a6a3a, 0x4a5a6a] },
  police: { length: 4.8, width: 2.1, topSpeed: 54, accel: 21, colors: [0xf0f0ee] },
};

const BODY_COLORS = {};

function buildCarMesh(model, color) {
  const def = CAR_MODELS[model];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const L = def.length, W = def.width;

  const body = new THREE.Mesh(new THREE.BoxGeometry(L, 0.85, W), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabinH = model === 'van' || model === 'truck' ? 1.0 : 0.72;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.52, cabinH, W * 0.86), glassMat);
  cabin.position.set(-L * 0.05, 1.3, 0);
  cabin.castShadow = true;
  g.add(cabin);
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelSpots = [
    [L * 0.32, W / 2 - 0.1], [L * 0.32, -W / 2 + 0.1],
    [-L * 0.32, W / 2 - 0.1], [-L * 0.32, -W / 2 + 0.1],
  ];
  const wheels = [];
  for (const [wx, wz] of wheelSpots) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe98a, emissiveIntensity: 0.9 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xd81e2a, emissive: 0xa01018, emissiveIntensity: 0.8 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.42), headMat);
    h.position.set(L / 2, 0.72, s * (W / 2 - 0.35));
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.42), tailMat);
    t.position.set(-L / 2, 0.72, s * (W / 2 - 0.35));
    g.add(t);
  }
  if (model === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.28, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd21e, emissiveIntensity: 0.7 }),
    );
    sign.position.set(0, 1.85, 0);
    g.add(sign);
  }
  if (model === 'police') {
    const barMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 1.5), barMat);
    bar.position.set(-0.1, 1.78, 0);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xd81e2a, emissive: 0xff2020, emissiveIntensity: 2 }));
    red.position.set(-0.1, 1.95, -0.38);
    red.name = 'sirenRed';
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x2040ff, emissiveIntensity: 2 }));
    blue.position.set(-0.1, 1.95, 0.38);
    blue.name = 'sirenBlue';
    g.add(blue);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 0.3, W + 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.5 }));
    stripe.position.set(0, 0.75, 0);
    g.add(stripe);
  }
  return { group: g, wheels };
}

export class Car {
  constructor(scene, model, color, x, z, heading) {
    this.model = model;
    this.def = CAR_MODELS[model];
    this.color = color;
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.radius = Math.max(this.def.length, this.def.width) * 0.5;
    const built = buildCarMesh(model, color);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.sirenPhase = 0;
    this.stolen = false;
  }

  get forward() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }

  // Arcade drive step. throttle -1..1, steerInput -1..1, handbrake bool.
  drive(dt, throttle, steerInput, handbrake, city) {
    const def = this.def;
    const maxSpeed = def.topSpeed * (handbrake ? 0.55 : 1);
    const accel = throttle >= 0 ? def.accel * throttle : def.accel * 1.6 * throttle;
    this.speed += accel * dt;
    // Drag and rolling resistance.
    this.speed -= this.speed * (handbrake ? 1.9 : 0.55) * dt;
    if (Math.abs(this.speed) < 0.08 && throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, -maxSpeed * 0.45, maxSpeed);
    // Steering bites harder at speed, less at a crawl; reversing flips it.
    const grip = clamp(Math.abs(this.speed) / 12, 0.12, 1);
    this.steer = steerInput;
    this.heading += steerInput * 1.9 * grip * Math.sign(this.speed || 1) * dt * (handbrake ? 1.5 : 1);
    const f = this.forward;
    const pos = { x: this.x + f.x * this.speed * dt, z: this.z + f.z * this.speed * dt };
    const hit = resolveCircleVsAABBs(pos, this.radius * 0.82, city.colliders);
    if (hit) {
      if (Math.abs(this.speed) > 14) this.crashed = Math.abs(this.speed);
      this.speed *= 0.45;
    }
    // World bounds: the sea is not drivable.
    pos.x = clamp(pos.x, -CITY_HALF_LIMIT, CITY_HALF_LIMIT);
    pos.z = clamp(pos.z, -CITY_HALF_LIMIT, CITY_HALF_LIMIT);
    this.x = pos.x; this.z = pos.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Wheel spin + front-wheel steer look.
    const spin = (this.speed * dt) / 0.42;
    this.wheels.forEach((w, i) => {
      w.rotation.z += spin;
      if (i < 2) w.rotation.y = -steerInput * 0.4;
    });
    // Police light bar flash.
    if (this.model === 'police') {
      this.sirenPhase += dt * 6;
      const on = Math.sin(this.sirenPhase) > 0;
      const red = this.mesh.getObjectByName('sirenRed');
      const blue = this.mesh.getObjectByName('sirenBlue');
      if (red) red.material.emissiveIntensity = on ? 3 : 0.2;
      if (blue) blue.material.emissiveIntensity = on ? 0.2 : 3;
    }
    const crashed = this.crashed || 0;
    this.crashed = 0;
    return crashed;
  }

  dispose(scene) { scene.remove(this.mesh); }
}

const CITY_HALF_LIMIT = 316;

// Traffic: moving cars that follow the road grid, plus parked cars at curbs.
export class Traffic {
  constructor(scene, city, seed, movingCount = 12, parkedCount = 10) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 77);
    this.cars = []; // { car, kind: 'moving' | 'parked', axis, line, along, dir, speed, turnAt }
    const models = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sports', 'truck'];
    for (let i = 0; i < movingCount; i++) {
      const model = pick(this.rng, models);
      const color = pick(this.rng, CAR_MODELS[model].colors);
      const vertical = this.rng() < 0.5;
      const line = pick(this.rng, city.roadsX);
      const along = rand(this.rng, -280, 280);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const x = vertical ? line + (dir > 0 ? 3.5 : -3.5) : along;
      const z = vertical ? along : line + (dir > 0 ? 3.5 : -3.5);
      const heading = vertical ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const car = new Car(scene, model, color, x, z, heading);
      this.cars.push({
        car, kind: 'moving', vertical, line, along, dir,
        speed: rand(this.rng, 9, 14), cruise: rand(this.rng, 9, 14),
        nextTurn: this.nextIntersection(along),
      });
    }
    for (let i = 0; i < parkedCount; i++) {
      const model = pick(this.rng, ['sedan', 'sedan', 'van', 'sports']);
      const color = pick(this.rng, CAR_MODELS[model].colors);
      const vertical = this.rng() < 0.5;
      const line = pick(this.rng, city.roadsX);
      const along = rand(this.rng, -270, 270);
      const x = vertical ? line + 5.6 : along;
      const z = vertical ? along : line + 5.6;
      const heading = vertical ? (this.rng() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : (this.rng() < 0.5 ? 0 : Math.PI);
      const car = new Car(scene, model, color, x, z, heading);
      this.cars.push({ car, kind: 'parked' });
    }
  }

  nextIntersection(along) {
    const lines = this.city.roadsX;
    let best = null;
    for (const l of lines) {
      if (l > along + 5) { best = l; break; }
    }
    return best ?? null;
  }

  // One step for every moving car: follow its road, turn at intersections.
  update(dt, playerCar, others) {
    for (const t of this.cars) {
      if (t.kind !== 'moving') continue;
      const car = t.car;
      // Slow down for the car ahead on the same lane.
      let target = t.cruise;
      for (const o of this.cars) {
        if (o === t || o.kind !== 'moving') continue;
        const dx = o.car.x - car.x, dz = o.car.z - car.z;
        const ahead = dx * car.forward.x + dz * car.forward.z;
        if (ahead > 0 && ahead < 12 && Math.abs(dx * car.forward.z - dz * car.forward.x) < 3) {
          target = Math.min(target, o.car.speed * 0.8);
        }
      }
      if (playerCar) {
        const dx = playerCar.x - car.x, dz = playerCar.z - car.z;
        const ahead = dx * car.forward.x + dz * car.forward.z;
        if (ahead > 0 && ahead < 10 && Math.abs(dx * car.forward.z - dz * car.forward.x) < 3.5) {
          target = Math.min(target, 2);
        }
      }
      car.speed = lerp(car.speed, target, clamp(dt * 1.5, 0, 1));
      // Advance along the road.
      t.along += car.speed * t.dir * dt;
      const f = car.forward;
      const pos = { x: car.x + f.x * car.speed * dt, z: car.z + f.z * car.speed * dt };
      resolveCircleVsAABBs(pos, car.radius * 0.8, this.city.colliders);
      car.x = pos.x; car.z = pos.z;
      // Intersection: maybe turn onto the cross road.
      if (t.nextTurn !== null && ((t.dir > 0 && t.along >= t.nextTurn) || (t.dir < 0 && t.along <= t.nextTurn))) {
        const turn = this.rng();
        if (turn < 0.45) {
          // Turn: swap axis, new line is the intersection coordinate.
          const oldLine = t.line;
          t.line = t.nextTurn;
          t.vertical = !t.vertical;
          t.along = oldLine;
          t.dir = this.rng() < 0.5 ? 1 : -1;
          const lane = 3.5;
          car.x = t.vertical ? t.line + (t.dir > 0 ? lane : -lane) : t.along;
          car.z = t.vertical ? t.along : t.line + (t.dir > 0 ? lane : -lane);
          car.heading = t.vertical ? (t.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
          t.nextTurn = this.nextIntersection(t.dir > 0 ? t.along : t.along);
          if (t.dir < 0) t.nextTurn = this.prevIntersection(t.along);
        } else {
          t.nextTurn = t.dir > 0 ? this.nextIntersection(t.along) : this.prevIntersection(t.along);
        }
      }
      // Loop back at the city edge.
      if (t.along > 290 || t.along < -290) {
        t.dir *= -1;
        t.along = clamp(t.along, -290, 290);
        car.heading = t.vertical ? (t.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
        t.nextTurn = t.dir > 0 ? this.nextIntersection(t.along) : this.prevIntersection(t.along);
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.42;
      car.wheels.forEach((w) => { w.rotation.z += spin; });
    }
    // Simple car-car separation so traffic does not pile up.
    const all = this.cars.map((t) => t.car);
    if (others) all.push(...others);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const min = (a.radius + b.radius) * 0.8;
        if (d2 < min * min && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
        }
      }
    }
    // Separation moved cars after their meshes were placed: re-sync them.
    for (const t of this.cars) {
      t.car.mesh.position.set(t.car.x, 0, t.car.z);
      t.car.mesh.rotation.y = t.car.heading;
    }
  }

  prevIntersection(along) {
    const lines = this.city.roadsX;
    let best = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i] < along - 5) { best = lines[i]; break; }
    }
    return best;
  }

  remove(car) {
    const idx = this.cars.findIndex((t) => t.car === car);
    if (idx >= 0) this.cars.splice(idx, 1);
  }

  nearestCar(x, z, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const t of this.cars) {
      const dx = t.car.x - x, dz = t.car.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = t.car; }
    }
    return best;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
