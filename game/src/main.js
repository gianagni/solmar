// Solmar — bootstrap, game loop, camera, crime detection and the screens.
// An original open-world crime game: drive, steal, run from the Solmar PD,
// work jobs for Mara Solano, and take the city for yourself.

import * as THREE from 'three';
import { mulberry32, clamp, angleLerp } from './util.js';
import { createCity, LANDMARKS } from './city.js';
import { Car, Traffic, CAR_MODELS } from './vehicles.js';
import { Pedestrians } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Heli } from './heli.js';
import { Roadblocks } from './roadblocks.js';
import { Missions, MISSIONS } from './missions.js';
import { AudioSys } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { parseShot, applyShot } from './shots.js';

const SEED = 20261122;

class Game {
  constructor() {
    this.timeSec = 0;
    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.camYaw = 0;
    this.camOffset = 0;
    this.camLift = 0; // staged shots can tilt the camera up (heli in frame)
    this.autopilot = false;
    this.autoWaypoint = 0;
    this.hintText = '';
    this.crimeCooldown = 0;
    this.saveCooldown = 0;
    this.shot = parseShot();

    // Renderer / scene.
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8d8);
    this.scene.fog = new THREE.Fog(0x9ab8cc, 180, 620);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    // Opening view over downtown for the title screen.
    this.camera.position.set(90, 110, 150);
    this.camera.lookAt(0, 0, 0);

