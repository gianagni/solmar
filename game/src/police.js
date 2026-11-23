// Solmar — the law: wanted stars, police pursuit and ramming, foot cops,
// the CONDOR-1 helicopter, roadblocks, and the BUSTED / WASTED outcomes.
import * as THREE from 'three';
import { makeCar, makeCarMesh } from './vehicles.js';
import { makePersonMesh } from './player.js';
import { clamp, slideMove, angleLerp, dist2, mulberry32, pick } from './util.js';

export function buildPolice(G) {
  G.wanted = 0;
  G.wantedTimer = 0;
  G.lastCrimeAt = -99;
  G.police = {
    spawnTimer: 4,
    heli: null,
    heliLeaving: false,
    patrolTimer: 0,
    roadblock: null,
    roadblockCooldown: 0,
    cops: [],
    ramCooldown: 0,
  };
  G.events.addWanted = (n, reason) => {
    if (G.wanted >= 5) return;
    G.wanted = Math.min(5, G.wanted + n);
    G.lastCrimeAt = G.time;
    G.wantedTimer = 0;
    G.hud.stars(G.wanted);
    G.audio.siren(G.wanted > 0);
    if (reason) G.events.toast(reason + ' — wanted level ' + G.wanted);
  };
  return G.police;
}

function spawnPoliceCar(G, x, z) {
  const car = makeCar(G, 'police', 0xe8e8e8, x, z, 0);
  car.driver = 'police';
  car.cruise = 24;
  return car;
}

function spawnPointOnRoad(G, rng, minD, maxD) {
  const p = G.player;
  for (let tries = 0; tries < 12; tries++) {
    const a = rng() * Math.PI * 2;
    const d = minD + rng() * (maxD - minD);
    let x = p.pos.x + Math.sin(a) * d;
    let z = p.pos.z + Math.cos(a) * d;
    // Snap to the nearest road line so the car arrives on a road.
    const lines = G.city.roads;
    let best = lines[0];
    let bestD = Infinity;
    for (const l of lines) {
      const dd = Math.abs(x - l);
      if (dd < bestD) { bestD = dd; best = l; }
    }
    if (bestD < Math.abs(z - lines.reduce((m, l) => (Math.abs(z - l) < Math.abs(z - m) ? l : m), lines[0]))) {
      x = best;
    } else {
      z = lines.reduce((m, l) => (Math.abs(z - l) < Math.abs(z - m) ? l : m), lines[0]);
    }
    x = clamp(x, -195, 195);
    z = clamp(z, -195, 195);
    return { x, z };
  }
  return { x: p.pos.x + 60, z: p.pos.z };
}

export function spawnCop(G, x, z) {
  const mesh = makePersonMesh({
    skin: 0xd9a184, shirt: 0xd8d8d8, jacket: 0x1a2a4a,
    pants: 0x1a2a4a, cap: 0x1a2a4a,
  });
  mesh.userData.hideWeapon();
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const cop = { mesh, pos: mesh.position, yaw: 0, punchCd: 0, bustTimer: 0, phase: 0 };
  G.police.cops.push(cop);
  return cop;
}

function buildHeli(G) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 5.2), bodyMat);
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.4), new THREE.MeshLambertMaterial({ color: 0x9fc4d4 }));
  glass.position.set(0, 0.2, 2.2);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.5), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 1.0), bodyMat);
  fin.position.set(0, 0.8, -6.2);
  g.add(fin);
  const rotor = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x222226 }));
  rotor.add(blade);
  const blade2 = blade.clone();
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade2);
  rotor.position.y = 1.1;
  g.add(rotor);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 })
  );
  beacon.position.set(0, -0.9, 0);
  g.add(beacon);
  // Searchlight: a spotlight aimed at the player, a visible cone hanging
  // from the heli to the ground, and a pool of light where it lands. The
  // cone and pool live in the scene (not the heli group) so they can stretch
  // from the heli to the player below.
  const spot = new THREE.SpotLight(0xfff2b0, 900, 120, 0.32, 0.5, 1.2);
  spot.position.set(0, -0.5, 0);
  g.add(spot);
  G.scene.add(spot.target);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 36, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  G.scene.add(cone);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  pool.rotation.x = -Math.PI / 2;
  G.scene.add(pool);
  g.position.set(G.player.pos.x + 30, 36, G.player.pos.z);
  G.scene.add(g);
  const heli = {
    group: g, rotor, beacon, spot, cone, pool,
    angle: 0, leaving: false, patrolTimer: 0,
    orbitR: 34, height: 36, // staging may tighten these for a shot
  };
  G.police.heli = heli;
  return heli;
}

