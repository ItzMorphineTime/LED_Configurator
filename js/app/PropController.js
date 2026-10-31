/**
 * @module app/PropController
 * The reference-prop use cases (one instance per prop: person, car): show/hide, field inputs, the transform
 * step, and the prop's Selectable (id = prop.kind) driven by the transform gizmo.
 * Never imports or calls ui/: PropControls mirror PROP_VISIBILITY_CHANGED and PROP_POSE_CHANGED; the gizmo
 * follows SELECTABLE_MOVED. Collaborators are injected; their types appear in JSDoc only.
 * Legacy source: index.html@cd3fd3f 2879-2892 / 2970-2983 (create tail, updatePersonTransform,
 * updateCarTransform), 3114-3117 / 3128-3131 (gizmo orientation and anchor), 3347-3360 / 3388-3399 (gizmo drags
 * on props), 3446-3461 (pick gating), 4332-4392 (prop toggles and inputs).
 * Layer: app (may import core, legacy, domain, geometry).
 */

import { Events } from '../core/EventBus.js';

/**
 * Use cases and Selectable of one prop. App registers the person after the camera and the car last (the legacy
 * pick push order).
 * @implements {import('../interaction/SelectionManager.js').Selectable}
 */
export class PropController {
  /** @type {import('../domain/Prop.js').Prop} */
  #prop;
  /** @type {import('../render/PropViews.js').PropView} */
  #view;
  /** @type {import('../interaction/SelectionManager.js').SelectionManager} */
  #selection;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /**
   * Stores the collaborators only.
   * Side effects: none.
   * @param {{prop: import('../domain/Prop.js').Prop, view: import('../render/PropViews.js').PropView,
   *          selection: import('../interaction/SelectionManager.js').SelectionManager,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ prop, view, selection, bus }) {
    this.#prop = prop;
    this.#view = view;
    this.#selection = selection;
    this.#bus = bus;
  }

  /** Side effects: none. @returns {string} the Selectable id: prop.kind ('person' | 'car') */
  get id() {
    return this.#prop.kind;
  }

  /** Side effects: none. @returns {string} the selection badge text: prop.label ('Person' | 'Car') */
  get label() {
    return this.#prop.label;
  }

