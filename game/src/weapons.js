// Solmar — weapon slots. Three guns Riko can carry, switched with 1/2/3.
// Each has its own damage, fire rate, spread and range; the HUD shows the
// slots, and the player mesh holds the current gun in its right hand.

export const WEAPONS = [
  {
    id: 'pistol',
    name: 'Pistol',
    key: '1',
    damage: 34,
    cooldown: 0.28, // seconds between shots
    pellets: 1,
    spread: 0.02, // radians of aim error per pellet
    range: 70,
    tracer: 0xffd21e,
  },
  {
    id: 'smg',
    name: 'SMG',
    key: '2',
    damage: 16,
    cooldown: 0.09,
    pellets: 1,
    spread: 0.06,
    range: 55,
    tracer: 0x7fb8e8,
  },
  {
    id: 'shotgun',
    name: 'Shotgun',
    key: '3',
    damage: 13,
    cooldown: 0.7,
    pellets: 5,
    spread: 0.14,
    range: 32,
    tracer: 0xff7a3a,
  },
];

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}
