/**
 * @module app/History
 * The one undo stack of the app (spec 07 5.6.1, 6.10, C16; H1): snapshots of the project, each
 * ProjectSession.capture('history') (no view-only and no derived key, logo assets by id), with one label per entry.
 * Undo and redo hand a snapshot to ProjectSession.apply with reason 'undo' / 'redo' (one rebuild per step; the panels
 * resync on PROJECT_REPLACED and the view-only values stay live).
 * Recording: every use case wraps its body in run(label, fn, {coalesceKey}); only the outermost run records, once, after
 * fn returns, and nothing is recorded while ProjectSession.apply runs (session.applying) or while an undo or redo applies,
 * so the use cases that apply reuses never record. A snapshot equal to the current one records nothing (a no-op edit).
 * Coalescing: a record with the coalesceKey of the newest entry, within coalesceMs (750 ms by default, measured from the
 * previous record on the monotonic clock, never Date) and with nothing undone since, replaces that entry instead of
 * adding one (typing, colour drags, spinner clicks); when the merged entry equals the state before it, it is dropped.
 * Transactions: begin(label) on a gizmo drag's mouse-down, commit() on its mouse-up (one entry, nothing for a drag that
 * ends where it started), cancel({revert}) on Escape. Every record inside a transaction is absorbed into it (6.10 commits
 * it first on another label, but a record follows its change, so that entry would hold both and the rest of the drag
 * would go unrecorded).
 * Limits: at most HISTORY_LIMITS.maxSteps undo steps and maxBytes of snapshots (2 bytes per character); the oldest go.
 * HISTORY_CHANGED {canUndo, canRedo, undoLabel, redoLabel, depth} and onCommitted() follow every record, undo and redo
 * (reset emits only).
 * Legacy source: none (07 H1).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

import { Events } from '../core/EventBus.js';

/** The depth limit (undo steps) and the snapshot memory limit (07 9: 32 MB). */
export const HISTORY_LIMITS = Object.freeze({ maxSteps: 100, maxBytes: 32 * 1024 * 1024 });

/** The default coalescing window (ms). */
export const COALESCE_MS = 750;

/** The undo stack. Implements core/historyRecorder's HistoryRecorder. */
export class History {
  /** @type {import('../core/EventBus.js').EventBus|null} */ #bus;
  /** @type {() => number} monotonic ms */ #clock;
  /** @type {{maxSteps: number, maxBytes: number}} */ #limits;
  /** @type {(() => void)|null} */ #onCommitted;
  /** @type {{capture(variant: string): string, apply(v2: object, options: object): void, applying: boolean}|null} */
  #session = null;
  /** @type {string[]} the snapshots, oldest first; states[index] is the live project */ #states = [];
  /** @type {string[]} labels[i] names the change from states[i - 1] to states[i] */ #labels = [];
  #index = 0;
  #depth = 0;
  #applying = false;
  /** @type {{label: string}|null} the open transaction */ #txn = null;
  /** @type {string|null} */ #lastKey = null;
  #lastTime = 0;

  /**
   * Stores the collaborators (R4: nothing else; the session is attached later, ProjectSession.attachHistory).
   * Side effects: none.
   * @param {{bus?: object|null, clock?: () => number, limits?: {maxSteps: number, maxBytes: number},
   *          onCommitted?: (() => void)|null}} [deps]  clock: App passes () => win.performance.now()
   */
  constructor({ bus = null, clock = () => globalThis.performance.now(), limits = HISTORY_LIMITS, onCommitted = null } = {}) {
    this.#bus = bus;
    this.#clock = clock;
    this.#limits = limits;
    this.#onCommitted = onCommitted;
  }

  /** Binds the session whose snapshots this stack holds. Side effects: none. @param {object} session */
  attach(session) {
    this.#session = session;
  }

  /** The hook a later Autosave sets (07 5.6: schedule after every record, undo and redo). @param {(() => void)|null} fn */
  setOnCommitted(fn) {
    this.#onCommitted = fn;
  }

  /**
   * The live project becomes the only state (boot: after the bootstrap's markClean). Side effects: the stacks;
   * HISTORY_CHANGED.
   */
  reset() {
    this.#txn = null;
    this.#lastKey = null;
    this.#states = this.#session ? [this.#session.capture('history')] : [];
    this.#labels = this.#states.map(() => '');
    this.#index = 0;
    this.#emit();
  }

  /** Side effects: none. @returns {boolean} whether a record now would be taken */
  get recording() {
    return this.#session !== null && !this.#session.applying && !this.#applying && this.#depth === 0;
  }

  /** Side effects: none. @returns {boolean} */
  get canUndo() {
    return this.#index > 0;
  }

  /** Side effects: none. @returns {boolean} */
  get canRedo() {
    return this.#index < this.#states.length - 1;
  }

  /** Side effects: none. @returns {string|null} the label of the entry undo() would revert */
  get undoLabel() {
    return this.canUndo ? this.#labels[this.#index] : null;
  }

  /** Side effects: none. @returns {string|null} the label of the entry redo() would replay */
  get redoLabel() {
    return this.canRedo ? this.#labels[this.#index + 1] : null;
  }

  /** Side effects: none. @returns {number} the undo steps available (the live state's index) */
  get depth() {
    return this.#index;
  }

  /** Side effects: none. @returns {boolean} a gizmo drag's transaction is open */
  get inTransaction() {
    return this.#txn !== null;
  }

  /** Side effects: none. @returns {string|null} the snapshot of the live project as last recorded (capture('history')) */
  get current() {
    return this.#states[this.#index] ?? null;
  }

