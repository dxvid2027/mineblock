import { settings } from './Settings.js';

// Centralizes keyboard/mouse state and pointer-lock handling. Game systems
// query `isDown(action)` / consume `takePressed(action)` rather than binding
// their own DOM listeners, so rebinding keys in Settings only touches this
// file's keybind lookup.
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

    // Touch input writes into these so no gameplay system needs to know
    // whether a keyboard or an on-screen control is driving it. See
    // ui/TouchControls.js; iOS Safari has no Pointer Lock, which is why look
    // input cannot simply be gated on `pointerLocked`.
    this.moveAxis = { x: 0, y: 0 };   // analog stick, -1..1 (y: +forward)
    this.virtualActions = new Set();  // action names held by on-screen buttons
    this.touchLook = false;           // a drag is steering the camera
    this.isTouch = false;

    this._onKeyDown = (e) => {
      if (!this._keysDown.has(e.code)) this._pressedThisFrame.add(e.code);
      this._keysDown.add(e.code);
    };
    this._onKeyUp = (e) => this._keysDown.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      this.mouseButtons.add(e.button);
      this._pressedThisFrame.add(`Mouse${e.button}`);
    };
    this._onMouseUp = (e) => this.mouseButtons.delete(e.button);
    this._onWheel = (e) => { this.wheelDelta += Math.sign(e.deltaY); };
    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
      // Belt-and-braces: explicitly restore a plain, visible cursor the
      // instant pointer lock ends (e.g. opening the inventory or a menu),
      // rather than trusting it reappears on its own.
      document.body.style.cursor = this.pointerLocked ? 'none' : 'default';
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.dom.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this.dom.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    // Prevent the browser context menu so right-click can be used for placing blocks.
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestPointerLock() {
    // Touch devices drive the camera by dragging instead; asking for a lock
    // there either throws or silently does nothing.
    if (this.isTouch) return;
    if (document.pointerLockElement !== this.dom) this.dom.requestPointerLock?.();
  }

  /** True while the camera should follow pointer movement. */
  get lookActive() {
    return this.pointerLocked || this.touchLook;
  }

  /** Injects a one-frame key press, used by on-screen menu buttons. */
  pressVirtualKey(code) {
    this._pressedThisFrame.add(code);
  }

  releasePointerLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  isDown(action) {
    if (this.virtualActions.has(action)) return true;
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
  }
}
