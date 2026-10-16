/**
 * @module ui/HeaderStats
 * The header statistics (total pixels, panels, sections, arc): a pure mirror of WALL_STATS_CHANGED.
 * Owns #total-pixels, #total-panels, #total-sections and #total-arc.
 * Legacy source: index.html@cd3fd3f 2314-2317 (the DOM writes of updateStats; the totals are Wall.totals()).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { Events } from '../core/EventBus.js';
import { byId } from './dom.js';

/**
 * Header statistics mirror.
 */
export class HeaderStats {
  /** @type {HTMLElement} */ #totalPixels;
  /** @type {HTMLElement} */ #totalPanels;
  /** @type {HTMLElement} */ #totalSections;
  /** @type {HTMLElement} */ #totalArc;

  /**
   * Looks up the four stat elements and subscribes WALL_STATS_CHANGED -> update(payload). The subscription is
   * made here so that it exists before the bootstrap rebuild publishes the first totals (bus rule 6).
   * Side effects: DOM lookups (no mutation); one bus subscription.
   * @param {{doc: Document, bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ doc, bus }) {
    this.#totalPixels = byId(doc, 'total-pixels');
    this.#totalPanels = byId(doc, 'total-panels');
    this.#totalSections = byId(doc, 'total-sections');
    this.#totalArc = byId(doc, 'total-arc');

    bus.on(Events.WALL_STATS_CHANGED, (payload) => this.update(payload));
  }

  /**
   * Writes the four header values with the legacy formatting.
   * Ports: index.html@cd3fd3f lines 2314-2317.
   * Side effects: writes textContent of #total-pixels, #total-panels, #total-sections, #total-arc (in that order).
   * @param {{totalPixels: number, totalPanels: number, totalSections: number, totalArc: number}} totals
   */
  update({ totalPixels, totalPanels, totalSections, totalArc }) {
    this.#totalPixels.textContent = totalPixels.toLocaleString();
    this.#totalPanels.textContent = totalPanels;
    this.#totalSections.textContent = totalSections;
    this.#totalArc.textContent = `${totalArc.toFixed(1)}°`;
  }
}
