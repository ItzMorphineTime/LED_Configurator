/**
 * @module app/PivotController
 * The wall-pivot use cases (Feature 3, docs/improvements/03-pivot.md 5.3, 5.6, 6.5, 6.7): the mode, the offset and its
 * reset, the keep-stage-layout and marker toggles, the Ctrl-drag snap step and the O-key selection toggle, each through
 * the one pivot pipeline P-PIVOT (#commit), plus the Selectable 'pivot' (the path-B hook set of 03 5.4, 07 C33) that the
 * TransformGizmo drives. The pivot is session-only until project file v2 (the owner's decision of 2026-10-17).
 * Never imports or calls ui/: PivotPanel, PivotMarkerView and CameraPanel mirror WALL_PIVOT_CHANGED; the gizmo follows
 * SELECTABLE_MOVED. WallController stays the only module that decides wall rebuilds (commitPivot, ARCHITECTURE.md 6.2).
 * Legacy source: none (new feature; the stage-anchored participants port no legacy code either).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

import { Events } from '../core/EventBus.js';
import { stageShift } from '../geometry/WallLayout.js';

/** The "Ctrl-drag snap" steps in metres: the values of the #pivot-snap options (03 3.2), smallest first. */
export const PIVOT_SNAP_STEPS_M = Object.freeze([0.001, 0.01, 0.1, 0.5, 1]);

/** The offset axes, in the order every per-axis loop uses. */
const AXES = Object.freeze(['x', 'y', 'z']);

/**
 * Rounds a distance to 1 mm (03 6.7 round_mm); a rounded -0 becomes +0.
 * Side effects: none.
 * @param {number} v  metres
 * @returns {number}
 */
const roundMm = (v) => Math.round(v * 1000) / 1000 || 0;

/**
 * The offset a pivot drag would commit (03 6.7, relative snapping, D9): the DRAGGED DISTANCE of each axis is snapped
 * to `step` (or rounded to 1 mm without a step) and added to the stored offset; an axis whose snapped distance is 0
 * keeps the stored value itself, bit for bit (an off-grid 0.123 stays 0.123).
 * Side effects: none.
 * @param {{x: number, y: number, z: number}} offset   the stored offset at the drag start (metres)
 * @param {{x: number, y: number, z: number}} pending  the accumulated, unsnapped drag movement (metres, stage = layout axes)
 * @param {number} step  the snap step in metres (Ctrl/Cmd held), or 0 for no snapping
 * @returns {{x: number, y: number, z: number}} the target offset
 */
export function dragTarget(offset, pending, step) {
  const target = {};
  for (const k of AXES) {
    const d = step > 0 ? roundMm(Math.round(pending[k] / step) * step) : roundMm(pending[k]);
    target[k] = d === 0 ? offset[k] : offset[k] + d;
  }
  return target;
}

/**
 * @typedef {object} StageAnchored  a stage-frame object re-expressed on explicit pivot edits (03 5.3, 6.5; 07 C45)
 * @property {string} id
 * @property {(dx: number, dz: number) => void} translateStage  domain write clamped through its LIMITS + its own pose
 *   mirror event; never a hub refresh (the pivot rebuild runs it)
 */

/**
 * @typedef {object} PivotMarker  what the controller needs of render/PivotMarkerView (03 5.3)
 * @property {boolean} exists          the marker group is allocated (after its init, the last bootstrap step)
 * @property {boolean} hasResolution   the last placed resolution is non-null
 * @property {boolean} visible         the marker is shown
 * @property {() => import('three').Object3D[]} pickMeshes   [the invisible pick proxy]
 * @property {(dx: number, dy: number, dz: number) => void} setPreview   the drag preview (glyph displacement)
 * @property {() => void} clearPreview
 */

/**
 * The pivot use cases and the Selectable 'pivot' (registered after the camera, person and car, so it is last in the
 * raycast tie order; its pickPriority counts only against wall hits, 03 5.4).
 * @implements {import('../interaction/SelectionManager.js').Selectable}
 */
