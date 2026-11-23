// Solmar — the story: 8 missions in sequence (M key), plus repeatable
// taxi fares. Every step names a place; Tower steps use radius 16 or more,
// because the Tower's 26x26 collider keeps the closest approach at ~13-15u.
import * as THREE from 'three';
import { makePersonMesh } from './player.js';
import { dist2, mulberry32, pick } from './util.js';

const REWARDS = [150, 200, 300, 350, 400, 500, 600, 1000];

function step(type, x, z, radius, label) {
  return { type, x, z, radius, label, done: false };
}

export function missionDefs(G) {
  const c = G.city;
  return [
    {
      id: 'M1', title: 'Meet Mara',
      brief: 'Mara Solano is waiting at the fountain square. Walk over and say hello — she has work for you.',
      steps: [
        step('goto', c.fountain.x, c.fountain.z, 6, 'Walk to the fountain square'),
        step('talk', c.mara.x, c.mara.z, 3, 'Talk to Mara (press E)'),
      ],
    },
    {
      id: 'M2', title: 'First Fare',
      brief: 'The taxi is waiting at the stand. Pick up your passenger and drive them across town — on time.',
      timer: 150,
      steps: [
        step('enter', c.taxiStand.x, c.taxiStand.z, 6, 'Get in the taxi at the stand'),
        step('driveTo', 152, -88, 8, 'Drive your fare to Marina East'),
      ],
    },
    {
      id: 'M3', title: 'Hot Wheels',
      brief: 'A gold coupe is parked on the west side. Steal it and bring it to the garage — no scratches, no cops.',
      steps: [
        step('enter', c.goldCar.x, c.goldCar.z, 6, 'Steal the gold car'),
        step('driveTo', c.garage.x, c.garage.z, 10, 'Deliver it to the garage'),
      ],
    },
    {
      id: 'M4', title: 'The Drop',
      brief: 'A package is waiting at the north depot. Drive it down to the pier before the buyer leaves.',
      timer: 120,
      steps: [
        step('goto', 80, -80, 6, 'Pick up the package at the north depot'),
        step('driveTo', c.pier.x, c.pier.z, 10, 'Drive the package to the pier'),
      ],
    },
    {
      id: 'M5', title: 'The Long Way Home',
      brief: 'The Docks are hot tonight. Get the heat on you — three stars — then slip through to the Docks.',
      steps: [
        step('heat', 0, 0, 0, 'Raise your wanted level to 3 stars'),
        step('driveTo', c.docks.x, c.docks.z, 8, 'Reach the Docks while wanted'),
      ],
    },
    {
      id: 'M6', title: 'Roadblock Run',
      brief: 'Two stars on your tail and two checkpoints to hit: the Tower, then the Garage. Do not stop for anyone.',
      timer: 120,
      steps: [
        step('heat', 0, 0, 0, 'Raise your wanted level to 2 stars'),
        step('driveTo', c.tower.x, c.tower.z, 16, 'Checkpoint 1: Solmar Tower'),
        step('driveTo', c.garage.x, c.garage.z, 16, 'Checkpoint 2: the Garage'),
      ],
    },
    {
      id: 'M7', title: 'Garage Heist',
      brief: 'The heist van is parked behind the garage. Take it and deliver it to the Docks — quietly.',
      steps: [
        step('enter', 40, 56, 6, 'Steal the heist van at the garage'),
        step('driveTo', c.docks2.x, c.docks2.z, 10, 'Deliver the van to the Docks'),
      ],
    },
    {
      id: 'M8', title: 'The Big Score',
      brief: 'Four stars, one package at the Tower, one drop at the Pier. This is the job Mara has been building toward.',
      timer: 180,
      steps: [
        step('heat', 0, 0, 0, 'Raise your wanted level to 4 stars'),
        step('goto', c.tower.x, c.tower.z, 16, 'Pick up the package at the Tower'),
        step('driveTo', c.pier.x, c.pier.z, 10, 'Deliver it to the Pier'),
      ],
    },
  ];
}

export function buildMissions(G) {
  // Mara Solano waits at the fountain — the face of the story.
  const mara = makePersonMesh({
    skin: 0xe8b898, shirt: 0xc65b4e, jacket: 0x8a2a4a,
    pants: 0x2a2a30, cap: 0x8a2a4a,
  });
  mara.userData.hideWeapon();
  mara.position.set(G.city.mara.x, 0, G.city.mara.z);
  mara.rotation.y = Math.PI;
  G.scene.add(mara);
  G.mara = mara;
  // The package marker: a glowing case that moves with the mission.
  const markerGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.6, 12, 1, true);
  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xffd24d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.visible = false;
  G.scene.add(marker);
  G.missionMarker = marker;
  G.missions = {
    defs: missionDefs(G),
    done: 0,
    active: null, // {def, stepIdx, timeLeft}
    fare: null, // {pickup, drop, phase, reward}
    bannerAt: -99,
  };
  G.missions.failActive = () => {
    if (G.missions.active) {
      G.events.toast('Mission failed: ' + G.missions.active.def.title);
      G.missions.active = null;
      G.hud.objective('Press M to start the next mission.');
      marker.visible = false;
    }
    G.missions.fare = null;
  };
  return G.missions;
}

