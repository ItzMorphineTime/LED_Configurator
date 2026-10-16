/**
 * @module domain/DebugViewSettings
 * The viewer preferences of the normals debug view (docs/improvements/01-normals.md 4.4): the shading override and
 * the normal-line options. They are not project data: never serialised, reset on reload (01 Q7). The only writer of
 * the fields is app/DebugViewController (ARCHITECTURE.md section 4).
 * Legacy source: none (Feature 1).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

/**
 * The shading modes: the content materials ('content', shown as "As displayed"), front/back face colours, or world
 * normals as colours.
 * @readonly
 * @enum {string}
 */
export const DebugShading = Object.freeze({ CONTENT: 'content', FACE_ORIENTATION: 'faceOrientation', NORMAL_COLORS: 'normalColors' });

/** The Shift+N cycle order (01 3.4). */
export const SHADING_CYCLE = Object.freeze(['content', 'faceOrientation', 'normalColors']);

/** The debug view settings (defaults: shading content; lines off, vertex lines on, face lines off, x1, depth-tested). */
export class DebugViewSettings {
  /** @type {string} a DebugShading value */
  shading = 'content';
  /** @type {{enabled: boolean, vertex: boolean, face: boolean, lengthScale: number, onTop: boolean}} */
  normals = { enabled: false, vertex: true, face: false, lengthScale: 1, onTop: false };

  /**
   * The stored length multiplier for a raw input value: zero, negative, empty and NaN reset to x1; anything else is
   * rounded to the 0.25 step and clamped to [0.25, 4] (the range input's min, max and step).
   *   v = parseFloat(raw); if (!Number.isFinite(v) || v <= 0) return 1;
   *   return Math.min(4, Math.max(0.25, Math.round(v * 4) / 4))
   * Side effects: none.
   * @param {*} raw
   * @returns {number}
   */
  static parseLengthScale(raw) {
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v <= 0) return 1;
    return Math.min(4, Math.max(0.25, Math.round(v * 4) / 4));
  }

  /**
   * The next shading mode of the Shift+N cycle: content -> faceOrientation -> normalColors -> content (an unknown
   * current value goes back to content).
   * Side effects: none.
   * @returns {string}
   */
  nextShading() {
    return SHADING_CYCLE[(SHADING_CYCLE.indexOf(this.shading) + 1) % SHADING_CYCLE.length];
  }

  /**
   * A frozen copy for event payloads: {shading, normals: {...normals}}.
   * Side effects: none.
   * @returns {Readonly<{shading: string, normals: Readonly<{enabled: boolean, vertex: boolean, face: boolean,
   *   lengthScale: number, onTop: boolean}>}>}
   */
  snapshot() {
    return Object.freeze({ shading: this.shading, normals: Object.freeze({ ...this.normals }) });
  }
}
