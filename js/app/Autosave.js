/**
 * @module app/Autosave
 * Autosave (spec 07 H3, 6.11; the owner's request of 2026-11-01): the project, as ProjectSession.capture('autosave')
 * (logo images inline up to 1 MB), written to the browser's localStorage AUTOSAVE_DEBOUNCE_MS after the last committed
 * change (App wires History's onCommitted to schedule(): every record, undo and redo) and at once on pagehide and on
 * visibilitychange to hidden (flush()).
 *
 * Two alternating slots (AUTOSAVE_SLOT_KEYS): each write goes to the slot that does not hold the newest valid record,
 * with the next sequence number, so the last good copy is never the one being replaced. A slot is a header line
 * (JSON: format, v, seq, saved_at, app_version, name, dirty, length, sha256), '\n', then the project text; it is valid
 * only when its header parses and the text has the header's length and SHA-256 (core/sha256), so a half-written,
 * truncated or edited slot never wins. The newest valid slot is the one with the highest seq.
 *
 * Boot (start(), after the bootstrap's markClean): when the newest valid slot holds a project that differs from the
 * fresh bootstrap project, its record is the restore offer (the banner, ui/RestoreBanner) and autosave writes nothing
 * until the offer is resolved: restore() (ProjectSession.restore: validated like an Open, applied with reason
 * 'restore', one history entry 'Restore session'; the project stays dirty unless it was saved when it was autosaved)
 * or discard() (both slots removed). A change made meanwhile is remembered and written once the offer is resolved.
 *
 * Never written: a pristine new project (session.isPristineNew: the bootstrap or New, untouched), anything while
 * the preference is off (Prefs 'autosave', the Project section's switch; turning it off keeps the slots), and anything
 * with `?autosave=off` in the page address (`suppressed`: no read, no write, no offer, the preference unchanged).
 * Storage failures: a quota error is retried once without the inline logos (maxInlineAssetBytes 0; saved with a
 * note), then reported as full (state 'error'; the next change tries again); a storage that is missing or throws on
 * access or on a probe write makes autosave unavailable for the page (state 'unavailable', with a note).
 *
 * Emits AUTOSAVE_STATUS {state, message, savedAt, enabled, available, suppressed} (the Project section's switch and
 * note) whenever one of them changes, and once from start().
 * Legacy source: none (new in 07 H3).
 * Layer: app (imports core; the session, prefs and window are injected; rule S2: storage only in app/Autosave.js and
 * app/Prefs.js).
 */
import { Events } from '../core/EventBus.js';
import { sha256HexSync } from '../core/sha256.js';

/** The two slots, written alternately. */
export const AUTOSAVE_SLOT_KEYS = Object.freeze(['morph-led-configurator:autosave:0', 'morph-led-configurator:autosave:1']);

/** The key of start()'s probe write (removed at once). */
export const AUTOSAVE_PROBE_KEY = 'morph-led-configurator:autosave:probe';

/** The header's `format`. */
export const AUTOSAVE_FORMAT = 'morph-led-autosave';

/** The wait after the last committed change before a write (ms). */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

/** The notes of the Project section (null: no note). */
export const AutosaveNotes = Object.freeze({
  unavailable: 'Autosave is off: this browser does not allow storage for this page.',
  noLogos: 'Autosaved without logos: browser storage is full.',
  full: 'Autosave paused: browser storage is full.',
  paused: 'Autosave paused until the previous session is restored or discarded.',
  /** @param {string} message @returns {string} */
  failed: (message) => `Autosave failed: ${message}`,
});

/**
 * Whether a storage exception is a quota error (Chrome, Firefox, Safari names and legacy codes).
 * Side effects: none.
 * @param {*} e
 * @returns {boolean}
 */
export function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

/**
 * The SHA-256 of a text's UTF-8 bytes, lowercase hex.
 * Side effects: none.
 * @param {string} text
 * @returns {string}
 */
export function autosaveChecksum(text) {
  return sha256HexSync(new TextEncoder().encode(text));
}

/**
 * One slot's stored value: the header line, '\n', the project text (JSON.stringify never writes a raw line break).
 * Side effects: none.
 * @param {{seq: number, savedAt: number, appVersion: string, name: string, dirty: boolean}} meta
 * @param {string} text  the project JSON
 * @returns {string}
 */
