// Input: keyboard, mouse and the pointer lock that turns the mouse into look. It reads the browser
// and writes one small truth — which keys are down and how far the mouse moved — and the frame loop
// turns that into a command. Nothing here knows what a weapon or a round is.
export function createInput(canvas, handlers = {}) {
  const keys = new Set();
  const pressed = new Set();
  const state = { locked: false, firing: false, using: false, lookX: 0, lookY: 0 };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const code = event.code;
    if (code === 'Tab' || code === 'Space' || code.startsWith('Arrow')) event.preventDefault();
    if (!keys.has(code)) pressed.add(code);
    keys.add(code);
    if (handlers.onKey) handlers.onKey(code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
    state.using = false;
  });

  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX || 0;
    state.lookY += event.movementY || 0;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) {
      if (handlers.onClick) handlers.onClick(event);
      return;
    }
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.using = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.using = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('wheel', (event) => {
    if (state.locked && handlers.onWheel) handlers.onWheel(event.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      pressed.clear();
      state.firing = false;
      state.using = false;
    }
    if (handlers.onLockChange) handlers.onLockChange(state.locked);
  });

  return {
    state,
    keys,
    requestLock() {
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    },
    release() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    /** True once per physical key press. */
    took(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    down(code) {
      return keys.has(code);
    },
    consumeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    endFrame() {
      pressed.clear();
    },
  };
}
