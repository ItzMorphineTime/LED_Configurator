/**
 * @module ui/SidebarToggle
 * The collapsible side panel (the owner's request of 2026-10-31): #sidebar-toggle, a slim chevron handle on the
 * viewport's edge beside the panel (it stays reachable while the panel is collapsed), shows or hides #control-panel.
 * Open by default. Collapsed, the class `sidebar-collapsed` on the panel's grid container (.app-container) gives the
 * viewport the whole width (the whole height at <= 900 px, where the panel sits below it; css/features/sidebar.css), and
 * the hidden panel leaves the tab order. The handle is a native button (Enter and Space come with it) with
 * aria-controls="control-panel" and aria-expanded; its title says what a click does. After every change it calls
 * onLayoutChange (App: sceneManager.fitContainer(), so the renderer, the camera aspect and the preview region follow at
 * once); SceneManager's ResizeObserver and FloatingPanel's re-clamp follow the container as well. View-only and
 * session-only: no model state, no events and, by the owner's rule, no keyboard shortcut (the handle is in the tab
 * order instead).
 * Legacy source: none (new feature).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { byId } from './dom.js';

/** The handle's title in each state (what a click does). */
export const SIDEBAR_TITLES = Object.freeze({ expanded: 'Hide side panel', collapsed: 'Show side panel' });

/** The side panel's collapse state and its handle. */
export class SidebarToggle {
  /** @type {HTMLButtonElement} #sidebar-toggle */
  #button;
  /** @type {HTMLElement} #control-panel */
  #panel;
  /** @type {() => void} */
  #onLayoutChange;
  #collapsed = false;

  /**
   * Looks up #sidebar-toggle and #control-panel (R4: no mutation, no listener).
   * Side effects: DOM lookups only.
   * @param {{doc: Document, onLayoutChange?: () => void}} deps  onLayoutChange: App passes () => sceneManager.fitContainer()
   */
  constructor({ doc, onLayoutChange = () => {} }) {
    this.#button = byId(doc, 'sidebar-toggle');
    this.#panel = byId(doc, 'control-panel');
    this.#onLayoutChange = onLayoutChange;
  }

  /**
   * The handle's click flips the panel.
   * Side effects: one click listener.
   */
  bind() {
    this.#button.addEventListener('click', () => this.setCollapsed(!this.#collapsed));
  }

  /** Side effects: none. @returns {boolean} the panel is collapsed */
  get collapsed() {
    return this.#collapsed;
  }

  /** Shows the panel (the context menu's "Change settings"). Side effects: as setCollapsed(false). */
  expand() {
    this.setCollapsed(false);
  }

  /**
   * Collapses or expands the panel: the container class, the handle's aria-expanded and title, then onLayoutChange().
   * A call that changes nothing does nothing.
   * Side effects: DOM writes on the grid container and the handle; onLayoutChange().
   * @param {boolean} on
   */
  setCollapsed(on) {
    const collapsed = !!on;
    if (collapsed === this.#collapsed) return;
    this.#collapsed = collapsed;
    this.#panel.parentElement.classList.toggle('sidebar-collapsed', collapsed);
    this.#button.setAttribute('aria-expanded', String(!collapsed));
    this.#button.title = collapsed ? SIDEBAR_TITLES.collapsed : SIDEBAR_TITLES.expanded;
    this.#onLayoutChange();
  }
}
