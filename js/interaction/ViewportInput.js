/**
 * @module interaction/ViewportInput
 * Viewport input routing: the G/R/L/P/O/U/Escape shortcut keys and the canvas pointer routing
 * (pilot | gizmo drag/hover | pick), registered in the legacy setupUI phase and order.
 * 03 T5 (docs/improvements/03-pivot.md 3.4, 5.4): the O key (pivot selection), the Escape order (a hooked gizmo drag is
 * cancelled first) and the gesture swallowing of a cancelled drag (the router's mousemove does nothing while
 * interaction.gestureCancelled).
 * 2026-10-31 (the owner's request): wall sections are selected by a CLICK, a press and release of the same button whose
 * pointer never travelled CLICK_SLOP_PX (4 px) or more, so an orbit drag never selects or deselects one. A left click
 * selects the section under the pointer (SelectionManager.hitAt: camera, props and pivot keep their priority) or, on
 * empty space, deselects; a right click on a section selects it and opens the section menu (commands.openSectionMenu).
 * A press taken by a gizmo handle or by the legacy pick (B-M14) is never a click. Nothing in pilot mode. The browser's
 * context menu is suppressed on the canvas only.
 * Legacy source: index.html@cd3fd3f 4409-4479.
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import { isTypingTarget } from './InputState.js';   // core/typingTarget.js, re-exported (01 CR-9)

/** The click threshold (px): a press whose pointer travels this far or more from where it went down is a drag. */
export const CLICK_SLOP_PX = 4;

/**
 * Side effects: none.
 * @param {{x: number, y: number}} from  where the button went down (clientX / clientY)
 * @param {{x: number, y: number}} to
 * @returns {boolean} the pointer travelled CLICK_SLOP_PX or more (straight-line distance)
 */
