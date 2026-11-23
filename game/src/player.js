// Solmar — Riko Vane, the player character: a 3D low-poly figure with
// correct anatomy (shoulders along local Z, limbs at the sides, a forward
// walk swing), jacket, V-neck shirt, belt, collar, cap with brim, shoes,
// and a weapon in the right hand, scaled per weapon.
import * as THREE from 'three';
import { clamp, slideMove, angleLerp } from './util.js';

// One reusable low-poly person. colours: {skin, shirt, jacket, pants, cap}.
export function makePersonMesh(colours) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat(colours.skin || 0xd9a184);
  const shirt = mat(colours.shirt || 0xe8e0d0);
  const jacket = mat(colours.jacket || 0x2e5a6b);
  const pants = mat(colours.pants || 0x2a2a30);
  const capM = mat(colours.cap || 0xc65b4e);

  const add = (mesh, x, y, z, parent) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || g).add(mesh);
    return mesh;
  };
  // Legs (pants) with shoes.
  const legL = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.26), pants), -0.14, 0.42, 0);
  const legR = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.26), pants), 0.14, 0.42, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.42), mat(0x1a1a1e)), -0.14, 0.05, 0.06, legL);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.42), mat(0x1a1a1e)), 0.14, 0.05, 0.06, legR);
  // Torso: jacket, V-neck shirt, belt, collar.
  const torso = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket), 0, 1.18, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.06), shirt), 0, 1.24, 0.19, torso);
  const vLeft = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.02), jacket), -0.09, 1.42, 0.23, torso);
  vLeft.rotation.z = 0.5;
  const vRight = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.02), jacket), 0.09, 1.42, 0.23, torso);
  vRight.rotation.z = -0.5;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.38), mat(0x1a1a1e)), 0, 0.84, 0, torso);
  const colL = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.2), jacket), -0.12, 1.56, 0.02, torso);
  colL.rotation.x = -0.3;
  const colR = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.2), jacket), 0.12, 1.56, 0.02, torso);
  colR.rotation.x = -0.3;
  // Arms at the sides.
  const armL = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), jacket), -0.41, 1.2, 0);
  const armR = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), jacket), 0.41, 1.2, 0);
  // Head with cap and brim.
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin), 0, 1.78, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), capM), 0, 1.98, 0, head);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.24), capM), 0, 1.93, 0.26, head);

  // Weapon in the right hand, one mesh per slot, toggled by the weapon bar.
  const hand = new THREE.Group();
  hand.position.set(0.41, 0.88, 0.1);
  armR.add(hand);
  const dark = mat(0x222226);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), dark);
  grip.position.set(0, -0.05, 0.05);
  hand.add(grip);
  const pistol = new THREE.Group();
  const pBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), dark);
  pBarrel.position.set(0, 0.02, 0.16);
  pistol.add(pBarrel);
  hand.add(pistol);
  const smg = new THREE.Group();
  const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), dark);
  sBody.position.set(0, 0.02, 0.22);
  smg.add(sBody);
  const sMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), dark);
  sMag.position.set(0, -0.08, 0.18);
  smg.add(sMag);
  smg.visible = false;
  hand.add(smg);
  const shotgun = new THREE.Group();
  const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.72), mat(0x4a3a28));
  gBarrel.position.set(0, 0.02, 0.34);
  shotgun.add(gBarrel);
  const gPump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), dark);
  gPump.position.set(0, -0.02, 0.3);
  shotgun.add(gPump);
  shotgun.visible = false;
  hand.add(shotgun);

  g.userData = {
    legL, legR, armL, armR, head, hand,
    weapons: [pistol, smg, shotgun],
    // Show one weapon mesh; hide the hand group while driving.
    showWeapon(slot) {
      g.userData.weapons.forEach((w, i) => (w.visible = i === slot));
      hand.visible = true;
    },
    hideWeapon() {
      hand.visible = false;
    },
  };
  return g;
}

