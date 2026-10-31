/**
 * @module ui/FloatingPanel
 * A generic floating panel inside the viewport (docs/improvements/04-uvs-uv-editor.md 3.1, 5.3; UV-10): a header that
 * moves it, a bottom-left resize handle, a close button, focus handling (focus leaves the panel when it hides), the
 * narrow-layout bottom sheet (viewport width <= 900 px: css/features/floating-panel.css lays it out, moving and resizing
 * are disabled) and re-clamping: on window resizes and, through one ResizeObserver, on host and avoid-element size
 * changes, the size stays within 90 % of the host and the header inside it. While the panel is at its default place,
 * the default rectangle shrinks above the avoid element (the camera preview window: showing, hiding and resizing it are
 * observed, so PreviewWindow needs no hook) down to the minimum height; once the user moved or resized the panel this
 * auto-offset stops for the session. The geometry is pure (defaultRect, clampRect) and unit-tested.
 * Legacy source: none (Feature 4).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

/** The narrow layout's media query (the app's responsive breakpoint, css/12-responsive.css). */
export const NARROW_QUERY = '(max-width: 900px)';
/** The gap kept between the panel and the avoid element (04 3.1). */
const AVOID_GAP = 8;

/**
 * @typedef {{left: number, top: number, width: number, height: number}} PanelRect  host CSS px
 * @typedef {{left: number, top: number, right: number, bottom: number}} HostBox    host CSS px
 */

/**
 * The default rectangle (04 3.1): `defaults.top` from the top and `defaults.right` from the right edge; when it would
 * overlap `avoid`, its height shrinks so its bottom stays AVOID_GAP px above avoid.top, down to min.height.
 * Side effects: none.
 * @param {number} hostW
 * @param {number} hostH
 * @param {{top: number, right: number, width: number, height: number}} defaults
 * @param {{width: number, height: number}} min
 * @param {HostBox|null} avoid  the avoid element's box in host coordinates; null when hidden (0 x 0)
 * @returns {PanelRect}
 */
export function defaultRect(hostW, hostH, defaults, min, avoid) {
  const rect = { left: hostW - defaults.right - defaults.width, top: defaults.top, width: defaults.width, height: defaults.height };
  const overlaps = avoid && rect.left < avoid.right && rect.left + rect.width > avoid.left
    && rect.top < avoid.bottom && rect.top + rect.height > avoid.top;
  if (overlaps) rect.height = Math.max(min.height, Math.min(rect.height, avoid.top - AVOID_GAP - rect.top));
  return rect;
}

/**
 * Clamps a rectangle into the host (04 3.1): width and height within [min, 90 % of the host] (the 90 % cap wins on a
 * small host), then the position so the whole width and the header stay inside the host.
 * Side effects: none.
 * @param {PanelRect} rect
 * @param {number} hostW
 * @param {number} hostH
 * @param {{width: number, height: number}} min
 * @param {number} headerH  the header height (CSS px)
 * @returns {PanelRect}
 */
export function clampRect(rect, hostW, hostH, min, headerH) {
  const maxW = Math.max(1, Math.floor(hostW * 0.9));
  const maxH = Math.max(1, Math.floor(hostH * 0.9));
  const width = Math.min(Math.max(rect.width, min.width), maxW);
  const height = Math.min(Math.max(rect.height, min.height), maxH);
  const left = Math.min(Math.max(rect.left, 0), Math.max(0, hostW - width));
  const top = Math.min(Math.max(rect.top, 0), Math.max(0, hostH - headerH));
  return { left, top, width, height };
}

/** A movable, resizable, closable panel inside a host element. */
export class FloatingPanel {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;
  /** @type {HTMLElement} */
  #host;
  #id;
  #title;
  #label;
  #defaults;
  #min;
  /** @type {() => (HTMLElement|null)} */
  #avoidElement;
  /** @type {HTMLElement|null} */
  #el = null;
  /** @type {HTMLElement|null} */
  #header = null;
  /** @type {HTMLElement|null} */
  #extra = null;
  /** @type {HTMLElement|null} */
  #body = null;
  /** @type {PanelRect|null} the user's rectangle; null while at the default place (auto-offset active) */
  #userRect = null;
  /** @type {PanelRect|null} the applied rectangle */
  #rect = null;
  /** @type {{kind: 'move'|'resize', x: number, y: number, rect: PanelRect, pointerId: number}|null} */
  #gesture = null;
  /** @type {Function[]} */
  #closeFns = [];
  /** @type {Function[]} */
  #resizeFns = [];

