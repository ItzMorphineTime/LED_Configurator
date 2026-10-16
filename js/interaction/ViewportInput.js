/**
 * @module interaction/ViewportInput
 * Viewport input routing: the G/R/L/P/Escape shortcut keys and the canvas pointer routing
 * (pilot | gizmo drag/hover | pick), registered in the legacy setupUI phase and order.
 * Legacy source: index.html@cd3fd3f 4409-4479.
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import { isTypingTarget } from './InputState.js';   // core/typingTarget.js, re-exported (01 CR-9)

/**
 * Routes the viewport input that legacy handled inline in setupUI: the G/R/L/P/Escape shortcut keys on the
 * document, and the canvas mousedown/mousemove/mouseup/wheel events (plus a window mouseup) to pilot mode, the
 * gizmo or picking. Owns no legacy global; it reads InteractionState.
 * Wiring (App): attachShortcuts() then attachPointer() in the setupUI phase, after KeyboardState's document
 * listeners and OrbitController's canvas listeners (R11).
 */
export class ViewportInput {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;
  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;
  /** @type {import('./TransformGizmo.js').TransformGizmo} */
  #gizmo;
  /** @type {import('./SelectionManager.js').SelectionManager} */
  #selection;
  /** @type {import('./PilotController.js').PilotController} */
  #pilot;

  /**
   * Stores the collaborators (no listeners here: see attachShortcuts() and attachPointer()).
   * Side effects: none.
   * @param {{doc: Document, win: Window, sceneManager: import('../render/SceneManager.js').SceneManager,
   *          interaction: import('./InputState.js').InteractionState,
   *          gizmo: import('./TransformGizmo.js').TransformGizmo,
   *          selection: import('./SelectionManager.js').SelectionManager,
   *          pilot: import('./PilotController.js').PilotController}} deps
   */
  constructor({ doc, win, sceneManager, interaction, gizmo, selection, pilot }) {
    this.#doc = doc;
    this.#win = win;
    this.#sceneManager = sceneManager;
    this.#interaction = interaction;
    this.#gizmo = gizmo;
    this.#selection = selection;
    this.#pilot = pilot;
  }

  /**
   * The gizmo keyboard shortcuts on the document (registered after KeyboardState's keydown):
   * G translate, R rotate, L space, P pilot, Escape (pilot ? leave pilot : deselect and clear the mode).
   * The key is ignored (08 P2-9b, B-L11; 08 6.11) when the target is a typing target (core/typingTarget.js,
   * 07 3.8: text-like INPUT, SELECT, TEXTAREA, contenteditable, inside an open dialog), when Ctrl, Meta or
   * Alt is held (Ctrl+P is the print dialog, not pilot mode), or when it is an auto-repeat (holding P no longer
   * flips pilot mode). Shift is allowed (Shift+G still means G).
   * Ports: index.html@cd3fd3f lines 4409-4434.
   * Side effects: adds 1 document keydown listener; the handler calls the gizmo, selection and pilot.
   */
  attachShortcuts() {
    const gizmo = this.#gizmo;
    const pilot = this.#pilot;
    this.#doc.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      if (e.key.toLowerCase() === 'g') {
        gizmo.setMode('translate');
      } else if (e.key.toLowerCase() === 'r') {
        gizmo.setMode('rotate');
      } else if (e.key.toLowerCase() === 'l') {
        gizmo.toggleSpace();
      } else if (e.key.toLowerCase() === 'p') {
        pilot.toggle();
      } else if (e.key === 'Escape') {
        if (this.#interaction.pilotMode) {
          pilot.toggle();
        } else {
          this.#selection.deselect();
          if (gizmo.mode) {
            gizmo.clearMode();
          }
        }
      }
    });
  }

  /**
   * The canvas pointer routing (registered after the orbit listeners on the same canvas), the window
   * mouseup that always ends gizmo drags and pilot looks, and the pilot wheel ({passive: false}).
   * Ports: index.html@cd3fd3f lines 4436-4479.
   * Side effects: adds 4 canvas listeners and 1 window listener; the handlers call the pilot, gizmo and
   * selection.
   */
  attachPointer() {
    const interaction = this.#interaction;
    const gizmo = this.#gizmo;
    const pilot = this.#pilot;
    const canvas = this.#sceneManager.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      if (interaction.pilotMode) {
        pilot.onMouseDown(e);
        return;
      }
      // LEGACY(B-M14): selection runs on mousedown whenever the gizmo did not take the event and a gizmo mode
      // is on, so the start of an orbit drag or a right click on empty space deselects.
      const gizmoHandled = gizmo.onMouseDown(e);
      if (!gizmoHandled && gizmo.mode) {
        this.#selection.pickAt(e);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (interaction.pilotMode) {
        pilot.onMouseMove(e);
        return;
      }
      if (interaction.isDraggingGizmo) {
        gizmo.onMouseMove(e);
      } else {
        gizmo.onHover(e);
      }
    });

    canvas.addEventListener('mouseup', () => {
      if (interaction.pilotMode) {
        pilot.onMouseUp();
        return;
      }
      gizmo.onMouseUp();
    });

    this.#win.addEventListener('mouseup', () => {
      gizmo.onMouseUp();
      pilot.onMouseUp();
    });

    canvas.addEventListener('wheel', (e) => {
      if (interaction.pilotMode) {
        pilot.onWheel(e);
      }
    }, { passive: false });
  }
}
