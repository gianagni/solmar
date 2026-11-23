// Solmar — screenshot staging: ?shot=cover|foot|chase|mission sets the
// player, mission, wanted level, helicopter and roadblock so each of the
// four screenshots is reproducible. Called once at load in shot mode.
import { enterCar, makeCar } from './vehicles.js';
import { startMission } from './missions.js';
import { selectWeapon } from './weapons.js';
import { forceRoadblock, ensureHeli } from './police.js';

function putPlayerInCar(G, car, x, z, yaw) {
  car.pos.x = x;
  car.pos.z = z;
  car.yaw = yaw;
  car.speed = 9;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = yaw;
  enterCar(G, car);
  G.player.camYaw = yaw;
}

export function stageShot(G, name) {
  G.shot = name;
  const p = G.player;
  if (name === 'cover') {
    // Driving downtown on a mission, 1 star, a police car behind.
    const taxi = G.specialCars.taxi;
    putPlayerInCar(G, taxi, -40, 0, Math.PI / 2);
    startMission(G, 1);
    G.missions.active.stepIdx = 1; // already picked up: drive the fare east
    G.wanted = 1;
    G.hud.stars(1);
    G.audio.siren(true);
    // A pursuit car right behind the taxi, closing in.
    const pc = makeCar(G, 'police', 0xe8e8e8, -70, 2, Math.PI / 2);
    pc.driver = 'police';
    pc.speed = 10;
  } else if (name === 'foot') {
    // Riko on foot, back three-quarter, shotgun in hand, weapon bar lit.
    p.pos.x = 6;
    p.pos.z = 10;
    p.pos.y = 0;
    p.group.position.set(6, 0, 10);
    p.yaw = Math.PI; // facing the fountain (-Z)
    p.camYaw = Math.PI - 0.55; // camera behind-right: three-quarter view
    p.camPitch = 0.3;
    selectWeapon(G, 2);
    const ped = G.peds[0];
    if (ped) {
      ped.pos.x = 12;
      ped.pos.z = 4;
      ped.mesh.position.set(12, 0, 4);
    }
    const near = G.cars.find((c) => c.kind === 'parked');
    if (near) {
      near.pos.x = -6;
      near.pos.z = 14;
      near.mesh.position.set(-6, 0, 14);
    }
  } else if (name === 'chase') {
    // Wanted 3: CONDOR-1 overhead with its searchlight, a roadblock ahead,
    // a police car in front, toast on screen.
    const taxi = G.specialCars.taxi;
    putPlayerInCar(G, taxi, -100, 0, Math.PI / 2);
    G.wanted = 3;
    G.hud.stars(3);
    G.audio.siren(true);
    forceRoadblock(G, 30);
    // Park the heli ahead-above so the chase camera sees it in frame:
    // a wide low orbit (30u out, 12u up) keeps it inside the frame.
    const h = ensureHeli(G);
    h.orbitR = 30;
    h.height = 12;
    h.angle = Math.PI / 2;
    h.group.position.set(p.pos.x + 30, 12, p.pos.z);
    const pc = G.cars.find((c) => c.isPolice && !c.rb);
    if (pc) {
      pc.pos.x = -30;
      pc.pos.z = 0;
      pc.yaw = Math.PI / 2;
      pc.speed = 8;
    }
  } else if (name === 'mission') {
    // M6 Roadblock Run: banner and brief up, roadblock across the road
    // ahead, 2 stars, driving toward the Tower checkpoint.
    const gold = G.specialCars.gold;
    putPlayerInCar(G, gold, -100, 0, Math.PI / 2);
    startMission(G, 5);
    G.missions.active.stepIdx = 1; // checkpoint 1: Solmar Tower
    G.wanted = 2;
    G.hud.stars(2);
    G.audio.siren(true);
    forceRoadblock(G, 30);
  }
  // The page is ready for the screenshot once the scene has settled.
  setTimeout(() => {
    window.__shotReady = true;
  }, 1500);
}
