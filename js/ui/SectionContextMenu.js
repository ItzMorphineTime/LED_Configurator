/**
 * @module ui/SectionContextMenu
 * The wall section's context menu (the owner's request of 2026-10-31). A right click on a section in the viewport selects
 * it and opens this small menu at the pointer (ViewportInput's openSectionMenu command, wired by App):
 *  - "Change settings": shows the side panel, expands the section's card, scrolls it into view, focuses its first field
 *    and flashes it (commands.changeSettings);
 *  - "Edit UVs…": opens the UV viewer on the section (commands.editUvs);
 *  - "Deselect" (commands.deselect).
 * A role="menu" element (no id) appended to the viewport host on the first open, with the section's name as a title row
 * (textContent: names are user input) and three role="menuitem" buttons; it is placed at the pointer and kept inside the
 * host (clampMenuPosition), and the first item takes the focus. Keyboard (menuKeyAction): ArrowDown / ArrowUp cycle,
 * Home / End, Enter and Space activate (native buttons), Escape and Tab close; every key pressed in the menu stops there,
 * so the viewport shortcuts and the orbit keys never see it. It closes on a pointer press outside it (an orbit start
 * included), Escape anywhere, a wheel, a window resize or blur, and after an item ran; focus then returns to where it was
 * (except after "Change settings", which focuses the card's field). Morph styling: css/features/section-selection.css.
 * Legacy source: none (new feature).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

/** The menu's items, in order. */
export const SECTION_MENU_ITEMS = Object.freeze([
  Object.freeze({ action: 'settings', label: 'Change settings' }),
  Object.freeze({ action: 'uvs', label: 'Edit UVs…' }),
  Object.freeze({ action: 'deselect', label: 'Deselect' }),
]);

/**
 * What a key does in the menu.
 * Side effects: none.
 * @param {string} key    KeyboardEvent.key
 * @param {number} index  the focused item (-1: none)
 * @param {number} count  the number of items (>= 1)
 * @returns {{focus: number}|{close: true}|null}  null: the key is not the menu's (Enter and Space reach the button)
 */
export function menuKeyAction(key, index, count) {
  switch (key) {
    case 'ArrowDown':
      return { focus: index < 0 ? 0 : (index + 1) % count };
    case 'ArrowUp':
      return { focus: index < 0 ? count - 1 : (index - 1 + count) % count };
    case 'Home':
      return { focus: 0 };
    case 'End':
      return { focus: count - 1 };
    case 'Escape':
    case 'Tab':
      return { close: true };
    default:
      return null;
  }
}

/**
 * The menu's top-left corner in the host: at the pointer, moved back inside the host (a margin from each edge) when the
 * menu would cross its right or bottom edge; never left of or above the margin.
 * Side effects: none.
 * @param {number} x  pointer x in host pixels
 * @param {number} y  pointer y in host pixels
 * @param {number} w  menu width
 * @param {number} h  menu height
 * @param {number} hostW
 * @param {number} hostH
 * @param {number} [margin]
 * @returns {{left: number, top: number}}
 */
export function clampMenuPosition(x, y, w, h, hostW, hostH, margin = 4) {
  return {
    left: Math.max(margin, Math.min(x, hostW - w - margin)),
    top: Math.max(margin, Math.min(y, hostH - h - margin)),
  };
}

/** The section context menu. */
export class SectionContextMenu {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;
  /** @type {HTMLElement} the viewport (position: relative) */
  #host;
  /** @type {{changeSettings?: (sectionId: *) => void, editUvs?: (sectionId: *) => void, deselect?: () => void}} */
  #commands;
  /** @type {HTMLElement|null} */
  #el = null;
  /** @type {HTMLElement|null} */
  #title = null;
  /** @type {HTMLButtonElement[]} */
  #items = [];
  /** @type {*} the section the open menu acts on */
  #sectionId = null;
  #open = false;
  /** @type {Element|null} the focused element when the menu opened */
  #returnFocus = null;
  /** @type {(() => void)|null} removes the close listeners of the open menu */
  #detach = null;

  /**
   * Stores the collaborators (R4: no DOM is created and no listener added before the first open).
   * Side effects: none.
   * @param {{doc: Document, win: Window, host: HTMLElement,
   *          commands: {changeSettings?: Function, editUvs?: Function, deselect?: Function}}} deps
   */
  constructor({ doc, win, host, commands }) {
    this.#doc = doc;
    this.#win = win;
    this.#host = host;
    this.#commands = commands;
  }

