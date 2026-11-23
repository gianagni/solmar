// Solmar — cars: meshes, traffic AI, the player's arcade driving, and
// stealing. Traffic follows loops on the road grid; every car is stealable.
import * as THREE from 'three';
import { clamp, slideMove, angleLerp, dist2, mulberry32, pick } from './util.js';

const TRAFFIC_COLORS = [0xc65b4e, 0x4a7a9e, 0xd9a441, 0x7a9e6b, 0x8a6fa8, 0xd8d0c0, 0x3a5a6b, 0xb85c38];

export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4d4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(x, 0.36, z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), headMat);
    h.position.set(x, 0.6, 2.12);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), tailMat);
    t.position.set(x, 0.6, -2.12);
    g.add(t);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5), darkMat);
    bar.position.set(0, 1.45, -0.25);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.46), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.28, 1.52, -0.25);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.46), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.28, 1.52, -0.25);
    g.add(blue);
    g.userData.lightBar = { red, blue };
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, 1.5, -0.25);
    g.add(sign);
  }
  if (kind === 'van') {
    body.scale.set(1.15, 1.9, 1.15);
    body.position.y = 0.85;
    cabin.position.y = 1.75;
    cabin.scale.set(1.1, 1.4, 0.8);
  }
  g.userData.wheels = wheels;
  return g;
}

export function makeCar(G, kind, color, x, z, yaw) {
  const mesh = makeCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  G.scene.add(mesh);
  const car = {
    kind, mesh, pos: mesh.position, yaw,
    speed: 0, steer: 0, radius: 1.7,
    driver: null, // 'player' | 'ai' | null
    route: null, routeIdx: 0,
    hp: 100, dead: false, isPolice: kind === 'police',
    brakeLight: false,
  };
  G.cars.push(car);
  return car;
}

// A rectangular loop around the road grid, for traffic to follow.
function makeRoute(rng) {
  const lines = [-160, -80, 0, 80, 160];
  const a = pick(rng, lines);
  const b = pick(rng, lines);
  const c = pick(rng, lines.filter((v) => v !== a));
  const d = pick(rng, lines.filter((v) => v !== b));
  return [
    { x: a, z: b }, { x: c, z: b }, { x: c, z: d }, { x: a, z: d },
  ];
}

export function buildVehicles(G) {
  const rng = mulberry32(77031);
  G.cars = [];
  // 12 moving traffic cars on road loops.
  for (let i = 0; i < 12; i++) {
    const car = makeCar(G, 'traffic', pick(rng, TRAFFIC_COLORS), 0, 0, 0);
    car.route = makeRoute(rng);
    car.routeIdx = Math.floor(rng() * 4);
    const wp = car.route[car.routeIdx];
    car.pos.x = wp.x;
    car.pos.z = wp.z;
    car.driver = 'ai';
    car.cruise = 8 + rng() * 4;
  }
  // 10 parked cars, stealable, tucked at road edges and block corners.
  const parkedSpots = [
    [-152, -72, 0], [-72, -152, 1.57], [72, -152, 1.57], [152, -72, 0],
    [-72, 152, 1.57], [72, 152, 1.57], [152, 72, 0], [-152, 72, 0],
    [8, -152, 1.57], [-8, 152, 1.57],
  ];
  for (const [x, z, yaw] of parkedSpots) {
    makeCar(G, 'parked', pick(rng, TRAFFIC_COLORS), x, z, yaw);
  }
  // The taxi at the taxi stand, the gold car, and the heist van at the garage.
  const taxi = makeCar(G, 'taxi', 0xf2c230, G.city.taxiStand.x, G.city.taxiStand.z, Math.PI / 2);
  taxi.label = 'taxi';
  const gold = makeCar(G, 'gold', 0xd9a441, G.city.goldCar.x, G.city.goldCar.z, 0);
  gold.label = 'gold';
  const van = makeCar(G, 'van', 0x5a6b7a, 40, 56, Math.PI);
  van.label = 'van';
  G.specialCars = { taxi, gold, van };
  return G.cars;
}

function carAhead(G, car, dist) {
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const rx = other.pos.x - car.pos.x;
    const rz = other.pos.z - car.pos.z;
    const along = rx * fx + rz * fz;
    if (along > 0 && along < dist && Math.abs(rx * fz - rz * fx) < 3.2) return true;
  }
  return false;
}