  /** Side effects: none. @returns {{canUndo: boolean, canRedo: boolean, undoLabel: string|null, redoLabel: string|null, depth: number}} */
  get state() {
    return { canUndo: this.canUndo, canRedo: this.canRedo, undoLabel: this.undoLabel, redoLabel: this.redoLabel, depth: this.#index };
  }

  /**
   * Runs a use case: nested runs are absorbed and only the outermost records, once, after fn returns (07 5.6.1). An
   * exception propagates and records nothing.
   * Side effects: fn's; maybe one record.
   * @template T
   * @param {string} label
   * @param {() => T} fn
   * @param {{coalesceKey?: string|null, coalesceMs?: number}} [options]
   * @returns {T}
   */
  run(label, fn, options) {
    this.#depth++;
    let result;
    try {
      result = fn();
    } finally {
      this.#depth--;
    }
    if (this.#depth === 0) this.record(label, options);
    return result;
  }

  /**
   * Records the live project as one entry after the newest (dropping the redo branch), or merges it into the newest
   * (coalescing, see the module comment). Ignored while not recording and inside a transaction (its commit records the
   * change); a no-op edit records nothing.
   * Side effects: the stacks; HISTORY_CHANGED; onCommitted().
   * @param {string} label
   * @param {{coalesceKey?: string|null, coalesceMs?: number}} [options]
   * @returns {boolean} whether the stack changed
   */
  record(label, { coalesceKey = null, coalesceMs = COALESCE_MS } = {}) {
    if (!this.recording || this.#states.length === 0) return false;
    if (this.#txn) return false;
    const snap = this.#session.capture('history');
    if (snap === this.#states[this.#index]) return false;
    const t = this.#clock();
    const states = this.#states;
    const labels = this.#labels;
    if (coalesceKey !== null && coalesceKey === this.#lastKey && t - this.#lastTime < coalesceMs
      && this.#index === states.length - 1 && this.#index > 0) {
      if (snap === states[this.#index - 1]) {
        // the merged edits cancel out: the entry goes
        states.pop();
        labels.pop();
        this.#index--;
        this.#lastKey = null;
        this.#changed();
        return true;
      }
      states[this.#index] = snap;
      labels[this.#index] = label;
    } else {
      states.length = this.#index + 1;
      labels.length = this.#index + 1;
      states.push(snap);
      labels.push(label);
      this.#index++;
    }
    this.#lastKey = coalesceKey;
    this.#lastTime = t;
    this.#trim();
    this.#changed();
    return true;
  }

  /** Opens a transaction (an open one is committed first). Side effects: the transaction. @param {string} label */
  begin(label) {
    if (this.#txn) this.commit();
    this.#txn = { label };
  }

  /** Closes the transaction with one record (none when nothing changed). Side effects: see record. */
  commit() {
    if (!this.#txn) return;
    const { label } = this.#txn;
    this.#txn = null;
    this.record(label);
  }

  /**
   * Drops the transaction; with revert, the live project returns to the newest entry (the gizmo's Escape passes revert:
   * false: its target restored itself).
   * Side effects: the transaction; with revert, ProjectSession.apply (reason 'undo').
   * @param {{revert?: boolean}} [options]
   */
  cancel({ revert = true } = {}) {
    if (!this.#txn) return;
    this.#txn = null;
    this.#lastKey = null;
    if (revert && this.#states.length) this.#apply(this.#states[this.#index], 'undo');
  }

  /**
   * Steps back one entry: an open transaction is cancelled first, then the previous snapshot is applied (reason 'undo').
   * Side effects: ProjectSession.apply; HISTORY_CHANGED; onCommitted().
   * @returns {boolean} whether a step was undone
   */
  undo() {
    if (this.#txn) this.cancel();
    if (!this.canUndo || !this.#idle()) return false;
    this.#index--;
    this.#apply(this.#states[this.#index], 'undo');
    this.#lastKey = null;
    this.#changed();
    return true;
  }

  /**
   * Steps forward one entry (reason 'redo').
   * Side effects: ProjectSession.apply; HISTORY_CHANGED; onCommitted().
   * @returns {boolean} whether a step was redone
   */
  redo() {
    if (!this.canRedo || this.#txn || !this.#idle()) return false;
    this.#index++;
    this.#apply(this.#states[this.#index], 'redo');
    this.#lastKey = null;
    this.#changed();
    return true;
  }

  /** @returns {boolean} a session is attached and nothing applies */
  #idle() {
    return this.#session !== null && !this.#session.applying && !this.#applying;
  }

  /** One snapshot through the session (the history variant is the session's own output, so it is applied as is). */
  #apply(snap, reason) {
    this.#applying = true;
    try {
      this.#session.apply(JSON.parse(snap), { reason, scope: 'full' });
    } finally {
      this.#applying = false;
    }
  }

  /** Drops the oldest entries over the limits (the live state always stays). */
  #trim() {
    const { maxSteps, maxBytes } = this.#limits;
    let bytes = this.#states.reduce((n, s) => n + 2 * s.length, 0);
    while (this.#states.length > 1 && (this.#states.length > maxSteps + 1 || bytes > maxBytes)) {
      bytes -= 2 * this.#states[0].length;
      this.#states.shift();
      this.#labels.shift();
      this.#index--;
    }
  }

  #changed() {
    this.#emit();
    if (this.#onCommitted) this.#onCommitted();
  }

  #emit() {
    if (this.#bus) this.#bus.emit(Events.HISTORY_CHANGED, this.state);
  }
}
