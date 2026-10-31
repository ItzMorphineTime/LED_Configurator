/**
 * @module ui/ProjectPanel
 * The Project section (spec 07 3.3, D8; the owner's request of 2026-11-01): the first card of the side panel, open at
 * start (the .collapsible pattern, ui/Collapsible.js). #project-name renames the project (ProjectSession.setName, on
 * change; Escape puts the stored name back); #project-dirty ("Unsaved changes") shows while ProjectSession.dirty; the
 * document title is "<product> — <name>", with a trailing " •" while dirty.
 *  - Save (#project-save, Ctrl/Cmd+S): ProjectIO.saveProject, the Export JSON document named after the project.
 *  - Open (#project-open, Ctrl/Cmd+O): the picker #project-open-input (.json or .zip), then the Import path
 *    (ProjectIO.importFromInputEvent -> ProjectSession.openFile; corrections are reported as for Import).
 *  - New (#project-new): ProjectSession.newProject, the defaults of a page load.
 * Open and New ask "Discard unsaved changes?" (dialogs.confirm) while the project is dirty: New before it applies, Open
 * once a file is chosen (a file picker opened after a blocking confirm can fail the browser's user-activation check,
 * which lasts about 5 s), so Cancel, or cancelling the picker, changes nothing.
 * Dirty is the session's capture comparison. The indicator and the title re-read it at most every REFRESH_MS after an
 * edit signal (the model events of EDIT_EVENTS, and an input, change, click, pointerup or keyup anywhere in the
 * document, capture phase), and at once after a rename, Save, Open and New; App calls refresh() after the bootstrap's
 * markClean.
 * The two shortcuts are one capture-phase keydown listener on the window, so they also work in a text field (they are
 * modified chords): a focused text field's pending edit is committed first (blur fires its change, then the focus
 * returns), and the chord is consumed (preventDefault: no Save Page or Open File dialog of the browser; stopPropagation:
 * KeyboardState never sees S or O held, so the WASD movement never starts); an auto-repeat does nothing.
 * Autosave (07 H3): the Autosave switch (#toggle-autosave, role="switch": click, Space or Enter) sets the device
 * preference through app/Autosave.setEnabled; it shows on while the preference is on and storage works, and is
 * aria-disabled (off, inert) with `?autosave=off` or without storage. #autosave-note shows Autosave's note (storage
 * full, logos left out, storage unavailable, paused for the restore banner) and mirrors its state in data-state. Both
 * follow AUTOSAVE_STATUS.
 * Owns #project-name, #project-dirty, #project-new, #project-open, #project-save, #project-open-input,
 * #toggle-autosave, #autosave-note.
 * Legacy source: none (new in 07 D8).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { Events } from '../core/EventBus.js';
import { byId } from './dom.js';

/** The question of Open and New while the project has unsaved changes. */
export const DISCARD_MESSAGE = 'Discard unsaved changes?';

/** The longest wait between an edit signal and the dirty re-check (ms). */
export const REFRESH_MS = 150;

/** The model events after which the project may have changed (each schedules a dirty re-check). */
const EDIT_EVENTS = Object.freeze([
  Events.WALL_SECTIONS_CHANGED, Events.WALL_SECTION_RENAMED, Events.WALL_MESH_MODE_CHANGED, Events.WALL_REBUILT,
  Events.DISPLAY_CONTENT_CHANGED, Events.CAMERA_PREVIEW_CHANGED, Events.CAMERA_FILMBACK_CHANGED, Events.CAMERA_LENS_CHANGED,
  Events.CAMERA_POSE_CHANGED, Events.CAMERA_SAFE_DISTANCE_TOGGLED, Events.PROP_VISIBILITY_CHANGED, Events.PROP_POSE_CHANGED,
  Events.SELECTABLE_MOVED, Events.WALL_PIVOT_CHANGED, Events.UV_TRANSFORM_CHANGED, Events.UV_DATA_CHANGED,
  Events.UV_SETTINGS_CHANGED,
]);

/** The document events (capture phase) after which the project may have changed. */
const EDIT_DOM_EVENTS = Object.freeze(['input', 'change', 'click', 'pointerup', 'keyup']);

/** INPUT types without typed text (no pending edit to commit). */
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'range', 'image', 'hidden']);

/**
 * The Project section's chord of a keydown: Ctrl+S or Cmd+S is 'save', Ctrl+O or Cmd+O is 'open' (no Alt, which also
 * keeps AltGr out, and no Shift). The letter is e.key on a Latin layout, else the physical key (e.code), as the
 * browser's own shortcuts.
 * Side effects: none.
 * @param {{key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean}} e
 * @returns {'save'|'open'|null}
 */
export function projectShortcut(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return null;
  const key = typeof e.key === 'string' && /^[a-z]$/i.test(e.key) ? e.key.toLowerCase()
    : ({ KeyS: 's', KeyO: 'o' })[e.code] ?? null;
  if (key === 's') return 'save';
  return key === 'o' ? 'open' : null;
}

/**
 * The document title: "<product> — <name>", plus " •" while there are unsaved changes.
 * Side effects: none.
 * @param {string} product  Brand.productName
 * @param {string} name     the project name
 * @param {boolean} dirty
 * @returns {string}
 */
