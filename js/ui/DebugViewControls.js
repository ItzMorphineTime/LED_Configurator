/**
 * @module ui/DebugViewControls
 * The normals debug view's controls (docs/improvements/01-normals.md 3.1-3.5, 5.2): the two toolbar buttons
 * (#toggle-normals: normal lines, N; #debug-view-btn: the popover, Shift+N cycles the shading), the non-modal popover
 * #debug-view-popover with native radios, checkboxes and a range, the top-centre legend #debug-view-legend (in
 * #viewport-top-stack) and the visually hidden announcer #debug-view-status. Commands go down to DebugViewController;
 * the DEBUG_VIEW_CHANGED mirror (the controller's snapshot) updates the buttons, the inputs, the legend and the
 * announcer. #debug-normals-stats inside the popover belongs to NormalsDebugView (App injects it there).
 * Focus rules (3.2): a keyboard-opened popover focuses the checked shading radio, a pointer-opened one leaves focus on
 * the button; a pointer-initiated change blurs the control, so focus returns to BODY and the viewport keys (WASD, G/R/L/P,
 * N) keep working; Escape (focus anywhere) closes the popover first, through a capture-phase document listener that
 * exists only while the popover is open (until 07 I1 replaces it with the Escape registry entry at priority 70, 07 C42).
 * N / Shift+N are read by a separate bubble-phase document listener, registered after ViewportInput.attachShortcuts,
 * with the shared typing guard core/typingTarget.js (01 CR-9) and the modifier and repeat filters (3.4).
 * Legacy source: none (Feature 1).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js). Imports only core and ui (01 8.1).
 */

import { Events } from '../core/EventBus.js';
import { isTypingTarget } from '../core/typingTarget.js';
import { byId } from './dom.js';

/** The visible name of each shading mode (the radio labels; 07 C49: the content mode reads "As displayed"). */
const SHADING_LABELS = Object.freeze({
  content: 'As displayed',
  faceOrientation: 'Face orientation',
  normalColors: 'Normal colours (world)',
});

/** The announcer debounce (3.2): a range drag announces once, 400 ms after the last change. */
const ANNOUNCE_DELAY_MS = 400;

/** The popover keeps this margin to the overlay's top and bottom edges (3.1). */
const POPOVER_MARGIN = 20;

/**
 * A 0xRRGGBB theme colour as a CSS hex colour.
 * @param {number} n
 * @returns {string}
 */
const cssHex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * The announcer message for the first setting that differs between two snapshots (3.2), or null.
 * Side effects: none.
 * @param {{shading: string, normals: {enabled: boolean, vertex: boolean, face: boolean, lengthScale: number,
 *   onTop: boolean}}|null} prev
 * @param {{shading: string, normals: {enabled: boolean, vertex: boolean, face: boolean, lengthScale: number,
 *   onTop: boolean}}} next
 * @returns {string|null}
 */
export function announcement(prev, next) {
  const onOff = (v) => (v ? 'on' : 'off');
  const a = prev ? prev.normals : {};
  const b = next.normals;
  if (a.enabled !== b.enabled) return `Normal lines ${onOff(b.enabled)}`;
  if (a.vertex !== b.vertex) return `Vertex normals ${onOff(b.vertex)}`;
  if (a.face !== b.face) return `Face normals ${onOff(b.face)}`;
  if (a.lengthScale !== b.lengthScale) return `Length ×${b.lengthScale.toFixed(2)}`;
  if (a.onTop !== b.onTop) return `Draw on top ${onOff(b.onTop)}`;
  if (!prev || prev.shading !== next.shading) return `Shading: ${SHADING_LABELS[next.shading] ?? next.shading}`;
  return null;
}

/**
 * The popover's top edge within the overlay (3.1): open downward with the top edge at the button's top edge; if that
 * does not fit, open upward with the bottom edge at the button's bottom edge; then clamp to the overlay with a 20 px
 * margin (a popover taller than the overlay sits at 20 px and scrolls).
 * Side effects: none.
 * @param {{top: number, height: number}} overlay  the overlay's client rect
 * @param {{top: number, bottom: number}} button  the button's client rect
 * @param {number} height  the popover's height while shown (already limited by its max-height)
 * @returns {{top: number, placement: 'down'|'up'}}
 */