function removeHeli(G) {
  const h = G.police.heli;
  if (!h) return;
  G.scene.remove(h.group);
  G.scene.remove(h.cone);
  G.scene.remove(h.pool);
  G.scene.remove(h.spot.target);
  G.police.heli = null;
}

function spawnRoadblock(G, distAhead) {
  const p = G.player;
  const rng = G.policeRng || (G.policeRng = mulberry32(31337));
  const fwd = p.onFoot ? { x: Math.sin(p.yaw), z: Math.cos(p.yaw) } : { x: Math.sin(p.car.yaw), z: Math.cos(p.car.yaw) };
  const px = p.pos.x + fwd.x * (distAhead || 45);
  const pz = p.pos.z + fwd.z * (distAhead || 45);
  const alongX = Math.abs(fwd.x) > Math.abs(fwd.z);
  const lines = G.city.roads;
  const snap = (v) => lines.reduce((m, l) => (Math.abs(v - l) < Math.abs(v - m) ? l : m), lines[0]);
  const bx = alongX ? px : snap(px);
  const bz = alongX ? snap(pz) : pz;
  const cars = [];
  const boxes = [];
  const circles = [];
  const coneMat = new THREE.MeshLambertMaterial({ color: 0xe86a1e });
  const mkCar = (x, z, yaw, minX, maxX, minZ, maxZ) => {
    const car = makeCar(G, 'police', 0xe8e8e8, x, z, yaw);
    car.driver = null;
    car.rb = true;
    cars.push(car);
    boxes.push({ minX, maxX, minZ, maxZ });
  };
  const mkCone = (x, z) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 8), coneMat);
    c.position.set(x, 0.55, z);
    c.castShadow = true;
    G.scene.add(c);
    circles.push({ x, z, r: 0.55 });
    return c;
  };
  const cones = [];
  if (alongX) {
    mkCar(bx, bz - 3.5, Math.PI / 2, bx - 1.3, bx + 1.3, bz - 5.7, bz - 1.3);
    mkCar(bx, bz + 3.5, Math.PI / 2, bx - 1.3, bx + 1.3, bz + 1.3, bz + 5.7);
    cones.push(mkCone(bx - 5, bz - 6), mkCone(bx - 5, bz + 6), mkCone(bx + 5, bz - 6), mkCone(bx + 5, bz + 6));
  } else {
    mkCar(bx - 3.5, bz, 0, bx - 5.7, bx - 1.3, bz - 1.3, bz + 1.3);
    mkCar(bx + 3.5, bz, 0, bx + 1.3, bx + 5.7, bz - 1.3, bz + 1.3);
    cones.push(mkCone(bx - 6, bz - 5), mkCone(bx + 6, bz - 5), mkCone(bx - 6, bz + 5), mkCone(bx + 6, bz + 5));
  }
  for (const b of boxes) G.colliders.boxes.push(b);
  for (const c of circles) G.colliders.circles.push(c);
  G.police.roadblock = { cars, cones, boxes, circles, x: bx, z: bz, until: G.time + 45 };
  G.events.toast('Roadblock ahead!');
  return G.police.roadblock;
}

function clearRoadblock(G) {
  const rb = G.police.roadblock;
  if (!rb) return;
  for (const car of rb.cars) {
    G.scene.remove(car.mesh);
    const i = G.cars.indexOf(car);
    if (i >= 0) G.cars.splice(i, 1);
  }
  for (const c of rb.cones) G.scene.remove(c);
  for (const b of rb.boxes) {
    const i = G.colliders.boxes.indexOf(b);
    if (i >= 0) G.colliders.boxes.splice(i, 1);
  }
  for (const c of rb.circles) {
    const i = G.colliders.circles.indexOf(c);
    if (i >= 0) G.colliders.circles.splice(i, 1);
  }
  G.police.roadblock = null;
  G.police.roadblockCooldown = 20;
}

function clearCops(G) {
  for (const cop of G.police.cops) G.scene.remove(cop.mesh);
  G.police.cops.length = 0;
}

function respawn(G) {
  const p = G.player;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
  }
  p.onFoot = true;
  p.pos.x = G.city.respawn.x;
  p.pos.z = G.city.respawn.z;
  p.group.position.set(p.pos.x, 0, p.pos.z);
  p.group.visible = true;
  p.group.userData.showWeapon(p.weapon);
  p.health = 100;
  p.camYaw = 0;
  G.wanted = 0;
  G.hud.stars(0);
  G.audio.siren(false);
  clearCops(G);
  clearRoadblock(G);
  if (G.police.heli) {
    G.scene.remove(G.police.heli.group);
    G.scene.remove(G.police.heli.cone);
    G.scene.remove(G.police.heli.pool);
    G.scene.remove(G.police.heli.spot.target);
    G.police.heli = null;
  }
  G.missions.failActive();
  G.audio.engine(0, false);
}

