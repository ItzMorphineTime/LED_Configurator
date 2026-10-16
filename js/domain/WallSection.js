/**
 * @module domain/WallSection
 * One section of the LED wall with the legacy field names (so ported code reads `section.panelCols` unchanged),
 * the card input rules (legacy number `change` handler) and the derived labels shown on the section card.
 * Values are never coerced or validated (ARCHITECTURE.md R12): imported strings and NaN stay as they are.
 * Legacy source: index.html@cd3fd3f 1395-1407 (default section), 3897-3908, 3958 (card derived values),
 * 4016 (rename), 4026-4054 (field rules and card patch values); `const scale = 0.001` at 1479, 2488, 2552, 2591,
 * 3757, 4493, 4912, 4920 (MM_TO_M).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { orDefault } from '../legacy/LegacyCompat.js';

/** Millimetres to metres; replaces the 8 local `const scale = 0.001`. */
export const MM_TO_M = 0.001;

/** The section fields in legacy object-literal order (1395-1407, 4090-4102, 4976-4988). */
export const SECTION_FIELDS = Object.freeze(['id', 'name', 'panelCols', 'panelRows', 'panelWidth', 'panelHeight',
                                             'ledX', 'ledY', 'curveIntensity', 'angleOffset', 'color']);

/**
 * One wall section: the 11 legacy fields as own enumerable properties (SECTION_FIELDS order) plus derived,
 * side-effect-free card labels on the prototype.
 */
export class WallSection {
  /**
   * Assigns exactly the SECTION_FIELDS keys from `fields`, in SECTION_FIELDS order, as own enumerable
   * properties. Ids are never written after construction.
   * Side effects: none.
   * @param {{id: *, name: *, panelCols: *, panelRows: *, panelWidth: *, panelHeight: *, ledX: *, ledY: *,
   *          curveIntensity: *, angleOffset: *, color: *}} fields
   */
  constructor(fields) {
    // LEGACY(B-L8): no coercion or validation; imported strings/NaN stay as they are.
    for (const key of SECTION_FIELDS) this[key] = fields[key];
  }

  /**
   * The bootstrap section.
   * Ports: index.html@cd3fd3f lines 1395-1407.
   * Side effects: none.
   * @returns {WallSection} {id: 0, name: 'Wall 1', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500,
   *   ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#00f0ff'}
   */
  static createDefault() {
    return new WallSection({
      id: 0,
      name: 'Wall 1',
      panelCols: 5,
      panelRows: 3,
      panelWidth: 500,
      panelHeight: 500,
      ledX: 32,
      ledY: 32,
      curveIntensity: 0,
      angleOffset: 0, // degrees - rotation offset before this section
      color: '#00f0ff',
    });
  }

  /**
   * The fallback name of the section at `index`.
   * Ports: index.html@cd3fd3f lines 3901, 4016.
   * Side effects: none.
   * @param {number} index  zero-based position in the wall
   * @returns {string} `Wall ${index + 1}`
   */
  static defaultName(index) {
    return `Wall ${index + 1}`;
  }

  /**
   * Card number-input rules, applied to v = parseFloat(raw); fields without a rule keep v.
   * B-L9 via orDefault (tagged in LegacyCompat): 0 and NaN fall back to the default.
   * LEGACY(B-L15): no rounding; fractional panel/LED counts are stored as typed.
   * Ports: index.html@cd3fd3f lines 4030-4036.
   * @type {Readonly<Record<string, (v: number) => number>>}
   */
  static FIELD_RULES = Object.freeze({
    panelCols: (v) => Math.max(1, Math.min(50, orDefault(v, 1))),
    panelRows: (v) => Math.max(1, Math.min(20, orDefault(v, 1))),
    panelWidth: (v) => Math.max(50, Math.min(5000, orDefault(v, 500))),
    panelHeight: (v) => Math.max(50, orDefault(v, 500)),
    ledX: (v) => Math.max(8, orDefault(v, 32)),
    ledY: (v) => Math.max(8, orDefault(v, 32)),
    curveIntensity: (v) => orDefault(v, 0),
    angleOffset: (v) => Math.max(-180, Math.min(180, orDefault(v, 0))),
  });