export function popoverPlacement(overlay, button, height) {
  const lo = POPOVER_MARGIN;
  const hi = overlay.height - POPOVER_MARGIN;
  let top = button.top - overlay.top;
  let placement = 'down';
  if (top + height > hi) {
    top = (button.bottom - overlay.top) - height;
    placement = 'up';
  }
  top = Math.max(lo, Math.min(top, hi - height));
  return { top: Math.round(top), placement };
}

/**
 * The debug view's toolbar buttons, popover, legend and announcer.
 * Wiring (App): constructed with the other panels (the constructor subscribes the mirror); bind() and bindShortcuts()
 * at the end of the setupUI phase, after ViewportInput.attachShortcuts, so the legacy listener order is unchanged.
 */
export class DebugViewControls {
  /** @type {Document} */ #doc;
  /** @type {Window} */ #win;
  /** @type {import('../app/DebugViewController.js').DebugViewController} */ #controller;
  /** @type {{scene: {debug: Record<string, number>}}} */ #theme;
  /** @type {HTMLElement} */ #toggleNormals;
  /** @type {HTMLElement} */ #menuButton;
  /** @type {HTMLElement} */ #popover;
  /** @type {HTMLInputElement[]} the three shading radios */ #radios;
  /** @type {HTMLInputElement} */ #vertex;
  /** @type {HTMLInputElement} */ #face;
  /** @type {HTMLInputElement} */ #scale;
  /** @type {HTMLElement} */ #scaleValue;
  /** @type {HTMLInputElement} */ #onTop;
  /** @type {HTMLElement} */ #close;
  /** @type {HTMLElement} */ #legend;
  /** @type {HTMLElement} */ #status;
  /** The last mirrored snapshot (the announcer reports what changed since). */
  #last;
  /** True from a pointerdown inside the popover until the next change, keydown or post-pointerup timer (3.2). */
  #pointerChange = false;
  /** The pending announcer timer and message. */
  #announceTimer = null;
  #pendingMessage = '';
  /** The listeners that exist only while the popover is open (added on open, removed on close). */
  #onEscape = (e) => {
    if (e.key !== 'Escape') return;   // every other key passes untouched (N, G, WASD are never swallowed)
    e.stopPropagation();              // the legacy bubble-phase handler (deselect, exit pilot) never sees this Escape
    this.closePopover();
  };
  #onOutsidePointerDown = (e) => {
    if (this.#popover.contains(e.target) || this.#menuButton.contains(e.target)) return;
    this.closePopover({ moveFocus: false });   // not consumed: an orbit drag still starts
  };
  #onResize = () => this.#placePopover();

  /**
   * Stores the collaborators, looks up the owned elements (no mutation) and subscribes the DEBUG_VIEW_CHANGED mirror.
   * Side effects: DOM lookups; one bus subscription.
   * @param {{doc: Document, win: Window,
   *          controller: import('../app/DebugViewController.js').DebugViewController,
   *          bus: import('../core/EventBus.js').EventBus, theme: {scene: object}}} deps
   */
  constructor({ doc, win, controller, bus, theme }) {
    this.#doc = doc;
    this.#win = win;
    this.#controller = controller;
    this.#theme = theme;
    this.#toggleNormals = byId(doc, 'toggle-normals');
    this.#menuButton = byId(doc, 'debug-view-btn');
    this.#popover = byId(doc, 'debug-view-popover');
    this.#radios = [byId(doc, 'debug-shading-content'), byId(doc, 'debug-shading-face'), byId(doc, 'debug-shading-normals')];
    this.#vertex = byId(doc, 'debug-normals-vertex');
    this.#face = byId(doc, 'debug-normals-face');
    this.#scale = byId(doc, 'debug-normals-scale');
    this.#scaleValue = byId(doc, 'debug-normals-scale-value');
    this.#onTop = byId(doc, 'debug-normals-ontop');
    this.#close = byId(doc, 'debug-view-close');
    this.#legend = byId(doc, 'debug-view-legend');
    this.#status = byId(doc, 'debug-view-status');
    this.#last = controller.settings.snapshot();
    bus.on(Events.DEBUG_VIEW_CHANGED, (snapshot) => this.#mirror(snapshot));
  }

  /**
   * Adds the listeners: the two toolbar buttons, the close button, the inputs (change for the radios and checkboxes,
   * input + change for the range), the pointer-change blur rule and its flag clearing (pointerdown inside sets the flag;
   * a change blurs the focused control inside the popover and clears it; a timer after pointerup / pointercancel and
   * any keydown inside clear it), and sets each legend swatch's --swatch from theme.scene.debug (the stylesheet holds
   * no colour literal). The Escape, outside-pointerdown and resize listeners are added on open (see openPopover).
   * Side effects: DOM listeners; writes the swatches' --swatch custom property.
   * @returns {void}
   */
  bind() {
    const controller = this.#controller;
    const debug = this.#theme.scene.debug;
    for (const swatch of this.#legend.querySelectorAll('[data-swatch]')) {
      const value = debug[swatch.dataset.swatch];
      if (typeof value === 'number') swatch.style.setProperty('--swatch', cssHex(value));
    }

    this.#toggleNormals.addEventListener('click', () => controller.toggleNormals());
    this.#menuButton.addEventListener('click', (e) => {
      if (this.isPopoverOpen()) this.closePopover();
      else this.openPopover({ keyboard: e.detail === 0 });   // Enter / Space (and el.click()) give detail 0
    });
    this.#close.addEventListener('click', () => this.closePopover());

    for (const radio of this.#radios) {
      radio.addEventListener('change', () => { if (radio.checked) controller.setShading(radio.value); });
    }
    this.#vertex.addEventListener('change', () => controller.setNormalLineKinds({ vertex: this.#vertex.checked }));
    this.#face.addEventListener('change', () => controller.setNormalLineKinds({ face: this.#face.checked }));
    const scale = this.#scale;
    scale.addEventListener('input', () => controller.setLengthScale(scale.value));
    scale.addEventListener('change', () => controller.setLengthScale(scale.value));
    this.#onTop.addEventListener('change', () => controller.setOnTop(this.#onTop.checked));

    const popover = this.#popover;
    popover.addEventListener('pointerdown', () => { this.#pointerChange = true; });
    const clearSoon = () => { this.#win.setTimeout(() => { this.#pointerChange = false; }, 0); };
    popover.addEventListener('pointerup', clearSoon);
    popover.addEventListener('pointercancel', clearSoon);
    popover.addEventListener('keydown', () => { this.#pointerChange = false; });
    // Bubble phase on the popover: runs after the control's own change listener, so the model is written first.
    popover.addEventListener('change', () => {
      if (!this.#pointerChange) return;
      this.#pointerChange = false;
      const active = this.#doc.activeElement;
      if (active && popover.contains(active) && typeof active.blur === 'function') active.blur();
    });
  }

  /**
   * N toggles the normal lines and Shift+N cycles the shading (3.4). A document keydown listener in the bubble phase,
   * registered after ViewportInput.attachShortcuts (so the legacy listener order is unchanged):
   *   if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
   *   if (e.key.toLowerCase() === 'n') { e.shiftKey ? controller.cycleShading() : controller.toggleNormals() }
   * isTypingTarget counts anything inside the open popover ([role=dialog]) as typing, so N is ignored while keyboard
   * focus is inside it. From 07 I1 these become KEYMAP actions (debug.normals, debug.cycleShading).
   * Side effects: adds 1 document keydown listener.
   * @returns {void}
   */
  bindShortcuts() {
    const controller = this.#controller;
    this.#doc.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (typeof e.key !== 'string' || e.key.toLowerCase() !== 'n') return;
      if (e.shiftKey) controller.cycleShading();
      else controller.toggleNormals();
    });
  }

  /** Side effects: none. @returns {boolean} true while the popover is shown (07 C42's Escape entry reads it) */
  isPopoverOpen() {
    return this.#popover.hidden !== true;
  }

  /**
   * Shows the popover: placement (3.1), aria-expanded, the open-only listeners (the capture-phase Escape listener on
   * the document, the outside-pointerdown close, the window resize re-placement), and for a keyboard open the focus
   * on the checked shading radio (a pointer open leaves focus where the browser put it, on the button).
   * Side effects: DOM writes; adds 3 listeners; may move focus.
   * @param {{keyboard?: boolean}} [options]
   * @returns {void}
   */
  openPopover({ keyboard = false } = {}) {
    if (this.isPopoverOpen()) return;
    this.#popover.hidden = false;
    this.#placePopover();
    this.#menuButton.setAttribute('aria-expanded', 'true');
    this.#doc.addEventListener('keydown', this.#onEscape, true);
    this.#doc.addEventListener('pointerdown', this.#onOutsidePointerDown, true);
    this.#win.addEventListener('resize', this.#onResize);
    if (keyboard) (this.#radios.find((r) => r.checked) ?? this.#radios[0]).focus();
  }

  /**
   * Hides the popover and removes the open-only listeners. Focus returns to #debug-view-btn iff it was inside the
   * popover (an outside pointerdown passes moveFocus: false: the user is clicking elsewhere).
   * Side effects: DOM writes; removes 3 listeners; may move focus.
   * @param {{moveFocus?: boolean}} [options]
   * @returns {void}
   */
  closePopover({ moveFocus = true } = {}) {
    if (!this.isPopoverOpen()) return;
    const active = this.#doc.activeElement;
    const focusInside = !!active && this.#popover.contains(active);
    this.#popover.hidden = true;
    this.#menuButton.setAttribute('aria-expanded', 'false');
    this.#doc.removeEventListener('keydown', this.#onEscape, true);
    this.#doc.removeEventListener('pointerdown', this.#onOutsidePointerDown, true);
    this.#win.removeEventListener('resize', this.#onResize);
    this.#pointerChange = false;
    if (moveFocus && focusInside) this.#menuButton.focus();
  }

  /** Places the shown popover next to its button within the overlay (3.1: getBoundingClientRect, never offsetTop). */
  #placePopover() {
    const popover = this.#popover;
    const overlay = popover.parentElement.getBoundingClientRect();
    const { top, placement } = popoverPlacement(overlay, this.#menuButton.getBoundingClientRect(), popover.offsetHeight);
    popover.style.top = `${top}px`;
    popover.dataset.placement = placement;
  }

  /**
   * DEBUG_VIEW_CHANGED mirror: button classes and aria-pressed, the inputs and the length text, the legend rows and
   * the debounced announcement of what changed.
   * @param {{shading: string, normals: {enabled: boolean, vertex: boolean, face: boolean, lengthScale: number,
   *   onTop: boolean}}} snapshot
   */
  #mirror(snapshot) {
    const { shading, normals } = snapshot;
    this.#toggleNormals.classList.toggle('active', normals.enabled);
    this.#toggleNormals.setAttribute('aria-pressed', String(normals.enabled));
    this.#menuButton.classList.toggle('active', shading !== 'content');
    for (const radio of this.#radios) radio.checked = radio.value === shading;
    this.#vertex.checked = normals.vertex;
    this.#face.checked = normals.face;
    this.#onTop.checked = normals.onTop;
    if (Number(this.#scale.value) !== normals.lengthScale) this.#scale.value = String(normals.lengthScale);
    this.#scaleValue.textContent = `×${normals.lengthScale.toFixed(2)}`;

    let anyRow = false;
    for (const row of this.#legend.querySelectorAll('[data-legend]')) {
      const key = row.dataset.legend;
      const shown = key === 'normals' ? normals.enabled : key === shading;
      row.hidden = !shown;
      anyRow = anyRow || shown;
    }
    this.#legend.hidden = !anyRow;

    const message = announcement(this.#last, snapshot);
    this.#last = snapshot;
    if (message) this.#announce(message);
  }

  /** Writes `message` to the status region 400 ms after the last call (a newer message replaces a pending one). */
  #announce(message) {
    this.#pendingMessage = message;
    if (this.#announceTimer !== null) this.#win.clearTimeout(this.#announceTimer);
    this.#announceTimer = this.#win.setTimeout(() => {
      this.#announceTimer = null;
      this.#status.textContent = this.#pendingMessage;
    }, ANNOUNCE_DELAY_MS);
  }
}
