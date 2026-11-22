// Solmar — deterministic staged states for screenshots (?shot=...&seed=).
// Each shot shows a different system of the game at its best:
//   start   — the title screen
//   play    — driving downtown in traffic (the cover)
//   foot    — on foot among pedestrians
//   chase   — a three-star police chase
//   mission — a mission in progress, beacon and objective visible
// The game also exposes window.__solmar for automation: ready, shot, errors,
// and a small state snapshot. Screenshots are real renders of the game.

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || 'start',
    seed: parseInt(q.get('seed') || '1', 10) || 1,
  };
}

// Applies a staged state after the world is built. Returns true when the
// game should skip the title screen and start playing at once.
export function applyShot(game, shot, seed) {
  const g = game;
  if (shot === 'start') return false;
  g.state = 'playing';
  g.audio.init();
  if (shot === 'foot') {
    // On foot on the plaza, pedestrians strolling past, shotgun in hand.
    g.player.x = -116;
    g.player.z = -180;
    g.player.heading = Math.PI / 2;
    g.player.mode = 'foot';
    g.player.switchWeapon(2);
    g.camYaw = Math.PI / 2 + 0.9; // three-quarter rear view: gun side visible
    g.hud.toast('Solmar — on foot in Plaza del Sol', 6);
    return true;
  }
  if (shot === 'chase') {
    // In a sports car downtown, three stars, CONDOR-1 overhead and patrol
    // cars already on the tail — spawned close so they read in the frame.
    const car = g.spawnPlayerCar('sports', 0xd81e2a, -40, 40, 0);
    g.player.enterCar(car);
    g.police.wanted = 3;
    g.police.lastCrimeAt = g.timeSec;
    g.police.spawnPatrolNear(g.player.x, g.player.z, 26);
    g.police.spawnPatrolNear(g.player.x, g.player.z, 34);
    // Stage the heli low and ahead so it reads in the frame, and tilt the
    // camera up a little: the air unit is the point of this shot.
    g.heli.altitude = 30;
    g.heli.orbitPhase = -0.6;
    g.camLift = 6;
    g.hud.toast('Three stars — CONDOR-1 is overhead, lose the Solmar PD!', 6);
    return true;
  }
  if (shot === 'mission') {
    // Mission 6 in progress: the roadblock run. The guest is in the car,
    // the first checkpoint is ahead, and the PD has sealed the street.
    g.missions.index = 5;
    g.missions.startMission(5);
    const car = g.spawnPlayerCar('sports', 0x1e6ad8, 40, -40, 0);
    g.player.enterCar(car);
    g.player.money = 2200;
    g.missions.active.step = 0;
    g.missions.refreshObjective();
    g.roadblocks.spawnAhead(g.player, 45); // close enough to read in the frame
    g.hud.toast('Mission: Roadblock Run — break through checkpoint 1', 6);
    return true;
  }
  // Default 'play': driving a sedan through downtown with traffic.
  const car = g.spawnPlayerCar('sedan', 0x8a2a2a, -40, 40, 0);
  g.player.enterCar(car);
  g.player.money = 1250;
  g.autopilot = true;
  g.missions.objective = {
    text: 'M2 — First Fare: Drive the guest to Hotel Miramonte',
    x: 116, z: -36,
  };
  g.missions.setMarker(116, -36);
  g.police.wanted = 1;
  g.police.lastCrimeAt = g.timeSec;
  g.hud.toast('Solmar — downtown drive', 6);
  return true;
}
