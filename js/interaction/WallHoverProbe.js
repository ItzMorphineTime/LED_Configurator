/**
 * @module interaction/WallHoverProbe
 * The UV viewer's wall hover (docs/improvements/04-uvs-uv-editor.md 3.5, 5.3; UV-15) in its own-raycast mode (spec 02's
 * shared hover raycast does not exist yet): while enabled (the viewer is open), canvas mousemoves are coalesced to at
 * most one raycast per animation frame against the front LED meshes (`targets()`); the nearest hit is delivered when the
 * ray meets its triangle from the front (the LED faces are DoubleSide, so a hit from behind is delivered as null: "hover
 * the front"). No raycast while a mouse button is held (orbit drags), while the gizmo is dragged or in pilot mode. A
 * canvas double-click on the front of the wall is delivered whether or not the hover is enabled (it opens the viewer on
 * that section), unless the viewport input routes double-clicks itself (spec 02).
 * Legacy source: none (Feature 4).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */

import THREE from '../vendor/three.js';

/** The wall hover probe. */
export class WallHoverProbe {
  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('./InputState.js').PointerRay} */
  #pointerRay;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;
  /** @type {Window} */
  #win;
  /** @type {() => object[]} */
  #targets;
  /** @type {(hit: object|null) => void} */
  #onHover;
  /** @type {(hit: object) => void} */
  #onDoubleClick;
  #doubleClick;
  #enabled = false;
  #pending = false;
  /** @type {MouseEvent|null} the last mousemove not yet probed */
  #lastEvent = null;
  /** whether the last delivery was null (repeated nulls are not delivered) */
  #deliveredNull = true;
  /** a reused vector (no id, R4) */
  #normal = new THREE.Vector3();

  /**
   * Stores the collaborators only (R4).
   * Side effects: none.
   * @param {{sceneManager: import('../render/SceneManager.js').SceneManager,
   *          pointerRay: import('./InputState.js').PointerRay,
   *          interaction: import('./InputState.js').InteractionState, win: Window,
   *          targets: () => object[], onHover: (hit: object|null) => void, onDoubleClick: (hit: object) => void,
   *          doubleClick?: boolean}} deps
   *   targets: App passes () => wallView.meshes() (the front LED meshes only); doubleClick: !viewportInput.handlesDoubleClick
   */
  constructor({ sceneManager, pointerRay, interaction, win, targets, onHover, onDoubleClick, doubleClick = true }) {
    this.#sceneManager = sceneManager;
    this.#pointerRay = pointerRay;
    this.#interaction = interaction;
    this.#win = win;
    this.#targets = targets;
    this.#onHover = onHover;
    this.#onDoubleClick = onDoubleClick;
    this.#doubleClick = doubleClick;
  }

  /**
   * Adds the canvas listeners (after ViewportInput.attachPointer): a passive mousemove, mouseleave and, with
   * doubleClick, dblclick.
   * Side effects: adds 2 or 3 canvas listeners.
   */
  attach() {
    const canvas = this.#sceneManager.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => {
      if (!this.#enabled) return;
      this.#lastEvent = e;
      this.#schedule();
    }, { passive: true });
    canvas.addEventListener('mouseleave', () => {
      this.#lastEvent = null;
      if (this.#enabled) this.#deliver(null);
    });
    if (this.#doubleClick) {
      canvas.addEventListener('dblclick', (e) => {
        const it = this.#interaction;
        if (it.pilotMode || it.isDraggingGizmo) return;
        const hit = this.#pick(e);
        if (hit) this.#onDoubleClick(hit);
      });
    }
  }

  /**
   * Enables or disables the hover raycasts; disabling delivers onHover(null) once.
   * Side effects: may call onHover(null).
   * @param {boolean} on
   */
  setEnabled(on) {
    if (this.#enabled === !!on) return;
    this.#enabled = !!on;
    if (!this.#enabled) {
      this.#lastEvent = null;
      this.#deliver(null);
    }
  }

  /** Side effects: none. @returns {boolean} */
  get enabled() {
    return this.#enabled;
  }

  /** One probe per animation frame at most. */
  #schedule() {
    if (this.#pending) return;
    this.#pending = true;
    this.#win.requestAnimationFrame(() => {
      this.#pending = false;
      this.#run();
    });
  }

  /** The frame's probe of the last mousemove (skipped during drags and in pilot mode). */
  #run() {
    const e = this.#lastEvent;
    this.#lastEvent = null;
    if (!this.#enabled || !e) return;
    const it = this.#interaction;
    if (e.buttons !== 0 || it.isDraggingGizmo || it.pilotMode) return;
    this.#deliver(this.#pick(e));
  }

  /** Delivers a hit, or null once after a hit. */
  #deliver(hit) {
    if (!hit && this.#deliveredNull) return;
    this.#deliveredNull = !hit;
    this.#onHover(hit);
  }

  /**
   * The nearest hit of the targets under the pointer, when its triangle faces the ray (the front of the wall).
   * @param {{clientX: number, clientY: number}} e
   * @returns {object|null} the raw intersection
   */
  #pick(e) {
    const raycaster = this.#pointerRay.fromEvent(e);
    const hits = raycaster.intersectObjects(this.#targets(), false);
    const hit = hits[0];
    if (!hit) return null;
    if (hit.face) {
      const n = this.#normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (n.dot(raycaster.ray.direction) > 0) return null;
    }
    return hit;
  }
}