  /** Side effects: none. @returns {boolean} */
  get isOpen() {
    return this.#open;
  }

  /** Side effects: none. @returns {HTMLElement|null} the menu element (null before the first open) */
  get element() {
    return this.#el;
  }

  /**
   * Opens (or moves) the menu at the pointer for a section and focuses its first item.
   * Side effects: creates the menu on the first call; DOM writes (title, position, hidden); focus; while open, a capturing
   *   pointerdown and wheel listener on the document and a resize and blur listener on the window.
   * @param {{sectionId: *, label: string, clientX: number, clientY: number}} req
   */
  open({ sectionId, label, clientX, clientY }) {
    const el = this.#ensure();
    this.#sectionId = sectionId;
    this.#title.textContent = String(label);
    el.setAttribute('aria-label', `Section actions: ${label}`);
    el.hidden = false;
    const r = this.#host.getBoundingClientRect();
    const { left, top } = clampMenuPosition(clientX - r.left, clientY - r.top, el.offsetWidth, el.offsetHeight,
      this.#host.clientWidth, this.#host.clientHeight);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    if (!this.#open) {
      this.#open = true;
      this.#returnFocus = this.#doc.activeElement;
      this.#attachClosers();
    }
    this.#items[0].focus({ preventScroll: true });
  }

  /**
   * Closes the menu (a no-op when it is closed).
   * Side effects: hides the menu; removes its close listeners; may move the focus back.
   * @param {{restoreFocus?: boolean}} [opts]  restoreFocus (default true): focus the element that had it before
   */
  close({ restoreFocus = true } = {}) {
    if (!this.#open) return;
    this.#open = false;
    this.#el.hidden = true;
    this.#detach?.();
    this.#detach = null;
    const back = this.#returnFocus;
    this.#returnFocus = null;
    if (restoreFocus && back && back !== this.#doc.body && back.isConnected && typeof back.focus === 'function') {
      back.focus({ preventScroll: true });
    }
  }

  /** The close triggers of an open menu: a press outside it, a wheel, a window resize or blur. */
  #attachClosers() {
    const doc = this.#doc;
    const win = this.#win;
    const quiet = () => this.close({ restoreFocus: false });
    const onDown = (e) => {
      if (!this.#el.contains(e.target)) quiet();
    };
    // Escape pressed while the focus is outside the menu (inside it, the menu's own handler closes it)
    const onKey = (e) => {
      if (e.key === 'Escape' && !this.#el.contains(e.target)) quiet();
    };
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('wheel', quiet, { capture: true, passive: true });
    win.addEventListener('resize', quiet);
    win.addEventListener('blur', quiet);
    this.#detach = () => {
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('wheel', quiet, { capture: true, passive: true });
      win.removeEventListener('resize', quiet);
      win.removeEventListener('blur', quiet);
    };
  }

  /** Runs an item: closes the menu first, then the command. */
  #run(action) {
    const id = this.#sectionId;
    this.close({ restoreFocus: action !== 'settings' });
    const c = this.#commands;
    if (action === 'settings') c.changeSettings?.(id);
    else if (action === 'uvs') c.editUvs?.(id);
    else if (action === 'deselect') c.deselect?.();
  }

  /**
   * Creates the menu once: the title row and the item buttons, its keydown and contextmenu listeners; appended to the host.
   * @returns {HTMLElement}
   */
  #ensure() {
    if (this.#el) return this.#el;
    const doc = this.#doc;
    const el = doc.createElement('div');
    el.className = 'context-menu';
    el.setAttribute('role', 'menu');
    el.hidden = true;
    const title = doc.createElement('div');
    title.className = 'context-menu__title';
    title.setAttribute('aria-hidden', 'true');
    el.appendChild(title);
    for (const item of SECTION_MENU_ITEMS) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'context-menu__item';
      btn.setAttribute('role', 'menuitem');
      btn.tabIndex = -1;
      btn.textContent = item.label;
      btn.addEventListener('click', () => this.#run(item.action));
      el.appendChild(btn);
      this.#items.push(btn);
    }
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const act = menuKeyAction(e.key, this.#items.indexOf(this.#doc.activeElement), this.#items.length);
      if (!act) return;
      e.preventDefault();
      if (act.close) this.close();
      else this.#items[act.focus].focus({ preventScroll: true });
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.#host.appendChild(el);
    this.#el = el;
    this.#title = title;
    return el;
  }
}
