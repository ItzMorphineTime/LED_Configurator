/**
 * @module app/DebugViewController
 * The use cases of the normals debug view (docs/improvements/01-normals.md 5.2): each one writes DebugViewSettings
 * (its only writer, ARCHITECTURE.md section 4), then emits DEBUG_VIEW_CHANGED with a frozen snapshot of the settings
 * (the mirror: DebugViewControls updates its buttons, inputs, legend and announcer), then makes its one render call
 * (NormalsDebugView.sync or LEDWallView.setDebugShading): model, mirror, render (R2). The event and its subscriber
 * landed together in F1-2 (01 T7; ARCHITECTURE.md 5.1 rule 7); F1-1 had neither.
 * Legacy source: none (Feature 1).
 * Layer: app (may import core, legacy, domain, geometry). Collaborators are injected.
 */

import { Events } from '../core/EventBus.js';
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
  /** @type {{emit(type: string, payload?: any): void}} */
  #bus;

  /**
   * Stores the collaborators (R4).
   * Side effects: none.
   * @param {{settings: DebugViewSettings,
   *          wallView: import('../render/LEDWallView.js').LEDWallView,
   *          normalsView: import('../render/NormalsDebugView.js').NormalsDebugView,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ settings, wallView, normalsView, bus }) {
    this.#settings = settings;
    this.#wallView = wallView;
    this.#normalsView = normalsView;
    this.#bus = bus;
  }

  /** Side effects: none. @returns {DebugViewSettings} the settings (read-only for callers) */
  get settings() {
    return this.#settings;
  }

  /**
   * Toggles the normal lines.
   * Side effects: writes settings.normals.enabled; emits DEBUG_VIEW_CHANGED; normalsView.sync().
   * @returns {boolean} the new state
   */
  toggleNormals() {
    const normals = this.#settings.normals;
    normals.enabled = !normals.enabled;
    this.#emit();
    this.#normalsView.sync();
    return normals.enabled;
  }

  /**
   * Sets the line kinds that are given (a missing key keeps its value).
   * Side effects: writes settings.normals.vertex / .face; emits DEBUG_VIEW_CHANGED; normalsView.sync().
   * @param {{vertex?: boolean, face?: boolean}} kinds
   * @returns {void}
   */
  setNormalLineKinds({ vertex, face }) {
    const normals = this.#settings.normals;
    if (vertex !== undefined) normals.vertex = !!vertex;
    if (face !== undefined) normals.face = !!face;
    this.#emit();
    this.#normalsView.sync();
  }

  /**
   * Sets the length multiplier from a raw input value (DebugViewSettings.parseLengthScale).
   * Side effects: writes settings.normals.lengthScale; emits DEBUG_VIEW_CHANGED; normalsView.sync().
   * @param {*} raw
   * @returns {number} the stored value
   */
  setLengthScale(raw) {
    const normals = this.#settings.normals;
    normals.lengthScale = DebugViewSettings.parseLengthScale(raw);
    this.#emit();
    this.#normalsView.sync();
    return normals.lengthScale;
  }

  /**
   * "Draw on top (ignore depth)".
   * Side effects: writes settings.normals.onTop; emits DEBUG_VIEW_CHANGED; normalsView.sync().
   * @param {*} on
   * @returns {void}
   */
  setOnTop(on) {
    const normals = this.#settings.normals;
    normals.onTop = !!on;
    this.#emit();
    this.#normalsView.sync();
  }

  /**
   * Sets the shading override; any value that is not a DebugShading value is stored as 'content'.
   * Side effects: writes settings.shading; emits DEBUG_VIEW_CHANGED; wallView.setDebugShading(settings.shading).
   * @param {*} mode
   * @returns {string} the stored mode
   */
  setShading(mode) {
    const settings = this.#settings;
    settings.shading = SHADINGS.has(mode) ? mode : DebugShading.CONTENT;
    this.#emit();
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

  /** The mirror step of every use case (R2: after the settings write, before the render call). */
  #emit() {
    this.#bus.emit(Events.DEBUG_VIEW_CHANGED, this.#settings.snapshot());
  }
}
