import { settings } from './Settings.js';

// Centralizes keyboard/mouse state and pointer-lock handling. Game systems
// query `isDown(action)` / consume `takePressed(action)` rather than binding
// their own DOM listeners, so rebinding keys in Settings only touches this
// file's keybind lookup.

// How fast the view turns when the cursor is parked against a screen edge in
// fallback look mode, in "mouse pixels" per second at full deflection.
const EDGE_TURN_SPEED = 900;
// Width of the band along each edge that drives that turn.
const EDGE_BAND = 90;

export class InputManager {
  constructor(domElement) {
    this.dom = domElement;
    this._keysDown = new Set();
    this._pressedThisFrame = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseButtons = new Set();
    this.wheelDelta = 0;
    this.pointerLocked = false;

    // Pointer Lock is the desktop path: the cursor disappears and the browser
    // reports raw movement deltas. Safari on iPadOS has no Pointer Lock at
    // all, and every browser refuses a lock that is not tied to a fresh user
    // gesture, so the camera can never depend on holding one. `wantLook` says
    // gameplay owns the camera (no panel or menu open); whenever it does but
    // the lock is not held, look input is derived from the cursor's own
    // motion instead, plus a turn while it rests against a screen edge, where
    // it can move no further.
    this.wantLook = false;
    this._cursorX = window.innerWidth / 2;
    this._cursorY = window.innerHeight / 2;
    this._haveCursorPos = false;

    this._onKeyDown = (e) => {
      if (!this._keysDown.has(e.code)) this._pressedThisFrame.add(e.code);
      this._keysDown.add(e.code);
    };
    this._onKeyUp = (e) => this._keysDown.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
        return;
      }
      const prevX = this._cursorX, prevY = this._cursorY;
      this._cursorX = e.clientX;
      this._cursorY = e.clientY;
      if (!this.lookActive) { this._haveCursorPos = true; return; }
      // The first move after gaining look control only establishes a
      // reference point; using it as a delta would snap the view.
      if (this._haveCursorPos) {
        this.mouseDX += e.clientX - prevX;
        this.mouseDY += e.clientY - prevY;
      }
      this._haveCursorPos = true;
    };
    this._onMouseDown = (e) => {
      this.mouseButtons.add(e.button);
      this._pressedThisFrame.add(`Mouse${e.button}`);
    };
    this._onMouseUp = (e) => this.mouseButtons.delete(e.button);
    this._onWheel = (e) => { this.wheelDelta += Math.sign(e.deltaY); };
    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
      // The cursor position recorded while locked is meaningless; start the
      // fallback from wherever the pointer reappears instead of jerking the
      // view by the difference.
      this._haveCursorPos = false;
      // Locking is asynchronous, so a request made just before a panel opened
      // can be granted just after. Left alone it would capture the cursor on
      // top of that panel and make it unclickable, so drop it again.
      if (this.pointerLocked && !this.wantLook) { document.exitPointerLock?.(); return; }
      this._applyCursorVisibility();
    };
    // Fired when the browser refuses the lock (Safari, an iframe policy, a
    // request outside a user gesture). Nothing to do but note it: the
    // fallback is already what drives the camera whenever the lock is absent.
    this._onPointerLockError = () => { this._haveCursorPos = false; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.dom.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this.dom.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('pointerlockerror', this._onPointerLockError);
    // Prevent the browser context menu so right-click can be used for placing blocks.
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestPointerLock() {
    this.wantLook = true;
    this._haveCursorPos = false; // don't turn the view by the cursor's jump
    if (document.pointerLockElement !== this.dom) {
      // Chrome returns a promise; Safari and older browsers return undefined
      // and report failure through the pointerlockerror event instead. Either
      // way a refusal is not fatal — the fallback below takes over.
      const result = this.dom.requestPointerLock?.();
      if (result?.catch) result.catch(() => this._onPointerLockError());
    }
    this._applyCursorVisibility();
  }

  releasePointerLock() {
    this.wantLook = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this._applyCursorVisibility();
  }

  /** True while the camera should follow pointer movement. */
  get lookActive() {
    return this.pointerLocked || this.wantLook;
  }

  /**
   * Edge turning for the no-pointer-lock path. Without a lock the cursor
   * stops at the screen border, so looking further in that direction would
   * be impossible; instead, resting the cursor near an edge keeps the view
   * rotating that way. Called once per frame while gameplay is active.
   */
  updateFallbackLook(dt) {
    if (this.pointerLocked || !this.lookActive || !this._haveCursorPos) return;
    const w = window.innerWidth, h = window.innerHeight;
    const push = (pos, size) => {
      if (pos < EDGE_BAND) return -(1 - pos / EDGE_BAND);
      if (pos > size - EDGE_BAND) return 1 - (size - pos) / EDGE_BAND;
      return 0;
    };
    this.mouseDX += push(this._cursorX, w) * EDGE_TURN_SPEED * dt;
    this.mouseDY += push(this._cursorY, h) * EDGE_TURN_SPEED * dt;
  }

  /** Hide the cursor while the camera is being steered, show it otherwise. */
  _applyCursorVisibility() {
    document.body.style.cursor = this.lookActive ? 'none' : 'default';
  }

  isDown(action) {
    const code = settings.get('keybinds')[action];
    return code ? this._keysDown.has(code) : false;
  }

  wasPressed(action) {
    const code = settings.get('keybinds')[action];
    return code ? this._pressedThisFrame.has(code) : false;
  }

  isKeyDown(code) {
    return this._keysDown.has(code);
  }

  keyWasPressed(code) {
    return this._pressedThisFrame.has(code);
  }

  /** Call once per frame after all systems have read input for that frame. */
  endFrame() {
    this._pressedThisFrame.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.dom.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.dom.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('pointerlockerror', this._onPointerLockError);
  }
}
