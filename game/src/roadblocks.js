// Solmar — police roadblocks. At 2 stars and up the Solmar PD throws
// patrol cars across the road ahead of the player. A block is two police
// cars parked side by side, with cones, and it really stops a car: each
// block car adds a collider to the city, so ramming one costs speed and
// paints the car. Blocks dissolve when the heat drops or after a while,
// and the PD sets a fresh one further up the road.

import * as THREE from 'three';
import { Car } from './vehicles.js';
import { clamp } from './util.js';

const BLOCK_LIFE = 45; // seconds before a block is pulled
const BLOCK_AHEAD = 70; // how far ahead of the player a block is set

function buildConeMesh() {
  const g = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86a1e, roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.8 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 10), orange);
  cone.position.y = 0.55;
  cone.castShadow = true;
  g.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 10), white);
  band.position.y = 0.55;
  g.add(band);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), orange);
  base.position.y = 0.06;
  g.add(base);
  return g;
}

export class Roadblocks {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game;
    this.blocks = []; // { cars: [Car, Car], cones: [Group], colliders: [box], timer }
    this.spawnTimer = 0;
  }

  // Two police cars across a road at (x, z), facing along the road.
  spawnAt(x, z, heading) {
    const cars = [];
    const colliders = [];
    const cones = [];
    // The cars sit side by side across the road: offset perpendicular.
    const px = -Math.sin(heading), pz = -Math.cos(heading);
    for (const s of [-2.6, 2.6]) {
      const car = new Car(this.scene, 'police', 0xf0f0ee, x + px * s, z + pz * s, heading);
      cars.push(car);
      const r = car.radius * 0.82;
      const box = {
        x0: car.x - r, z0: car.z - r, x1: car.x + r, z1: car.z + r,
      };
      colliders.push(box);
      this.city.colliders.push(box);
    }
    // Cones funneling traffic into the block.
    for (const [cx, cz] of [[-7, -4], [-7, 4], [7, -4], [7, 4]]) {
      const cone = buildConeMesh();
      // Cones sit along the road direction, flanking the cars.
      const fx = Math.cos(heading), fz = -Math.sin(heading);
      cone.position.set(x + fx * cx + px * cz, 0, z + fz * cx + pz * cz);
      this.scene.add(cone);
      cones.push(cone);
    }
    this.blocks.push({ cars, cones, colliders, timer: BLOCK_LIFE });
  }

  // Set a block on the road the player is driving along, ahead of them.
  spawnAhead(player, aheadDist = BLOCK_AHEAD) {
    // Pick the road line nearest the player and a point ahead of them.
    const heading = player.heading;
    const fx = Math.cos(heading), fz = -Math.sin(heading);
    const ax = player.x + fx * aheadDist;
    const az = player.z + fz * aheadDist;
    // Snap to the nearest road so the block sits on asphalt, not a building.
    const p = this.city.roadPointNear(ax, az);
    if (!p) return;
    // Face the block across the road: heading along the road's direction.
    const vertical = Math.abs(p.x - ax) < Math.abs(p.z - az);
    const blockHeading = vertical ? Math.PI / 2 : 0;
    this.spawnAt(p.x, p.z, blockHeading);
  }

  clearBlock(block) {
    for (const car of block.cars) car.dispose(this.scene);
    for (const cone of block.cones) this.scene.remove(cone);
    for (const box of block.colliders) {
      const i = this.city.colliders.indexOf(box);
      if (i >= 0) this.city.colliders.splice(i, 1);
    }
  }

  clearAll() {
    for (const b of this.blocks) this.clearBlock(b);
    this.blocks = [];
  }

  update(dt, player) {
    const wanted = this.game.police.wanted;
    // Age the blocks; pull them when the heat is gone or they time out.
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.timer -= dt;
      if (wanted < 2 || b.timer <= 0) {
        this.clearBlock(b);
        this.blocks.splice(i, 1);
      }
    }
    if (wanted < 2) return;
    // Keep one block ahead while the heat holds.
    this.spawnTimer -= dt;
    if (this.blocks.length === 0 && this.spawnTimer <= 0) {
      this.spawnTimer = 8;
      this.spawnAhead(player);
      this.game.hud.toast('Roadblock ahead — the PD sealed the street!', 3.5);
    }
  }
}