export function bustPlayer(G) {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  const fine = 330;
  G.player.money = Math.max(0, G.player.money - fine);
  G.hud.showScreen('busted', 'BUSTED', 'The Solmar PD caught you. Fine: $' + fine + '.');
  G.audio.busted();
  G.audio.siren(false);
  G.events.afterBusted = () => {
    respawn(G);
    G.state = 'playing';
    G.hud.hideScreens();
  };
}

export function wastePlayer(G) {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  G.player.money = Math.max(0, G.player.money - 100);
  G.hud.showScreen('wasted', 'WASTED', 'You got taken down. Hospital bill: $100.');
  G.audio.wasted();
  G.audio.siren(false);
  G.events.afterWasted = () => {
    respawn(G);
    G.state = 'playing';
    G.hud.hideScreens();
  };
}

export function damagePlayer(G, dmg) {
  const p = G.player;
  if (G.state !== 'playing' || p.health <= 0) return;
  p.health -= dmg;
  G.hud.flashDamage();
  if (p.health <= 0) {
    p.health = 0;
    wastePlayer(G);
  }
}

export function updatePolice(G, dt) {
  const P = G.police;
  const p = G.player;
  const rng = G.policeRng || (G.policeRng = mulberry32(31337));
  if (G.state !== 'playing') return;
  P.ramCooldown = Math.max(0, P.ramCooldown - dt);
  P.roadblockCooldown = Math.max(0, P.roadblockCooldown - dt);

  // Wanted decays when the heat is off: no crime for 25s, no police close.
  if (G.wanted > 0) {
    G.wantedTimer += dt;
    let policeNear = false;
    for (const car of G.cars) {
      if (car.isPolice && !car.dead && dist2(car.pos.x, car.pos.z, p.pos.x, p.pos.z) < 35) {
        policeNear = true;
        break;
      }
    }
    if (G.wantedTimer > 25 && !policeNear && G.time - G.lastCrimeAt > 25) {
      G.wanted -= 1;
      G.wantedTimer = 0;
      G.hud.stars(G.wanted);
      if (G.wanted === 0) {
        G.audio.siren(false);
        clearCops(G);
      }
    }
  }

  // Spawn pursuit cars up to the wanted cap.
  const wantCars = G.wanted > 0 ? Math.min(1 + G.wanted, 4) : 0;
  const liveCars = G.cars.filter((c) => c.isPolice && !c.dead && !c.rb);
  P.spawnTimer -= dt;
  if (liveCars.length < wantCars && P.spawnTimer <= 0) {
    const s = spawnPointOnRoad(G, rng, 55, 70);
    spawnPoliceCar(G, s.x, s.z);
    P.spawnTimer = 5;
  }

  // Pursuit: steer at the player, ram the player's car, drop foot cops.
  for (const car of liveCars) {
    const dx = p.pos.x - car.pos.x;
    const dz = p.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz);
    car.yaw = angleLerp(car.yaw, wantYaw, Math.min(1, dt * 2.4));
    const target = d > 6 ? Math.min(26, 18 + G.wanted * 2) : 12;
    car.speed = angleLerp(car.speed, target, Math.min(1, dt * 1.2));
    const moved = slideMove(car.pos.x, car.pos.z,
      Math.sin(car.yaw) * car.speed * dt, Math.cos(car.yaw) * car.speed * dt,
      car.radius, G.colliders.boxes, G.colliders.circles);
    if (moved.hitX || moved.hitZ) {
      car.speed *= 0.3;
      car.yaw += dt * 1.5; // wriggle free of the wall
    }
    car.pos.x = moved.x;
    car.pos.z = moved.z;
    // Ram the player's car.
    if (!p.onFoot && p.car && d < 4.5 && P.ramCooldown <= 0) {
      p.car.speed *= 0.75;
      damagePlayer(G, 6);
      P.ramCooldown = 1;
    }
    // Drop a foot cop when close to a player on foot.
    if (p.onFoot && d < 9 && Math.abs(car.speed) < 6 && P.cops.length < 3 && G.wanted >= 1) {
      spawnCop(G, car.pos.x + 2, car.pos.z + 2);
      car.speed = 0;
    }
  }

  // Foot cops chase on foot and grab the player.
  for (const cop of P.cops) {
    const dx = p.pos.x - cop.pos.x;
    const dz = p.pos.z - cop.pos.z;
    const d = Math.hypot(dx, dz);
    cop.yaw = Math.atan2(dx, dz);
    cop.phase += dt * 9;
    const u = cop.mesh.userData;
    u.legL.rotation.x = Math.sin(cop.phase) * 0.6;
    u.legR.rotation.x = -Math.sin(cop.phase) * 0.6;
    cop.mesh.rotation.y = cop.yaw;
    if (p.onFoot && d > 1.4) {
      const moved = slideMove(cop.pos.x, cop.pos.z, (dx / d) * 6.8 * dt, (dz / d) * 6.8 * dt, 0.6, G.colliders.boxes, G.colliders.circles);
      cop.pos.x = moved.x;
      cop.pos.z = moved.z;
      cop.bustTimer = 0;
    } else if (p.onFoot) {
      cop.bustTimer += dt;
      cop.punchCd -= dt;
      if (cop.punchCd <= 0) {
        damagePlayer(G, 8);
        cop.punchCd = 0.9;
      }
      if (cop.bustTimer > 0.4) {
        bustPlayer(G);
        return;
      }
    } else {
      // Player drove off: the cop gives up and walks back to a road.
      cop.bustTimer = 0;
    }
    cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
  }

  // CONDOR-1: orbits at wanted 3+, searchlight on the player, calls patrols.
  if (G.wanted >= 3 && !P.heli) {
    buildHeli(G);
  }
  if (P.heli) {
    const h = P.heli;
    if (G.wanted < 3) {
      // Leaves: climb and drift away, then gone.
      h.group.position.y += dt * 25;
      h.group.position.x += dt * 20;
      h.rotor.rotation.y += dt * 22;
      if (h.group.position.y > 130) removeHeli(G);
    } else {
      h.angle += dt * 0.22;
      const tx = p.pos.x + Math.sin(h.angle) * h.orbitR;
      const tz = p.pos.z + Math.cos(h.angle) * h.orbitR;
      h.group.position.x = angleLerp(h.group.position.x, tx, Math.min(1, dt * 2));
      h.group.position.z = angleLerp(h.group.position.z, tz, Math.min(1, dt * 2));
      h.group.position.y = h.height;
      h.group.rotation.y = Math.atan2(p.pos.x - h.group.position.x, p.pos.z - h.group.position.z);
      h.rotor.rotation.y += dt * 22;
      h.beacon.material.color.setHex(Math.floor(G.time * 3) % 2 === 0 ? 0xff2222 : 0x551111);
      // Spotlight, cone and pool all track the player on the ground.
      // (The spotlight itself rides with the heli at local (0,-0.5,0);
      // its target lives in the scene at the player's feet.)
      h.spot.target.position.set(p.pos.x, 0, p.pos.z);
      h.spot.target.updateMatrixWorld();
      const hx = h.group.position.x;
      const hy = h.group.position.y;
      const hz = h.group.position.z;
      const dx = p.pos.x - hx;
      const dy = 0 - hy;
      const dz = p.pos.z - hz;
      const len = Math.hypot(dx, dy, dz);
      h.cone.position.set((hx + p.pos.x) / 2, hy / 2, (hz + p.pos.z) / 2);
      h.cone.scale.set(1, len / 36, 1);
      h.cone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len)
      );
      h.pool.position.set(p.pos.x, 0.06, p.pos.z);
      h.patrolTimer -= dt;
      if (h.patrolTimer <= 0) {
        h.patrolTimer = 18;
        if (liveCars.length < 4) {
          const s = spawnPointOnRoad(G, rng, 50, 65);
          spawnPoliceCar(G, s.x, s.z);
        }
      }
    }
  }

  // Roadblocks at wanted 2+, one at a time, 45s of life.
  if (G.wanted >= 2 && !P.roadblock && P.roadblockCooldown <= 0) {
    spawnRoadblock(G);
  }
  if (P.roadblock && (G.wanted < 2 || G.time > P.roadblock.until)) {
    clearRoadblock(G);
  }
}

// Staging helper for screenshots: put a roadblock up right now.
export function forceRoadblock(G, distAhead) {
  if (G.police.roadblock) return G.police.roadblock;
  G.police.roadblockCooldown = 0;
  return spawnRoadblock(G, distAhead);
}

// Staging helper for screenshots: bring CONDOR-1 in right now.
export function ensureHeli(G) {
  if (!G.police.heli) buildHeli(G);
  return G.police.heli;
}