  /**
   * Stores the dependencies only (R4): no DOM is created and no listener added until mount().
   * Side effects: none.
   * @param {{doc: Document, win: Window, host: HTMLElement, id: string, title: string, label?: string,
   *          defaults?: {top: number, right: number, width: number, height: number},
   *          min?: {width: number, height: number}, avoidElement?: () => (HTMLElement|null)}} deps
   *   host: the positioned parent (.viewport); defaults and min: 04 3.1's 20 / 72 / 380 x 440 and 300 x 320
   */
  constructor({ doc, win, host, id, title, label = title, defaults = { top: 20, right: 72, width: 380, height: 440 },
    min = { width: 300, height: 320 }, avoidElement = () => null }) {
    this.#doc = doc;
    this.#win = win;
    this.#host = host;
    this.#id = id;
    this.#title = title;
    this.#label = label;
    this.#defaults = defaults;
    this.#min = min;
    this.#avoidElement = avoidElement;
  }

  /**
   * Creates the DOM (hidden): `section#<id>.floating-panel` with the header (title, an extra slot, the close button),
   * the body and the bottom-left resize handle, appended to the host; attaches the pointer listeners, a window
   * `resize` listener and one ResizeObserver on the host and the avoid element (when the window has ResizeObserver).
   * Idempotent.
   * Side effects: DOM creation; listeners.
   */
  mount() {
    if (this.#el) return;
    const doc = this.#doc;
    const el = doc.createElement('section');
    el.id = this.#id;
    el.className = 'floating-panel';
    el.hidden = true;
    el.tabIndex = -1;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', this.#label);
    const header = doc.createElement('div');
    header.className = 'floating-panel__header';
    const title = doc.createElement('span');
    title.className = 'floating-panel__title';
    title.textContent = this.#title;
    const extra = doc.createElement('div');
    extra.className = 'floating-panel__extra';
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'floating-panel__close';
    close.setAttribute('aria-label', `Close ${this.#title}`);
    close.title = `Close ${this.#title}`;
    close.textContent = '×';
    header.append(title, extra, close);
    const body = doc.createElement('div');
    body.className = 'floating-panel__body';
    const resize = doc.createElement('div');
    resize.className = 'floating-panel__resize';
    resize.setAttribute('aria-hidden', 'true');
    el.append(header, body, resize);
    this.#host.appendChild(el);
    this.#el = el;
    this.#header = header;
    this.#extra = extra;
    this.#body = body;

    close.addEventListener('click', () => this.#closeFns.forEach((fn) => fn()));
    header.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, select, input, label')) return;
      this.#begin('move', e, header);
    });
    resize.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.#begin('resize', e, resize);
    });
    for (const target of [header, resize]) {
      target.addEventListener('pointermove', (e) => this.#move(e));
      target.addEventListener('pointerup', (e) => this.#end(e));
      target.addEventListener('pointercancel', (e) => this.#end(e));
    }
    this.#win.addEventListener('resize', () => this.reflow());
    const RO = this.#win.ResizeObserver;
    if (typeof RO === 'function') {
      const ro = new RO(() => this.reflow());
      ro.observe(this.#host);
      const avoid = this.#avoidElement();
      if (avoid) ro.observe(avoid);
    }
  }

  /** Side effects: none. @returns {HTMLElement|null} the panel element (null before mount) */
  get element() {
    return this.#el;
  }

  /** Side effects: none. @returns {HTMLElement|null} the body element (null before mount) */
  get body() {
    return this.#body;
  }

  /** Side effects: none. @returns {HTMLElement|null} the header slot between the title and the close button */
  get headerExtra() {
    return this.#extra;
  }

  /** Side effects: none. @returns {boolean} mounted and shown */
  get visible() {
    return !!this.#el && !this.#el.hidden;
  }

  /** Side effects: none. @returns {PanelRect|null} the applied rectangle (null in the narrow sheet or before a show) */
  get rect() {
    return this.#rect ? { ...this.#rect } : null;
  }

  /** Mounts if needed, shows the panel and lays it out. Side effects: DOM. */
  show() {
    this.mount();
    if (!this.#el.hidden) return;
    this.#el.hidden = false;
    this.reflow();
  }

  /**
   * Hides the panel; focus inside it moves to `returnFocus` (when given and focusable) or is dropped, so it never stays
   * on a hidden element.
   * Side effects: DOM; focus.
   * @param {HTMLElement|null} [returnFocus]
   */
  hide(returnFocus = null) {
    const el = this.#el;
    if (!el || el.hidden) return;
    const active = this.#doc.activeElement;
    const hadFocus = !!active && el.contains(active);
    el.hidden = true;
    this.#gesture = null;
    if (hadFocus) {
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
      else if (typeof active.blur === 'function') active.blur();
    }
  }

  /**
   * Lays the panel out again (04 3.1): the narrow sheet clears the inline geometry (CSS places it); otherwise the default
   * rectangle with its auto-offset (until the user moved or resized the panel) or the user's rectangle, clamped into the
   * host. A no-op while hidden.
   * Side effects: writes the panel's inline left / top / width / height; calls the onResize callbacks.
   */
  reflow() {
    const el = this.#el;
    if (!el || el.hidden) return;
    if (this.#narrow()) {
      el.classList.add('floating-panel--sheet');
      for (const p of ['left', 'top', 'width', 'height']) el.style[p] = '';
      this.#rect = null;
    } else {
      el.classList.remove('floating-panel--sheet');
      const hostW = this.#host.clientWidth;
      const hostH = this.#host.clientHeight;
      const base = this.#userRect ?? defaultRect(hostW, hostH, this.#defaults, this.#min, this.#avoidBox());
      this.#apply(clampRect(base, hostW, hostH, this.#min, this.#headerHeight()));
    }
    this.#resizeFns.forEach((fn) => fn());
  }

  /** Registers a close-button callback (the owner hides the panel). Side effects: none. @param {() => void} fn */
  onClose(fn) {
    this.#closeFns.push(fn);
  }

  /** Registers a layout callback (after every reflow, move and resize). Side effects: none. @param {() => void} fn */
  onResize(fn) {
    this.#resizeFns.push(fn);
  }

  /** @returns {boolean} the narrow layout (bottom sheet) applies */
  #narrow() {
    const mq = typeof this.#win.matchMedia === 'function' ? this.#win.matchMedia(NARROW_QUERY) : null;
    return mq ? mq.matches : this.#win.innerWidth <= 900;
  }

  /** @returns {number} the header's height (CSS px; 36 before layout) */
  #headerHeight() {
    return this.#header?.offsetHeight || 36;
  }

  /** @returns {HostBox|null} the avoid element's box in host coordinates, null when absent or hidden (0 x 0) */
  #avoidBox() {
    const avoid = this.#avoidElement();
    if (!avoid) return null;
    const a = avoid.getBoundingClientRect();
    if (a.width === 0 || a.height === 0) return null;
    const h = this.#host.getBoundingClientRect();
    return { left: a.left - h.left, top: a.top - h.top, right: a.right - h.left, bottom: a.bottom - h.top };
  }

  /** Writes a rectangle to the panel's inline style. */
  #apply(rect) {
    this.#rect = rect;
    const s = this.#el.style;
    s.left = `${rect.left}px`;
    s.top = `${rect.top}px`;
    s.width = `${rect.width}px`;
    s.height = `${rect.height}px`;
  }

  /** Starts a move or resize gesture (never in the narrow sheet). */
  #begin(kind, e, target) {
    if (this.#narrow() || !this.#rect) return;
    e.preventDefault();
    this.#gesture = { kind, x: e.clientX, y: e.clientY, rect: { ...this.#rect }, pointerId: e.pointerId };
    if (typeof target.setPointerCapture === 'function') target.setPointerCapture(e.pointerId);
  }

  /** Applies a gesture step: the header moves the panel; the bottom-left handle moves the left and bottom edges. */
  #move(e) {
    const g = this.#gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const hostW = this.#host.clientWidth;
    const hostH = this.#host.clientHeight;
    let next;
    if (g.kind === 'move') {
      next = { ...g.rect, left: g.rect.left + dx, top: g.rect.top + dy };
    } else {
      const right = g.rect.left + g.rect.width;
      const width = Math.min(Math.max(g.rect.width - dx, this.#min.width), Math.max(1, Math.floor(hostW * 0.9)));
      next = { left: right - width, top: g.rect.top, width, height: g.rect.height + dy };
    }
    this.#userRect = clampRect(next, hostW, hostH, this.#min, this.#headerHeight());
    this.#apply(this.#userRect);
    this.#resizeFns.forEach((fn) => fn());
  }

  /** Ends a gesture. */
  #end(e) {
    if (this.#gesture && e.pointerId === this.#gesture.pointerId) this.#gesture = null;
  }
}
