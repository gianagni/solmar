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
    // On foot on the plaza, pedestrians strolling past.
    g.player.x = -116;
    g.player.z = -180;
    g.player.heading = Math.PI / 2;
    g.player.mode = 'foot';
    g.camYaw = Math.PI / 2 + 0.4;
    g.hud.toast('Solmar — on foot in Plaza del Sol', 6);
    return true;
  }
  if (shot === 'chase') {
    // In a sports car downtown, three stars, patrol cars already on the tail.
    const car = g.spawnPlayerCar('sports', 0xd81e2a, -40, 40, 0);
    g.player.enterCar(car);
    g.police.wanted = 3;
    g.police.lastCrimeAt = g.timeSec;
    g.police.spawnPatrol(g.player.x, g.player.z);
    g.police.spawnPatrol(g.player.x, g.player.z);
    g.hud.toast('Three stars — lose the Solmar PD!', 6);
    return true;
  }
  if (shot === 'mission') {
    // Mission 2 in progress: the guest is in the car, Hotel Miramonte ahead.
    g.missions.index = 1;
    g.missions.startMission(1);
    const car = g.spawnPlayerCar('taxi', 0xe8c832, 40, -40, 0);
    g.player.enterCar(car);
    g.player.money = 750;
    g.missions.active.step = 1; // past "get in a car"
    g.missions.refreshObjective();
    g.hud.toast('Mission: First Fare — drive the guest to Hotel Miramonte', 6);
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
