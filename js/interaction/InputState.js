/**
 * @module interaction/InputState
 * Shared interaction flags (InteractionState), the held-key table (KeyboardState), the shared pick ray
 * (PointerRay: ONE THREE.Raycaster and ONE THREE.Vector2, exactly as the legacy globals) and the two
 * keyboard target guards.
 * Legacy source: index.html@cd3fd3f 1363, 1368-1370 (flags, raycaster, mouse), 3198-3203 / 3235-3240 /
 * 3312-3317 / 3431-3436 (the four mouse -> NDC copies), 3753 (keysPressed), 3842-3854 (key state listeners),
 * 4411 (shortcut target guard).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import THREE from '../vendor/three.js';

/**
 * Shared, tiny interaction flags (breaks the orbit / gizmo / pilot cycles). Single writers:
 * pilotMode <- PilotController.toggle only; isDraggingGizmo <- TransformGizmo only.
 * Ports: index.html@cd3fd3f lines 1363 (isDraggingGizmo), 1370 (pilotMode).
 */
export class InteractionState {
  /** legacy `pilotMode`; written only by PilotController.toggle */
  pilotMode = false;
  /** legacy `isDraggingGizmo`; written only by TransformGizmo.onMouseDown/onMouseUp */
  isDraggingGizmo = false;
}

/**
 * Key-state guard: keys typed into form fields are not recorded as held movement keys.
 * Ports: index.html@cd3fd3f line 3845.
 * Side effects: none.
 * @param {EventTarget & {tagName?: string}} t  the keydown event target
 * @returns {boolean} true when the key must be ignored
 */
export const isKeyStateIgnoredTarget = (t) => t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA';

/**
 * Shortcut guard (G/R/L/P/Escape).
 * LEGACY(B-L11): SELECT, modifiers and key repeat are NOT filtered for shortcuts (4411).
 * Ports: index.html@cd3fd3f line 4411.
 * Side effects: none.
 * @param {EventTarget & {tagName?: string}} t  the keydown event target
 * @returns {boolean} true when the shortcut must be ignored
 */
export const isShortcutIgnoredTarget = (t) => t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';

/**
 * The table of held keys (legacy `keysPressed`, 3753), keyed by `KeyboardEvent.code` with plain-object
 * key semantics. Read every frame by OrbitController.tickKeyboard and PilotController.tickKeyboard.
 */
export class KeyboardState {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;
  /** @type {Record<string, boolean>} legacy keysPressed (a plain object, as legacy) */
  #keys = {};

  /**
   * Stores the injected document and window (no listeners here: see attach()).
   * Side effects: none.
   * @param {{doc: Document, win: Window}} deps
   */
  constructor({ doc, win }) {
    this.#doc = doc;
    this.#win = win;
  }

  /**
   * Whether the key with this code is currently held.
   * Ports: index.html@cd3fd3f the `keysPressed['KeyW'] || ...` reads of 3580-3606 and 3785-3809.
   * Side effects: none.
   * @param {string} code  a KeyboardEvent.code, e.g. 'KeyW' or 'ArrowUp'
   * @returns {boolean} !!keys[code]
   */
  isDown(code) {
    return !!this.#keys[code];
  }

  /**
   * Registers the key-state listeners in legacy order: doc keydown (ignored for INPUT/SELECT/TEXTAREA
   * targets; keys[e.code] = true), doc keyup (keys[e.code] = false), win blur (every known key = false).
   * Called in the init phase (after OrbitController.attach, before ViewportInput.attachShortcuts), so the
   * key state is updated before the shortcut handler runs for the same keydown.
   * Ports: index.html@cd3fd3f lines 3842-3854.
   * Side effects: adds 2 document listeners and 1 window listener.
   */
  attach() {
    const keysPressed = this.#keys;
    this.#doc.addEventListener('keydown', (e) => {
      // Don't capture if typing in an input field
      if (isKeyStateIgnoredTarget(e.target)) return;
      keysPressed[e.code] = true;
    });
    this.#doc.addEventListener('keyup', (e) => {
      keysPressed[e.code] = false;
    });
    // Clear keys when window loses focus
    this.#win.addEventListener('blur', () => {
      Object.keys(keysPressed).forEach(key => keysPressed[key] = false);
    });
  }
}

/**
 * The legacy shared `raycaster` + `mouse` (1368-1369): ONE instance shared by gizmo hover, gizmo drag
 * and picking. Replaces the four inline copies of the mouse -> NDC code.
 */
export class PointerRay {
  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {THREE.Raycaster} legacy `raycaster` */
  #raycaster = new THREE.Raycaster();
  /** @type {THREE.Vector2} legacy `mouse` */
  #ndc = new THREE.Vector2();

  /**
   * Creates the one shared THREE.Raycaster and THREE.Vector2 (neither carries an id, R4).
   * The renderer and camera are read from the SceneManager at use time.
   * Side effects: none.
   * @param {{sceneManager: import('../render/SceneManager.js').SceneManager}} deps
   */
  constructor({ sceneManager }) {
    this.#sceneManager = sceneManager;
  }

  /** Side effects: none. @returns {THREE.Raycaster} the shared raycaster (legacy `raycaster`) */
  get raycaster() {
    return this.#raycaster;
  }

  /** Side effects: none. @returns {THREE.Vector2} the shared normalised device coordinates (legacy `mouse`) */
  get ndc() {
    return this.#ndc;
  }

  /**
   * Converts a mouse event to NDC on the main canvas and aims the shared raycaster from the main camera.
   * Ports: index.html@cd3fd3f lines 3198-3203 (== 3235-3240 == 3312-3317 == 3431-3436).
   * Side effects: writes the shared ndc and raycaster.
   * @param {{clientX: number, clientY: number}} event
   * @returns {THREE.Raycaster} the shared raycaster
   */
  fromEvent(event) {
    const canvas = this.#sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = this.#ndc;
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.#raycaster.setFromCamera(mouse, this.#sceneManager.camera);
    return this.#raycaster;
  }
}
