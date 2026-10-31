/**
 * @module ui/HistoryControls
 * The header's undo / redo group (spec 07 H2; the history slot of the header grid, 06 3.2, 07 C50): #history-undo (↶)
 * and #history-redo (↷), disabled while there is nothing to undo / redo and titled "Undo <label>" / "Redo <label>"
 * from HISTORY_CHANGED; and the shortcuts Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y (redo).
 * The shortcuts are one capture-phase keydown listener on the window (as ProjectPanel's Ctrl/Cmd+S and O), so they work
 * wherever the focus is (the UV viewer's canvas included) except in a text-editing control (core/typingTarget
 * isTextEditTarget: a text-like input, a textarea, contenteditable): there the chord is left to the browser's own text
 * undo. Anywhere else it is consumed (preventDefault: no browser action; stopPropagation: KeyboardState never holds the
 * key) and runs History.undo / redo, unless a drag is in progress (a gizmo drag's transaction, a UV handle or vertex
 * drag: App's isBusy), when it does nothing. An auto-repeat repeats the step, as in editors.
 * Owns #history-undo, #history-redo.
 * Legacy source: none (07 H2).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { Events } from '../core/EventBus.js';
import { isTextEditTarget } from '../core/typingTarget.js';
import { byId } from './dom.js';

/**
 * The history chord of a keydown: Ctrl+Z or Cmd+Z is 'undo'; with Shift, 'redo'; Ctrl+Y or Cmd+Y (no Shift) is 'redo'.
 * Never with Alt (which also keeps AltGr out). The letter is e.key on a Latin layout, else the physical key (e.code),
 * as the browser's own shortcuts.
 * Side effects: none.
 * @param {{key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean}} e
 * @returns {'undo'|'redo'|null}
 */
export function historyShortcut(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = typeof e.key === 'string' && /^[a-z]$/i.test(e.key) ? e.key.toLowerCase()
    : ({ KeyZ: 'z', KeyY: 'y' })[e.code] ?? null;
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  return key === 'y' && !e.shiftKey ? 'redo' : null;
}

/**
 * The two button titles of a HISTORY_CHANGED state (shared by the UV viewer's ↶ / ↷).
 * Side effects: none.
 * @param {{canUndo: boolean, canRedo: boolean, undoLabel: string|null, redoLabel: string|null}|null} state
 * @returns {{undo: string, redo: string}}
 */
export function historyTitles(state) {
  return {
    undo: state && state.canUndo ? `Undo ${state.undoLabel}` : 'Nothing to undo',
    redo: state && state.canRedo ? `Redo ${state.redoLabel}` : 'Nothing to redo',
  };
}

/** The header's undo / redo buttons and the history shortcuts. */
export class HistoryControls {
  /** @type {Window} */ #win;
  /** @type {import('../app/History.js').History} */ #history;
  /** @type {() => boolean} */ #isBusy;
  /** @type {HTMLButtonElement} */ #undo;
  /** @type {HTMLButtonElement} */ #redo;

  /**
   * Looks up the two buttons and subscribes HISTORY_CHANGED (R4: no listener, no mutation).
   * Side effects: DOM lookups; one bus subscription.
   * @param {{doc: Document, win: Window, history: import('../app/History.js').History,
   *          bus: import('../core/EventBus.js').EventBus, isBusy?: () => boolean}} deps
   *   isBusy: a drag is in progress (App: the gizmo's or the UV viewer's)
   */
  constructor({ doc, win, history, bus, isBusy = () => false }) {
    this.#win = win;
    this.#history = history;
    this.#isBusy = isBusy;
    this.#undo = byId(doc, 'history-undo');
    this.#redo = byId(doc, 'history-redo');
    bus.on(Events.HISTORY_CHANGED, (state) => this.render(state));
  }

  /** The two clicks and the window's capture-phase keydown. Side effects: 2 element listeners, 1 window listener. */
  bind() {
    this.#undo.addEventListener('click', () => this.undo());
    this.#redo.addEventListener('click', () => this.redo());
    this.#win.addEventListener('keydown', (e) => this.#onKeydown(e), true);
  }

  /**
   * Side effects: the buttons' disabled state and titles.
   * @param {{canUndo: boolean, canRedo: boolean, undoLabel: string|null, redoLabel: string|null}} state
   */
  render(state) {
    const titles = historyTitles(state);
    this.#undo.disabled = !state.canUndo;
    this.#undo.title = titles.undo;
    this.#redo.disabled = !state.canRedo;
    this.#redo.title = titles.redo;
  }

  /** History.undo unless a drag is in progress. Side effects: see History.undo. @returns {boolean} whether it stepped */
  undo() {
    return !this.#busy() && this.#history.undo();
  }

  /** History.redo unless a drag is in progress. Side effects: see History.redo. @returns {boolean} whether it stepped */
  redo() {
    return !this.#busy() && this.#history.redo();
  }

  #busy() {
    return this.#history.inTransaction || this.#isBusy();
  }

  /** The window's capture-phase keydown (see the module comment). */
  #onKeydown(e) {
    const action = historyShortcut(e);
    if (action === null || isTextEditTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (action === 'undo') this.undo();
    else this.redo();
  }
}
