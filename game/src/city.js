// Solmar — the city itself: roads, blocks, buildings, landmarks, sun and
// sky, plus every collider the movement code obeys. Layout is seeded, so the
// city is identical on every run.
import * as THREE from 'three';
import { mulberry32, pick } from './util.js';

export const ROAD_LINES = [-160, -80, 0, 80, 160];
export const ROAD_W = 14;

const BLOCKS = [
  [-200, -167], [-153, -87], [-73, -7], [7, 73], [87, 153], [167, 200],
];
const PALETTE = [
  0xe8b04b, 0xd98a5f, 0xc96f4a, 0xe5c98a, 0xb8d4a0,
  0x7fb3c8, 0xe8e0d0, 0xd9a441, 0xc65b4e, 0x9db8c4, 0xe0a866,
];

function box(w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...(opts || {}) })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildCity(G) {
  const rng = mulberry32(20261123);
  const scene = G.scene;
  const boxes = [];
  const circles = [];

  // Sky, sun, haze — a golden afternoon over the coast.
  scene.background = new THREE.Color(0xf0b25e);
  scene.fog = new THREE.Fog(0xeeb265, 280, 560);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.7);
  sun.position.set(-140, 190, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -230;
  sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230;
  sun.shadow.camera.bottom = -230;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffe0b3, 0x8a6f4d, 0.75));

  // Ground and sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0xcbb37f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(280, 760),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(340, 0.06, 0);
  scene.add(sea);
  // Beach strip where the land meets the sea.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 420),
    new THREE.MeshLambertMaterial({ color: 0xe6d3a3 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(183, 0.04, 0);
  beach.receiveShadow = true;
  scene.add(beach);

  // Roads, sidewalks and centre lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xbfae85 });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xe8e0c8 });
  for (const l of ROAD_LINES) {
    for (const [w, len, x, z] of [
      [ROAD_W, 440, l, 0],
      [440, ROAD_W, 0, l],
    ]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, len), roadMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, 0.02, z);
      r.receiveShadow = true;
      scene.add(r);
    }
    for (const [w, len, x, z] of [
      [3, 440, l - 8.5, 0], [3, 440, l + 8.5, 0],
      [440, 3, 0, l - 8.5], [440, 3, 0, l + 8.5],
    ]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, len), walkMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.03, z);
      s.receiveShadow = true;
      scene.add(s);
    }
    for (const [w, len, x, z] of [
      [0.5, 440, l, 0],
      [440, 0.5, 0, l],
    ]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, len), lineMat);
      c.rotation.x = -Math.PI / 2;
      c.position.set(x, 0.035, z);
      scene.add(c);
    }
  }

  // World edge walls, with a gap for the pier (|z| < 8, out to x = 232).
  const wall = (minX, maxX, minZ, maxZ) => boxes.push({ minX, maxX, minZ, maxZ });
  wall(-220, -200, -220, 220);
  wall(-220, 220, -220, -200);
  wall(-220, 220, 200, 220);
  wall(200, 220, -220, -8);
  wall(200, 220, 8, 220);
  wall(232, 240, -8, 8);

  function addBuilding(cx, cz, w, d, h, color) {
    const b = box(w, h, d, color, cx, h / 2, cz);
    scene.add(b);
    const lip = box(w + 0.8, 0.6, d + 0.8, 0x5a4a3a, cx, h + 0.3, cz);
    scene.add(lip);
    boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return b;
  }

  // Solmar Tower — the 26x26 landmark at (-40,-40), kept clear all around.
  const tower = box(26, 78, 26, 0x8fa8b8, -40, 39, -40);
  scene.add(tower);
  const towerTop = box(27, 2, 27, 0xd9a441, -40, 79, -40);
  scene.add(towerTop);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
  );
  beacon.position.set(-40, 82, -40);
  scene.add(beacon);
  boxes.push({ minX: -53, maxX: -27, minZ: -53, maxZ: -27 });
  G.cityBeacon = beacon;

  // Garage district — a low workshop at (40,40) with a dark open door.
  const garage = box(18, 7, 12, 0x6b7c8c, 40, 3.5, 40);
  scene.add(garage);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 5),
    new THREE.MeshLambertMaterial({ color: 0x222226 })
  );
  door.position.set(40, 2.5, 46.05);
  scene.add(door);
  boxes.push({ minX: 31, maxX: 49, minZ: 34, maxZ: 46 });

  // Station — southwest, the respawn point.
  addBuilding(-120, 120, 20, 12, 8, 0xb8a67e);
  const platform = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 8),
    new THREE.MeshLambertMaterial({ color: 0x9a8a6a })
  );
  platform.rotation.x = -Math.PI / 2;
  platform.position.set(-120, 0.05, 132);
  platform.receiveShadow = true;
  scene.add(platform);

  // Fountain square at the (0,0) crossing.
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.4, 1.1, 20),
    new THREE.MeshLambertMaterial({ color: 0xd8cba8 })
  );
  basin.position.set(0, 0.55, 0);
  basin.castShadow = true;
  basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.4, 0.3, 20),
    new THREE.MeshLambertMaterial({ color: 0x4fa3c8 })
  );
  water.position.set(0, 1.05, 0);
  scene.add(water);
  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.7, 2.4, 8),
    new THREE.MeshLambertMaterial({ color: 0xcbbfa0 })
  );
  jet.position.set(0, 2.2, 0);
  scene.add(jet);
  circles.push({ x: 0, z: 0, r: 5.2 });

  // Pier out over the sea: a flat deck at ground level, with posts.
  const pierDeck = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 14),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d })
  );
  pierDeck.rotation.x = -Math.PI / 2;
  pierDeck.position.set(208, 0.05, 0);
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);
  for (let i = 0; i < 4; i++) {
    const post = box(0.8, 2.2, 0.8, 0x6b5636, 196 + i * 12, 1.1, 7.4);
    scene.add(post);
    const post2 = box(0.8, 2.2, 0.8, 0x6b5636, 196 + i * 12, 1.1, -7.4);
    scene.add(post2);
  }
  addBuilding(188, 26, 10, 8, 5, 0x7a8a99);
  addBuilding(188, -26, 10, 8, 5, 0x7a8a99);
  for (const [cx, cz] of [[182, 14], [184, -14], [196, 12]]) {
    const crate = box(2.4, 2.4, 2.4, 0xa8874f, cx, 1.2, cz);
    scene.add(crate);
    boxes.push({ minX: cx - 1.2, maxX: cx + 1.2, minZ: cz - 1.2, maxZ: cz + 1.2 });
  }

  // Fill the remaining blocks with varied buildings.
  const reserved = (bx, bz) =>
    (bx === 2 && bz === 2) || // tower block
    (bx === 3 && bz === 3) || // garage block
    (bx === 1 && bz === 4) || // station block
    bx === 5; // beach blocks
  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      if (reserved(bx, bz)) continue;
      const [x0, x1] = BLOCKS[bx];
      const [z0, z1] = BLOCKS[bz];
      const n = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        // Keep every building inside its block (and off the roads).
        const w = Math.min(10 + rng() * 14, (x1 - x0) - 14);
        const d = Math.min(10 + rng() * 14, (z1 - z0) - 14);
        const cx = x0 + 6 + rng() * Math.max(1, x1 - x0 - 12 - w);
        const cz = z0 + 6 + rng() * Math.max(1, z1 - z0 - 12 - d);
        const h = 8 + rng() * 36;
        addBuilding(cx, cz, w, d, h, pick(rng, PALETTE));
      }
    }
  }

  // Street lamps along the roads.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x44444a });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const l of ROAD_LINES) {
    for (let s = -160; s <= 160; s += 80) {
      for (const [x, z] of [[l + 9, s], [s, l - 9]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6, 6), lampMat);
        pole.position.set(x, 3, z);
        pole.castShadow = true;
        scene.add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), lampHeadMat);
        head.position.set(x, 6.1, z);
        scene.add(head);
        circles.push({ x, z, r: 0.4 });
      }
    }
  }

  // Palms on the sidewalks.
  for (let i = 0; i < 24; i++) {
    const l = pick(rng, ROAD_LINES);
    const s = -180 + rng() * 360;
    const x = rng() > 0.5 ? l + 10.5 : s;
    const z = rng() > 0.5 ? s : l + 10.5;
    if (Math.abs(x) > 195 || Math.abs(z) > 195) continue;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 5, 6),
      new THREE.MeshLambertMaterial({ color: 0x7a5c3a })
    );
    trunk.position.set(x, 2.5, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 2.2, 7),
      new THREE.MeshLambertMaterial({ color: 0x4d8a4a })
    );
    crown.position.set(x, 6, z);
    crown.castShadow = true;
    scene.add(crown);
    circles.push({ x, z, r: 0.5 });
  }

  G.colliders = { boxes, circles };
  G.city = {
    tower: { x: -40, z: -40 },
    garage: { x: 40, z: 40 },
    station: { x: -120, z: 120 },
    respawn: { x: -140, z: 138 },
    fountain: { x: 0, z: 0 },
    mara: { x: 5, z: 3 },
    taxiStand: { x: 8, z: 80 },
    goldCar: { x: -160, z: 8 },
    pier: { x: 190, z: 0 },
    docks: { x: 190, z: 20 },
    docks2: { x: 190, z: -20 },
    roads: ROAD_LINES,
  };
  return G.city;
}