export function encodeSlot({ seq, savedAt, appVersion, name, dirty }, text) {
  const header = {
    format: AUTOSAVE_FORMAT, v: 1, seq, saved_at: savedAt, app_version: appVersion, name, dirty, length: text.length,
    sha256: autosaveChecksum(text),
  };
  return `${JSON.stringify(header)}\n${text}`;
}

/**
 * A slot's header, or null when the value is not an autosave record (the text is not verified here).
 * Side effects: none.
 * @param {*} raw  the stored value
 * @returns {{seq: number, savedAt: number, name: string, dirty: boolean, length: number, sha256: string, text: string}|null}
 */
export function readSlotHeader(raw) {
  if (typeof raw !== 'string') return null;
  const nl = raw.indexOf('\n');
  if (nl < 0) return null;
  let h;
  try {
    h = JSON.parse(raw.slice(0, nl));
  } catch {
    return null;
  }
  if (h === null || typeof h !== 'object' || h.format !== AUTOSAVE_FORMAT || h.v !== 1 || !Number.isSafeInteger(h.seq) || h.seq < 1
    || !Number.isSafeInteger(h.length) || typeof h.sha256 !== 'string') return null;
  return {
    seq: h.seq,
    savedAt: Number.isFinite(h.saved_at) ? h.saved_at : 0,
    name: typeof h.name === 'string' ? h.name : '',
    dirty: h.dirty !== false,
    length: h.length,
    sha256: h.sha256,
    text: raw.slice(nl + 1),
  };
}

/**
 * Whether a slot's text is complete and unchanged (its header's length and SHA-256).
 * Side effects: none.
 * @param {{length: number, sha256: string, text: string}} record  readSlotHeader's result
 * @returns {boolean}
 */
export function verifySlot(record) {
  return record.text.length === record.length && autosaveChecksum(record.text) === record.sha256;
}

/**
 * The newest valid record of a set of stored values: the highest seq (then the latest saved_at, then the first slot)
 * whose text verifies; the others are not hashed.
 * Side effects: none.
 * @param {(string|null)[]} raws  the stored value of each slot
 * @returns {{slot: number, seq: number, savedAt: number, name: string, dirty: boolean, text: string}|null}
 */
export function newestValidSlot(raws) {
  const records = [];
  raws.forEach((raw, slot) => {
    const record = readSlotHeader(raw);
    if (record) records.push({ ...record, slot });
  });
  records.sort((a, b) => b.seq - a.seq || b.savedAt - a.savedAt || a.slot - b.slot);
  const best = records.find(verifySlot);
  return best ? { slot: best.slot, seq: best.seq, savedAt: best.savedAt, name: best.name, dirty: best.dirty, text: best.text } : null;
}

/** Autosave of the session to two alternating localStorage slots, with the restore offer of the previous session. */
export class Autosave {
  /** @type {import('./ProjectSession.js').ProjectSession} */ #session;
  /** @type {import('./Prefs.js').Prefs} */ #prefs;
  /** @type {import('../core/EventBus.js').EventBus|null} */ #bus;
  /** @type {Window} localStorage, setTimeout, clearTimeout, the pagehide listener */ #win;
  /** @type {() => number} Date.now: saved_at only (the debounce uses the window's timers) */ #clock;
  /** @type {string} */ #appVersion;
  /** @type {number} */ #debounceMs;
  /** @type {boolean} `?autosave=off`: nothing is read or written for this page load */ #suppressed;
  /** @type {boolean} start() has run */ #started = false;
  /** @type {boolean} the preference */ #enabled = true;
  /** @type {boolean} the storage works */ #available = false;
  /** @type {boolean} a restore offer is pending (no write until it is resolved) */ #paused = false;
  /** @type {boolean} a committed change not written yet */ #pending = false;
  /** @type {*} the debounce timer id, or null */ #timer = null;
  /** @type {number} the newest valid record's seq (0: none) */ #seq = 0;
  /** @type {number} the slot holding it (-1: none) */ #slot = -1;
  /** @type {{slot: number, seq: number, savedAt: number, name: string, dirty: boolean, text: string}|null} */ #offer = null;
  /** @type {string} */ #state = 'idle';
  /** @type {string|null} */ #message = null;
  /** @type {number|null} the last write's saved_at */ #savedAt = null;
  /** @type {string|null} the last emitted status (JSON) */ #lastEmitted = null;

