/**
 * @module domain/UvSettings
 * The UV state of a project (docs/improvements/04-uvs-uv-editor.md 4.1, UV-5a): the per-section UV transform
 * (`WallSection.uvTransform`), the per-section vertex edits (`WallSection.uvVertexEdits`, UvVertexEdits) and the
 * project-wide UV settings (`Project.uv`). Pure values with their field rules; the maths that applies them lives in
 * geometry/UvMapper.js.
 * Persistence (04 UV-5c, the v2 keys `sections[].uv_transform` and `uv`) has not landed: the state is session-only, and
 * toJSON / fromJSON only fix the key shapes of 04 4.2 for it.
 * Legacy source: none (Feature 4).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { clamp } from './rules.js';

/** The two Combined-mesh UV layouts (04 5.1, D2): each section filling 0..1 (default), or the pixel-accurate atlas. */
export const UvLayout = Object.freeze({ PER_SECTION: 'per-section', ATLAS: 'atlas' });

/** The two panel-mode UV spaces (04 D5): section space (default), or the legacy per-panel 0..1. */
export const PanelUvMode = Object.freeze({ SECTION: 'section', PANEL: 'panel' });

/** A raw UI value as a number: numbers as given, anything else through parseFloat (so '' and 'abc' give NaN). */
const num = (raw) => (typeof raw === 'number' ? raw : parseFloat(raw));

/** The boolean rule of 04 4.2: true and "true" are true; everything else ("false", 1, "yes", null) is false. */
const bool = (raw) => raw === true || raw === 'true';

/** An offset rule: finite, else 0; clamped to [-8, 8]. */
const offsetRule = (raw) => {
  const v = num(raw);
  return Number.isFinite(v) ? clamp(v, -8, 8) : 0;
};

/** A scale rule: finite and non-zero, else 1; the absolute value (the sign toggles the flip, setField), clamped to [0.01, 16]. */
const scaleRule = (raw) => {
  const v = num(raw);
  return Number.isFinite(v) && v !== 0 ? clamp(Math.abs(v), 0.01, 16) : 1;
};

/** The UV transform fields in the order of 04 4.1 (and of the JSON leaves of 4.2). */
const TRANSFORM_FIELDS = Object.freeze(['offsetU', 'offsetV', 'scaleU', 'scaleV', 'rotation', 'flipU', 'flipV', 'sourceRotated']);

/**
 * The UV transform of one section (04 4.1, 6.3): offset, scale, rotation (degrees, counter-clockwise island rotation in
 * source-pixel space), flips and the source orientation. Baked into the UVs at generation (D3); LED-mask content ignores
 * it (D4). A section owns its own instance; instances are never shared (WallSection.setUvTransform stores a clone).
 */
export class UvTransform {
  /** @type {number} UV units */
  offsetU;
  /** @type {number} UV units */
  offsetV;
  /** @type {number} source px per LED along the section's u */
  scaleU;
  /** @type {number} source px per LED along the section's v */
  scaleV;
  /** @type {number} degrees, normalised to (-180, 180] by every writer */
  rotation;
  /** @type {boolean} */
  flipU;
  /** @type {boolean} */
  flipV;
  /** @type {boolean} the source is H x W instead of W x H (don't-care when W = H, 04 6.6) */
  sourceRotated;

  /**
   * Stores the given values as they are (no coercion, R12); a missing field takes its default.
   * Side effects: none.
   * @param {{offsetU?: number, offsetV?: number, scaleU?: number, scaleV?: number, rotation?: number, flipU?: boolean,
   *          flipV?: boolean, sourceRotated?: boolean}} [fields]
   */
  constructor({ offsetU = 0, offsetV = 0, scaleU = 1, scaleV = 1, rotation = 0, flipU = false, flipV = false,
    sourceRotated = false } = {}) {
    this.offsetU = offsetU;
    this.offsetV = offsetV;
    this.scaleU = scaleU;
    this.scaleV = scaleV;
    this.rotation = rotation;
    this.flipU = flipU;
    this.flipV = flipV;
    this.sourceRotated = sourceRotated;
  }

  /** Side effects: none. @returns {UvTransform} a new identity transform */
  static identity() {
    return new UvTransform();
  }

  /**
   * Normalises an angle into (-180, 180] (04 4.1): d - 360 * ceil((d - 180) / 360); 180 stays 180, -180 becomes 180.
   * Side effects: none.
   * @param {number} deg
   * @returns {number}
   */
  static normalizeRotation(deg) {
    return deg - 360 * Math.ceil((deg - 180) / 360);
  }

