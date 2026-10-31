/**
 * @module core/historyRecorder
 * The recorder interface of the one undo stack (spec 07 5.6.1, H1; app/History implements it) and NO_HISTORY, the
 * recorder of a module built without one (unit tests, tools): run() just runs, the rest do nothing. The use cases of
 * app/ and interaction/ take a `history` dependency (default NO_HISTORY), so neither layer imports app/History.
 * Legacy source: none (07 H1).
 * Layer: core (imports nothing).
 */

/**
 * @typedef {object} HistoryRecorder
 * @property {(label: string, fn: () => *, options?: {coalesceKey?: string|null, coalesceMs?: number}) => *} run
 *   runs fn; only the outermost run records, once, after fn returns
 * @property {(label: string, options?: {coalesceKey?: string|null, coalesceMs?: number}) => boolean} record
 * @property {(label: string) => void} begin   a transaction (one entry per gizmo drag)
 * @property {() => void} commit
 * @property {(options?: {revert?: boolean}) => void} cancel
 * @property {() => boolean} undo
 * @property {() => boolean} redo
 */

/** @type {Readonly<HistoryRecorder>} */
export const NO_HISTORY = Object.freeze({
  run: (label, fn) => fn(),
  record: () => false,
  begin: () => {},
  commit: () => {},
  cancel: () => {},
  undo: () => false,
  redo: () => false,
});
