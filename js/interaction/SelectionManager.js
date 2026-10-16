/**
 * @module interaction/SelectionManager
 * The registry of Selectables (camera, person, car), the selection state (legacy `selectedObject`) and
 * raycast picking (legacy handleViewportClick). Defines the Selectable typedef that the app controllers
 * implement and the TransformGizmo drives.
 * Legacy source: index.html@cd3fd3f 1360 (selectedObject), 3139-3153 (selectObject, deselectObject),
 * 3427-3474 (handleViewportClick).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import { Events } from '../core/EventBus.js';

/**
 * @typedef {object} Selectable   implemented by CameraController ('camera') and PropController ('person', 'car');
 *  Feature 2 adds WallSectionSelectable, Feature 3 a pivot Selectable, Feature 5 a projection-point Selectable.
 * @property {string} id                       'camera' | 'person' | 'car'
 * @property {string} label                    badge text: 'Camera' | 'Person' | 'Car' (legacy names map 3161)
 * @property {() => boolean} isPickable        legacy pick gating (3441, 3446, 3455)
 * @property {() => import('three').Object3D[]} pickMeshes   meshes to raycast, in legacy push order (3442-3461)
 * @property {() => boolean} hasGizmoTarget    legacy updateGizmoPosition gating (previewCameraGroup / personMesh / carMesh, 3126-3134)
 * @property {(out: import('three').Vector3) => import('three').Vector3} gizmoAnchor   sets and returns `out`
 * @property {(rotation: import('three').Euler) => void} orientGizmo   local-space orientation (3107-3118)
 * @property {(movement: import('three').Vector3) => void} applyGizmoTranslate   domain write + pose event + refresh
 * @property {(axis: 'x'|'y'|'z', deltaDeg: number) => void} applyGizmoRotate      deltaDeg already signed (Strategies.gizmoRotateSign)
 */

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
   * (the legacy push order 3440-3462).
   * Side effects: none besides the registration.
   * @param {Selectable} selectable
   */
  register(selectable) {
    this.#selectables.push(selectable);
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
   * Ports: index.html@cd3fd3f lines 3139-3143.
   * Side effects: emits SELECTION_CHANGED {id, label} (badge), then gizmo.attach(selected) (rebuild).
   * @param {string} id
   */
  select(id) {
    this.#selectedId = id;
    this.#selected = this.find(id);
    this.#bus.emit(Events.SELECTION_CHANGED, { id, label: this.#selected?.label });
    this.#gizmo.attach(this.#selected);
  }

  /**
   * Clears the selection: state, badge mirror, then the gizmo (removed; hover reset).
   * Ports: index.html@cd3fd3f lines 3145-3153 (hoveredAxis is reset by gizmo.detach, after the badge: PR5).
   * Side effects: emits SELECTION_CHANGED {id: null, label: null}, then gizmo.detach().
   */
  deselect() {
    this.#selectedId = null;
    this.#selected = null;
    this.#bus.emit(Events.SELECTION_CHANGED, { id: null, label: null });
    this.#gizmo.detach();
  }

  /**
   * Legacy handleViewportClick (called on canvas mousedown when the gizmo did not take the event).
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
      const selectType = intersects[0].object.userData.selectType;
      if (selectType && selectType !== this.#selectedId) {
        this.select(selectType);
      }
    } else {
      this.deselect();
    }
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