  /**
   * The field rules (04 4.1, 4.2): raw UI strings (or numbers) to stored values, Number.isFinite based so 0 is legal
   * (B-L9 avoided). The import validator of 04 UV-5c calls the same functions.
   *   offsetU / offsetV: finite, else 0; clamp [-8, 8].
   *   scaleU / scaleV: finite and non-zero, else 1; abs; clamp [0.01, 16] (a negative value also toggles the flip, setField).
   *   rotation: finite, else 0; normalizeRotation.
   *   flipU / flipV / sourceRotated: true or "true", else false.
   * @type {Readonly<Record<string, (raw: *) => (number|boolean)>>}
   */
  static RULES = Object.freeze({
    offsetU: offsetRule,
    offsetV: offsetRule,
    scaleU: scaleRule,
    scaleV: scaleRule,
    rotation: (raw) => {
      const v = num(raw);
      return Number.isFinite(v) ? UvTransform.normalizeRotation(v) : 0;
    },
    flipU: bool,
    flipV: bool,
    sourceRotated: bool,
  });

  /**
   * Stores one field through its rule. A negative scale stores its absolute value and toggles the matching flip
   * (04 4.2 `coerced`).
   * Side effects: writes this[field] (and flipU / flipV for a negative scale).
   * @param {string} field  a TRANSFORM_FIELDS name
   * @param {*} raw
   * @returns {number|boolean} the stored value
   * @throws {RangeError} for an unknown field
   */
  setField(field, raw) {
    const rule = UvTransform.RULES[field];
    if (!rule) throw new RangeError(`Unknown UV transform field ${JSON.stringify(field)}`);
    if (field === 'scaleU' || field === 'scaleV') {
      const v = num(raw);
      if (Number.isFinite(v) && v < 0) {
        const flip = field === 'scaleU' ? 'flipU' : 'flipV';
        this[flip] = !this[flip];
      }
    }
    this[field] = rule(raw);
    return this[field];
  }

  /**
   * True when every field has its default: offsets 0, scales 1, rotation 0, no flip, sourceRotated false.
   * Side effects: none.
   * @returns {boolean}
   */
  get isIdentity() {
    return this.#isIdentityIgnoringSource() && this.sourceRotated === false;
  }

  /**
   * The identity for a W x H section: isIdentity, or only sourceRotated differs and W === H (the flag has no effect on
   * a square section, 04 6.6).
   * Side effects: none.
   * @param {number} W  the section's pixel width (panelCols * ledX)
   * @param {number} H  the section's pixel height (panelRows * ledY)
   * @returns {boolean}
   */
  isIdentityFor(W, H) {
    return this.#isIdentityIgnoringSource() && (this.sourceRotated === false || W === H);
  }

  /** @returns {boolean} every field but sourceRotated has its default */
  #isIdentityIgnoringSource() {
    return this.offsetU === 0 && this.offsetV === 0 && this.scaleU === 1 && this.scaleV === 1 && this.rotation === 0
      && this.flipU === false && this.flipV === false;
  }

  /** Side effects: none. @returns {UvTransform} a copy */
  clone() {
    return new UvTransform(this);
  }

  /**
   * Side effects: none.
   * @param {UvTransform|null|undefined} o
   * @returns {boolean} every field strictly equal
   */
  equals(o) {
    return !!o && TRANSFORM_FIELDS.every((f) => this[f] === o[f]);
  }

  /**
   * The one-line summary of the non-default parts (04 4.1), in this order: flips, rotation, "Source rotated" (only when
   * W !== H), scale, offset; 'Identity' for the identity of this size. For example
   * `Flip U · 90° · Source rotated · 50 % × 50 % · Offset 0.1000, 0.0000`.
   * Side effects: none.
   * @param {number} W
   * @param {number} H
   * @returns {string}
   */
  summaryFor(W, H) {
    if (this.isIdentityFor(W, H)) return 'Identity';
    const parts = [];
    if (this.flipU) parts.push('Flip U');
    if (this.flipV) parts.push('Flip V');
    const theta = UvTransform.normalizeRotation(this.rotation);
    if (theta !== 0) parts.push(`${Number(theta.toFixed(2))}°`);
    if (this.sourceRotated && W !== H) parts.push('Source rotated');
    if (this.scaleU !== 1 || this.scaleV !== 1) {
      parts.push(`${Number((this.scaleU * 100).toFixed(1))} % × ${Number((this.scaleV * 100).toFixed(1))} %`);
    }
    if (this.offsetU !== 0 || this.offsetV !== 0) parts.push(`Offset ${this.offsetU.toFixed(4)}, ${this.offsetV.toFixed(4)}`);
    return parts.join(' · ');
  }

  /**
   * The full snake_case object of 04 4.2 (defaults included), in the row order.
   * Side effects: none.
   * @returns {{offset_u: number, offset_v: number, scale_u: number, scale_v: number, rotation_degrees: number,
   *            flip_u: boolean, flip_v: boolean, source_rotated: boolean}}
   */
  toJSON() {
    return {
      offset_u: this.offsetU, offset_v: this.offsetV, scale_u: this.scaleU, scale_v: this.scaleV,
      rotation_degrees: this.rotation, flip_u: this.flipU, flip_v: this.flipV, source_rotated: this.sourceRotated,
    };
  }

  /**
   * Builds a transform from a validated 04 4.2 object (every leaf already valid; a missing leaf takes its default).
   * Side effects: none.
   * @param {object} v
   * @returns {UvTransform}
   */
  static fromJSON(v) {
    return new UvTransform({
      offsetU: v.offset_u, offsetV: v.offset_v, scaleU: v.scale_u, scaleV: v.scale_v, rotation: v.rotation_degrees,
      flipU: v.flip_u, flipV: v.flip_v, sourceRotated: v.source_rotated,
    });
  }
}

