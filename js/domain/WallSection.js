/**
 * @module domain/WallSection
 * One section of the LED wall with the legacy field names (so ported code reads `section.panelCols` unchanged),
 * the card input rules (legacy number `change` handler) and the derived labels shown on the section card.
 * The constructor never coerces (ARCHITECTURE.md R12); since 08 P2-3b imports reach it only through the validator. The
 * card rules round the integer fields and clamp every field to `LIMITS` since 08 P2-8a (B-L15), and `setName` applies
 * the validator's text rule since 08 P2-3b.
 * Legacy source: index.html@cd3fd3f 1395-1407 (default section), 3897-3908, 3958 (card derived values),
 * 4016 (rename), 4026-4054 (field rules and card patch values); `const scale = 0.001` at 1479, 2488, 2552, 2591,
 * 3757, 4493, 4912, 4920 (MM_TO_M).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { clamp, deepFreeze, finiteOr, roundInt, sanitizeText } from './rules.js';
import { UvTransform } from './UvSettings.js';

/**
 * One card rule after its fallback (08 P2-8a, 4.4): the value rounded when the field is an integer field, then
 * clamped to the field's WallSection.LIMITS range.
 * Side effects: none.
 * @param {string} field  a WallSection.LIMITS key
 * @param {number} v      the value after the legacy fallback (never NaN)
 * @returns {number}
 */
function cardRule(field, v) {
  const { min, max, int } = WallSection.LIMITS[field];
  return clamp(int ? roundInt(v) : v, min, max);
}

/** Millimetres to metres; replaces the 8 local `const scale = 0.001`. */
export const MM_TO_M = 0.001;

/** The section fields in legacy object-literal order (1395-1407, 4090-4102, 4976-4988). */
export const SECTION_FIELDS = Object.freeze(['id', 'name', 'panelCols', 'panelRows', 'panelWidth', 'panelHeight',
                                             'ledX', 'ledY', 'curveIntensity', 'angleOffset', 'color']);

/**
 * One wall section: the 11 legacy fields as own enumerable properties (SECTION_FIELDS order) plus derived,
 * side-effect-free card labels on the prototype, and its UV transform (04 UV-5a) behind the `uvTransform` accessor.
 */
export class WallSection {
  /**
   * The section's own UV transform (04 4.1): never shared, replaced only through setUvTransform (a clone). Kept out of
   * the own enumerable fields (a deviation from 04 4.1, which appends 'uvTransform' to SECTION_FIELDS), so the legacy
   * field list, the legacy-parity tests and every `{...section}` copy keep exactly the 11 legacy fields.
   * @type {UvTransform}
   */
  #uvTransform;

  /** @type {import('./UvSettings.js').UvVertexEdits|null} the per-vertex UV edits (`uv_vertex_edits`), null for none */
  #uvVertexEdits = null;

  /**
   * The section's `extensions` of the project file (07 4.4 rule 4; 08 P2-13e): namespaced, validated JSON kept
   * verbatim for a round trip and never interpreted. Like the UV transform it is not a SECTION_FIELDS key, so a copied
   * or new section starts without any.
   * @type {Readonly<object>}
   */
  #extensions = Object.freeze({});

  /**
   * Assigns exactly the SECTION_FIELDS keys from `fields`, in SECTION_FIELDS order, as own enumerable
   * properties, and the UV transform: fields.uvTransform when it is a UvTransform (stored as given), else the identity
   * (04 4.1; a new section never inherits a transform, Q8). Ids are never written after construction.
   * Side effects: none.
   * @param {{id: *, name: *, panelCols: *, panelRows: *, panelWidth: *, panelHeight: *, ledX: *, ledY: *,
   *          curveIntensity: *, angleOffset: *, color: *, uvTransform?: UvTransform, extensions?: object}} fields
   *   extensions: the validated `sections[i].extensions` of a v2 file (08 P2-13e), stored frozen; anything but a plain
   *   object stores none
   */
  constructor(fields) {
    // No coercion here (R12). Since 08 P2-3b (B-L8 fixed) an import reaches the constructor only through the validator
    // (io/ProjectSchema.sectionsFromProject), and the card rules and setName normalise every typed value.
    for (const key of SECTION_FIELDS) this[key] = fields[key];
    this.#uvTransform = fields.uvTransform instanceof UvTransform ? fields.uvTransform : UvTransform.identity();
    const ext = fields.extensions;
    if (ext !== null && typeof ext === 'object' && Object.getPrototypeOf(ext) === Object.prototype) this.#extensions = deepFreeze(ext);
  }

  /**
   * The section's file extensions (08 P2-13e): a frozen plain object, {} for none.
   * Side effects: none.
   * @returns {Readonly<object>}
   */
  get extensions() {
    return this.#extensions;
  }

  /**
   * The section's UV transform (04 4.1, 6.3). Never mutate it in place: write through setUvTransform.
   * Side effects: none.
   * @returns {UvTransform}
   */
  get uvTransform() {
    return this.#uvTransform;
  }

  /**
   * Replaces the UV transform with a copy of `t` (04 4.1; the writers are 04's UvController and the project load).
   * Side effects: writes the section's UV transform.
   * @param {UvTransform} t
   */
  setUvTransform(t) {
    this.#uvTransform = t.clone();
  }

