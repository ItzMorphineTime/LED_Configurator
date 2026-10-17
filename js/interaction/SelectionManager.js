/**
 * @module interaction/SelectionManager
 * The registry of Selectables (camera, person, car), the selection state (legacy `selectedObject`) and
 * raycast picking (legacy handleViewportClick). Defines the Selectable typedef that the app controllers
 * implement and the TransformGizmo drives.
 * 03 T5 (docs/improvements/03-pivot.md 5.4; 07 C33): the path-B hook set of the Selectable typedef (shared with spec 02),
 * the required `kind` (inferred only for the three legacy ids), the pickAt rule (pickPriority counts only against wall,
 * i.e. section, hits; otherwise the nearest hit wins, the legacy rule) and the `modes` of SELECTION_CHANGED.
 * Legacy source: index.html@cd3fd3f 1360 (selectedObject), 3139-3153 (selectObject, deselectObject),
 * 3427-3474 (handleViewportClick).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import { Events } from '../core/EventBus.js';

/**
 * @typedef {object} Selectable   implemented by CameraController ('camera'), PropController ('person', 'car') and, since
 *  03 T5, PivotController ('pivot'); Feature 2 adds the section Selectables, Feature 5 a projection-point Selectable.
 *  The optional members are the path-B hook set of 03 5.4 (07 C33, one-to-one with 07's Selectable v2); legacy targets
 *  implement none of them and behave exactly as in Phase 1.
 * @property {string} id                       'camera' | 'person' | 'car' | 'pivot' | ...
 * @property {string} label                    badge text: 'Camera' | 'Person' | 'Car' (legacy names map 3161) | 'Pivot'
 * @property {'camera'|'prop'|'pivot'|'projector'|'section'} [kind]   REQUIRED for every Selectable added after Phase 1
 *                                             (register throws without it); inferred only for the legacy ids
 *                                             ('camera' -> 'camera'; 'person', 'car' -> 'prop')
 * @property {number} [pickPriority]           default 0; outranks wall (section) hits only (pickAt). Pivot 10, HDRI point 9.
 * @property {(mode: 'translate'|'rotate') => ({x: boolean, y: boolean, z: boolean}|null)} [allowedAxes]
 *                                             default every axis in both modes; null = the mode is unsupported (no
 *                                             handles, left out of SELECTION_CHANGED.modes); a false axis gets no handle
 * @property {() => boolean} isPickable        legacy pick gating (3441, 3446, 3455)
 * @property {() => import('three').Object3D[]} pickMeshes   meshes to raycast, in legacy push order (3442-3461)
 * @property {() => boolean} hasGizmoTarget    legacy updateGizmoPosition gating (previewCameraGroup / personMesh / carMesh, 3126-3134)
 * @property {(out: import('three').Vector3) => import('three').Vector3} gizmoAnchor   sets and returns `out`
 * @property {(rotation: import('three').Euler, mode?: 'translate'|'rotate') => void} orientGizmo   local-space orientation
 *                                             (3107-3118); the second argument is the gizmo mode (legacy targets ignore it)
 * @property {() => void} [beginGizmoDrag]     TransformGizmo.onMouseDown, on a handle hit
 * @property {(opts: {cancel: boolean}) => void} [endGizmoDrag]   the ONLY end hook: {cancel: false} on the mouse-up that
 *                                             ends a drag (commit); {cancel: true} from TransformGizmo.cancelDrag() (Escape)
 *                                             and detach() during a drag (restore). Absent: the drag cannot be cancelled.
 * @property {(movement: import('three').Vector3, ctx?: DragContext) => void} applyGizmoTranslate   domain write + pose
 *                                             event + refresh (legacy targets ignore ctx)
 * @property {(axis: 'x'|'y'|'z', deltaDeg: number, ctx?: DragContext) => void} applyGizmoRotate   deltaDeg already signed
 *                                             (Strategies.gizmoRotateSign)
 */

