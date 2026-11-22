// Solmar — save and load through localStorage. The save holds money, health,
// story progress, the player's position and the time of day the run is in.

const SAVE_KEY = 'solmar-save-v1';

export function saveGame(game) {
  try {
    const data = {
      version: 1,
      money: Math.floor(game.player.money),
      health: Math.round(game.player.health),
      missionsDone: game.missions.completed.slice(),
      missionIndex: game.missions.index,
      x: Math.round(game.player.x * 10) / 10,
      z: Math.round(game.player.z * 10) / 10,
      heading: game.player.heading,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
