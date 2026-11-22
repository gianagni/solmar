// Solmar — keyboard and mouse input. Tracks held keys, edge-triggered
// presses, mouse drag for the camera, and click-to-shoot.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared each frame
    this.mouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false; // left click this frame
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // Keep the page from scrolling on game keys.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.dragging = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.dragging = true;
        this.clicked = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.dragging = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this.lastX;
      this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) { return this.keys.has(code); }

  // True only on the frame the key went down.
  wasPressed(code) { return this.pressed.has(code); }

  // Camera orbit deltas since last frame; call once per frame.
  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  takeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  endFrame() {
    this.pressed.clear();
  }
}
