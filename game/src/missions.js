// Solmar — story and missions. Riko Vane, a driver fresh out of luck, takes
// jobs from Mara Solano, a fixer who runs the city's quieter errands. Each
// mission is a chain of steps: go somewhere, drive something, deliver it,
// lose the heat. Finish all eight, then taxi fares keep paying.

import * as THREE from 'three';
import { LANDMARKS } from './city.js';

const MISSIONS = [
  {
    id: 'meet-mara',
    title: 'M1 — Meet Mara',
    giver: 'Mara Solano',
    brief: 'Mara wants a driver she can trust. Meet her at Cafe Alba.',
    reward: 150,
    steps: [
      { type: 'goto', at: LANDMARKS.cafe, radius: 8, text: 'Meet Mara at Cafe Alba' },
    ],
    done: 'Mara: "You drive, I point. First fare is a hotel guest. Don\'t keep him waiting."',
  },
  {
    id: 'first-fare',
    title: 'M2 — First Fare',
    giver: 'Mara Solano',
    brief: 'A hotel guest needs a ride across town. Get in a car and take him to Hotel Miramonte before the meter runs out.',
    reward: 500,
    steps: [
      { type: 'needCar', text: 'Get in a car' },
      { type: 'driveTo', at: LANDMARKS.hotel, radius: 10, time: 100, text: 'Drive the guest to Hotel Miramonte' },
    ],
    done: '"Smooth ride. The guest tipped. Mara\'s got bigger work for you."',
  },
  {
    id: 'hot-wheels',
    title: 'M3 — Hot Wheels',
    giver: 'Mara Solano',
    brief: 'A gold sports car is parked by the plaza. Take it to Rico Auto Garage. The owner will notice — expect heat.',
    reward: 800,
    steps: [
      { type: 'steal', at: { x: -116, z: -184 }, carId: 'gold-car', text: 'Take the gold sports car by the plaza' },
      { type: 'driveTo', at: LANDMARKS.garage, radius: 10, text: 'Deliver the car to Rico Auto Garage' },
    ],
    done: '"Rico says the paint job is clean. Two stars and you still made it. Impressive."',
  },
  {
    id: 'the-drop',
    title: 'M4 — The Drop',
    giver: 'Mara Solano',
    brief: 'A package waits at the docks. Pick it up on foot, then run it to Solmar Pier. The PD knows the route — bring speed.',
    reward: 1200,
    steps: [
      { type: 'goto', at: LANDMARKS.docks, radius: 8, text: 'Pick up the package at the Docks' },
      { type: 'driveTo', at: LANDMARKS.pier, radius: 10, text: 'Deliver the package to Solmar Pier' },
    ],
    done: '"Delivered. The pier crew owes us now. Solmar is yours, Riko — drive it like you own it."',
  },
  {
    id: 'long-way-home',
    title: 'M5 — The Long Way Home',
    giver: 'Mara Solano',
    brief: 'The PD has your plate now, and CONDOR-1 is in the air. Take the long way to the Docks and shake the air unit off your tail.',
    reward: 1500,
    wanted: 3,
    steps: [
      { type: 'driveTo', at: LANDMARKS.docks, radius: 10, time: 150, text: 'Lose the helicopter — reach the Docks' },
    ],
    done: '"The heli lost you in the container rows. Nice flying, Riko."',
  },
  {
    id: 'roadblock-run',
    title: 'M6 — Roadblock Run',
    giver: 'Mara Solano',
    brief: 'The PD sealed the streets with roadblocks. Punch through the checkpoints: Solmar Tower, then Rico Auto Garage. Do not stop.',
    reward: 1800,
    wanted: 2,
    steps: [
      { type: 'driveTo', at: LANDMARKS.tower, radius: 16, time: 120, text: 'Break through checkpoint 1 — Solmar Tower' },
      { type: 'driveTo', at: LANDMARKS.garage, radius: 10, time: 120, text: 'Break through checkpoint 2 — Rico Auto Garage' },
    ],
    done: '"Two roadblocks, zero stops. The PD is rethinking its whole strategy."',
  },
  {
    id: 'garage-heist',
    title: 'M7 — Garage Heist',
    giver: 'Mara Solano',
    brief: 'A van full of Rico\'s parts is sitting at the garage, keys in it. Take the van and run it to the Docks before the PD locks the yard down.',
    reward: 2200,
    steps: [
      { type: 'steal', at: LANDMARKS.garage, carId: 'heist-van', text: 'Take the parts van at Rico Auto Garage' },
      { type: 'driveTo', at: LANDMARKS.docks, radius: 10, text: 'Deliver the van to the Docks' },
    ],
    done: '"Rico\'s parts, intact. The garage crew is already spending the cut."',
  },
  {
    id: 'the-big-score',
    title: 'M8 — The Big Score',
    giver: 'Mara Solano',
    brief: 'One last job, the big one. Pick up the package at Solmar Tower and run it to the Pier with the whole PD on you — four stars, heli overhead, no mistakes.',
    reward: 3000,
    wanted: 4,
    steps: [
      { type: 'goto', at: LANDMARKS.tower, radius: 16, text: 'Pick up the package at Solmar Tower' },
      { type: 'driveTo', at: LANDMARKS.pier, radius: 10, time: 150, text: 'Run the package to Solmar Pier' },
    ],
    done: '"That\'s the last of it. Solmar is yours now, Riko — every street, every deal, every dollar."',
  },
];