  /**
   * Stores the collaborators (R4: no storage access, no listener).
   * @param {{session: object, prefs: {get(name: string): *, set(name: string, value: *): boolean}, bus?: object,
   *          win: object, clock?: () => number, appVersion?: string, debounceMs?: number, suppressed?: boolean}} deps
   */
  constructor({ session, prefs, bus = null, win, clock = () => Date.now(), appVersion = '', debounceMs = AUTOSAVE_DEBOUNCE_MS,
    suppressed = false }) {
    this.#session = session;
    this.#prefs = prefs;
    this.#bus = bus;
    this.#win = win;
    this.#clock = clock;
    this.#appVersion = appVersion;
    this.#debounceMs = debounceMs;
    this.#suppressed = suppressed;
  }

  /** @returns {{state: string, message: string|null, savedAt: number|null, enabled: boolean, available: boolean,
   *  suppressed: boolean}} the AUTOSAVE_STATUS payload */
  get status() {
    return {
      state: this.#state, message: this.#message, savedAt: this.#savedAt, enabled: this.#enabled, available: this.#available,
      suppressed: this.#suppressed,
    };
  }

  /** @returns {boolean} the preference (the switch) */
  get enabled() {
    return this.#enabled;
  }

  /** @returns {boolean} whether a restore offer is pending */
  get paused() {
    return this.#paused;
  }

