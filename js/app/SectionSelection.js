/**
 * @module app/SectionSelection
 * Wall sections as selectable objects (the owner's request of 2026-10-31; spec 02's PickProvider of
 * docs/improvements/02-section-editing-offsets.md 5.2 without its offsets, multi-selection, hover or gizmo):
 *  - the pick provider of SelectionManager: its click pick (hitAt) raycasts the wall meshes of every mesh mode
 *    (view.meshes()) and resolves a hit to 'section:<id>' through view.sectionOfHit (the combined mesh's face ranges, the
 *    section and panel mesh tags);
 *  - the section Selectables: kind 'section', the section's name as the badge label, its id as `sectionId` (the UV
 *    viewer follows it, 04 5.3), and no gizmo: allowedAxes is null in both modes, so G and R build no handles and the
 *    drag hooks are no-ops;
 *  - a rebuild observer (WallController.addRebuildObserver) that keeps the selection valid: after an import the section
 *    selection is cleared (the new wall's ids name other sections); after any other rebuild and after a rename
 *    SelectionManager.prune() deselects a deleted section and re-announces a renamed one (the badge follows).
 * Legacy source: none (new feature).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */
import { sectionSelectionId, sectionKeyOf, isSectionKey } from '../core/sectionIds.js';

/**
 * The Selectable of one section (a snapshot: the label is the name when it was made).
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @returns {import('../interaction/SelectionManager.js').Selectable & {sectionId: *}}
 */
export function sectionSelectable(section) {
  const noop = () => {};
  return Object.freeze({
    id: sectionSelectionId(section.id),
    kind: 'section',
    label: String(section.name),
    sectionId: section.id,
    allowedAxes: () => null,
    isPickable: () => false,
    pickMeshes: () => [],
    hasGizmoTarget: () => false,
    gizmoAnchor: (out) => out,
    orientGizmo: noop,
    applyGizmoTranslate: noop,
    applyGizmoRotate: noop,
  });
}

/** The wall sections' pick provider and selection upkeep. */
export class SectionSelection {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../render/LEDWallView.js').LEDWallView} */
  #view;
  /** @type {import('../interaction/SelectionManager.js').SelectionManager} */
  #selection;

  /**
   * Stores the collaborators only.
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          view: {meshes(): object[], sectionOfHit(hit: object): ({sectionId: *}|null)},
   *          selection: import('../interaction/SelectionManager.js').SelectionManager}} deps  view: the LEDWallView
   */
  constructor({ project, view, selection }) {
    this.#project = project;
    this.#view = view;
    this.#selection = selection;
  }

  // ---- PickProvider ----------------------------------------------------------------------------------------------

  /** Side effects: none. @returns {boolean} always (pilot mode and gizmo drags are gated by SelectionManager.hitAt) */
  isPickable() {
    return true;
  }

  /** Side effects: none. @returns {object[]} the wall meshes of the last rebuild */
  pickMeshes() {
    return this.#view.meshes();
  }

  /**
   * Side effects: none.
   * @param {object} hit  a raw intersection with a wall mesh
   * @returns {string|null} the section's selection id
   */
  resolveHit(hit) {
    const r = this.#view.sectionOfHit(hit);
    return r ? sectionSelectionId(r.sectionId) : null;
  }

  /**
   * Side effects: none.
   * @param {string} id
   * @returns {object|null} the Selectable of the first section the id names, null for another id or a missing section
   */
  find(id) {
    const key = sectionKeyOf(id);
    if (key === null) return null;
    const section = this.#project.wall.sections.find((s) => isSectionKey(s, key));
    return section ? sectionSelectable(section) : null;
  }

  // ---- WallController rebuild observer -----------------------------------------------------------------------------

  /**
   * After a rebuild: an import clears a section selection; any other rebuild prunes it (a deleted section is deselected).
   * Side effects: maybe selection.deselect() or selection.prune().
   * @param {{cause?: string}} info
   */
  onWallRebuilt({ cause = 'edit' } = {}) {
    const selection = this.#selection;
    if (sectionKeyOf(selection.selectedId) === null) return;
    if (cause === 'import') selection.deselect();
    else selection.prune();
  }

  /**
   * After a rename (every keystroke of a card's name field): the badge shows the new name.
   * Side effects: maybe selection.prune() (which re-selects the renamed section).
   */
  onSectionRenamed() {
    if (sectionKeyOf(this.#selection.selectedId) !== null) this.#selection.prune();
  }
}