export class Missions {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.index = 0; // next mission to run
    this.completed = [];
    this.active = null; // { mission, step }
    this.stepTimer = 0;
    this.marker = null; // { mesh, ring }
    this.fare = null; // repeatable taxi fare after the story
    this.objective = { text: 'Free roam — press M for missions', x: null, z: null };
    this.buildMarker();
  }

  buildMarker() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd21e, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beam.position.y = 30;
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.35, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd21e }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    group.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd21e }),
    );
    diamond.position.y = 9;
    group.add(diamond);
    group.visible = false;
    this.scene.add(group);
    this.marker = { group, diamond, ring };
  }

  setMarker(x, z) {
    if (x === null || x === undefined) {
      this.marker.group.visible = false;
      return;
    }
    this.marker.group.visible = true;
    this.marker.group.position.set(x, 0, z);
  }

  startMission(i) {
    const m = MISSIONS[i];
    if (!m) return false;
    this.active = { mission: m, step: 0 };
    this.stepTimer = 0;
    // Some jobs start hot: the PD is already on you when the brief lands.
    if (m.wanted) this.game.police.addWanted(m.wanted, this.game.timeSec);
    this.game.onMissionStart(m);
    this.refreshObjective();
    return true;
  }

  startNext() {
    if (this.index >= MISSIONS.length) return false;
    return this.startMission(this.index);
  }

  refreshObjective() {
    if (!this.active) {
      if (this.fare) {
        this.objective = { text: `Taxi fare: drop the passenger at the marker ($${this.fare.pay})`, x: this.fare.at.x, z: this.fare.at.z };
        this.setMarker(this.fare.at.x, this.fare.at.z);
        return;
      }
      this.objective = { text: 'Free roam — press M for the next job', x: null, z: null };
      this.setMarker(null);
      return;
    }
    const step = this.active.mission.steps[this.active.step];
    if (!step) { this.objective = { text: '', x: null, z: null }; this.setMarker(null); return; }
    this.objective = {
      text: `${this.active.mission.title}: ${step.text}`,
      x: step.at ? step.at.x : null,
      z: step.at ? step.at.z : null,
    };
    this.setMarker(this.objective.x, this.objective.z);
  }

  // Called when the player steals a car (used by the Hot Wheels step).
  // Only the marked car counts for that job (gold car for M3, parts van
  // for M7); any mission car counts when a step names no car.
  onCarStolen(car) {
    if (!this.active) return;
    const step = this.active.mission.steps[this.active.step];
    if (step && step.type === 'steal' && car.isMissionCar) {
      if (step.carId && car.missionId !== step.carId) return;
      this.advance();
    }
  }

  advance() {
    if (!this.active) return;
    this.active.step += 1;
    this.stepTimer = 0;
    if (this.active.step >= this.active.mission.steps.length) {
      this.completeMission();
    } else {
      this.refreshObjective();
    }
  }

  completeMission() {
    const m = this.active.mission;
    this.completed.push(m.id);
    this.index = this.completed.length;
    this.game.player.money += m.reward;
    this.game.onMissionComplete(m);
    this.active = null;
    this.game.saveGame();
    if (this.index < MISSIONS.length) {
      // Next job is one keypress away (M), so the player chooses the pace.
      this.objective = { text: `${m.title} complete — $${m.reward}. Press M for the next job.`, x: null, z: null };
      this.setMarker(null);
    } else {
      this.objective = { text: `Story complete — $${m.reward}. Taxi fares now pay around town. Press M for a fare.`, x: null, z: null };
      this.setMarker(null);
    }
  }

  failMission(reason) {
    if (!this.active) return;
    this.game.onMissionFailed(this.active.mission, reason);
    this.active = null;
    this.refreshObjective();
  }

  startFare(rng) {
    const spots = Object.values(LANDMARKS);
    const at = spots[Math.floor(rng() * spots.length)];
    this.fare = { at, pay: 150 + Math.floor(rng() * 4) * 50 };
    this.refreshObjective();
  }

  update(dt, player) {
    // Marker animation.
    if (this.marker.group.visible) {
      this.marker.diamond.rotation.y += dt * 2;
      this.marker.diamond.position.y = 9 + Math.sin(this.game.timeSec * 2) * 1.2;
      const s = 1 + Math.sin(this.game.timeSec * 3) * 0.08;
      this.marker.ring.scale.set(s, s, 1);
    }
    // Fare completion.
    if (this.fare && !this.active) {
      const dx = player.x - this.fare.at.x, dz = player.z - this.fare.at.z;
      if (dx * dx + dz * dz < 100) {
        player.money += this.fare.pay;
        this.game.onFareDone(this.fare);
        this.fare = null;
        this.game.saveGame();
        this.refreshObjective();
      }
    }
    if (!this.active) return;
    const step = this.active.mission.steps[this.active.step];
    if (!step) return;
    if (step.time !== undefined) {
      this.stepTimer += dt;
      if (this.stepTimer > step.time) {
        this.failMission('Out of time');
        return;
      }
    }
    switch (step.type) {
      case 'goto': {
        const dx = player.x - step.at.x, dz = player.z - step.at.z;
        if (dx * dx + dz * dz < step.radius * step.radius) this.advance();
        break;
      }
      case 'needCar': {
        if (player.mode === 'car') this.advance();
        break;
      }
      case 'driveTo': {
        if (player.mode !== 'car') break;
        const dx = player.x - step.at.x, dz = player.z - step.at.z;
        if (dx * dx + dz * dz < step.radius * step.radius) this.advance();
        break;
      }
      case 'steal': {
        // Advance happens in onCarStolen; the marker sits on the car spot.
        break;
      }
      default:
        break;
    }
  }

  get timeLeft() {
    if (!this.active) return null;
    const step = this.active.mission.steps[this.active.step];
    if (!step || step.time === undefined) return null;
    return Math.max(0, step.time - this.stepTimer);
  }
}

export { MISSIONS };
