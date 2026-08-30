import { globalEvents } from '../core/EventBus.js';

/**
 * On-screen controls for touch devices (iPad, phones).
 *
 * iOS Safari implements no Pointer Lock API at all, so the desktop control
 * scheme — lock the cursor, read raw mouse deltas — cannot work there. This
 * module provides the whole input surface instead: an analog stick for
 * movement, drag-anywhere-else to look, and buttons for the actions that are
 * keys on desktop. It writes into the same InputManager fields the keyboard
 * and mouse use, so no gameplay system needs to know which one is driving.
 */

const LOOK_SENSITIVITY = 0.9; // relative to mouse look, tuned for finger drags
const SPRINT_THRESHOLD = 0.85; // stick deflection at which the player sprints

/** iPadOS 13+ reports itself as a Mac, so check for touch points too. */
export function isTouchDevice() {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches
  );
}

export class TouchControls {
  constructor(root, input, canvas) {
    this.input = input;
    this.canvas = canvas;
    this.lookPointerId = null;
    this.stickPointerId = null;

    this.el = document.createElement('div');
    this.el.id = 'touch-controls';
    root.appendChild(this.el);

    this._buildStick();
    this._buildButtons();
    this._bindLook();
  }

  // ------------------------------------------------------------- movement
  _buildStick() {
    this.stick = document.createElement('div');
    this.stick.className = 'touch-stick interactive';
    this.knob = document.createElement('div');
    this.knob.className = 'touch-stick-knob';
    this.stick.appendChild(this.knob);
    this.el.appendChild(this.stick);

    const radius = () => this.stick.clientWidth / 2;

    const move = (e) => {
      const rect = this.stick.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const r = radius();
      const dist = Math.min(Math.hypot(dx, dy), r);
      const angle = Math.atan2(dy, dx);
      const nx = Math.cos(angle) * (dist / r);
      const ny = Math.sin(angle) * (dist / r);

      this.knob.style.transform = `translate(${nx * r * 0.6}px, ${ny * r * 0.6}px)`;
      // Screen-down is +y, but "forward" is -y, hence the negation.
      this.input.moveAxis.x = nx;
      this.input.moveAxis.y = -ny;
      this.input.virtualActions[dist / r > SPRINT_THRESHOLD ? 'add' : 'delete']('sprint');
    };

    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stickPointerId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      move(e);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      move(e);
    });
    const release = (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.knob.style.transform = 'translate(0,0)';
      this.input.moveAxis.x = 0;
      this.input.moveAxis.y = 0;
      this.input.virtualActions.delete('sprint');
    };
    this.stick.addEventListener('pointerup', release);
    this.stick.addEventListener('pointercancel', release);
  }

  // -------------------------------------------------------------- buttons
  /** A button that reports as held for as long as it is pressed. */
  _holdButton(label, title, onDown, onUp) {
    const btn = document.createElement('button');
    btn.className = 'touch-btn interactive';
    btn.innerHTML = label;
    btn.title = title;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('held');
      onDown();
    });
    const up = (e) => {
      e.preventDefault();
      btn.classList.remove('held');
      onUp?.();
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    return btn;
  }

  _buildButtons() {
    const input = this.input;

    const actions = document.createElement('div');
    actions.className = 'touch-actions';

    // Mining is a hold, so it maps to holding the left mouse button.
    actions.appendChild(this._holdButton('⛏', 'Break block',
      () => input.mouseButtons.add(0), () => input.mouseButtons.delete(0)));

    // Placing is a discrete action; Interaction has its own cooldown, so a
    // single frame of "button down" is enough and avoids repeat-placing.
    actions.appendChild(this._holdButton('▣', 'Place block',
      () => { input.mouseButtons.add(2); setTimeout(() => input.mouseButtons.delete(2), 90); }));

    actions.appendChild(this._holdButton('⤒', 'Jump',
      () => input.virtualActions.add('jump'), () => input.virtualActions.delete('jump')));

    actions.appendChild(this._holdButton('⤓', 'Crouch',
      () => input.virtualActions.add('crouch'), () => input.virtualActions.delete('crouch')));

    this.el.appendChild(actions);

    const menu = document.createElement('div');
    menu.className = 'touch-menu';
    const tap = (label, title, key) => {
      const btn = document.createElement('button');
      btn.className = 'touch-btn small interactive';
      btn.innerHTML = label;
      btn.title = title;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        // Surfaced as a synthetic key press so Game's existing key handling
        // stays the single place that decides what these do.
        input.pressVirtualKey(key);
      });
      return btn;
    };
    menu.appendChild(tap('🎒', 'Inventory', 'KeyE'));
    menu.appendChild(tap('☰', 'Pause', 'Escape'));
    this.el.appendChild(menu);
  }

  // ----------------------------------------------------------------- look
  _bindLook() {
    // Any drag that does not start on a control rotates the camera.
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.lookPointerId !== null) return;
      this.lookPointerId = e.pointerId;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.input.touchLook = true;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      e.preventDefault();
      this.input.mouseDX += (e.clientX - this._lastX) * LOOK_SENSITIVITY;
      this.input.mouseDY += (e.clientY - this._lastY) * LOOK_SENSITIVITY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      this.lookPointerId = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /** Hides the controls while a full-screen panel (inventory, pause) is open. */
  setVisible(visible) {
    this.el.style.display = visible ? '' : 'none';
    if (!visible) {
      this.input.moveAxis.x = 0;
      this.input.moveAxis.y = 0;
      this.input.mouseButtons.clear();
      this.input.virtualActions.clear();
      this.knob.style.transform = 'translate(0,0)';
    }
  }

  dispose() { this.el.remove(); }
}