export function buildPlayer(G) {
  const group = makePersonMesh({
    skin: 0xd9a184, shirt: 0xe8e0d0, jacket: 0x2e5a6b,
    pants: 0x2a2a30, cap: 0xc65b4e,
  });
  group.position.set(-140, 0, 138);
  G.scene.add(group);
  const p = {
    group,
    pos: group.position,
    yaw: 0, // facing +Z
    camYaw: 0,
    camPitch: 0.32,
    onFoot: true,
    car: null,
    health: 100,
    money: 2200,
    weapon: 0,
    fireCooldown: 0,
    punchCooldown: 0,
    walkPhase: 0,
    moving: false,
    speed: 0,
    radius: 0.6,
  };
  G.player = p;
  return p;
}

// Third-person camera: behind the player on foot, chase cam in a car.
export function updateCamera(G, dt) {
  const p = G.player;
  const cam = G.camera;
  const m = G.input.takeMouse();
  if (G.state === 'playing') {
    p.camYaw -= m.dx * 0.0032;
    p.camPitch = clamp(p.camPitch + m.dy * 0.0024, -0.12, 0.9);
  }
  let target;
  let dist;
  let height;
  if (p.onFoot) {
    target = p.pos;
    dist = 7.5;
    height = 2.6 + p.camPitch * 4;
  } else if (p.car) {
    target = p.car.pos;
    dist = 11;
    height = 4.2;
    // Chase cam sits behind the car: camYaw follows the car's heading, so
    // the camera looks where the car is going.
    p.camYaw = angleLerp(p.camYaw, p.car.yaw, Math.min(1, dt * 3));
  }
  const cx = target.x - Math.sin(p.camYaw) * dist;
  const cz = target.z - Math.cos(p.camYaw) * dist;
  cam.position.set(cx, height, cz);
  cam.lookAt(target.x, target.y + 1.6, target.z);
}

export function updatePlayer(G, dt) {
  const p = G.player;
  if (G.state !== 'playing') return;
  // In a car the player's position IS the car's position: missions, the
  // police, the heli and the minimap all read p.pos.
  if (!p.onFoot) {
    if (p.car) {
      p.pos.x = p.car.pos.x;
      p.pos.z = p.car.pos.z;
    }
    return;
  }
  const input = G.input;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  const run = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = run ? 9 : 5;
  let fx = 0;
  let fz = 0;
  if (input.down('KeyW')) fz += 1;
  if (input.down('KeyS')) fz -= 1;
  if (input.down('KeyA')) fx -= 1;
  if (input.down('KeyD')) fx += 1;
  const len = Math.hypot(fx, fz);
  p.moving = len > 0;
  if (p.moving) {
    fx /= len;
    fz /= len;
    // Movement is relative to the camera: W walks away from the camera
    // (along the view direction), D strafes to the camera's right.
    const sin = Math.sin(p.camYaw);
    const cos = Math.cos(p.camYaw);
    const wx = sin * fz + cos * fx;
    const wz = cos * fz - sin * fx;
    const moved = slideMove(p.pos.x, p.pos.z, wx * speed * dt, wz * speed * dt, p.radius, G.colliders.boxes, G.colliders.circles);
    p.pos.x = moved.x;
    p.pos.z = moved.z;
    p.speed = speed;
    p.walkPhase += dt * speed * 1.6;
    p.yaw = Math.atan2(wx, wz);
  } else {
    p.speed = 0;
  }
  // Walk swing: arms and legs swing opposite, forward, while moving.
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const u = G.player.group.userData;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8;
  u.armR.rotation.x = swing * 0.8;
  u.armR.rotation.x = p.weapon >= 0 ? -0.9 : u.armR.rotation.x; // right arm holds the weapon forward
  p.group.rotation.y = p.yaw;
  // Slow health regen when nobody is after the player.
  if (G.wanted === 0 && p.health < 100) p.health = Math.min(100, p.health + 2 * dt);
}