/** A vertex delta rule: finite, else 0; |d| < 1e-12 is 0 (a drag back to the start leaves no edit); clamp [-8, 8]. */
const deltaRule = (raw) => {
  const v = num(raw);
  return Number.isFinite(v) && Math.abs(v) >= 1e-12 ? clamp(v, -8, 8) : 0;
};

/**
 * The per-vertex UV edits of one section (the owner's request of 2026-10-31): a sparse map from a vertex of the
 * section's (panelCols + 1) x (panelRows + 1) panel-corner grid (key = row * (cols + 1) + col, row 0 at the bottom) to
 * a delta [du, dv] in the island's BASE space, before the section's UvTransform: the vertex's UV is T(base + delta), so
 * moving, scaling or rotating the island keeps the edits. Bound to the grid size it was made for (matches(); a section
 * whose panelCols or panelRows changes drops its edits, UvController). Session-only like the transform. A section stores
 * its own copy (WallSection.setUvVertexEdits); a stored delta is a frozen pair and is never mutated.
 */
export class UvVertexEdits {
  /** @type {number} */
  #cols;
  /** @type {number} */
  #rows;
  /** @type {Map<number, readonly number[]>} key -> frozen [du, dv], never [0, 0] */
  #map = new Map();

  /**
   * Side effects: none.
   * @param {number} cols  the section's panelCols
   * @param {number} rows  the section's panelRows
   */
  constructor(cols, rows) {
    this.#cols = cols;
    this.#rows = rows;
  }

