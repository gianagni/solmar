// Solmar — bootstrap and game loop. Builds every system, owns the shared
// state object G, the state machine (start / playing / paused / busted /
// wasted), and the camera. Everything original; nothing from Rockstar.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { buildPlayer, updatePlayer, updateCamera } from './player.js';
import { buildVehicles, updateVehicles, nearestStealableCar, enterCar, exitCar } from './vehicles.js';
import { buildPeds, updatePeds } from './peds.js';
import { buildPolice, updatePolice, damagePlayer, spawnCop } from './police.js';
import { buildWeapons, selectWeapon, fireWeapon, punch, updateWeapons } from './weapons.js';
import { buildMissions, startNextMission, updateMissions, startFare } from './missions.js';
import { initHud } from './hud.js';
import { initInput } from './input.js';
import { initAudio } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const SHOTS = ['cover', 'foot', 'chase', 'mission'];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const G = {
  scene, camera, renderer,
  time: 0, state: 'start', wanted: 0,
  flags: { talked: false },
  shot: null, saveTimer: 0,
  events: {},
};

// Events every system can call; defined before the modules that use them.
G.events.toast = (msg) => G.hud.toast(msg);
G.events.crash = (speed) => {
  if (speed > 18) damagePlayer(G, 4);
};
G.events.saveSoon = () => saveGame(G);

buildCity(G);
buildPlayer(G);
buildVehicles(G);
buildPeds(G);
buildPolice(G);
buildWeapons(G);
buildMissions(G);
initHud(G);
initInput(G);
initAudio(G);

// The rest of the events, wired after every module exists.
G.events.pressM = () => {
  if (G.state !== 'playing') return;
  const M = G.missions;
  if (M.active) {
    const a = M.active;
    G.hud.banner(a.def.id + ' — ' + a.def.title, a.def.brief);
    return;
  }
  if (M.done >= M.defs.length) {
    G.hud.toast('All 8 story missions complete — Solmar is yours.');
    return;
  }
  startNextMission(G);
};
G.events.pressE = () => {
  if (G.state !== 'playing') return;
  const p = G.player;
  if (!p.onFoot) {
    exitCar(G);
    return;
  }
  // Talk to Mara when her mission step asks for it.
  const M = G.missions;
  if (M.active) {
    const s = M.active.def.steps[M.active.stepIdx];
    if (s && s.type === 'talk') {
      const d = Math.hypot(p.pos.x - G.city.mara.x, p.pos.z - G.city.mara.z);
      if (d <= 4) {
        G.flags.talked = true;
        G.hud.toast('Mara: "Good. The city is waiting, Riko."');
        return;
      }
    }
  }
  // Steal the nearest car.
  const car = nearestStealableCar(G, p.pos.x, p.pos.z, 3.5);
  if (car) {
    enterCar(G, car);
    // A job car for the current mission step is arranged; any other car
    // is a theft and the law notices.
    let arranged = false;
    if (M.active) {
      const s = M.active.def.steps[M.active.stepIdx];
      if (s && s.type === 'enter') {
        const d = Math.hypot(car.pos.x - s.x, car.pos.z - s.z);
        if (d <= s.radius + 4) arranged = true;
      }
    }
    if (!arranged) G.events.addWanted(1, 'stole a car');
  }
};
G.events.pressPause = () => {
  if (G.state === 'playing') {
    G.state = 'paused';
    G.hud.showScreen('pause', 'Paused', 'Take a breath. Solmar waits.');
  } else if (G.state === 'paused') {
    G.events.resumeGame();
  }
};
G.events.resumeGame = () => {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  G.hud.hideScreens();
};
G.events.selectWeapon = (slot) => {
  if (G.state === 'playing' && G.player.onFoot) selectWeapon(G, slot);
};
G.events.pressT = () => {
  if (G.state !== 'playing') return;
  startFare(G);
};
G.events.startGame = (fromSave) => {
  G.audio.unlock();
  if (fromSave) {
    const s = loadGame();
    if (s) {
      G.player.money = s.money;
      G.player.health = s.health || 100;
      G.missions.done = Math.min(s.missionsDone, 8);
      G.player.pos.x = s.x;
      G.player.pos.z = s.z;
      G.player.group.position.set(s.x, 0, s.z);
      G.hud.toast('Welcome back, Riko. ' + G.missions.done + ' of 8 missions done.');
    }
  }
  G.hud.money(G.player.money);
  G.hud.health(G.player.health);
  G.hud.stars(0);
  G.hud.weaponBar(0);
  G.hud.objective('Press M to start the next mission.');
  G.state = 'playing';
  G.hud.hideScreens();
};
G.events.afterBusted = () => {};
G.events.afterWasted = () => {};

// A handle for play-testing from the browser console / Playwright: the
// whole game state, plus a way to place a foot cop next to the player.
window.__solmar = G;
G.debug = {
  spawnCop: (x, z) => spawnCop(G, x, z),
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Shot mode: skip the menu, stage the scene, play.
if (shotName && SHOTS.includes(shotName)) {
  G.hud.hideScreens();
  G.hud.money(G.player.money);
  G.hud.health(G.player.health);
  G.hud.weaponBar(0);
  G.state = 'playing';
  stageShot(G, shotName);
} else {
  const save = loadGame();
  if (save) {
    document.getElementById('btn-continue').style.display = '';
    document.getElementById('btn-continue').textContent =
      'Continue — ' + save.missionsDone + ' of 8 missions, $' + save.money;
  }
  G.hud.showScreen('start', 'SOLMAR', 'An original open-world crime game. Steal cars, outrun the Solmar PD, run 8 story jobs for Mara Solano.');
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.state === 'playing') {
    G.time += dt;
    // Tower beacon blinks.
    if (G.cityBeacon) {
      G.cityBeacon.material.color.setHex(Math.floor(G.time * 1.5) % 2 === 0 ? 0xff4444 : 0x881111);
    }
    updatePlayer(G, dt);
    updateVehicles(G, dt);
    updatePeds(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateWeapons(G, dt);
    // Hold mouse to shoot; F to punch.
    if (G.mouse.down && G.player.onFoot) fireWeapon(G);
    if (G.input.down('KeyF')) punch(G);
    // HUD.
    const p = G.player;
    G.hud.health(p.health);
    G.hud.driving(!p.onFoot);
    const speedKmh = p.onFoot ? p.speed * 3.6 : (p.car ? Math.abs(p.car.speed) * 3.6 : 0);
    G.hud.speed(speedKmh, !p.onFoot);
    G.hud.drawMinimap();
    G.audio.engine(!p.onFoot ? Math.abs(p.car.speed) / 30 : 0, !p.onFoot);
    // Autosave every 15 seconds.
    G.saveTimer += dt;
    if (G.saveTimer > 15) {
      G.saveTimer = 0;
      saveGame(G);
    }
    updateCamera(G, dt);
  } else if (G.state === 'start') {
    // Slow orbit over the city behind the title screen.
    const t = performance.now() * 0.00004;
    camera.position.set(Math.cos(t) * 90, 32, Math.sin(t) * 90);
    camera.lookAt(-20, 12, -20);
  }
  renderer.render(scene, camera);
}

animate();

// Surface any boot error on the page so a headless run can see it.
window.addEventListener('error', (e) => {
  const d = document.getElementById('boot-error');
  if (d) {
    d.style.display = 'block';
    d.textContent = 'Error: ' + e.message;
  }
});