  /**
   * Boot (App, after the bootstrap's markClean and history.reset): reads the preference, checks the storage with a
   * probe write, finds the newest valid slot and, when its project differs from the fresh bootstrap project, makes it the
   * restore offer and pauses writing. Emits AUTOSAVE_STATUS once.
   * Side effects: storage reads and the probe write; the state.
   * @returns {{savedAt: number, name: string}|null} the offer for the banner, or null
   */
  start() {
    this.#started = true;
    if (this.#suppressed) {
      this.#enabled = false;
      this.#emit('disabled', null);
      return null;
    }
    this.#enabled = this.#prefs.get('autosave') !== false;
    const storage = this.#storage();
    if (!storage || !this.#probe(storage)) {
      this.#emit('unavailable', AutosaveNotes.unavailable);
      return null;
    }
    this.#available = true;
    const best = newestValidSlot(AUTOSAVE_SLOT_KEYS.map((key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    }));
    if (best) {
      this.#seq = best.seq;
      this.#slot = best.slot;
    }
    if (best && best.text !== this.#session.capture('autosave')) {
      this.#offer = best;
      this.#paused = true;
      if (this.#enabled) this.#emit('paused', AutosaveNotes.paused);
      else this.#emit('disabled', null);
      return { savedAt: best.savedAt, name: best.name };
    }
    this.#emit(this.#enabled ? 'idle' : 'disabled', null);
    return null;
  }

  /**
   * Adds the lifecycle listeners: pagehide, and visibilitychange to hidden, write a pending change at once.
   * Side effects: one window and one document listener.
   * @param {{addEventListener: Function, visibilityState: string}} doc
   */
  attachLifecycle(doc) {
    this.#win.addEventListener('pagehide', () => this.flush());
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') this.flush();
    });
  }

  /**
   * A committed change (History's onCommitted): remembered, and written AUTOSAVE_DEBOUNCE_MS after the last one while
   * autosave can write (on, available, no offer pending).
   * Side effects: the debounce timer; the state.
   */
  schedule() {
    this.#pending = true;
    if (!this.#writable) return;
    if (this.#timer !== null) this.#win.clearTimeout(this.#timer);
    this.#timer = this.#win.setTimeout(() => {
      this.#timer = null;
      this.flush();
    }, this.#debounceMs);
    this.#emit('pending', this.#message);
  }

  /**
   * Writes a pending change now (the debounce, pagehide, hidden), unless autosave cannot write or the project is a
   * pristine new project (nothing written: the slots keep the last work, e.g. the work before an accidental New).
   * Side effects: at most two storage writes; the state.
   * @returns {boolean} whether a slot was written
   */
  flush() {
    if (this.#timer !== null) {
      this.#win.clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (!this.#pending || !this.#writable) return false;
    this.#pending = false;
    if (this.#session.isPristineNew) {
      this.#emit('idle', this.#message);
      return false;
    }
    return this.#write();
  }

  /**
   * The banner's Restore: the offered project through ProjectSession.restore (validated like an Open, corrections
   * reported, one history entry 'Restore session'), then writing resumes. Runs once per offer.
   * Side effects: see ProjectSession.restore; the state.
   * @returns {Promise<boolean>} whether the project was restored
   */
  async restore() {
    const offer = this.#offer;
    if (!offer) return false;
    this.#offer = null;
    try {
      return await this.#session.restore(offer.text, { clean: !offer.dirty });
    } finally {
      this.#resolve();
    }
  }

  /**
   * The banner's Discard: both slots removed, then writing resumes.
   * Side effects: two storage removals; the state.
   */
  discard() {
    if (!this.#offer) return;
    this.#offer = null;
    const storage = this.#storage();
    for (const key of AUTOSAVE_SLOT_KEYS) {
      try {
        if (storage) storage.removeItem(key);
      } catch { /* a blocked storage keeps nothing anyway */ }
    }
    this.#seq = 0;
    this.#slot = -1;
    this.#resolve();
  }

  /**
   * The Project section's switch: stores the preference. Off cancels the pending write (the slots are kept); on writes
   * a change remembered meanwhile. Ignored with `?autosave=off` or without storage.
   * Side effects: the preference; the timer; the state.
   * @param {boolean} on
   * @returns {boolean} the preference after the call
   */
  setEnabled(on) {
    if (this.#suppressed || !this.#available) return this.#enabled;
    this.#enabled = !!on;
    this.#prefs.set('autosave', this.#enabled);
    if (!this.#enabled) {
      if (this.#timer !== null) this.#win.clearTimeout(this.#timer);
      this.#timer = null;
      this.#emit('disabled', null);
    } else if (this.#paused) {
      this.#emit('paused', AutosaveNotes.paused);
    } else {
      this.#emit('idle', null);
      if (this.#pending) this.schedule();
    }
    return this.#enabled;
  }

  /** Whether a write may happen now. */
  get #writable() {
    return this.#started && this.#available && this.#enabled && !this.#paused && !this.#suppressed;
  }

  /** The window's localStorage, or null (missing, or its getter throws). */
  #storage() {
    try {
      return this.#win.localStorage ?? null;
    } catch {
      return null;
    }
  }

  /** Whether a write and a removal work. */
  #probe(storage) {
    try {
      storage.setItem(AUTOSAVE_PROBE_KEY, '1');
      storage.removeItem(AUTOSAVE_PROBE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  /** The offer is resolved: writing resumes, and a change remembered meanwhile is scheduled. */
  #resolve() {
    this.#paused = false;
    this.#emit(this.#enabled ? 'idle' : 'disabled', null);
    if (this.#pending) this.schedule();
  }

  /** One write with the quota fallback (the project without its inline logos). */
  #write() {
    const storage = this.#storage();
    if (!storage) {
      this.#available = false;
      this.#emit('unavailable', AutosaveNotes.unavailable);
      return false;
    }
    const full = this.#session.capture('autosave');
    try {
      this.#put(storage, full);
      this.#emit('saved', null);
      return true;
    } catch (e) {
      if (!isQuotaError(e)) return this.#fail(e);
    }
    const lean = this.#session.capture('autosave', { maxInlineAssetBytes: 0 });
    if (lean !== full) {
      try {
        this.#put(storage, lean);
        this.#emit('saved', AutosaveNotes.noLogos);
        return true;
      } catch (e) {
        if (!isQuotaError(e)) return this.#fail(e);
      }
    }
    this.#emit('error', AutosaveNotes.full);
    return false;
  }

  /** A write that failed for another reason than the quota. @returns {false} */
  #fail(e) {
    this.#emit('error', AutosaveNotes.failed(String(e?.message ?? e)));
    return false;
  }

  /** Writes the text to the slot that does not hold the newest valid record, with the next seq. */
  #put(storage, text) {
    const slot = this.#slot === 0 ? 1 : 0;
    const seq = this.#seq + 1;
    const savedAt = this.#clock();
    storage.setItem(AUTOSAVE_SLOT_KEYS[slot], encodeSlot({
      seq, savedAt, appVersion: this.#appVersion, name: this.#session.name, dirty: this.#session.dirty,
    }, text));
    this.#seq = seq;
    this.#slot = slot;
    this.#savedAt = savedAt;
  }

  /** Sets the state and emits AUTOSAVE_STATUS when anything changed (always the first time, from start()). */
  #emit(state, message) {
    const first = this.#lastEmitted === null;
    this.#state = state;
    this.#message = message;
    const status = this.status;
    const key = JSON.stringify(status);
    if (!first && key === this.#lastEmitted) return;
    this.#lastEmitted = key;
    if (this.#bus) this.#bus.emit(Events.AUTOSAVE_STATUS, status);
  }
}
