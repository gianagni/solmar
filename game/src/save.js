// Solmar — localStorage save and load. The save holds money, how many story
// missions are done, and where the player stood, so Continue resumes a run.
const KEY = 'solmar-save-v1';

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      money: Math.round(p.money),
      missionsDone: G.missions.done,
      x: Math.round(p.pos.x * 10) / 10,
      z: Math.round(p.pos.z * 10) / 10,
      health: Math.round(p.health),
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.missionsDone !== 'number') return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    /* storage unavailable; nothing to clear */
  }
}