  /**
   * The section's per-vertex UV edits (UvSettings.UvVertexEdits, base-space deltas under the transform), or null for
   * none. Like the transform: never mutate it in place, write through setUvVertexEdits; not a SECTION_FIELDS key, so a
   * copied or new section starts without edits.
   * Side effects: none.
   * @returns {import('./UvSettings.js').UvVertexEdits|null}
   */
  get uvVertexEdits() {
    return this.#uvVertexEdits;
  }

  /**
   * Replaces the vertex edits with a copy of `e`; null or an empty map stores null.
   * Side effects: writes the section's vertex edits.
   * @param {import('./UvSettings.js').UvVertexEdits|null} e
   */
  setUvVertexEdits(e) {
    this.#uvVertexEdits = e && !e.isEmpty ? e.clone() : null;
  }

  /**
   * The bootstrap section. Its colour is injected (06 T7, 4.1): App passes Theme.palette.defaultSectionColor through
   * Project.createDefault; the literal default only lets `new Wall()` work in Node tests, and the U8 test keeps it equal
   * to the palette's.
   * Ports: index.html@cd3fd3f lines 1395-1407.
   * Side effects: none.
   * @param {{color?: string}} [options]  color: the section colour (default '#d9d9d6', Studio Grey)
   * @returns {WallSection} {id: 0, name: 'Wall 1', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500,
   *   ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color}
   */
  static createDefault({ color = '#d9d9d6' } = {}) {
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
      color,
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
   * The ranges of the eight numeric section fields (spec 07 4.1 and 4.3; 08 4.4): plain frozen data
   * `{ field: { min, max, int, default } }`. FIELD_RULES read their bounds and the integer flag from it, and from
   * 08 P2-3b so does the import validator (io/ProjectSchema.js), so the card inputs and the import cannot disagree.
   * `default` is the validator's default (the v1 import default); the card rules keep their own legacy fallbacks.
   * The caps on panel height (100,000 mm), LEDs (65,536) and curve (±180°) are sanity caps far above any buildable
   * wall (aee55ac removed the old UI caps on purpose); they exist so that every value the UI can produce lies inside
   * the validator's range (07 Q15).
   * @type {Readonly<Record<string, Readonly<{min: number, max: number, int: boolean, default: number}>>>}
   */
  static LIMITS = deepFreeze({
    panelCols: { min: 1, max: 50, int: true, default: 5 },
    panelRows: { min: 1, max: 20, int: true, default: 3 },
    panelWidth: { min: 50, max: 5000, int: false, default: 500 },
    panelHeight: { min: 50, max: 100000, int: false, default: 500 },
    ledX: { min: 8, max: 65536, int: true, default: 32 },
    ledY: { min: 8, max: 65536, int: true, default: 32 },
    curveIntensity: { min: -180, max: 180, int: false, default: 0 },
    angleOffset: { min: -180, max: 180, int: false, default: 0 },
  });

  /**
   * Card number-input rules, applied to v = parseFloat(raw); fields without a rule keep v.
   * 08 P2-8b (B-L9 fixed): a non-numeric entry (NaN) takes the card fallback; 0 is kept, then clamped (finiteOr).
   * 08 P2-8a (B-L15 fixed, 08 4.4): the integer fields (columns, rows, LEDs) are rounded with roundInt, and every
   * field is clamped to its LIMITS range: `clamp(roundInt(finiteOr(v, fallback)), min, max)` for the integer fields,
   * `clamp(finiteOr(v, fallback), min, max)` for the others (so a 0 panel width gives the minimum 50).
   * Ports: index.html@cd3fd3f lines 4030-4036.
   * @type {Readonly<Record<string, (v: number) => number>>}
   */
  static FIELD_RULES = Object.freeze({
    panelCols: (v) => cardRule('panelCols', finiteOr(v, 1)),
    panelRows: (v) => cardRule('panelRows', finiteOr(v, 1)),
    panelWidth: (v) => cardRule('panelWidth', finiteOr(v, 500)),
    panelHeight: (v) => cardRule('panelHeight', finiteOr(v, 500)),
    ledX: (v) => cardRule('ledX', finiteOr(v, 32)),
    ledY: (v) => cardRule('ledY', finiteOr(v, 32)),
    curveIntensity: (v) => cardRule('curveIntensity', finiteOr(v, 0)),
    angleOffset: (v) => cardRule('angleOffset', finiteOr(v, 0)),
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
   * Stores a section name through the one text rule of the validator (08 P2-3b, spec 07 C28): sanitizeText(String(raw),
   * 32) strips the C0, C1 and bidi controls and truncates to 32 UTF-16 code units without splitting a surrogate pair,
   * without trimming, so a typed or pasted name is stored exactly as an import of the saved file would store it.
   * Side effects: writes this.name.
   * @param {*} raw
   * @returns {string} the stored name (may be '')
   */
  setName(raw) {
    this.name = sanitizeText(String(raw), 32);
    return this.name;
  }

  /**
   * Name input handler: the name goes through setName, and an empty result falls back to the default name (the input
   * itself stays empty). For a name without controls this stores exactly what the legacy `raw || Wall <index + 1>` did
   * (the input's maxlength is 32).
   * Ports: index.html@cd3fd3f line 4016.
   * Side effects: writes this.name.
   * @param {string} raw    the input's value
   * @param {number} index  the card index captured at render time
   * @returns {string} the stored name
   */
  rename(raw, index) {
    if (!this.setName(raw)) this.name = WallSection.defaultName(index);
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
