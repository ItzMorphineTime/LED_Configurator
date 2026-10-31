/**
 * @module app/Prefs
 * The device preferences (spec 07 C19, H3): one JSON object under PREFS_KEY in the browser's localStorage, never in a
 * project file. `get(name)` gives the stored value when it has the default's type, else the default; `set(name, value)`
 * rewrites the object. Storage is untrusted and may be missing or blocked (private mode, a blocked site): every access
 * is in try/catch, a read that fails gives the defaults, a write that fails returns false. Since 07 H3 the one
 * preference is `autosave` (default on).
 * Legacy source: none (new in 07 H3).
 * Layer: app (imports nothing; `win` is injected, rule S2: storage only in app/Prefs.js and app/Autosave.js).
 */

/** The storage key of the preferences object (07 4.8). */
export const PREFS_KEY = 'morph-led-configurator:prefs';

/** Every preference and its default (a stored value of another type reads as the default). */
export const PREF_DEFAULTS = Object.freeze({ autosave: true });

/** The device preferences in localStorage. */
export class Prefs {
  /** @type {{localStorage?: Storage}} */ #win;

  /**
   * Stores the window (R4: nothing else; storage is read on every access).
   * @param {{win: {localStorage?: Storage}}} deps
   */
  constructor({ win }) {
    this.#win = win;
  }

  /**
   * A preference: the stored value when it has the type of its default, else the default.
   * Side effects: none (one storage read).
   * @param {string} name  a key of PREF_DEFAULTS
   * @returns {*}
   */
  get(name) {
    const stored = this.#read();
    const fallback = PREF_DEFAULTS[name];
    return Object.hasOwn(stored, name) && typeof stored[name] === typeof fallback ? stored[name] : fallback;
  }

  /**
   * Stores a preference (the other stored members are kept).
   * Side effects: one storage write.
   * @param {string} name
   * @param {*} value
   * @returns {boolean} whether it was stored
   */
  set(name, value) {
    try {
      const next = { ...this.#read(), v: 1, [name]: value };
      this.#win.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  /** The stored object, or {} (missing, blocked, unreadable or not an object). */
  #read() {
    try {
      const raw = this.#win.localStorage.getItem(PREFS_KEY);
      const value = raw === null ? null : JSON.parse(raw);
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
}