export class PivotController {
  /** Selectable id. */
  id = 'pivot';
  /** Selection badge text. */
  label = 'Pivot';
  /** Selectable kind (03 5.4: required for every Selectable added after Phase 1). */
  kind = 'pivot';
  /** Outranks wall (section) hits only; against the camera, props and spec 05's point the nearest hit wins (03 5.4). */
  pickPriority = 10;

  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('./WallController.js').WallController} */
  #wallController;
  /** @type {PivotMarker} */
  #markerView;
  /** @type {StageAnchored[]} re-expression order: camera, person, car (03 5.8) */
  #stageAnchored;
  /** @type {import('../interaction/SelectionManager.js').SelectionManager} */
  #selection;
  /** @type {import('../interaction/TransformGizmo.js').TransformGizmo} */
  #gizmo;
  /** @type {import('../interaction/InputState.js').InteractionState} */
  #interaction;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {boolean} a gizmo drag of the pivot is in progress (between beginGizmoDrag and endGizmoDrag) */
  #dragging = false;
  /** @type {{x: number, y: number, z: number}} the accumulated, unsnapped drag movement (03 6.7) */
  #pending = { x: 0, y: 0, z: 0 };
  /** @type {{x: number, y: number, z: number}|null} the offset the drag would commit (the last previewed value) */
  #target = null;
  /** @type {{x: number, y: number, z: number}} the marker glyph displacement of the drag preview (stage frame) */
  #preview = { x: 0, y: 0, z: 0 };

  /**
   * Stores the collaborators only (R4).
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          wallController: import('./WallController.js').WallController,
   *          markerView: PivotMarker,
   *          stageAnchored: StageAnchored[],
   *          selection: import('../interaction/SelectionManager.js').SelectionManager,
   *          gizmo: import('../interaction/TransformGizmo.js').TransformGizmo,
   *          interaction: import('../interaction/InputState.js').InteractionState,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   *   stageAnchored: [cameraController, personController, carController] (spec 05's HDRI point, spec 09's measurements
   *   and 07 I4b's OrbitController append themselves later, 07 C45); each clamps through its own LIMITS
   */
  constructor({ project, wallController, markerView, stageAnchored, selection, gizmo, interaction, bus }) {
    this.#project = project;
    this.#wallController = wallController;
    this.#markerView = markerView;
    this.#stageAnchored = stageAnchored;
    this.#selection = selection;
    this.#gizmo = gizmo;
    this.#interaction = interaction;
    this.#bus = bus;
  }

  /** Side effects: none. @returns {import('../domain/Wall.js').WallPivot} project.wall.pivot (the live object) */
  get pivot() {
    return this.#project.wall.pivot;
  }

  /**
   * The mode radios (rebuild-policy row F3-1).
   * Side effects: P-PIVOT (#commit) iff the mode changes.
   * @param {string} mode  a PIVOT_MODES value
   * @throws {RangeError} for an unknown mode (WallPivot.setMode), before anything is written
   */
  setMode(mode) {
    this.#commit((p) => p.setMode(mode), 'mode');
  }

  /**
   * One offset input (row F3-2). A value WallPivot.parseOffset rejects writes nothing.
   * Side effects: P-PIVOT iff the stored component changes.
   * @param {'x'|'y'|'z'} axis
   * @param {number|string} raw  the input's text (or a number)
   * @returns {number} the stored component, for the input's write-back
   */
  setOffsetAxis(axis, raw) {
    this.#commit((p) => p.setOffsetAxis(axis, raw), 'offset');
    return this.pivot.offset[axis];
  }

  /**
   * #pivot-reset-offset (row F3-3).
   * Side effects: P-PIVOT iff the offset was not already (0, 0, 0).
   */
  resetOffset() {
    this.#commit((p) => p.resetOffset(), 'reset-offset');
  }

  /**
   * #toggle-pivot-keep-stage (row F3-5): never rebuilds, never re-expresses.
   * Side effects: writes pivot.keepStageLayout; iff it changed, emits WALL_PIVOT_CHANGED {source: 'keep-stage',
   *   stageShift: (0, 0), reexpressed: false, rebuilds: false, resolution: the cached one}.
   * @param {boolean} on
   * @throws {TypeError} when `on` is not a boolean (WallPivot.setKeepStageLayout)
   */
  setKeepStageLayout(on) {
    if (this.pivot.setKeepStageLayout(on)) this.#emitToggle('keep-stage');
  }

  /**
   * #toggle-pivot-marker (row F3-5): view-only, session-only. While the pivot is selected the marker shows anyway.
   * Side effects: writes display.showPivotMarker; emits WALL_PIVOT_CHANGED {source: 'marker', rebuilds: false} (the
   *   marker view mirrors its visibility, the panel its toggle).
   * @param {boolean} on
   */
  setMarkerVisible(on) {
    const display = this.#project.display;
    display.showPivotMarker = on;
    this.#emitToggle('marker');
  }

  /**
   * #pivot-snap: the Ctrl-drag snap step of pivot drags (session-only; the shared snapping model, D9).
   * Side effects: gizmo.setSnapIncrements({pivotM: m}) (writes interaction.snap.pivotM).
   * @param {number} m  one of PIVOT_SNAP_STEPS_M
   * @throws {RangeError} for any other value
   */
  setSnapStep(m) {
    if (!PIVOT_SNAP_STEPS_M.includes(m)) throw new RangeError(`Unknown pivot snap step ${JSON.stringify(m)}`);
    this.#gizmo.setSnapIncrements({ pivotM: m });
  }

  /**
   * The O key and #pivot-select (03 3.4): select the pivot (and switch the gizmo to translate unless it already is), or
   * deselect it. A no-op in pilot mode (the marker is hidden and unpickable there, 03 3.3, AC 12; the button is "the same
   * as the O key", 3.2, whose guards include pilot mode), while a gizmo drag is active or while a cancelled drag's button
   * is still held.
   * Side effects: selection.select('pivot') and maybe gizmo.setMode('translate'), or selection.deselect().
   */
  toggleSelect() {
    const interaction = this.#interaction;
    if (interaction.pilotMode || interaction.isDraggingGizmo || interaction.gestureCancelled) return;
    if (this.#selection.isSelected(this.id)) {
      this.#selection.deselect();
      return;
    }
    this.#selection.select(this.id);
    if (this.#gizmo.mode !== 'translate') this.#gizmo.setMode('translate');
  }

  // ---- Selectable 'pivot' (the path-B hook set of 03 5.4, 07 C33) ---------------------------------------------

  /**
   * Translate only (B-L22 is not repeated): every axis in 'translate', null (mode unsupported: no handles, and the
   * mode is left out of SELECTION_CHANGED.modes) in any other mode.
   * Side effects: none.
   * @param {'translate'|'rotate'|null} mode
   * @returns {{x: boolean, y: boolean, z: boolean}|null}
   */
  allowedAxes(mode) {
    return mode === 'translate' ? { x: true, y: true, z: true } : null;
  }

  /** Side effects: none. @returns {boolean} the marker exists, has a resolution and is shown */
  isPickable() {
    const marker = this.#markerView;
    return marker.exists && marker.hasResolution && marker.visible;
  }

  /** Side effects: none. @returns {import('three').Object3D[]} the marker's invisible pick proxy */
  pickMeshes() {
    return this.#markerView.pickMeshes();
  }

  /** Side effects: none. @returns {boolean} the marker exists and the cached resolution is non-null */
  hasGizmoTarget() {
    return this.#markerView.exists && this.#wallController.pivotResolution !== null;
  }

  /**
   * The gizmo position in the STAGE frame: the glyph (0, P.y, 0) plus the drag preview. It reads WallController's cache,
   * which rebuild step 1 and commitPivot set before WALL_REBUILT and SELECTABLE_MOVED are emitted, so the result never
   * depends on the order of the WALL_REBUILT subscribers (03 5.4 re-anchor); a null resolution gives the preview alone.
   * Side effects: writes `out`.
   * @param {import('three').Vector3} out
   * @returns {import('three').Vector3} out
   */
  gizmoAnchor(out) {
    const r = this.#wallController.pivotResolution;
    const p = this.#preview;
    return out.set(p.x, (r ? r.point.y : 0) + p.y, p.z);
  }

  /**
   * The pivot has no rotation: world and local space coincide.
   * Side effects: writes `rotation`.
   * @param {import('three').Euler} rotation  the gizmo group's rotation
   * @param {'translate'|'rotate'} [mode]  unused
   */
  orientGizmo(rotation, mode) {
    rotation.set(0, 0, 0);
  }

  /**
   * TransformGizmo.onMouseDown, on a handle hit: starts a drag from the stored offset.
   * Side effects: resets the drag state (pending, target, preview).
   */
  beginGizmoDrag() {
    this.#dragging = true;
    this.#pending = { x: 0, y: 0, z: 0 };
    this.#target = { ...this.pivot.offset };
    this.#preview = { x: 0, y: 0, z: 0 };
  }

  /**
   * One drag step (03 6.7): only the marker glyph moves; nothing is committed and the wall never rebuilds during a drag.
   * `ctx.snap` is interaction.snap while Ctrl/Cmd is held (its pivotM is the step), else null. ctx.space and
   * ctx.axisWorld are not needed: stage deltas equal world deltas and the pivot has no rotation.
   * Side effects: updates the drag state; markerView.setPreview(preview); emits SELECTABLE_MOVED {id: 'pivot'}.
   * @param {{x: number, y: number, z: number}} movement  the gizmo's incremental world movement along the active axis
   * @param {{space?: string, axisWorld?: {x: number, y: number, z: number}, snap?: {pivotM: number}|null}} [ctx]
   */
  applyGizmoTranslate(movement, ctx) {
    if (!this.#dragging) this.beginGizmoDrag();
    const pending = this.#pending;
    pending.x += movement.x;
    pending.y += movement.y;
    pending.z += movement.z;
    const offset = this.pivot.offset;
    const target = dragTarget(offset, pending, ctx?.snap ? ctx.snap.pivotM : 0);
    this.#target = target;
    this.#preview = { x: target.x - offset.x, y: target.y - offset.y, z: target.z - offset.z };
    this.#markerView.setPreview(this.#preview.x, this.#preview.y, this.#preview.z);
    this.#bus.emit(Events.SELECTABLE_MOVED, { id: this.id });
  }

  /**
   * Never called: allowedAxes('rotate') is null, so the gizmo builds no rotate handles for the pivot.
   * Side effects: none.
   * @param {'x'|'y'|'z'} axis
   * @param {number} deltaDeg
   * @param {object} [ctx]
   */
  applyGizmoRotate(axis, deltaDeg, ctx) {
  }

  /**
   * The only end hook (03 5.4, 07 C33).
   * {cancel: false} (mouse-up after a drag): the last previewed target is committed through P-PIVOT (rebuild-policy row
   * F3-4: exactly one rebuild iff the stage origin moved), or nothing when it equals the stored offset.
   * {cancel: true} (Escape mid-drag through TransformGizmo.cancelDrag(), or a detach during a drag): the preview is
   * cleared and nothing is committed.
   * Side effects: markerView.clearPreview(); P-PIVOT or SELECTABLE_MOVED {id: 'pivot'}.
   * @param {{cancel: boolean}} options
   */
  endGizmoDrag({ cancel }) {
    const target = this.#target;
    this.#dragging = false;
    this.#target = null;
    this.#clearPreview();
    const offset = this.pivot.offset;
    if (cancel || !target || (target.x === offset.x && target.y === offset.y && target.z === offset.z)) {
      this.#bus.emit(Events.SELECTABLE_MOVED, { id: this.id });
      return;
    }
    this.#commit((p) => p.setOffset(target), 'gizmo');
  }

  // ---- P-PIVOT ---------------------------------------------------------------------------------------------------

  /**
   * P-PIVOT (03 5.6): the model write through a WallPivot method (clamped and rounded); nothing more when the pivot is
   * unchanged. Otherwise: the stage-origin shift against WallController's cached resolution; with keep-stage-layout on
   * and a moved origin, every StageAnchored participant is re-expressed by the negated shift (6.5); WALL_PIVOT_CHANGED;
   * WallController.commitPivot (one rebuild iff the stage origin moved, else the cache only); SELECTABLE_MOVED, so a
   * selected pivot's gizmo follows (also for a height-only change).
   * Side effects: the pivot; maybe translateStage on each participant (their pose events); emits WALL_PIVOT_CHANGED;
   *   wallController.commitPivot(after); emits SELECTABLE_MOVED {id: 'pivot'}.
   * @param {(pivot: import('../domain/Wall.js').WallPivot) => void} mutate
   * @param {'mode'|'offset'|'reset-offset'|'gizmo'} source
   */
  #commit(mutate, source) {
    const pivot = this.pivot;
    const snapshot = pivot.clone();
    mutate(pivot);
    if (pivot.equals(snapshot)) return;
    const wallController = this.#wallController;
    const before = wallController.pivotResolution;
    const after = wallController.resolvePivotNow();
    const shift = stageShift(before, after);
    const moved = shift.x !== 0 || shift.z !== 0;
    const reexpressed = moved && pivot.keepStageLayout;
    if (reexpressed) {
      for (const participant of this.#stageAnchored) participant.translateStage(-shift.x, -shift.z);
    }
    this.#bus.emit(Events.WALL_PIVOT_CHANGED, {
      source, pivot: pivot.clone(), resolution: after, stageShift: shift, reexpressed, rebuilds: moved,
    });
    wallController.commitPivot(after);
    this.#bus.emit(Events.SELECTABLE_MOVED, { id: this.id });
  }

  /**
   * The WALL_PIVOT_CHANGED of the two toggles (rebuilds nothing, re-expresses nothing).
   * Side effects: emits WALL_PIVOT_CHANGED.
   * @param {'keep-stage'|'marker'} source
   */
  #emitToggle(source) {
    this.#bus.emit(Events.WALL_PIVOT_CHANGED, {
      source, pivot: this.pivot.clone(), resolution: this.#wallController.pivotResolution, stageShift: { x: 0, z: 0 },
      reexpressed: false, rebuilds: false,
    });
  }

  /** Side effects: preview = (0, 0, 0); markerView.clearPreview(). */
  #clearPreview() {
    this.#preview = { x: 0, y: 0, z: 0 };
    this.#markerView.clearPreview();
  }
}