/**
 * @typedef {object} DragContext   the context of one gizmo drag step (03 5.4)
 * @property {'world'|'local'} space
 * @property {{x: number, y: number, z: number}} axisWorld   the unit drag axis in world space
 * @property {{pivotM: number}|null} snap      interaction.snap iff Ctrl/Cmd is held, else null
 */

/** The kinds of the three Phase-1 Selectables, which declare none (03 5.4: inferred only for these ids). */
const LEGACY_KINDS = Object.freeze({ camera: 'camera', person: 'prop', car: 'prop' });

/** The gizmo modes, in the order of SELECTION_CHANGED.modes. */
const GIZMO_MODES = Object.freeze(['translate', 'rotate']);

/**
 * The Selectable registry and the current selection. Owns the legacy global `selectedObject` (selectedId, the id
 * of a registered Selectable). select() / deselect() attach and detach the TransformGizmo and emit
 * SELECTION_CHANGED, which ViewportToolbar mirrors.
 * Wiring (App): registers the camera, person and car controllers in that order (the raycast tie order).
 * ViewportInput calls pickAt() on canvas mousedown and deselect() on Escape; CameraController and PropController
 * call deselect() when their selected object is hidden.
 */
export class SelectionManager {
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {import('./TransformGizmo.js').TransformGizmo} */
  #gizmo;
  /** @type {import('./InputState.js').PointerRay} */
  #pointerRay;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;
  /** @type {Selectable[]} registration order = raycast tie order */
  #selectables = [];
  /** @type {Map<Selectable, string>} the kind of each registered Selectable (declared, or inferred for a legacy id) */
  #kinds = new Map();
  /** @type {string|null} legacy `selectedObject` */
  #selectedId = null;
  /** @type {Selectable|null} */
  #selected = null;

  /**
   * Stores the collaborators.
   * Side effects: none.
   * @param {{bus: import('../core/EventBus.js').EventBus, gizmo: import('./TransformGizmo.js').TransformGizmo,
   *          pointerRay: import('./InputState.js').PointerRay,
   *          interaction: import('./InputState.js').InteractionState}} deps
   */
  constructor({ bus, gizmo, pointerRay, interaction }) {
    this.#bus = bus;
    this.#gizmo = gizmo;
    this.#pointerRay = pointerRay;
    this.#interaction = interaction;
  }

  /**
   * Registers a Selectable. Registration order is the raycast tie order: App registers camera, person, car
   * (the legacy push order 3440-3462), then the pivot (03 5.8).
   * Side effects: none besides the registration.
   * @param {Selectable} selectable
   * @throws {Error} for a Selectable without `kind` whose id is not one of the legacy ids (03 5.4)
   */
  register(selectable) {
    const kind = selectable.kind ?? LEGACY_KINDS[selectable.id];
    if (!kind) throw new Error(`Selectable ${JSON.stringify(selectable.id)} must declare its kind (03 5.4)`);
    this.#kinds.set(selectable, kind);
    this.#selectables.push(selectable);
  }

  /**
   * Side effects: none.
   * @param {Selectable|null} selectable
   * @returns {string|null} its kind (declared, or inferred for a legacy id), null when it is not registered
   */
  kindOf(selectable) {
    return this.#kinds.get(selectable) ?? null;
  }

  /** Side effects: none. @returns {string|null} legacy selectedObject: 'camera' | 'person' | 'car' | null */
  get selectedId() {
    return this.#selectedId;
  }

  /** Side effects: none. @returns {Selectable|null} the selected registered Selectable or null */
  get selected() {
    return this.#selected;
  }

  /**
   * Side effects: none.
   * @param {string} id
   * @returns {boolean} selectedId === id (legacy `selectedObject === id`)
   */
  isSelected(id) {
    return this.#selectedId === id;
  }

  /**
   * Side effects: none.
   * @param {string} id
   * @returns {Selectable|null} the registered Selectable with that id, or null
   */
  find(id) {
    return this.#selectables.find((s) => s.id === id) ?? null;
  }