  /**
   * Shows or hides the prop, after PropControls flipped the toggle class. On: build, transform (including the
   * gizmo follow), then add to the scene (legacy create -> update*Transform -> scene.add). Off: remove, then
   * deselect it if selected.
   * Ports: index.html@cd3fd3f lines 4334-4341 / 4365-4372 (with 2879-2880 / 2970-2971).
   * Side effects: writes prop.visible; emits PROP_VISIBILITY_CHANGED {id, visible} (options block);
   *   on: view.create(), applyTransform() (emits SELECTABLE_MOVED), view.addToScene();
   *   off: view.remove(), selection.deselect() when this prop is selected.
   * @param {boolean} on  the toggle's new state
   * @returns {void}
   */
  setVisible(on) {
    const prop = this.#prop;
    prop.visible = on;
    this.#bus.emit(Events.PROP_VISIBILITY_CHANGED, { id: this.id, visible: on });
    if (on) {
      this.#view.create();
      this.applyTransform();
      this.#view.addToScene();
    } else {
      this.#view.remove();
      if (this.#selection.isSelected(this.id)) this.#selection.deselect();
    }
  }

  /**
   * Stores a prop input (model only; the panel writes back iff Prop.FIELD_RULES[field].writeBack, then calls
   * applyTransform()).
   * Ports: index.html@cd3fd3f lines 4345, 4349, 4353, 4358 (car 4376, 4380, 4384, 4389).
   * Side effects: writes prop[field].
   * @param {string} field  a Prop.FIELD_RULES key
   * @param {string} raw    the input's value
   * @returns {number} the stored value
   */
  setField(field, raw) {
    return this.#prop.setField(field, raw);
  }

  /**
   * Applies the prop pose to its view (no-op while hidden) and lets the gizmo follow.
   * Ports: index.html@cd3fd3f lines 2883-2892 / 2974-2983.
   * Side effects: view.updateTransform(prop); emits SELECTABLE_MOVED {id} (the gizmo moves iff this prop is selected).
   * @returns {void}
   */
  applyTransform() {
    if (!this.#view.exists) return;
    this.#view.updateTransform(this.#prop);
    this.#bus.emit(Events.SELECTABLE_MOVED, { id: this.id });
  }

  /**
   * The pose and scale of a v2 import (08 6.17 step 10; P2-13e): the validated values through Prop.assign (the far
   * bounds only), the input mirror ('import') and the transform (a no-op while the prop is hidden).
   * Side effects: writes the prop's pose and scale; emits PROP_POSE_CHANGED {id, source: 'import'}; applyTransform().
   * @param {{posX: number, posZ: number, rotY: number, scale: number}} pose
   * @returns {void}
   */
  applyImportedPose(pose) {
    const { posX, posZ, rotY, scale } = pose;
    this.#prop.assign({ posX, posZ, rotY, scale });
    this.#bus.emit(Events.PROP_POSE_CHANGED, { id: this.id, source: 'import' });
    this.applyTransform();
  }

  /**
   * StageAnchored participant (03 5.3, 6.5): re-expresses the prop after an explicit pivot edit moved the stage origin
   * by -(dx, dz), clamped through Prop.LIMITS (07 C45), mirrors its inputs and applies the transform (a no-op while the
   * prop is hidden; the pose is re-expressed anyway).
   * Side effects: writes prop.posX, prop.posZ; emits PROP_POSE_CHANGED {id, source: 'pivot'}; applyTransform().
   * @param {number} dx  metres
   * @param {number} dz  metres
   * @returns {void}
   */
  translateStage(dx, dz) {
    this.#prop.translateStage(dx, dz);
    this.#bus.emit(Events.PROP_POSE_CHANGED, { id: this.id, source: 'pivot' });
    this.applyTransform();
  }

  /**
   * StageAnchored participant, the rigid form (03 12.6): Prop.reexpressStage(change), the input mirror and the transform.
   * Side effects: writes the prop's pose; emits PROP_POSE_CHANGED {id, source: 'pivot'}; applyTransform().
   * @param {{yawDeg: number, cos: number, sin: number, dx: number, dz: number}} change  WallLayout.stageChange
   * @returns {void}
   */
  reexpressStage(change) {
    this.#prop.reexpressStage(change);
    this.#bus.emit(Events.PROP_POSE_CHANGED, { id: this.id, source: 'pivot' });
    this.applyTransform();
  }

  // ---- Selectable ------------------------------------------------------------------------------------------

  /**
   * Pick gating (legacy `showPerson && personMesh` / `showCar && carMesh`).
   * Ports: index.html@cd3fd3f lines 3446, 3455.
   * Side effects: none.
   * @returns {boolean}
   */
  isPickable() {
    return this.#prop.visible && this.#view.exists;
  }

  /**
   * Ports: index.html@cd3fd3f lines 3447-3452 / 3456-3461.
   * Side effects: none.
   * @returns {import('three').Object3D[]} the prop's meshes in traversal order
   */
  pickMeshes() {
    return this.#view.pickMeshes();
  }

  /**
   * Gizmo follow gating (legacy `personMesh` / `carMesh`).
   * Ports: index.html@cd3fd3f lines 3128, 3130.
   * Side effects: none.
   * @returns {boolean}
   */
  hasGizmoTarget() {
    return this.#view.exists;
  }

  /**
   * The gizmo position: on the prop at its anchor height (0.9 m person, 0.5 m car).
   * Ports: index.html@cd3fd3f lines 3129, 3131.
   * Side effects: writes `out`.
   * @param {import('three').Vector3} out
   * @returns {import('three').Vector3} out
   */
  gizmoAnchor(out) {
    const prop = this.#prop;
    return out.set(prop.posX, prop.gizmoAnchorY, prop.posZ);
  }

  /**
   * Local-space gizmo orientation: the prop's heading only.
   * Ports: index.html@cd3fd3f lines 3115, 3117.
   * Side effects: writes rotation.y.
   * @param {import('three').Euler} rotation  the gizmo group's rotation (already reset to 0, 0, 0)
   * @returns {void}
   */
  orientGizmo(rotation) {
    rotation.y = this.#prop.rotY * Math.PI / 180;
  }

  /**
   * Gizmo translate drag step on the prop (floor only: B-L22, tagged at Prop.translateBy).
   * Ports: index.html@cd3fd3f lines 3347-3353 / 3354-3360.
   * Side effects: writes posX, posZ; emits PROP_POSE_CHANGED {id, source: 'gizmo-translate'} (pos inputs);
   *   applyTransform().
   * @param {import('three').Vector3} movement  world-space movement along the active axis
   * @returns {void}
   */
  applyGizmoTranslate(movement) {
    const prop = this.#prop;
    prop.translateBy(movement.x, movement.y, movement.z);
    this.#bus.emit(Events.PROP_POSE_CHANGED, { id: this.id, source: 'gizmo-translate' });
    this.applyTransform();
  }

  /**
   * Gizmo rotate drag step on the prop: only the Y ring acts (B-L22, tagged at Prop.rotateBy).
   * Ports: index.html@cd3fd3f lines 3388-3399.
   * Side effects: when axis is 'y': writes rotY; emits PROP_POSE_CHANGED {id, source: 'gizmo-rotate'} (rotation
   *   input); applyTransform(). Otherwise nothing.
   * @param {'x'|'y'|'z'} axis
   * @param {number} deltaDeg  signed degrees (already carries Strategies.gizmoRotateSign)
   * @returns {void}
   */
  applyGizmoRotate(axis, deltaDeg) {
    if (this.#prop.rotateBy(axis, deltaDeg)) {
      this.#bus.emit(Events.PROP_POSE_CHANGED, { id: this.id, source: 'gizmo-rotate' });
      this.applyTransform();
    }
  }
}