  /** Side effects: none. @returns {number} */
  get cols() { return this.#cols; }
  /** Side effects: none. @returns {number} */
  get rows() { return this.#rows; }
  /** Side effects: none. @returns {number} the number of edited vertices */
  get size() { return this.#map.size; }
  /** Side effects: none. @returns {boolean} */
  get isEmpty() { return this.#map.size === 0; }

  /** Side effects: none. @param {number} col @param {number} row @returns {number} the vertex key */
  key(col, row) {
    return row * (this.#cols + 1) + col;
  }

  /** Side effects: none. @param {number} key @returns {number[]} [col, row] */
  colRow(key) {
    const n = this.#cols + 1;
    const col = key % n;
    return [col, (key - col) / n];
  }

  /** Side effects: none. @param {number} key @returns {readonly number[]|undefined} the frozen [du, dv] */
  get(key) {
    return this.#map.get(key);
  }

  /**
   * Stores a vertex's delta through the delta rule; a zero delta removes the vertex.
   * Side effects: writes the map.
   * @param {number} key
   * @param {*} du
   * @param {*} dv
   * @throws {RangeError} for a key outside the grid
   */
  set(key, du, dv) {
    if (!Number.isInteger(key) || key < 0 || key >= (this.#cols + 1) * (this.#rows + 1)) {
      throw new RangeError(`Vertex ${key} is outside the ${this.#cols} x ${this.#rows} grid`);
    }
    const u = deltaRule(du);
    const v = deltaRule(dv);
    if (u === 0 && v === 0) this.#map.delete(key);
    else this.#map.set(key, Object.freeze([u, v]));
  }

  /** Adds to a vertex's delta (set of the sums). Side effects: writes the map. @param {number} key @param {number} du @param {number} dv */
  add(key, du, dv) {
    const d = this.#map.get(key);
    this.set(key, (d ? d[0] : 0) + du, (d ? d[1] : 0) + dv);
  }

  /** Side effects: writes the map. @param {number} key */
  delete(key) {
    this.#map.delete(key);
  }

  /** Side effects: none. @returns {number[]} the edited vertices' keys, ascending */
  keys() {
    return [...this.#map.keys()].sort((a, b) => a - b);
  }

  /** Side effects: none. @param {number} cols @param {number} rows @returns {boolean} made for this grid size */
  matches(cols, rows) {
    return this.#cols === cols && this.#rows === rows;
  }

  /** Side effects: none. @returns {UvVertexEdits} a copy (the frozen pairs are shared) */
  clone() {
    const c = new UvVertexEdits(this.#cols, this.#rows);
    for (const [k, d] of this.#map) c.#map.set(k, d);
    return c;
  }

  /**
   * Side effects: none.
   * @param {UvVertexEdits|null|undefined} o
   * @returns {boolean} the same grid and the same deltas (null and undefined equal an empty map)
   */
  equals(o) {
    if (!o) return this.isEmpty;
    if (!o.matches(this.#cols, this.#rows) || o.size !== this.size) return false;
    for (const [k, d] of this.#map) {
      const e = o.get(k);
      if (!e || e[0] !== d[0] || e[1] !== d[1]) return false;
    }
    return true;
  }
}

/**
 * The project-wide UV settings (04 4.1; `Project.uv`, injected by reference and never replaced: assign() hydrates it in
 * place). Defaults: the per-section Combined layout (the owner's decision), section-space panel UVs, and the glTF
 * second UV channel (TEXCOORD_1, the combined canvas) on.
 */
export class UvSettings {
  /** @type {'per-section'|'atlas'} */
  combinedLayout = UvLayout.PER_SECTION;
  /** @type {'section'|'panel'} */
  panelUvs = PanelUvMode.SECTION;
  /**
   * Write glTF TEXCOORD_1 = the combined canvas (every section side by side in wall order on one square canvas, pixels
   * square; UvMapper.combinedCanvas) on every primitive of every mesh mode (the owner's request of 2026-10-31, the
   * reference LED_Wall_Gen.blend's "UVMap_Combined"; it replaced 04 7.3's optional atlas TEXCOORD_1). On by default.
   * @type {boolean}
   */
  gltfCanvasTexcoord1 = true;

  /**
   * The value rules (04 4.2): an unknown enum value gives the default; the boolean takes true or "true" only.
   * @type {Readonly<Record<string, (raw: *) => (string|boolean)>>}
   */
  static RULES = Object.freeze({
    combinedLayout: (raw) => (Object.values(UvLayout).includes(raw) ? raw : UvLayout.PER_SECTION),
    panelUvs: (raw) => (Object.values(PanelUvMode).includes(raw) ? raw : PanelUvMode.SECTION),
    gltfCanvasTexcoord1: bool,
  });

  /** Side effects: none. @returns {boolean} every setting has its default */
  get isDefault() {
    return this.combinedLayout === UvLayout.PER_SECTION && this.panelUvs === PanelUvMode.SECTION
      && this.gltfCanvasTexcoord1 === true;
  }

  /**
   * Hydrates the settings in place from validated values (07 4.1: aggregate parts are never replaced); an undefined
   * value leaves its setting unchanged.
   * Side effects: writes the given settings.
   * @param {{combinedLayout?: string, panelUvs?: string, gltfCanvasTexcoord1?: boolean}} values
   * @returns {UvSettings} this
   */
  assign({ combinedLayout, panelUvs, gltfCanvasTexcoord1 } = {}) {
    if (combinedLayout !== undefined) this.combinedLayout = combinedLayout;
    if (panelUvs !== undefined) this.panelUvs = panelUvs;
    if (gltfCanvasTexcoord1 !== undefined) this.gltfCanvasTexcoord1 = gltfCanvasTexcoord1;
    return this;
  }

  /**
   * Side effects: none.
   * @returns {{combined_layout: string, panel_uvs: string, gltf_canvas_texcoord1: boolean}} the full 04 4.2 object
   */
  toJSON() {
    return { combined_layout: this.combinedLayout, panel_uvs: this.panelUvs, gltf_canvas_texcoord1: this.gltfCanvasTexcoord1 };
  }

  /**
   * Side effects: none.
   * @param {object} v  a validated 04 4.2 `uv` object
   * @returns {{combinedLayout: string, panelUvs: string, gltfCanvasTexcoord1: boolean}} the field object for assign()
   */
  static fromJSON(v) {
    return { combinedLayout: v.combined_layout, panelUvs: v.panel_uvs, gltfCanvasTexcoord1: v.gltf_canvas_texcoord1 };
  }
}
