// Solmar — CONDOR-1, the Solmar PD air unit. At 3 stars and up the
// helicopter hovers over the player, sweeps a visible searchlight across
// the streets, and radios in ground patrols. It leaves when the heat does.

import * as THREE from 'three';
import { clamp } from './util.js';

function buildHeliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.5, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9 });

  // Fuselage.
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.0, 2.6), bodyMat);
  body.position.y = 0;
  body.castShadow = true;
  g.add(body);
  // Nose glass.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.2), glassMat);
  nose.position.set(3.0, -0.1, 0);
  g.add(nose);
  // Tail boom + fin.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.7, 0.7), bodyMat);
  boom.position.set(-4.6, 0.4, 0);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), bodyMat);
  fin.position.set(-7.0, 1.1, 0);
  g.add(fin);
  // Tail rotor.
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), darkMat);
  tailRotor.position.set(-7.0, 0.6, 0.5);
  g.add(tailRotor);
  // Main rotor mast + blades (spin in update).
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8), darkMat);
  mast.position.y = 1.4;
  g.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.9;
  const bladeGeo = new THREE.BoxGeometry(11, 0.12, 0.7);
  const blade1 = new THREE.Mesh(bladeGeo, darkMat);
  const blade2 = new THREE.Mesh(bladeGeo, darkMat);
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade1); rotor.add(blade2);
  g.add(rotor);
  // Skids.
  const skidGeo = new THREE.BoxGeometry(4.4, 0.16, 0.16);
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(skidGeo, darkMat);
    skid.position.set(0.3, -1.5, s * 1.1);
    g.add(skid);
  }
  // Searchlight housing under the nose.
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 0.5, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe98a, emissiveIntensity: 1.2 }),
  );
  lamp.position.set(2.6, -1.2, 0);
  g.add(lamp);
  // Red beacon on the belly.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd81e2a, emissive: 0xff2020, emissiveIntensity: 2 }),
  );
  beacon.position.set(0, -1.15, 0);
  beacon.name = 'beacon';
  g.add(beacon);

  return { group: g, rotor, tailRotor, beacon };
}

export class Heli {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game;
    this.active = false;
    this.x = 0; this.z = 0;
    this.y = 32;
    this.altitude = 32; // cruise height: low enough to see, above most roofs
    this.heading = 0;
    this.orbitPhase = 0;
    this.callTimer = 0;
    this.sweepPhase = 0;
    const built = buildHeliMesh();
    this.mesh = built.group;
    this.parts = built;
    this.mesh.visible = false;
    scene.add(this.mesh);

    // The searchlight: a real spotlight aimed at the player, plus a visible
    // translucent cone so the beam reads in screenshots.
    this.spot = new THREE.SpotLight(0xfff2b8, 900, 160, 0.22, 0.45, 1.2);
    this.spot.position.set(0, 55, 0);
    this.spotTarget = new THREE.Object3D();
    scene.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    this.spot.visible = false;
    scene.add(this.spot);
    const coneGeo = new THREE.ConeGeometry(11, 55, 20, 1, true);
    coneGeo.translate(0, -27.5, 0);
    this.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xfff2b8, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    this.cone.visible = false;
    scene.add(this.cone);
    // Lit patch on the ground under the beam.
    const poolGeo = new THREE.CircleGeometry(9, 24);
    this.pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
      color: 0xfff2b8, transparent: true, opacity: 0.22, depthWrite: false,
    }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.15;
    this.pool.visible = false;
    scene.add(this.pool);
  }

  update(dt, player) {
    const wanted = this.game.police.wanted;
    if (wanted >= 3) {
      if (!this.active) {
        this.active = true;
        this.mesh.visible = true;
        this.spot.visible = true;
        this.cone.visible = true;
        this.pool.visible = true;
        this.x = player.x + 20;
        this.z = player.z + 20;
        this.game.hud.toast('CONDOR-1 is overhead — the air unit is on you!', 4);
      }
      // Orbit above the player, slowly circling, rotor spinning.
      this.orbitPhase += dt * 0.25;
      const orbitR = 26;
      const tx = player.x + Math.cos(this.orbitPhase) * orbitR;
      const tz = player.z + Math.sin(this.orbitPhase) * orbitR;
      this.x += (tx - this.x) * clamp(dt * 1.5, 0, 1);
      this.z += (tz - this.z) * clamp(dt * 1.5, 0, 1);
      this.y = this.altitude + Math.sin(this.game.timeSec * 0.7) * 2;
      this.heading = Math.atan2(-(player.z - this.z), player.x - this.x);
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.rotation.y = this.heading;
      this.parts.rotor.rotation.y += dt * 22;
      this.parts.tailRotor.rotation.x += dt * 30;
      const blink = Math.sin(this.game.timeSec * 6) > 0;
      this.parts.beacon.material.emissiveIntensity = blink ? 3 : 0.3;
      // The searchlight sweeps a small circle around the player.
      this.sweepPhase += dt * 0.5;
      const sx = player.x + Math.cos(this.sweepPhase) * 6;
      const sz = player.z + Math.sin(this.sweepPhase) * 6;
      this.spot.position.set(this.x, this.y - 1, this.z);
      this.spotTarget.position.set(sx, 0, sz);
      this.cone.position.set(this.x, this.y - 1, this.z);
      // Aim the cone (which hangs down its local -Y) at the sweep point.
      const dir = new THREE.Vector3(sx - this.x, 0 - (this.y - 1), sz - this.z);
      const len = dir.length() || 1;
      dir.divideScalar(len);
      this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      this.cone.scale.set(1, len / 55, 1);
      this.pool.position.set(sx, 0.15, sz);
      // Radio in a ground patrol now and then while the heat holds.
      this.callTimer -= dt;
      if (this.callTimer <= 0) {
        this.callTimer = 18;
        const want = this.game.police.wantedCarCount();
        if (this.game.police.cars.length < want) {
          this.game.police.spawnPatrol(player.x, player.z);
        }
      }
    } else if (this.active) {
      this.active = false;
      this.mesh.visible = false;
      this.spot.visible = false;
      this.cone.visible = false;
      this.pool.visible = false;
    }
  }
}