export function projectDocTitle(product, name, dirty) {
  return `${product} — ${name}${dirty ? ' •' : ''}`;
}

/**
 * Whether `el` is a text field whose typed value may not be committed yet (its change event fires on blur).
 * @param {*} el  document.activeElement
 * @returns {boolean}
 */
function isTextField(el) {
  if (!el || typeof el.blur !== 'function') return false;
  const tag = String(el.tagName ?? '').toUpperCase();
  return tag === 'TEXTAREA' || (tag === 'INPUT' && !NON_TEXT_INPUT_TYPES.has(String(el.type || 'text').toLowerCase()));
}

/** The Project section: name, unsaved-changes indicator, title, Save, Open, New and their two shortcuts. */
export class ProjectPanel {
  /** @type {Document} */ #doc;
  /** @type {Window} setTimeout, clearTimeout, the keydown listener */ #win;
  /** @type {import('../app/ProjectSession.js').ProjectSession} */ #session;
  /** @type {import('../app/ProjectIO.js').ProjectIO} */ #projectIO;
  /** @type {{confirm(msg: string): boolean}} */ #dialogs;
  /** @type {string} Brand.productName */ #product;
  /** @type {HTMLInputElement} */ #name;
  /** @type {HTMLElement} */ #dirty;
  /** @type {HTMLElement} */ #newBtn;
  /** @type {HTMLElement} */ #openBtn;
  /** @type {HTMLElement} */ #saveBtn;
  /** @type {HTMLInputElement} */ #openInput;
  /** @type {{enabled: boolean, setEnabled(on: boolean): boolean}|null} app/Autosave (07 H3) */ #autosave;
  /** @type {HTMLElement|null} */ #autosaveToggle;
  /** @type {HTMLElement|null} */ #autosaveNote;
  /** @type {*} the pending re-check's timer id, or null */ #timer = null;