  /**
   * Parses a raw card input value: `const v = parseFloat(raw)`, then the field's rule if it has one.
   * Ports: index.html@cd3fd3f lines 4029-4036.
   * Side effects: none.
   * @param {string} field  a data-field name
   * @param {string} raw    the input's value
   * @returns {number} the value legacy assigned to `section[field]`
   */
  static parseField(field, raw) {
    const v = parseFloat(raw);
    // Own-key lookup: the legacy if/else chain matched only these exact field names. hasOwnProperty.call, not
    // Object.hasOwn, which needs newer browsers than the rest of the code (minimum browsers: ARCHITECTURE.md 1.2).
    return Object.prototype.hasOwnProperty.call(WallSection.FIELD_RULES, field) ? WallSection.FIELD_RULES[field](v) : v;
  }

  /**
   * Stores the parsed value of a card input (model only; the caller writes it back to the input).
   * Ports: index.html@cd3fd3f lines 4028-4038.
   * Side effects: writes this[field].
   * @param {string} field
   * @param {string} raw
   * @returns {number} the stored value
   */
  setField(field, raw) {
    this[field] = WallSection.parseField(field, raw);
    return this[field];
  }

  /**
   * Ports: index.html@cd3fd3f lines 3997 / 4007 (`section.color = ...`).
   * Side effects: writes this.color.
   * @param {string} color
   */
  setColor(color) {
    this.color = color;
  }

  /**
   * Name input handler: an empty input falls back to the default name (the input itself stays empty).
   * Ports: index.html@cd3fd3f line 4016.
   * Side effects: writes this.name.
   * @param {string} raw    the input's value
   * @param {number} index  the card index captured at render time
   * @returns {*} the stored name
   */
  rename(raw, index) {
    this.name = raw || WallSection.defaultName(index);
    return this.name;
  }

  /**
   * Render-time fill of a missing name (the one declared domain write inside an event subscriber, R3).
   * Ports: index.html@cd3fd3f line 3901.
   * Side effects: writes this.name only when it is falsy.
   * @param {number} index
   */
  ensureName(index) {
    if (!this.name) this.name = WallSection.defaultName(index);
  }

  /**
   * Ports: index.html@cd3fd3f lines 3898, 4043, 4050.
   * Side effects: none.
   * @returns {'Flat'|'Concave'|'Convex'}
   */
  get curveType() {
    return this.curveIntensity === 0 ? 'Flat' : (this.curveIntensity > 0 ? 'Concave' : 'Convex');
  }

  /**
   * The `.curve-hint` text, e.g. 'Flat', 'Concave (+5°)', 'Convex (-2.5°)'.
   * Ports: index.html@cd3fd3f line 3958 (== 4044).
   * Side effects: none.
   * @returns {string}
   */
  get curveHint() {
    const c = this.curveIntensity;
    return `${this.curveType}${c !== 0 ? ` (${c > 0 ? '+' : ''}${c}°)` : ''}`;
  }

  /**
   * Ports: index.html@cd3fd3f lines 3904, 4048.
   * Side effects: none.
   * @returns {number} this.panelCols * this.ledX
   */
  get canvasWidth() {
    return this.panelCols * this.ledX;
  }

  /**
   * Ports: index.html@cd3fd3f lines 3905, 4049.
   * Side effects: none.
   * @returns {number} this.panelRows * this.ledY
   */
  get canvasHeight() {
    return this.panelRows * this.ledY;
  }

  /**
   * The `.section-summary` text, e.g. '5×3 • 160×96px • Flat'.
   * Ports: index.html@cd3fd3f line 3906 (== 4051).
   * Side effects: none.
   * @returns {string}
   */
  get summary() {
    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;
    return `${this.panelCols}×${this.panelRows} • ${canvasWidth}×${canvasHeight}px • ${this.curveType}`;
  }

  /**
   * Whether the section's canvas exceeds 4K in either orientation.
   * Ports: index.html@cd3fd3f line 3908 (== 4054).
   * Side effects: none.
   * @returns {boolean}
   */
  get exceeds4K() {
    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;
    // LEGACY(B-L17): per section only; the whole wall is never checked.
    return (canvasWidth > 3840 || canvasHeight > 2160) && (canvasWidth > 2160 || canvasHeight > 3840);
  }
}