    // Golden-afternoon sun + soft sky light.
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd8ee, 0x6a5a44, 0.9));

    // World and systems.
    this.city = createCity(this.scene, SEED + this.shot.seed);
    this.traffic = new Traffic(this.scene, this.city, SEED + this.shot.seed, 12, 10);
    this.peds = new Pedestrians(this.scene, this.city, SEED + this.shot.seed, 22);
    this.player = new Player(this.scene, -40, 44);
    this.police = new Police(this.scene, this.city, this);
    this.heli = new Heli(this.scene, this.city, this);
    this.roadblocks = new Roadblocks(this.scene, this.city, this);
    this.missions = new Missions(this.scene, this);
    this.audio = new AudioSys();
    this.hud = new HUD(this);
    this.input = new Input(canvas);

    // The gold sports car for the Hot Wheels job, parked by the plaza.
    const gold = new Car(this.scene, 'sports', 0xffd21e, -116, -184, Math.PI / 2);
    gold.isMissionCar = true;
    gold.missionId = 'gold-car';
    this.traffic.cars.push({ car: gold, kind: 'parked' });
    this.missionCar = gold;
    // The parts van for the Garage Heist job, parked at Rico Auto Garage.
    const van = new Car(this.scene, 'van', 0x4a9a5a, -116, 116, Math.PI / 2);
    van.isMissionCar = true;
    van.missionId = 'heist-van';
    this.traffic.cars.push({ car: van, kind: 'parked' });
    this.heistVan = van;

    // Health pickups: glowing crosses that respawn.
    this.pickups = [];
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x3ad84a });
    for (const s of this.city.pickupSpots) {
      const g = new THREE.Group();
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), crossMat);
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.5), crossMat);
      g.add(v); g.add(h);
      g.position.set(s.x, 1.4, s.z);
      this.scene.add(g);
      this.pickups.push({ mesh: g, x: s.x, z: s.z, timer: 0, active: true });
    }

    this.bindMenu();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('error', (e) => {
      window.__solmar.errors.push(String(e.message || e.error));
    });

    // Staged screenshot states (?shot=...). Skip the menu for play shots.
    if (this.shot.shot !== 'start') {
      applyShot(this, this.shot.shot, this.shot.seed);
      document.getElementById('menu').classList.add('hidden');
    } else {
      this.updateMenuButtons();
    }

    this.last = performance.now();
    this.frames = 0;
    this.renderer.setAnimationLoop(() => this.loop());
    // Automation hook: screenshots wait on this.
    setTimeout(() => { window.__solmar.ready = true; }, 600);
  }

  // --- menus ---------------------------------------------------------------
  bindMenu() {
    const menu = document.getElementById('menu');
    const pause = document.getElementById('pause');
    const over = document.getElementById('gameover');
    document.getElementById('start-btn').addEventListener('click', () => {
      this.audio.init();
      this.audio.click();
      menu.classList.add('hidden');
      this.state = 'playing';
      this.missions.startNext();
      this.hud.toast('Mara wants to meet you. Follow the yellow marker.', 5);
    });
    document.getElementById('continue-btn').addEventListener('click', () => {
      this.audio.init();
      this.audio.click();
      const data = loadGame();
      if (data) this.applySave(data);
      menu.classList.add('hidden');
      this.state = 'playing';
      this.hud.toast('Welcome back to Solmar.', 4);
    });
    document.getElementById('resume-btn').addEventListener('click', () => {
      pause.classList.add('hidden');
      this.state = 'playing';
    });
    document.getElementById('save-btn').addEventListener('click', () => {
      this.saveGame();
      this.hud.toast('Game saved.', 2.5);
    });
    document.getElementById('quit-btn').addEventListener('click', () => {
      pause.classList.add('hidden');
      menu.classList.remove('hidden');
      this.state = 'menu';
      this.updateMenuButtons();
    });
    document.getElementById('over-btn').addEventListener('click', () => {
      over.classList.add('hidden');
      this.state = 'playing';
      this.hud.toast('Back on your feet. Stay out of trouble.', 4);
    });
    document.getElementById('mute-btn').addEventListener('click', () => {
      this.audio.init();
      this.audio.setMuted(!this.audio.muted);
      document.getElementById('mute-btn').textContent = this.audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
    });
  }

  updateMenuButtons() {
    document.getElementById('continue-btn').style.display = hasSave() ? '' : 'none';
  }

  applySave(data) {
    this.player.money = data.money ?? 250;
    this.player.health = data.health ?? 100;
    this.player.x = data.x ?? -40;
    this.player.z = data.z ?? 44;
    this.player.heading = data.heading ?? 0;
    this.player.mode = 'foot';
    this.player.mesh.visible = true;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.missions.completed = (data.missionsDone || []).slice();
    this.missions.index = data.missionIndex ?? this.missions.completed.length;
    this.missions.active = null;
    this.missions.refreshObjective();
  }

  saveGame() {
    if (saveGame(this)) this.saveCooldown = 1;
  }

  // --- cars ----------------------------------------------------------------
  spawnPlayerCar(model, color, x, z, heading) {
    const car = new Car(this.scene, model, color, x, z, heading);
    return car;
  }

  // --- callbacks from the systems ------------------------------------------
  onCrash(intensity) {
    this.audio.crash(intensity);
  }

  onCopShot() {
    this.audio.shot();
  }

  onMissionStart(m) {
    this.hud.banner(m.title, m.brief, 4);
    this.audio.pickup();
  }

  onMissionComplete(m) {
    this.hud.banner(`${m.title} — COMPLETE`, `+$${m.reward}. ${m.done}`, 5);
    this.audio.missionDone();
  }

  onMissionFailed(m, reason) {
    this.hud.banner(`${m.title} — FAILED`, `${reason}. Press M to retry the job.`, 4);
    this.audio.missionFail();
  }

  onFareDone(fare) {
    this.hud.toast(`Fare complete — +$${fare.pay}.`, 3);
    this.audio.pickup();
  }

  onBusted() {
    if (this.state !== 'playing') return;
    const fine = Math.min(this.player.money, Math.max(50, Math.floor(this.player.money * 0.15)));
    this.player.money -= fine;
    this.police.clearHeat();
    if (this.missions.active) this.missions.failMission('Busted by the PD');
    this.state = 'busted';
    this.audio.busted();
    this.showOver('BUSTED', `The Solmar PD caught you. Fine: $${fine}. Your car was impounded — you're on foot at the station.`);
    // Respawn on foot at the police station.
    if (this.player.car) {
      this.player.car = null;
      this.player.mode = 'foot';
      this.player.mesh.visible = true;
    }
    this.player.x = LANDMARKS.policeStation.x + 14;
    this.player.z = LANDMARKS.policeStation.z;
    this.player.heading = 0;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.saveGame();
  }

  onWasted() {
    if (this.state !== 'playing') return;
    const lost = Math.min(this.player.money, Math.max(25, Math.floor(this.player.money * 0.1)));
    this.player.money -= lost;
    this.police.clearHeat();
    if (this.missions.active) this.missions.failMission('You got wasted');
    this.state = 'wasted';
    this.audio.busted();
    this.showOver('WASTED', `You woke up at St. Lumen Hospital. Medical bill: $${lost}.`);
    if (this.player.car) {
      this.player.car = null;
      this.player.mode = 'foot';
      this.player.mesh.visible = true;
    }
    this.player.health = 100;
    this.player.x = LANDMARKS.hospital.x + 16;
    this.player.z = LANDMARKS.hospital.z;
    this.player.heading = 0;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.saveGame();
  }

  showOver(title, sub) {
    document.getElementById('over-title').textContent = title;
    document.getElementById('over-sub').textContent = sub;
    document.getElementById('gameover').classList.remove('hidden');
  }

  // --- crime detection ------------------------------------------------------
  commitCrime(stars, nowSec) {
    if (this.crimeCooldown > 0) return;
    this.crimeCooldown = 3;
    this.police.addWanted(stars, nowSec);
    this.hud.toast(stars > 1 ? `Wanted level up! The PD is on you.` : `The PD noticed that.`, 2.5);
  }

  // --- main loop ------------------------------------------------------------
  loop() {
    const now = performance.now();
    let dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (this.state !== 'playing') {
      // Menus still render; the world freezes.
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }
    this.timeSec += dt;
    const nowSec = this.timeSec;
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    const input = this.input;
    const p = this.player;

    // Global keys.
    if (input.wasPressed('Escape')) {
      this.state = 'paused';
      document.getElementById('pause').classList.remove('hidden');
    }
    if (input.wasPressed('KeyM')) {
      if (!this.missions.active) {
        if (this.missions.index < MISSIONS.length) this.missions.startNext();
        else this.missions.startFare(Math.random);
      }
    }
    // Weapon slots: 1 pistol, 2 SMG, 3 shotgun.
    if (input.wasPressed('Digit1')) { p.switchWeapon(0); this.hud.toast('Pistol', 1); }
    if (input.wasPressed('Digit2')) { p.switchWeapon(1); this.hud.toast('SMG', 1); }
    if (input.wasPressed('Digit3')) { p.switchWeapon(2); this.hud.toast('Shotgun', 1); }
    if (input.wasPressed('KeyN')) {
      this.audio.setMuted(!this.audio.muted);
      this.hud.toast(this.audio.muted ? 'Sound off' : 'Sound on', 1.5);
    }
    if (input.wasPressed('KeyP')) {
      this.saveGame();
      this.hud.toast('Game saved.', 2);
    }

    // Camera orbit with mouse drag.
    const md = input.takeMouseDelta();
    this.camOffset += md.x * 0.004;
    this.camOffset = clamp(this.camOffset, -2.2, 2.2);

    // --- player -------------------------------------------------------------
    if (p.mode === 'foot') {
      p.updateFoot(dt, input, this.camYaw, this.city);
      // Enter a car.
      if (input.wasPressed('KeyE')) {
        const car = this.traffic.nearestCar(p.x, p.z, 4.5);
        if (car) {
          const moving = this.traffic.cars.find((t) => t.car === car);
          const occupied = moving && moving.kind === 'moving';
          const policeNear = this.police.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 60);
          this.traffic.remove(car);
          p.enterCar(car);
          this.audio.click();
          if (occupied || policeNear) this.commitCrime(1, nowSec);
          this.missions.onCarStolen(car);
          this.hud.toast(occupied ? 'You jacked a moving car!' : 'You took the car.', 2);
        }
      }
      // Punch.
      if (input.wasPressed('KeyF')) {
        const targets = [...this.peds.peds, ...this.police.cops];
        const hit = p.punch(targets);
        if (hit) {
          this.audio.punch();
          if (hit.health !== undefined && this.police.cops.includes(hit)) {
            this.police.hitCop(hit, nowSec);
          } else {
            hit.knockDown();
            this.commitCrime(1, nowSec);
            this.peds.scareNear(p.x, p.z, 25, 1);
          }
        } else {
          this.audio.punch();
        }
      }
      // Shoot while the mouse is held: the weapon's own fire rate paces it.
      if (input.mouseDown && p.shootCooldown <= 0) {
        const camDir = this.cameraAimDir();
        const targets = [];
        for (const ped of this.peds.peds) {
          if (ped.state !== 'down') targets.push({ x: ped.x, z: ped.z, radius: 1, ref: ped, kind: 'ped' });
        }
        for (const cop of this.police.cops) {
          if (cop.state !== 'down') targets.push({ x: cop.x, z: cop.z, radius: 1, ref: cop, kind: 'cop' });
        }
        for (const car of this.police.cars) {
          targets.push({ x: car.x, z: car.z, radius: 2.6, ref: car, kind: 'policecar' });
        }
        const hit = p.shoot(camDir, targets, p.weapon);
        this.audio.shot();
        this.peds.scareNear(p.x, p.z, 40, 1);
        if (hit) {
          if (hit.kind === 'ped') {
            hit.ref.knockDown();
            this.commitCrime(1, nowSec);
          } else if (hit.kind === 'cop') {
            this.police.hitCop(hit.ref, nowSec, p.weapon.damage);
          } else {
            this.commitCrime(1, nowSec);
          }
          this.hud.toast('Hit!', 1);
        }
      }
    } else if (p.mode === 'car' && p.car) {
      const car = p.car;
      const throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
        + (input.isDown('KeyS') || input.isDown('ArrowDown') ? -1 : 0);
      const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0)
        + (input.isDown('KeyD') || input.isDown('ArrowRight') ? -1 : 0);
      const handbrake = input.isDown('Space');
      let crashed = 0;
      if (this.autopilot) {
        crashed = this.autopilotDrive(dt, car);
      } else {
        crashed = car.drive(dt, throttle, steer, handbrake, this.city);
      }
      if (crashed > 0) this.audio.crash(crashed);
      // The player rides in the car: position, heading, camera, police,
      // missions and the minimap all follow the car from here on.
      p.x = car.x; p.z = car.z; p.heading = car.heading;
      // Exit the car.
      if (input.wasPressed('KeyE') && Math.abs(car.speed) < 3) {
        const old = p.exitCar();
        if (old) {
          // Leave the car where it is, as a parked car again.
          this.traffic.cars.push({ car: old, kind: 'parked' });
          this.audio.click();
        }
      }
      // Hitting pedestrians with the car.
      for (const ped of this.peds.peds) {
        if (ped.state === 'down') continue;
        const d2 = (ped.x - car.x) ** 2 + (ped.z - car.z) ** 2;
        if (d2 < 4.8 && Math.abs(car.speed) > 3) {
          ped.knockDown();
          this.commitCrime(1, nowSec);
          this.peds.scareNear(car.x, car.z, 25, 1);
          this.audio.crash(10);
          car.speed *= 0.7;
        }
      }
      // Ramming a police car.
      for (const pc of this.police.cars) {
        const d2 = (pc.x - car.x) ** 2 + (pc.z - car.z) ** 2;
        if (d2 < 14 && Math.abs(car.speed) > 8) {
          this.commitCrime(1, nowSec);
          car.speed *= 0.6;
          pc.speed *= 0.5;
        }
      }
      this.audio.engine(Math.abs(car.speed) / car.def.topSpeed, Math.max(0, throttle), true);
    }

    // --- world ---------------------------------------------------------------
    const playerCar = p.mode === 'car' ? p.car : null;
    const otherCars = [p.car, ...this.police.cars].filter(Boolean);
    this.traffic.update(dt, playerCar, otherCars);
    this.peds.update(dt, p.pos);
    this.police.update(dt, p, nowSec);
    this.heli.update(dt, p);
    this.roadblocks.update(dt, p);
    this.missions.update(dt, p);

    // Health pickups.
    for (const pk of this.pickups) {
      if (!pk.active) {
        pk.timer -= dt;
        if (pk.timer <= 0) { pk.active = true; pk.mesh.visible = true; }
        continue;
      }
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 1.4 + Math.sin(nowSec * 2 + pk.x) * 0.25;
      const d2 = (p.x - pk.x) ** 2 + (p.z - pk.z) ** 2;
      if (d2 < 6.5 && p.health < 100) {
        p.heal(40);
        pk.active = false;
        pk.mesh.visible = false;
        pk.timer = 30;
        this.audio.pickup();
        this.hud.toast('Health +40', 2);
      }
    }

    // Traffic cars can knock peds down too (no wanted for that).
    for (const t of this.traffic.cars) {
      if (t.kind !== 'moving') continue;
      for (const ped of this.peds.peds) {
        if (ped.state === 'down') continue;
        const d2 = (ped.x - t.car.x) ** 2 + (ped.z - t.car.z) ** 2;
        if (d2 < 4.5 && Math.abs(t.car.speed) > 5) ped.knockDown();
      }
    }

    // Wasted?
    if (p.health <= 0) this.onWasted();

    // Siren when wanted.
    this.audio.siren(this.police.wanted > 0);

    // --- camera ---------------------------------------------------------------
    this.updateCamera(dt);

    // --- HUD ------------------------------------------------------------------
    this.hintText = this.computeHint();
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.frames += 1;
  }

  autopilotDrive(dt, car) {
    // Cruise a downtown loop so the cover shot shows real driving.
    const loop = [
      { x: -40, z: 40 }, { x: 120, z: 40 }, { x: 120, z: -40 }, { x: -40, z: -40 },
    ];
    const wp = loop[this.autoWaypoint % loop.length];
    const dx = wp.x - car.x, dz = wp.z - car.z;
    if (dx * dx + dz * dz < 64) this.autoWaypoint += 1;
    const want = Math.atan2(-dz, dx);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * 1.6, -1, 1);
    return car.drive(dt, 0.75, steer, false, this.city);
  }

  cameraAimDir() {
    // Direction the camera looks, flattened to the ground plane.
    const e = new THREE.Vector3();
    this.camera.getWorldDirection(e);
    const len = Math.hypot(e.x, e.z) || 1;
    return { x: e.x / len, z: e.z / len };
  }

  updateCamera(dt) {
    const p = this.player;
    // Base yaw follows the player; mouse drag offsets it, then it eases back.
    const targetYaw = p.mode === 'car' && p.car ? p.car.heading : p.heading;
    this.camOffset = angleLerp(this.camOffset, 0, dt * 0.4);
    this.camYaw = angleLerp(this.camYaw, targetYaw + this.camOffset, clamp(dt * 3.2, 0, 1));
    const dist = p.mode === 'car' ? 12 : 8;
    const height = p.mode === 'car' ? 4.8 : 3.4;
    const cx = p.x - Math.cos(this.camYaw) * dist;
    const cz = p.z + Math.sin(this.camYaw) * dist;
    const lookX = p.x + Math.cos(this.camYaw) * 5;
    const lookZ = p.z - Math.sin(this.camYaw) * 5;
    this.camera.position.x = lerp2(this.camera.position.x, cx, clamp(dt * 6, 0, 1));
    this.camera.position.y = lerp2(this.camera.position.y, height, clamp(dt * 6, 0, 1));
    this.camera.position.z = lerp2(this.camera.position.z, cz, clamp(dt * 6, 0, 1));
    this.camera.lookAt(lookX, 1.6 + this.camLift, lookZ);
  }

  computeHint() {
    const p = this.player;
    if (p.mode === 'foot') {
      const car = this.traffic.nearestCar(p.x, p.z, 4.5);
      if (car) return 'E — Get in car';
      return 'WASD move · Shift run · E enter car · Click shoot · F punch · 1/2/3 weapons';
    }
    return 'WASD drive · Space handbrake · E exit car · M next job · P save · N sound';
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function lerp2(a, b, t) { return a + (b - a) * t; }

// Automation hook for screenshots and tests.
window.__solmar = {
  ready: false,
  errors: [],
  shot: new URLSearchParams(window.location.search).get('shot') || 'start',
  state: () => window.__game ? window.__game.state : 'booting',
  snapshot: () => {
    const g = window.__game;
    if (!g) return null;
    return {
      state: g.state,
      mode: g.player.mode,
      x: Math.round(g.player.x),
      z: Math.round(g.player.z),
      health: Math.round(g.player.health),
      money: Math.floor(g.player.money),
      wanted: g.police.wanted,
      mission: g.missions.objective.text,
      missionIndex: g.missions.index,
      missionsDone: g.missions.completed.length,
      heli: g.heli.active,
      roadblocks: g.roadblocks.blocks.length,
      weapon: g.player.weapon.id,
      traffic: g.traffic.cars.length,
      peds: g.peds.peds.length,
      policeCars: g.police.cars.length,
    };
  },
};

try {
  window.__game = new Game();
} catch (err) {
  window.__solmar.errors.push(String(err && err.message ? err.message : err));
  const el = document.getElementById('webgl-error');
  if (el) {
    el.textContent = `Solmar could not start: ${err && err.message ? err.message : err}`;
    el.classList.remove('hidden');
  }
}
