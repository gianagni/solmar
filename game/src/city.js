// Solmar — the city itself: ground, roads, buildings, beach, park and props.
// Everything is procedural (no external art). The ground is one big canvas
// texture: roads, lane dashes, crosswalks, sidewalks, sand and grass drawn
// once, so the city looks finished without hundreds of meshes.

import * as THREE from 'three';
import { mulberry32, rand, randInt, pick } from './util.js';

export const CITY_HALF = 320; // world runs -320..320 on x and z
export const ROAD_LINES = [-280, -200, -120, -40, 40, 120, 200, 280];
export const ROAD_WIDTH = 14;
export const BEACH_X = 300; // sand and sea start here (east edge)

// Landmark spots, shared with missions and the minimap.
export const LANDMARKS = {
  cafe: { x: -36, z: -116, label: 'Cafe Alba' },
  hotel: { x: 116, z: -36, label: 'Hotel Miramonte' },
  garage: { x: -116, z: 116, label: 'Rico Auto Garage' },
  docks: { x: 276, z: 236, label: 'Docks' },
  pier: { x: 316, z: -4, label: 'Solmar Pier' },
  hospital: { x: -196, z: 36, label: 'St. Lumen Hospital' },
  policeStation: { x: 36, z: 196, label: 'Solmar PD' },
  tower: { x: -4, z: -4, label: 'Solmar Tower' },
  plaza: { x: -116, z: -196, label: 'Plaza del Sol' },
};

const BUILDING_COLORS = [
  0xe8dcc8, 0xd9c1a3, 0xc9d6de, 0xe0b48f, 0xb9c4a8,
  0xd8a08a, 0xa8b8cc, 0xe6d6b8, 0xcfd8c2, 0xf0e6d2,
];
const GLASS_COLORS = [0x7fa8c9, 0x5f8fae, 0x9db8c9, 0x6f9fb8];

function groundTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const w2p = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * S; // world -> pixels
  const pw = (v) => (v / (CITY_HALF * 2)) * S; // world length -> pixels

  // Base: sun-baked asphalt for the whole ground.
  g.fillStyle = '#3a3d42';
  g.fillRect(0, 0, S, S);

  // Sidewalk blocks: light concrete squares between the roads.
  g.fillStyle = '#8f8a80';
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const x0 = ROAD_LINES[i] + ROAD_WIDTH / 2;
      const x1 = ROAD_LINES[i + 1] - ROAD_WIDTH / 2;
      const z0 = ROAD_LINES[j] + ROAD_WIDTH / 2;
      const z1 = ROAD_LINES[j + 1] - ROAD_WIDTH / 2;
      g.fillRect(w2p(x0), w2p(z0), pw(x1 - x0), pw(z1 - z0));
    }
  }
  // Outer ring sidewalk.
  g.fillRect(0, 0, w2p(-280 - ROAD_WIDTH / 2), S);
  g.fillRect(w2p(280 + ROAD_WIDTH / 2), 0, S - w2p(280 + ROAD_WIDTH / 2), S);
  g.fillRect(0, 0, S, w2p(-280 - ROAD_WIDTH / 2));
  g.fillRect(0, w2p(280 + ROAD_WIDTH / 2), S, S - w2p(280 + ROAD_WIDTH / 2));

  // Roads: darker strips with center dashes.
  g.fillStyle = '#2e3136';
  for (const line of ROAD_LINES) {
    g.fillRect(w2p(line - ROAD_WIDTH / 2), 0, pw(ROAD_WIDTH), S);
    g.fillRect(0, w2p(line - ROAD_WIDTH / 2), S, pw(ROAD_WIDTH));
  }
  g.fillStyle = '#d8c95a';
  for (const line of ROAD_LINES) {
    for (let p = -CITY_HALF + 10; p < CITY_HALF - 10; p += 16) {
      g.fillRect(w2p(p), w2p(line) - 1, pw(8), 2);
      g.fillRect(w2p(line) - 1, w2p(p), 2, pw(8));
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = '#e8e6df';
  for (const rx of ROAD_LINES) {
    for (const rz of ROAD_LINES) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(w2p(rx + k * 3 - 1), w2p(rz - ROAD_WIDTH / 2 - 2), pw(2), pw(4));
        g.fillRect(w2p(rx + k * 3 - 1), w2p(rz + ROAD_WIDTH / 2 - 2), pw(2), pw(4));
        g.fillRect(w2p(rx - ROAD_WIDTH / 2 - 2), w2p(rz + k * 3 - 1), pw(4), pw(2));
        g.fillRect(w2p(rx + ROAD_WIDTH / 2 - 2), w2p(rz + k * 3 - 1), pw(4), pw(2));
      }
    }
  }

  // Park (green block) and plaza (terracotta) override two blocks.
  g.fillStyle = '#5d8a4a';
  g.fillRect(w2p(40 + 7), w2p(120 + 7), pw(66), pw(66));
  g.fillStyle = '#c98d5a';
  g.fillRect(w2p(-120 + 7), w2p(-200 + 7), pw(66), pw(66));

  // Beach: pale sand east of the last road, then the sea is a 3D plane.
  g.fillStyle = '#e8d9a8';
  g.fillRect(w2p(BEACH_X), 0, S - w2p(BEACH_X), S);
  g.fillStyle = '#d9c98f';
  for (let i = 0; i < 40; i++) {
    g.fillRect(w2p(BEACH_X + 2 + (i % 7) * 2.4), w2p(-300 + i * 15), pw(1.2), pw(6));
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowsTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const lit = ((x * 7 + y * 13) % 5) < 3;
      g.fillStyle = lit ? '#2c4a63' : '#5a6a72';
      g.fillRect(x, y, 8, 7);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Sea (east of the beach) and the pier deck.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(220, CITY_HALF * 2 + 220),
    new THREE.MeshStandardMaterial({ color: 0x2e7fa8, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY_HALF + 110, -0.4, 0);
  group.add(sea);

  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(60, 1.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }),
  );
  pier.position.set(CITY_HALF + 18, 0.4, -4);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);
  colliders.push({ x0: CITY_HALF - 12, z0: -9, x1: CITY_HALF + 48, z1: 1 });

  // Buildings: one to four per block, kept off the roads and the beach.
  const winTex = windowsTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const landmarkHeights = {
    tower: 64, hotel: 34, hospital: 22, policeStation: 14, cafe: 9, garage: 8,
  };
  const reserved = new Set();
  for (const [name, lm] of Object.entries(LANDMARKS)) {
    reserved.add(`${Math.round(lm.x)},${Math.round(lm.z)}`);
  }

  const buildingMats = new Map();
  function buildingMat(color, glass) {
    const key = `${color}:${glass}`;
    if (!buildingMats.has(key)) {
      buildingMats.set(key, new THREE.MeshStandardMaterial({
        color, map: winTex, roughness: 0.85,
        emissive: glass ? 0x1a2a38 : 0x000000, emissiveIntensity: glass ? 0.35 : 0,
      }));
    }
    return buildingMats.get(key);
  }

  function addBuilding(x, z, w, d, h, color, glass) {
    const m = new THREE.Mesh(boxGeo, buildingMat(color, glass));
    m.scale.set(w, h, d);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    // Rooftop box so flat roofs read as rooftops, not slabs.
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x6a655c, roughness: 1 }));
    roof.scale.set(w * 0.3, 1.6, d * 0.3);
    roof.position.set(x + w * 0.2, h + 0.8, z - d * 0.2);
    roof.castShadow = true;
    group.add(roof);
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  }

  // Landmark buildings first (fixed spots, named on the minimap).
  for (const [name, lm] of Object.entries(LANDMARKS)) {
    if (name === 'docks' || name === 'pier' || name === 'plaza') continue;
    const h = landmarkHeights[name] ?? 16;
    const glass = name === 'tower' || name === 'hotel';
    addBuilding(lm.x, lm.z, name === 'tower' ? 26 : 22, name === 'tower' ? 26 : 18, h,
      name === 'hospital' ? 0xf2f0ea : name === 'policeStation' ? 0x9fb4c8 : pick(rng, GLASS_COLORS),
      glass);
  }
  // Solmar Tower gets a lit crown.
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(10, 3, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff9a2a, emissiveIntensity: 1.4 }),
  );
  crown.position.set(LANDMARKS.tower.x, 65.5, LANDMARKS.tower.z);
  group.add(crown);

  // Docks: shipping containers near the beach.
  const containerColors = [0xc65a3a, 0x3a7ac6, 0x4a9a5a, 0xd8a03a];
  for (let i = 0; i < 8; i++) {
    const cx = 268 + (i % 4) * 9;
    const cz = 216 + Math.floor(i / 4) * 10;
    const cont = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: containerColors[i % 4], roughness: 0.8 }));
    cont.scale.set(8, 3, 3.4);
    cont.position.set(cx, 1.5, cz);
    cont.castShadow = true;
    group.add(cont);
    colliders.push({ x0: cx - 4, z0: cz - 1.7, x1: cx + 4, z1: cz + 1.7 });
  }

  // Fill the remaining blocks.
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const bx0 = ROAD_LINES[i] + ROAD_WIDTH / 2 + 3;
      const bx1 = ROAD_LINES[i + 1] - ROAD_WIDTH / 2 - 3;
      const bz0 = ROAD_LINES[j] + ROAD_WIDTH / 2 + 3;
      const bz1 = ROAD_LINES[j + 1] - ROAD_WIDTH / 2 - 3;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      // Skip the park and plaza blocks (they stay open).
      if (Math.abs(cx - 80) < 5 && Math.abs(cz - 160) < 5) continue;
      if (Math.abs(cx + 80) < 5 && Math.abs(cz + 160) < 5) continue;
      // Skip blocks that hold a landmark.
      let skip = false;
      for (const lm of Object.values(LANDMARKS)) {
        if (lm.x > bx0 - 12 && lm.x < bx1 + 12 && lm.z > bz0 - 12 && lm.z < bz1 + 12) { skip = true; break; }
      }
      if (skip) continue;
      // Beach-side blocks stay empty so the sea stays visible.
      if (bx0 > BEACH_X - 40) continue;
      const n = randInt(rng, 1, 3);
      for (let k = 0; k < n; k++) {
        const w = rand(rng, 14, 26), d = rand(rng, 14, 26);
        const x = rand(rng, bx0 + w / 2, bx1 - w / 2);
        const z = rand(rng, bz0 + d / 2, bz1 - d / 2);
        addBuilding(x, z, w, d, rand(rng, 9, 38), pick(rng, BUILDING_COLORS), rng() < 0.25);
      }
    }
  }

  // Park trees + plaza fountain.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a7a35, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 6);
  const leafGeo = new THREE.SphereGeometry(3.2, 8, 6);
  function addTree(x, z) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2, z);
    trunk.castShadow = true;
    group.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, 6, z);
    leaf.castShadow = true;
    group.add(leaf);
    colliders.push({ x0: x - 0.7, z0: z - 0.7, x1: x + 0.7, z1: z + 0.7 });
  }
  for (let i = 0; i < 14; i++) {
    addTree(rand(rng, 50, 140), rand(rng, 130, 210));
  }
  for (let i = 0; i < 6; i++) {
    addTree(rand(rng, -290, -250), rand(rng, -290, -250));
  }
  // Fountain: a low blue cylinder in the plaza.
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.4, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a8ab8, roughness: 0.3 }),
  );
  fountain.position.set(LANDMARKS.plaza.x, 0.7, LANDMARKS.plaza.z);
  fountain.receiveShadow = true;
  group.add(fountain);
  colliders.push({ x0: LANDMARKS.plaza.x - 8, z0: LANDMARKS.plaza.z - 8, x1: LANDMARKS.plaza.x + 8, z1: LANDMARKS.plaza.z + 8 });

  // Streetlights along the roads (emissive heads, no real light per lamp).
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 1.6 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 7, 6);
  const lampGeo = new THREE.SphereGeometry(0.7, 8, 6);
  for (const rx of ROAD_LINES) {
    for (const rz of [-240, -80, 80, 240]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(rx + ROAD_WIDTH / 2 + 1, 3.5, rz);
      group.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(rx + ROAD_WIDTH / 2 + 1, 7.2, rz);
      group.add(lamp);
    }
  }

  // Health pickups: glowing green crosses at the hospital and the park.
  const pickupSpots = [
    { x: LANDMARKS.hospital.x + 16, z: LANDMARKS.hospital.z },
    { x: 80, z: 160 },
    { x: -240, z: -240 },
    { x: 240, z: -160 },
  ];

  return {
    group,
    colliders,
    pickupSpots,
    roadsX: ROAD_LINES,
    roadsZ: ROAD_LINES,
    bounds: CITY_HALF,
    // Nearest point on any road centerline — used to spawn police on roads.
    roadPointNear(x, z) {
      let best = null, bestD = Infinity;
      for (const rx of ROAD_LINES) {
        const d = Math.abs(x - rx);
        if (d < bestD) { bestD = d; best = { x: rx, z: clamp(z, -280, 280) }; }
      }
      for (const rz of ROAD_LINES) {
        const d = Math.abs(z - rz);
        if (d < bestD) { bestD = d; best = { x: clamp(x, -280, 280), z: rz }; }
      }
      return best;
    },
    // A random road point at least minDist from (x, z).
    randomRoadPoint(minX, minZ, minDist) {
      for (let tries = 0; tries < 40; tries++) {
        const vertical = rng() < 0.5;
        const line = pick(rng, ROAD_LINES);
        const along = rand(rng, -280, 280);
        const p = vertical ? { x: line, z: along } : { x: along, z: line };
        const dx = p.x - minX, dz = p.z - minZ;
        if (dx * dx + dz * dz > minDist * minDist) return p;
      }
      return { x: -280, z: -280 };
    },
  };
}