  /**
   * Stores the collaborators, looks up the owned elements and subscribes the edit events (a dirty re-check),
   * PROJECT_REPLACED (the name field follows an Open, a New and an Import) and AUTOSAVE_STATUS (the switch and the
   * note). No mutation, no DOM listener (R4).
   * Side effects: DOM lookups and bus subscriptions only.
   * @param {{doc: Document, win: Window, session: object, projectIO: object, bus: import('../core/EventBus.js').EventBus,
   *          dialogs: {confirm(msg: string): boolean}, brand: {productName: string},
   *          autosave?: {enabled: boolean, setEnabled(on: boolean): boolean}|null}} deps
   */
  constructor({ doc, win, session, projectIO, bus, dialogs, brand, autosave = null }) {
    this.#doc = doc;
    this.#win = win;
    this.#session = session;
    this.#projectIO = projectIO;
    this.#dialogs = dialogs;
    this.#product = brand.productName;
    this.#autosave = autosave;
    this.#name = byId(doc, 'project-name');
    this.#dirty = byId(doc, 'project-dirty');
    this.#newBtn = byId(doc, 'project-new');
    this.#openBtn = byId(doc, 'project-open');
    this.#saveBtn = byId(doc, 'project-save');
    this.#openInput = byId(doc, 'project-open-input');
    this.#autosaveToggle = byId(doc, 'toggle-autosave');
    this.#autosaveNote = byId(doc, 'autosave-note');
    const schedule = () => this.#schedule();
    for (const type of EDIT_EVENTS) bus.on(type, schedule);
    bus.on(Events.PROJECT_REPLACED, () => {
      this.#name.value = session.name;
      schedule();
    });
    bus.on(Events.AUTOSAVE_STATUS, (status) => this.#showAutosave(status));
  }

  /**
   * Adds the listeners: the name field (change renames, Escape restores the stored name), the three buttons, the
   * picker's change, the Autosave switch (click; Space or Enter while focused), the window's capture-phase keydown (the
   * two chords) and the document's capture-phase edit signals.
   * Side effects: 6 element listeners (8 with autosave), 1 window listener, 5 document listeners.
   */
  bind() {
    this.#name.addEventListener('change', () => this.rename(this.#name.value));
    this.#name.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.#name.value = this.#session.name;
    });
    this.#saveBtn.addEventListener('click', () => this.save());
    this.#openBtn.addEventListener('click', () => this.openPicker());
    this.#newBtn.addEventListener('click', () => this.newProject());
    this.#openInput.addEventListener('change', (e) => this.openChosen(e));
    if (this.#autosave && this.#autosaveToggle) {
      this.#autosaveToggle.addEventListener('click', () => this.toggleAutosave());
      this.#autosaveToggle.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        this.toggleAutosave();
      });
    }
    this.#win.addEventListener('keydown', (e) => this.#onKeydown(e), true);
    for (const type of EDIT_DOM_EVENTS) this.#doc.addEventListener(type, () => this.#schedule(), true);
  }

  /**
   * The Autosave switch: flips the preference (Autosave.setEnabled; ignored while the switch is aria-disabled).
   * Side effects: see Autosave.setEnabled (its AUTOSAVE_STATUS redraws the switch).
   * @returns {boolean} the preference after the call
   */
  toggleAutosave() {
    if (!this.#autosave) return false;
    return this.#autosave.setEnabled(!this.#autosave.enabled);
  }

  /**
   * AUTOSAVE_STATUS: the switch (on while the preference is on and storage works; aria-disabled with `?autosave=off` or
   * without storage) and the note (Autosave's message; hidden without one; data-state mirrors the state).
   * @param {{state: string, message: string|null, enabled: boolean, available: boolean, suppressed: boolean}} status
   */
  #showAutosave(status) {
    const toggle = this.#autosaveToggle;
    if (toggle) {
      const inert = status.suppressed || !status.available;
      const on = status.enabled && !inert;
      toggle.classList.toggle('active', on);
      toggle.setAttribute('aria-checked', String(on));
      toggle.setAttribute('aria-disabled', String(inert));
      toggle.tabIndex = inert ? -1 : 0;
      if (status.suppressed) toggle.title = 'Autosave is off for this page load (autosave=off in the address)';
    }
    const note = this.#autosaveNote;
    if (note) {
      note.dataset.state = status.state;
      note.textContent = status.message ?? '';
      note.hidden = !status.message;
    }
  }

  /**
   * Writes the unsaved-changes indicator and the document title from the session (and cancels a pending re-check). The
   * name field is written only by a rename and PROJECT_REPLACED, never here, so typing in it is never overwritten.
   * Side effects: #project-dirty's hidden, doc.title.
   * @returns {boolean} session.dirty
   */
  refresh() {
    if (this.#timer !== null) {
      this.#win.clearTimeout(this.#timer);
      this.#timer = null;
    }
    const dirty = this.#session.dirty;
    this.#dirty.hidden = !dirty;
    this.#doc.title = projectDocTitle(this.#product, this.#session.name, dirty);
    return dirty;
  }

  /**
   * Renames the project (session.setName: the validator's text rule) and shows the stored name.
   * Side effects: project.meta.name; the name field; refresh().
   * @param {string} raw
   * @returns {string} the stored name
   */
  rename(raw) {
    const name = this.#session.setName(raw);
    this.#name.value = name;
    this.refresh();
    return name;
  }

  /**
   * Save: commits a focused field's pending edit, then ProjectIO.saveProject (one download named after the project; the
   * session is clean after it, or an M-EXP-1 alert).
   * Side effects: see ProjectIO.saveProject; refresh().
   */
  save() {
    this.#commitTyping();
    this.#projectIO.saveProject();
    this.refresh();
  }

  /**
   * Open: commits a focused field's pending edit, then opens the file picker (openChosen runs when a file is chosen).
   * Side effects: #project-open-input.click().
   */
  openPicker() {
    this.#commitTyping();
    this.#openInput.click();
  }

  /**
   * The picker's change: without a file, nothing; while dirty, "Discard unsaved changes?" (Cancel resets the picker and
   * changes nothing); then the Import path (ProjectIO.importFromInputEvent: the session's openFile, which reports
   * corrections and refusals and leaves the project clean after an open), and a refresh when it settles.
   * Side effects: at most one confirm; see ProjectSession.openFile.
   * @param {Event} e  the #project-open-input change event
   * @returns {Promise<boolean>|undefined} whether the file was applied (undefined: no file, or cancelled)
   */
  openChosen(e) {
    const input = e.target;
    if (!input.files || !input.files[0]) return undefined;
    if (this.#session.dirty && !this.#dialogs.confirm(DISCARD_MESSAGE)) {
      input.value = '';
      return undefined;
    }
    const opened = this.#projectIO.importFromInputEvent(e);
    return Promise.resolve(opened).then((ok) => {
      this.refresh();
      return ok;
    });
  }

  /**
   * New: while dirty, "Discard unsaved changes?" first (Cancel changes nothing); then ProjectSession.newProject (the
   * defaults of a page load, clean and pristine).
   * Side effects: at most one confirm; see ProjectSession.newProject; the name field; refresh().
   * @returns {boolean} whether a new project was applied
   */
  newProject() {
    if (this.#session.dirty && !this.#dialogs.confirm(DISCARD_MESSAGE)) return false;
    this.#session.newProject();
    this.#name.value = this.#session.name;
    this.refresh();
    return true;
  }

  /** The window's capture-phase keydown: Ctrl/Cmd+S saves, Ctrl/Cmd+O opens the picker; both chords are consumed. */
  #onKeydown(e) {
    const action = projectShortcut(e);
    if (action === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (action === 'save') this.save();
    else this.openPicker();
  }

  /** Commits the focused text field's typed value (its change event fires on blur), then gives it the focus back. */
  #commitTyping() {
    const el = this.#doc.activeElement;
    if (!isTextField(el)) return;
    el.blur();
    if (el.isConnected !== false && typeof el.focus === 'function') el.focus({ preventScroll: true });
  }

  /** At most one pending re-check (REFRESH_MS). */
  #schedule() {
    if (this.#timer !== null) return;
    this.#timer = this.#win.setTimeout(() => {
      this.#timer = null;
      this.refresh();
    }, REFRESH_MS);
  }
}