export function isDragTravel(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y) >= CLICK_SLOP_PX;
}

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
  /** @type {() => void} the O key's use case (PivotController.toggleSelect, 03 3.4) */
  #onPivotShortcut;

  /**
   * Stores the collaborators (no listeners here: see attachShortcuts() and attachPointer()).
   * Side effects: none.
   * @param {{doc: Document, win: Window, sceneManager: import('../render/SceneManager.js').SceneManager,
   *          interaction: import('./InputState.js').InteractionState,
   *          gizmo: import('./TransformGizmo.js').TransformGizmo,
   *          selection: import('./SelectionManager.js').SelectionManager,
   *          pilot: import('./PilotController.js').PilotController, onPivotShortcut: () => void}} deps
   *   onPivotShortcut: the O key (03 3.4; App passes () => pivotController.toggleSelect())
   * @param {{toggleUvViewer?: () => void,
   *          openSectionMenu?: (req: {id: string, clientX: number, clientY: number}) => void}} [deps.commands]
   *   04 3.6 path B: the U key (App passes () => uvController.toggleViewer()); removed with the platform keymap (04 UV-18).
   *   2026-10-31: openSectionMenu, a right click on a section (App opens ui/SectionContextMenu at the pointer)
   */
  constructor({ doc, win, sceneManager, interaction, gizmo, selection, pilot, onPivotShortcut, commands = {} }) {
    this.#doc = doc;
    this.#win = win;
    this.#sceneManager = sceneManager;
    this.#interaction = interaction;
    this.#gizmo = gizmo;
    this.#selection = selection;
    this.#pilot = pilot;
    this.#onPivotShortcut = onPivotShortcut;
    this.#commands = commands;
  }

  /** @type {{toggleUvViewer?: () => void, openSectionMenu?: Function}} the injected commands of 04 3.6 path B */
  #commands;
  /**
   * The current press of a possible click (2026-10-31): where and with which button it went down, whether the pointer
   * travelled CLICK_SLOP_PX or more since, and whether the gizmo or the legacy pick took it. null between presses and in
   * pilot mode.
   * @type {{x: number, y: number, button: number, dragged: boolean, taken: boolean}|null}
   */
  #press = null;

  /**
   * Whether this router handles canvas double-clicks (04 5.3): false in the legacy routing, true once spec 02's dblclick
   * routing lands; App passes !handlesDoubleClick to the UV hover probe's doubleClick option.
   * Side effects: none.
   * @returns {boolean}
   */
  get handlesDoubleClick() {
    return false;
  }

  /**
   * The gizmo keyboard shortcuts on the document (registered after KeyboardState's keydown):
   * G translate, R rotate, L space, P pilot, Escape (pilot ? leave pilot : deselect and clear the mode).
   * The key is ignored (08 P2-9b, B-L11; 08 6.11) when the target is a typing target (core/typingTarget.js,
   * 07 3.8: text-like INPUT, SELECT, TEXTAREA, contenteditable, inside an open dialog), when Ctrl, Meta or
   * Alt is held (Ctrl+P is the print dialog, not pilot mode), or when it is an auto-repeat (holding P no longer
   * flips pilot mode). Shift is allowed (Shift+G still means G).
   * 03 T5 (3.4): O toggles the pivot selection (onPivotShortcut), not in pilot mode and not while a gizmo drag is active or
   * a cancelled drag's button is still held (Ctrl+O, the browser's open-file key, is already filtered with every
   * modifier). Escape first cancels a drag whose target implements endGizmoDrag (gizmo.cancelDrag(): the selection and
   * the mode are kept and the rest of the gesture is swallowed); otherwise pilot mode is left, else the selection and the
   * mode are cleared (legacy; legacy targets have no hook, so a mid-drag Escape on them is unchanged).
   * 04 3.6 (path B, UV-12): U toggles the UV viewer (commands.toggleUvViewer), not in pilot mode. No existing key
   * uses U (G R L P O N Shift+N, the WASD / QE / arrow movement keys and Escape).
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
      } else if (e.key.toLowerCase() === 'o') {
        const interaction = this.#interaction;
        if (interaction.pilotMode || interaction.isDraggingGizmo || interaction.gestureCancelled) return;
        this.#onPivotShortcut();
      } else if (e.key.toLowerCase() === 'u') {
        // 04 3.6 (path B): U toggles the UV viewer; never in pilot mode (typing targets, modifiers and repeats are
        // filtered above, so U typed into a field of the viewer never toggles it)
        if (this.#interaction.pilotMode) return;
        this.#commands.toggleUvViewer?.();
      } else if (e.key === 'Escape') {
        if (this.#interaction.isDraggingGizmo && gizmo.target?.endGizmoDrag) {
          gizmo.cancelDrag();
        } else if (this.#interaction.pilotMode) {
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
   * mouseup that always ends gizmo drags and pilot looks, and the pilot wheel ({passive: false}). 03 T5 (5.4): while a
   * cancelled drag's button is still held (interaction.gestureCancelled), mousemove calls neither gizmo.onMouseMove nor
   * gizmo.onHover, so nothing moves and no handle lights up.
   * Ports: index.html@cd3fd3f lines 4436-4479.
   * 2026-10-31: the press is recorded on mousedown, its travel on mousemove, and the canvas mouseup runs the click
   * (#release) after gizmo.onMouseUp(); the window mouseup forgets the press (a release outside the canvas is no click);
   * a canvas contextmenu listener suppresses the browser's menu.
   * Side effects: adds 5 canvas listeners and 1 window listener; the handlers call the pilot, gizmo and
   * selection.
   */
  attachPointer() {
    const interaction = this.#interaction;
    const gizmo = this.#gizmo;
    const pilot = this.#pilot;
    const canvas = this.#sceneManager.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      this.#press = null;
      if (interaction.pilotMode) {
        pilot.onMouseDown(e);
        return;
      }
      // LEGACY(B-M14): selection runs on mousedown whenever the gizmo did not take the event and a gizmo mode
      // is on, so the start of an orbit drag or a right click on empty space deselects.
      const gizmoHandled = gizmo.onMouseDown(e);
      let picked = false;
      if (!gizmoHandled && gizmo.mode) {
        picked = this.#selection.pickAt(e) === true;
      }
      this.#press = { x: e.clientX, y: e.clientY, button: e.button, dragged: false, taken: !!gizmoHandled || picked };
    });

    canvas.addEventListener('mousemove', (e) => {
      if (interaction.pilotMode) {
        pilot.onMouseMove(e);
        return;
      }
      const press = this.#press;
      if (press && !press.dragged && isDragTravel(press, { x: e.clientX, y: e.clientY })) press.dragged = true;
      if (interaction.gestureCancelled) return;
      if (interaction.isDraggingGizmo) {
        gizmo.onMouseMove(e);
      } else {
        gizmo.onHover(e);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (interaction.pilotMode) {
        pilot.onMouseUp();
        return;
      }
      gizmo.onMouseUp();
      this.#release(e);
    });

    this.#win.addEventListener('mouseup', () => {
      this.#press = null;
      gizmo.onMouseUp();
      pilot.onMouseUp();
    });

    canvas.addEventListener('wheel', (e) => {
      if (interaction.pilotMode) {
        pilot.onWheel(e);
      }
    }, { passive: false });

    // 2026-10-31: the browser's context menu never opens over the 3D view (a right click selects a section and opens the
    // section menu instead; right-drags orbit as before)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * The release of a press on the canvas (2026-10-31): a click when the same button went down on the canvas, neither the
   * gizmo nor the legacy pick took the press, the pointer never travelled CLICK_SLOP_PX and no drag was cancelled. A left
   * click selects the section under the pointer (a camera, prop or pivot hit keeps the click and changes nothing) or, on
   * empty space, deselects; a right click on a section selects it and asks for the section menu (no menu elsewhere).
   * Side effects: forgets the press; may select or deselect; may call commands.openSectionMenu.
   * @param {MouseEvent} e  the canvas mouseup
   */
  #release(e) {
    const press = this.#press;
    this.#press = null;
    const it = this.#interaction;
    if (!press || press.taken || press.dragged || it.pilotMode || it.gestureCancelled || e.button !== press.button) return;
    if (isDragTravel(press, { x: e.clientX, y: e.clientY })) return;
    if (press.button !== 0 && press.button !== 2) return;
    const selection = this.#selection;
    const hit = selection.hitAt(e);
    const section = hit !== null && hit.kind === 'section';
    if (section && !selection.isSelected(hit.id)) selection.select(hit.id);
    if (press.button === 0) {
      if (hit === null && selection.selectedId !== null) selection.deselect();
    } else if (section) {
      this.#commands.openSectionMenu?.({ id: hit.id, clientX: e.clientX, clientY: e.clientY });
    }
  }
}
