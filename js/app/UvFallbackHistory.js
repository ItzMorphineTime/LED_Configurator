/**
 * @module app/UvFallbackHistory
 * The UV-only undo/redo stack of spec 04's path B (docs/improvements/04-uvs-uv-editor.md 5.2, 3.3; the owner's decision:
 * spec 07's global History does not exist yet). A 200-entry stack with the subset of 07's History interface that
 * UvController uses (record, undo, redo, canUndo, canRedo, undoLabel, redoLabel), plus pruning of entries whose
 * sections were deleted. The entries are opaque to the stack: UvController applies their `before` (undo) or `after`
 * (redo) side. Replaced by 07's History and deleted with 04 UV-18.
 * Legacy source: none (Feature 4).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

/**
 * @typedef {{id: *, t: import('../domain/UvSettings.js').UvTransform}} TransformState  one section's transform
 * @typedef {{id: *, edits: import('../domain/UvSettings.js').UvVertexEdits|null}} VertexState  one section's vertex edits
 * @typedef {{kind: 'transforms', before: TransformState[], after: TransformState[]}
 *          | {kind: 'vertices', before: VertexState[], after: VertexState[]}
 *          | {kind: 'settings', key: string, before: *, after: *}} UvHistoryEntry
 */

/** A UV-only undo/redo stack (path B). */
export class UvFallbackHistory {
  /** @type {object[]} oldest first */
  #undo = [];
  /** @type {object[]} the most recently undone last */
  #redo = [];
  /** @type {number} */
  #limit;
  /** @type {() => number} */
  #now;
  /** @type {number} */
  #coalesceMs;

  /**
   * Side effects: none.
   * @param {{limit?: number, now?: () => number, coalesceMs?: number}} [options]  defaults 200 entries, Date.now and
   *   07's 750 ms coalescing window
   */
  constructor({ limit = 200, now = () => Date.now(), coalesceMs = 750 } = {}) {
    this.#limit = limit;
    this.#now = now;
    this.#coalesceMs = coalesceMs;
  }

  /**
   * Records one entry and clears the redo stack. With a coalesceKey equal to the newest entry's, recorded within the
   * coalescing window and with nothing undone since, the newest entry keeps its `before` and takes the new `after`
   * (repeated spinner clicks give one entry, 04 3.3).
   * Side effects: writes the stacks.
   * @param {string} label  e.g. 'UV Offset U (Main 500)'
   * @param {UvHistoryEntry} entry
   * @param {{coalesceKey?: string|null}} [options]
   */
  record(label, entry, { coalesceKey = null } = {}) {
    const time = this.#now();
    const top = this.#undo[this.#undo.length - 1];
    if (coalesceKey !== null && top && top.coalesceKey === coalesceKey && this.#redo.length === 0
      && time - top.time <= this.#coalesceMs) {
      top.after = entry.after;
      top.time = time;
      return;
    }
    this.#undo.push({ ...entry, label, coalesceKey, time });
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo.length = 0;
  }

  /**
   * Side effects: moves the newest entry to the redo stack.
   * @returns {(UvHistoryEntry & {label: string})|null} the entry whose `before` side the caller applies
   */
  undo() {
    const e = this.#undo.pop() ?? null;
    if (e) this.#redo.push(e);
    return e;
  }

  /**
   * Side effects: moves the most recently undone entry back to the undo stack.
   * @returns {(UvHistoryEntry & {label: string})|null} the entry whose `after` side the caller applies
   */
  redo() {
    const e = this.#redo.pop() ?? null;
    if (e) this.#undo.push(e);
    return e;
  }

  /** Side effects: none. @returns {boolean} */
  get canUndo() {
    return this.#undo.length > 0;
  }

  /** Side effects: none. @returns {boolean} */
  get canRedo() {
    return this.#redo.length > 0;
  }

  /** Side effects: none. @returns {string|null} the label of the entry undo() would apply */
  get undoLabel() {
    return this.#undo.length ? this.#undo[this.#undo.length - 1].label : null;
  }

  /** Side effects: none. @returns {string|null} the label of the entry redo() would apply */
  get redoLabel() {
    return this.#redo.length ? this.#redo[this.#redo.length - 1].label : null;
  }

  /** Side effects: none. @returns {{canUndo: boolean, canRedo: boolean, undoLabel: string|null, redoLabel: string|null}} */
  snapshot() {
    return { canUndo: this.canUndo, canRedo: this.canRedo, undoLabel: this.undoLabel, redoLabel: this.redoLabel };
  }

  /**
   * Drops the section states that `keep` refuses: those of sections that no longer exist (a delete, 04 5.2), and the
   * vertex states of a section whose grid size changed (UvController). A section entry ('transforms', 'vertices') left
   * without any state is removed (a Copy to all entry keeps its other sections). Settings entries are kept.
   * Side effects: writes the stacks.
   * @param {(id: *, entry: UvHistoryEntry) => boolean} keep  whether the entry keeps the states of section `id`
   */
  prune(keep) {
    const keepEntry = (e) => {
      if (!Array.isArray(e.before)) return true;
      e.before = e.before.filter((s) => keep(s.id, e));
      e.after = e.after.filter((s) => keep(s.id, e));
      return e.before.length > 0 || e.after.length > 0;
    };
    this.#undo = this.#undo.filter(keepEntry);
    this.#redo = this.#redo.filter(keepEntry);
  }

  /** Empties both stacks (an import replaces every section). Side effects: writes the stacks. */
  clear() {
    this.#undo = [];
    this.#redo = [];
  }
}