  /**
   * Selects a registered Selectable: state, badge mirror, then the gizmo (rebuilt for the new target).
   * 03 5.4: the payload carries `modes`, the gizmo modes whose allowedAxes is not null (both for a legacy target); it is
   * emitted before gizmo.attach, so its subscribers cache it instead of reading gizmo.target.
   * Ports: index.html@cd3fd3f lines 3139-3143.
   * Side effects: emits SELECTION_CHANGED {id, label, modes} (badge), then gizmo.attach(selected) (rebuild).
   * @param {string} id
   */
  select(id) {
    this.#selectedId = id;
    this.#selected = this.find(id);
    const selected = this.#selected;
    const modes = GIZMO_MODES.filter((m) => !selected?.allowedAxes || selected.allowedAxes(m) !== null);
    this.#bus.emit(Events.SELECTION_CHANGED, { id, label: selected?.label, modes });
    this.#gizmo.attach(selected);
  }

  /**
   * Clears the selection: state, badge mirror, then the gizmo (removed; hover reset).
   * Ports: index.html@cd3fd3f lines 3145-3153 (hoveredAxis is reset by gizmo.detach, after the badge: PR5).
   * Side effects: emits SELECTION_CHANGED {id: null, label: null, modes: []}, then gizmo.detach().
   */
  deselect() {
    this.#selectedId = null;
    this.#selected = null;
    this.#bus.emit(Events.SELECTION_CHANGED, { id: null, label: null, modes: [] });
    this.#gizmo.detach();
  }

  /**
   * Legacy handleViewportClick (called on canvas mousedown when the gizmo did not take the event).
   * 03 5.4: the hit is chosen by #choose (pickPriority only against wall hits); without wall hits, which is every hit list
   * before spec 02 makes sections pickable, it is the nearest hit, the legacy rule bit for bit.
   * Ports: index.html@cd3fd3f lines 3427-3474.
   * Side effects: tags pick meshes with userData.selectType; may select() or deselect().
   * @param {MouseEvent} event
   */
  pickAt(event) {
    // LEGACY(B-M14): picking runs on mousedown (not on click), so every miss, including the start of an
    // orbit drag or a right click, deselects; a hit on the already selected object does nothing.
    if (this.#interaction.isDraggingGizmo || this.#interaction.pilotMode) return;
    if (!this.#gizmo.mode) return;

    const raycaster = this.#pointerRay.fromEvent(event);
    const intersects = raycaster.intersectObjects(this.#collectPickMeshes(), false);

    if (intersects.length > 0) {
      const selectType = this.#choose(intersects).object.userData.selectType;
      if (selectType && selectType !== this.#selectedId) {
        this.select(selectType);
      }
    } else {
      this.deselect();
    }
  }

  /**
   * The pick rule of 03 5.4: when the nearest hit is not a wall (section) hit, it wins (camera, prop, pivot, projector:
   * the legacy nearest-first rule). When it is a wall hit, the hit with the highest positive pickPriority behind it wins
   * (strictly higher, so the nearer of equal priorities), and the wall hit itself when there is none.
   * @param {{object: import('three').Object3D}[]} hits  raycaster order, nearest first (not empty)
   * @returns {{object: import('three').Object3D}} the chosen hit
   */
  #choose(hits) {
    const owner = (h) => this.find(h.object.userData.selectType);
    const kindOf = (h) => this.kindOf(owner(h));
    const prio = (h) => owner(h)?.pickPriority ?? 0;
    const first = hits[0];
    if (kindOf(first) !== 'section') return first;
    let best = null;
    for (const h of hits) {
      if (kindOf(h) === 'section' || prio(h) <= 0) continue;
      if (!best || prio(h) > prio(best)) best = h;
    }
    return best ?? first;
  }

  /**
   * The meshes to raycast, in registration order, each tagged with its Selectable's id.
   * Ports: index.html@cd3fd3f lines 3438-3462.
   * @returns {import('three').Object3D[]}
   */
  #collectPickMeshes() {
    const selectables = [];
    for (const selectable of this.#selectables) {
      if (!selectable.isPickable()) continue;
      for (const mesh of selectable.pickMeshes()) {
        mesh.userData.selectType = selectable.id;
        selectables.push(mesh);
      }
    }
    return selectables;
  }
}
