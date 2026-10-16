/**
 * @module app/DebugViewController
 * The use cases of the normals debug view (docs/improvements/01-normals.md 5.2): each one writes DebugViewSettings
 * (its only writer, ARCHITECTURE.md section 4) and then makes its one render call (NormalsDebugView.sync or
 * LEDWallView.setDebugShading). F1-1 has no bus and no event; F1-2 (01 T7) adds the `bus` dependency and
 * DEBUG_VIEW_CHANGED, emitted between the settings write and the render call (R2), together with its subscriber
 * DebugViewControls (ARCHITECTURE.md 5.1 rule 7).
 * Legacy source: none (Feature 1).
 * Layer: app (may import core, legacy, domain, geometry). Collaborators are injected.
 */

import { DebugShading, DebugViewSettings } from '../domain/DebugViewSettings.js';

/** The valid shading values (anything else is stored as 'content'). */
const SHADINGS = new Set(Object.values(DebugShading));

/**
 * The debug-view use cases.
 */
export class DebugViewController {
  /** @type {DebugViewSettings} */
  #settings;
  /** @type {{setDebugShading(mode: string): void}} */
  #wallView;
  /** @type {{sync(options?: {keepLength?: boolean}): void}} */
  #normalsView;

  /**
   * Stores the collaborators (R4).
   * Side effects: none.
   * @param {{settings: DebugViewSettings,
   *          wallView: import('../render/LEDWallView.js').LEDWallView,
   *          normalsView: import('../render/NormalsDebugView.js').NormalsDebugView}} deps
   */
  constructor({ settings, wallView, normalsView }) {
    this.#settings = settings;
    this.#wallView = wallView;
    this.#normalsView = normalsView;
  }

  /** Side effects: none. @returns {DebugViewSettings} the settings (read-only for callers) */
  get settings() {
    return this.#settings;
  }

  /**
   * Toggles the normal lines.
   * Side effects: writes settings.normals.enabled; normalsView.sync().
   * @returns {boolean} the new state
   */
  toggleNormals() {
    const normals = this.#settings.normals;
    normals.enabled = !normals.enabled;
    this.#normalsView.sync();
    return normals.enabled;
  }

  /**
   * Sets the line kinds that are given (a missing key keeps its value).
   * Side effects: writes settings.normals.vertex / .face; normalsView.sync().
   * @param {{vertex?: boolean, face?: boolean}} kinds
   * @returns {void}
   */
  setNormalLineKinds({ vertex, face }) {
    const normals = this.#settings.normals;
    if (vertex !== undefined) normals.vertex = !!vertex;
    if (face !== undefined) normals.face = !!face;
    this.#normalsView.sync();
  }

  /**
   * Sets the length multiplier from a raw input value (DebugViewSettings.parseLengthScale).
   * Side effects: writes settings.normals.lengthScale; normalsView.sync().
   * @param {*} raw
   * @returns {number} the stored value
   */
  setLengthScale(raw) {
    const normals = this.#settings.normals;
    normals.lengthScale = DebugViewSettings.parseLengthScale(raw);
    this.#normalsView.sync();
    return normals.lengthScale;
  }

  /**
   * "Draw on top (ignore depth)".
   * Side effects: writes settings.normals.onTop; normalsView.sync().
   * @param {*} on
   * @returns {void}
   */
  setOnTop(on) {
    const normals = this.#settings.normals;
    normals.onTop = !!on;
    this.#normalsView.sync();
  }

  /**
   * Sets the shading override; any value that is not a DebugShading value is stored as 'content'.
   * Side effects: writes settings.shading; wallView.setDebugShading(settings.shading).
   * @param {*} mode
   * @returns {string} the stored mode
   */
  setShading(mode) {
    const settings = this.#settings;
    settings.shading = SHADINGS.has(mode) ? mode : DebugShading.CONTENT;
    this.#wallView.setDebugShading(settings.shading);
    return settings.shading;
  }

  /**
   * Shift+N: the next shading mode of the cycle (content -> face orientation -> normal colours -> content).
   * Side effects: as setShading.
   * @returns {string} the stored mode
   */
  cycleShading() {
    return this.setShading(this.#settings.nextShading());
  }
}