export function updateVehicles(G, dt) {
  const input = G.input;
  for (const car of G.cars) {
    if (car.dead) continue;
    if (car.driver === 'player') {
      // Arcade driving: W accelerate, S brake/reverse, A/D steer, Space brake.
      const fwd = input.down('KeyW') ? 1 : 0;
      const back = input.down('KeyS') ? 1 : 0;
      const left = input.down('KeyA') ? 1 : 0;
      const right = input.down('KeyD') ? 1 : 0;
      const brake = input.down('Space') ? 1 : 0;
      if (fwd) car.speed += 15 * dt;
      if (back) car.speed -= car.speed > 0.5 ? 26 * dt : 9 * dt;
      if (brake) car.speed = Math.max(0, car.speed - 30 * dt);
      car.speed -= car.speed * 0.55 * dt; // drag
      car.speed = clamp(car.speed, -9, 30);
      const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
      car.steer = angleLerp(car.steer, steerTarget * 0.55, Math.min(1, dt * 6));
      car.yaw += car.steer * (car.speed / 9) * dt * (car.speed >= 0 ? 1 : -1);
      const moved = slideMove(car.pos.x, car.pos.z,
        Math.sin(car.yaw) * car.speed * dt, Math.cos(car.yaw) * car.speed * dt,
        car.radius, G.colliders.boxes, G.colliders.circles);
      if (moved.hitX || moved.hitZ) {
        if (Math.abs(car.speed) > 12) G.events.crash(Math.abs(car.speed));
        car.speed *= 0.4;
      }
      car.pos.x = moved.x;
      car.pos.z = moved.z;
      // Speeding past a police car draws attention.
      if (car.speed > 22 && G.wanted < 5) {
        for (const pc of G.cars) {
          if (pc.isPolice && !pc.dead && dist2(pc.pos.x, pc.pos.z, car.pos.x, car.pos.z) < 30) {
            G.events.addWanted(1, 'speeding');
            break;
          }
        }
      }
    } else if (car.driver === 'ai') {
      // Follow the route loop, slowing for the car ahead.
      const wp = car.route[car.routeIdx];
      const dx = wp.x - car.pos.x;
      const dz = wp.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 6) {
        car.routeIdx = (car.routeIdx + 1) % car.route.length;
      } else {
        const wantYaw = Math.atan2(dx, dz);
        car.yaw = angleLerp(car.yaw, wantYaw, Math.min(1, dt * 2.2));
        const target = carAhead(G, car, 11) ? 0 : car.cruise;
        car.speed = angleLerp(car.speed, target, Math.min(1, dt * 1.4));
        const moved = slideMove(car.pos.x, car.pos.z,
          Math.sin(car.yaw) * car.speed * dt, Math.cos(car.yaw) * car.speed * dt,
          car.radius, G.colliders.boxes, G.colliders.circles);
        if (moved.hitX || moved.hitZ) car.speed *= 0.3;
        car.pos.x = moved.x;
        car.pos.z = moved.z;
      }
    }
    // Mesh follows the body; wheels spin with speed.
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.yaw;
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 1.4;
    if (car.isPolice) {
      const blink = Math.floor(G.time * 6) % 2 === 0;
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        bar.red.material.color.setHex(blink ? 0xff2222 : 0x551111);
        bar.blue.material.color.setHex(blink ? 0x111155 : 0x2244ff);
      }
    }
  }
  // Car-car shove: circles push apart so traffic never overlaps.
  for (let i = 0; i < G.cars.length; i++) {
    for (let j = i + 1; j < G.cars.length; j++) {
      const a = G.cars[i];
      const b = G.cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius - 0.4;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        if (a.driver !== 'player') { a.pos.x -= nx * push; a.pos.z -= nz * push; }
        if (b.driver !== 'player') { b.pos.x += nx * push; b.pos.z += nz * push; }
      }
    }
  }
}

export function nearestStealableCar(G, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.dead || car.driver === 'player' || car.isPolice) continue;
    const d = dist2(x, z, car.pos.x, car.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  car.driver = 'player';
  p.car = car;
  p.onFoot = false;
  // The player's position becomes the car's at once (not on the next
  // frame): missions, police, roadblocks and staging all read p.pos.
  p.pos.x = car.pos.x;
  p.pos.z = car.pos.z;
  p.group.position.set(car.pos.x, 0, car.pos.z);
  p.group.visible = false;
  p.group.userData.hideWeapon();
  G.audio.engine(0, true);
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car || Math.abs(car.speed) > 3) return false;
  car.driver = null;
  p.car = null;
  p.onFoot = true;
  const side = 2.6;
  p.pos.x = car.pos.x + Math.cos(car.yaw) * side;
  p.pos.z = car.pos.z - Math.sin(car.yaw) * side;
  p.pos.y = 0;
  p.group.position.set(p.pos.x, 0, p.pos.z);
  p.group.visible = true;
  p.group.userData.showWeapon(p.weapon);
  p.camYaw = car.yaw;
  G.audio.engine(0, false);
  return true;
}