export function startMission(G, index) {
  const M = G.missions;
  if (M.active || index >= M.defs.length) return false;
  const def = M.defs[index];
  M.active = { def, stepIdx: 0, timeLeft: def.timer || 0 };
  G.hud.banner(def.id + ' — ' + def.title, def.brief);
  G.audio.pickup();
  M.bannerAt = G.time;
  return true;
}

export function startNextMission(G) {
  return startMission(G, G.missions.done);
}

function completeStep(G) {
  const M = G.missions;
  const a = M.active;
  a.stepIdx++;
  G.audio.pickup();
  if (a.stepIdx >= a.def.steps.length) {
    const reward = REWARDS[M.done] || 100;
    G.player.money += reward;
    G.hud.money(G.player.money);
    G.hud.banner(a.def.id + ' complete', 'Paid $' + reward + '. ' + (M.done + 1 < M.defs.length ? 'Press M for the next job.' : 'That was the last job — Solmar is yours.'));
    G.audio.missionDone();
    M.done++;
    M.active = null;
    G.missionMarker.visible = false;
    G.events.saveSoon();
  }
}

function stepPos(G, s) {
  return { x: s.x, z: s.z };
}

export function updateMissions(G, dt) {
  const M = G.missions;
  const p = G.player;
  if (!M.active && !M.fare) {
    G.missionMarker.visible = false;
    return;
  }
  if (M.active) {
    const a = M.active;
    if (a.def.timer) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) {
        G.events.toast('Out of time: ' + a.def.title);
        M.failActive();
        return;
      }
    }
    const s = a.def.steps[a.stepIdx];
    if (!s) return;
    const pos = stepPos(G, s);
    // Marker beacon on the current step.
    G.missionMarker.visible = true;
    G.missionMarker.position.set(pos.x, 1.3, pos.z);
    G.missionMarker.rotation.y += dt * 1.5;
    const d = dist2(p.pos.x, p.pos.z, pos.x, pos.z);
    const inCar = !p.onFoot;
    let done = false;
    if (s.type === 'goto') done = d <= s.radius;
    else if (s.type === 'driveTo') done = inCar && d <= s.radius;
    else if (s.type === 'enter') done = inCar && d <= s.radius + 4;
    else if (s.type === 'talk') done = d <= s.radius && G.flags.talked;
    else if (s.type === 'heat') done = G.wanted >= (a.def.id === 'M5' ? 3 : a.def.id === 'M6' ? 2 : 4);
    if (done) {
      G.flags.talked = false;
      completeStep(G);
      return;
    }
    const timerText = a.def.timer ? '  ·  ' + Math.ceil(a.timeLeft) + 's' : '';
    G.hud.objective(a.def.id + ' — ' + s.label + '  ·  ' + Math.round(d) + 'm' + timerText);
    return;
  }
  // Taxi fare: pickup, then drop-off.
  const f = M.fare;
  const target = f.phase === 'pickup' ? f.pickup : f.drop;
  G.missionMarker.visible = true;
  G.missionMarker.position.set(target.x, 1.3, target.z);
  G.missionMarker.rotation.y += dt * 1.5;
  const d = dist2(p.pos.x, p.pos.z, target.x, target.z);
  const needCar = true;
  if (d <= 7 && (!needCar || !p.onFoot)) {
    if (f.phase === 'pickup') {
      f.phase = 'drop';
      G.events.toast('Passenger aboard — drive to the marker.');
      G.audio.pickup();
    } else {
      G.player.money += f.reward;
      G.hud.money(G.player.money);
      G.events.toast('Fare complete: +$' + f.reward);
      G.audio.cash();
      M.fare = null;
      G.missionMarker.visible = false;
      G.hud.objective('Press M to start the next mission.');
    }
  } else {
    G.hud.objective('Taxi fare — ' + (f.phase === 'pickup' ? 'pick up your passenger' : 'drop them off') + '  ·  ' + Math.round(d) + 'm');
  }
}

export function startFare(G) {
  const M = G.missions;
  if (M.active || M.fare || M.done < 2) return false;
  const rng = G.fareRng || (G.fareRng = mulberry32(20240));
  const lines = G.city.roads;
  const pt = () => ({
    x: pick(rng, lines) + (rng() > 0.5 ? 8 : -8),
    z: pick(rng, lines) + (rng() > 0.5 ? 8 : -8),
  });
  const pickup = pt();
  let drop = pt();
  while (dist2(pickup.x, pickup.z, drop.x, drop.z) < 120) drop = pt();
  const reward = 40 + Math.floor(rng() * 5) * 10;
  M.fare = { pickup, drop, phase: 'pickup', reward };
  G.events.toast('New fare: pick up the passenger at the marker.');
  return true;
}
