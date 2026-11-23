// Solmar — keyboard and mouse input. One job: track what the player is
// pressing, and hand the game a clean snapshot each frame.
export function initInput(G) {
  const keys = new Set();
  const mouse = { dx: 0, dy: 0, down: false, clicked: false, rightDown: false };
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
    if (e.code === 'KeyM') G.events.pressM();
    if (e.code === 'KeyE') G.events.pressE();
    if (e.code === 'KeyP' || e.code === 'Escape') G.events.pressPause();
    if (e.code === 'Digit1') G.events.selectWeapon(0);
    if (e.code === 'Digit2') G.events.selectWeapon(1);
    if (e.code === 'Digit3') G.events.selectWeapon(2);
    if (e.code === 'KeyT') G.events.pressT();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const canvas = G.renderer.domElement;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
    if (e.button === 2) mouse.rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (mouse.down || locked) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('click', () => {
    if (G.state === 'playing' && !locked) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  G.keys = keys;
  G.mouse = mouse;
  G.input = {
    // Consume the accumulated mouse drag for this frame.
    takeMouse() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0;
      mouse.dy = 0;
      return d;
    },
    takeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c;
    },
    down(code) {
      return keys.has(code);
    },
  };
  return G.input;
}
