/**
 * @module domain/Wall
 * The ordered list of wall sections (legacy `wallSections`), the section id allocator (legacy `nextSectionId`),
 * the header totals, the legacy flat bounds, and the wall pivot (Feature 3, 03 T1: `WallPivot` with its rules; the
 * identity until the pivot UI lands, docs/improvements/03-pivot.md 4.1) with its whole-wall orientation (03 section 12,
 * F3-O1: `OrientationAlign`, `WallPivot.orientation` and its rules).
 * Legacy source: index.html@cd3fd3f 1395-1409 (state), 2307-2313 (totals), 2487-2493 / 2551-2557 / 2597-2603 /
 * 3757-3762 (flat bounds), 4088-4103 (add), 4133 (delete), 4976 + 4989 (import replace + allocator).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { WallSection } from './WallSection.js';
import { MAX_SECTION_ID, createIdAllocator, isValidSectionId } from './rules.js';

/** Where the wall pivot's anchor sits (Feature 3, docs/improvements/03-pivot.md 6.1). */
export const PivotMode = Object.freeze({ BOTTOM_LEFT: 'bottom-left', MESH_CENTER: 'mesh-center', WALL_CENTER: 'wall-center' });

/** The pivot modes in display order: the radio list and the validator read it (03 4.1, 6.1 extension point). */
export const PIVOT_MODES = Object.freeze([PivotMode.BOTTOM_LEFT, PivotMode.MESH_CENTER, PivotMode.WALL_CENTER]);

/** The largest pivot offset magnitude per axis, in metres (03 4.1, Q11). */
export const PIVOT_OFFSET_LIMIT_M = 1000;

/** The offset axes that setOffsetAxis accepts. */
const OFFSET_AXES = Object.freeze(['x', 'y', 'z']);

/**
 * How the whole wall is turned about the pivot (03 section 12, the owner's request of 2026-10-17):
 * 'center-neg-x' ("Centre on −X") turns the LED normal at the wall's centre point to +X, so the wall's centre lies
 * toward −X from the pivot and the face looks at the stage on +X; 'none' applies the yaw offset alone.
 */
export const OrientationAlign = Object.freeze({ CENTER_NEG_X: 'center-neg-x', NONE: 'none' });

/** The orientation alignments in display order: the #pivot-align options (03 12.9) and, with v2, the validator read it. */
export const ORIENTATION_ALIGNS = Object.freeze([OrientationAlign.CENTER_NEG_X, OrientationAlign.NONE]);

/** The largest yaw offset magnitude, in degrees (03 12.4). */
export const YAW_OFFSET_LIMIT_DEG = 180;

/**
 * The wall pivot (Feature 3, 03 4.1): P = anchor(mode) + offset (D2). The offset is in metres, in layout axes (X along
 * the wall start, Y up, Z toward the stage), and moves the pivot relative to the wall. keepStageLayout decides whether
 * an explicit pivot or orientation edit re-expresses the camera and props (D6, 03 12.6). The orientation (03 section 12)
 * turns the whole wall about the vertical axis through P: the alignment ('center-neg-x' or 'none') plus a yaw offset in
 * degrees. The default is the identity (bottom-left, zero offset, DEFAULT_ALIGN 'none' with a zero yaw offset): the
 * implicit legacy pivot. Written only through these methods (ARCHITECTURE.md section 4); the pivot is session-only
 * until the project file v2 lands (03 header, "Sequencing", the owner's decision of 2026-10-17).
 */
export class WallPivot {
  /**
   * The alignment of a new pivot (03 12.11): 'none' until the owner's default (Centre on −X for new projects) lands in
   * its own commit, so every output stays unchanged until the orientation is used.
   * @type {string}
   */
  static DEFAULT_ALIGN = OrientationAlign.NONE;

  /**
   * The pivot of a NEW project (the owner's defaults of 2026-10-17, 03 12.11): 'wall-center' ("Wall centre on floor")
   * with Centre on −X. The class defaults stay the identity (the implicit legacy pivot, which the legacy-parity oracles
   * and `new WallPivot()` mean); App's Project.createNew installs these.
   */
  static NEW_PROJECT_MODE = PivotMode.WALL_CENTER;
  static NEW_PROJECT_ALIGN = OrientationAlign.CENTER_NEG_X;

  /**
   * A pivot with the new-project defaults (NEW_PROJECT_MODE, NEW_PROJECT_ALIGN, zero offset and yaw offset, keep stage
   * layout on).
   * Side effects: none.
   * @returns {WallPivot}
   */
  static createForNewProject() {
    const p = new WallPivot();
    p.setMode(WallPivot.NEW_PROJECT_MODE);
    p.setAlign(WallPivot.NEW_PROJECT_ALIGN);
    return p;
  }

  /** @type {string} a PivotMode value */
  mode = PivotMode.BOTTOM_LEFT;
  /** @type {{x: number, y: number, z: number}} metres; replaced (never mutated in place) by every setter */
  offset = { x: 0, y: 0, z: 0 };
  /** @type {boolean} re-express the camera and props on explicit pivot and orientation edits (D6, Q4: on by default) */
  keepStageLayout = true;
  /**
   * The whole-wall orientation (03 12.1): align is an ORIENTATION_ALIGNS value, yawOffsetDeg degrees in
   * [-YAW_OFFSET_LIMIT_DEG, YAW_OFFSET_LIMIT_DEG] stored to 0.1 degree (positive = counter-clockwise seen from above,
   * the sign of three.js rotation.y). Replaced (never mutated in place) by every setter.
   * @type {{align: string, yawOffsetDeg: number}}
   */
  orientation = { align: WallPivot.DEFAULT_ALIGN, yawOffsetDeg: 0 };

  /**
   * Side effects: none.
   * @returns {boolean} true when the pivot is bottom-left with a zero offset and the orientation is 'none' with a zero
   *   yaw offset (the implicit legacy pivot); keepStageLayout does not count
   */
  get isIdentity() {
    return this.mode === PivotMode.BOTTOM_LEFT && this.offset.x === 0 && this.offset.y === 0 && this.offset.z === 0 &&
      this.orientation.align === OrientationAlign.NONE && this.orientation.yawOffsetDeg === 0;
  }

  /**
   * Sets the anchor mode.
   * Side effects: writes mode.
   * @param {*} mode  a PIVOT_MODES value
   * @returns {boolean} whether the mode changed
   * @throws {RangeError} `Unknown pivot mode ${JSON.stringify(mode)}` for anything else (the error type of
   *   WallLayout.pivotPoint)
   */
  setMode(mode) {
    if (!PIVOT_MODES.includes(mode)) throw new RangeError(`Unknown pivot mode ${JSON.stringify(mode)}`);
    const changed = this.mode !== mode;
    this.mode = mode;
    return changed;
  }

  /**
   * Stores one offset component through parseOffset. A value parseOffset rejects (not finite) writes nothing, and the
   * stored component is returned for the input's write-back. The offset object is REPLACED, never mutated in place, so
   * a resolution snapshot that holds the old object keeps its values.
   * Side effects: replaces offset (only when the value parses).
   * @param {'x'|'y'|'z'} axis
   * @param {number|string} raw  a number, or the input's text
   * @returns {number} the stored component
   * @throws {RangeError} for an axis other than 'x', 'y' or 'z'
   */
  setOffsetAxis(axis, raw) {
    if (!OFFSET_AXES.includes(axis)) throw new RangeError(`Unknown pivot offset axis ${JSON.stringify(axis)}`);
    const v = WallPivot.parseOffset(raw);
    if (v === null) return this.offset[axis];
    this.offset = { ...this.offset, [axis]: v };
    return v;
  }

  /**
   * setOffsetAxis for each axis of `vec`, in x, y, z order.
   * Side effects: replaces offset (per parsed component).
   * @param {{x: number, y: number, z: number}} vec  metres
   * @returns {{x: number, y: number, z: number}} the stored offset
   */
  setOffset(vec) {
    for (const axis of OFFSET_AXES) this.setOffsetAxis(axis, vec[axis]);
    return this.offset;
  }

  /**
   * Side effects: replaces offset with (0, 0, 0).
   */
  resetOffset() {
    this.offset = { x: 0, y: 0, z: 0 };
  }

  /**
   * Side effects: writes keepStageLayout.
   * @param {boolean} on
   * @returns {boolean} whether the value changed
   * @throws {TypeError} when `on` is not a boolean
   */
  setKeepStageLayout(on) {
    if (typeof on !== 'boolean') throw new TypeError(`keepStageLayout must be a boolean, got ${JSON.stringify(on)}`);
    const changed = this.keepStageLayout !== on;
    this.keepStageLayout = on;
    return changed;
  }

  /**
   * Sets the orientation alignment (03 12.4; rebuild-policy row F3-6). The orientation object is REPLACED.
   * Side effects: replaces orientation.
   * @param {*} align  an ORIENTATION_ALIGNS value
   * @returns {boolean} whether the alignment changed
   * @throws {RangeError} `Unknown orientation alignment ${JSON.stringify(align)}` for anything else
   */
  setAlign(align) {
    if (!ORIENTATION_ALIGNS.includes(align)) throw new RangeError(`Unknown orientation alignment ${JSON.stringify(align)}`);
    const changed = this.orientation.align !== align;
    this.orientation = { ...this.orientation, align };
    return changed;
  }

  /**
   * Stores the yaw offset through parseYawOffset (03 12.4; row F3-7). A value parseYawOffset rejects (not finite) writes
   * nothing, and the stored value is returned for the input's write-back. The orientation object is REPLACED.
   * Side effects: replaces orientation (only when the value parses).
   * @param {number|string} raw  a number, or the input's text (degrees)
   * @returns {number} the stored yaw offset in degrees
   */
  setYawOffset(raw) {
    const v = WallPivot.parseYawOffset(raw);
    if (v === null) return this.orientation.yawOffsetDeg;
    this.orientation = { ...this.orientation, yawOffsetDeg: v };
    return v;
  }

  /**
   * Number or text -> metres: finite values are rounded to 1 mm and clamped to +-PIVOT_OFFSET_LIMIT_M; anything else
   * gives null. Never orDefault: 0 is a valid offset (B-L9 does not apply). A rounded -0 is normalised to +0
   * (`|| 0`). Idempotent: parseOffset(parseOffset(x)) === parseOffset(x) for every finite x.
   * Side effects: none.
   * @param {*} raw
   * @returns {number|null}
   */
  static parseOffset(raw) {
    const v = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(v)) return null;
    return Math.max(-PIVOT_OFFSET_LIMIT_M, Math.min(PIVOT_OFFSET_LIMIT_M, Math.round(v * 1000) / 1000)) || 0;
  }

  /**
   * Number or text -> degrees (03 12.4): finite values are rounded to 0.1 degree and clamped to +-YAW_OFFSET_LIMIT_DEG;
   * anything else gives null. Never orDefault: 0 is a valid yaw offset. A rounded -0 is normalised to +0 (`|| 0`).
   * Idempotent: parseYawOffset(parseYawOffset(x)) === parseYawOffset(x) for every finite x.
   * Side effects: none.
   * @param {*} raw
   * @returns {number|null}
   */
  static parseYawOffset(raw) {
    const v = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(v)) return null;
    return Math.max(-YAW_OFFSET_LIMIT_DEG, Math.min(YAW_OFFSET_LIMIT_DEG, Math.round(v * 10) / 10)) || 0;
  }

  /**
   * Side effects: none.
   * @returns {WallPivot} a deep copy
   */
  clone() {
    const copy = new WallPivot();
    copy.mode = this.mode;
    copy.offset = { ...this.offset };
    copy.keepStageLayout = this.keepStageLayout;
    copy.orientation = { ...this.orientation };
    return copy;
  }

  /**
   * Side effects: none.
   * @param {WallPivot} other
   * @returns {boolean} mode, the three offset components, keepStageLayout and the two orientation fields, each compared
   *   with ===
   */
  equals(other) {
    return this.mode === other.mode && this.offset.x === other.offset.x && this.offset.y === other.offset.y &&
      this.offset.z === other.offset.z && this.keepStageLayout === other.keepStageLayout &&
      this.orientation.align === other.orientation.align && this.orientation.yawOffsetDeg === other.orientation.yawOffsetDeg;
  }
}

/**
 * The wall: the live, ordered section array (legacy `wallSections`) and the section id allocator
 * (legacy `nextSectionId`), with the legacy totals and flat bounds.
 */
export class Wall {
  /** The most sections a wall may have (08 P2-3b; spec 07 4.1, 4.3): Add Section refuses a 201st (M-SEC-1) and the
   *  validator refuses a file with more (M-IMP-3). */
  static MAX_SECTIONS = 200;

  /** @type {WallSection[]} */
  #sections;
  /** @type {number} where allocateId (appendLikeLast) starts looking for a free id (legacy global 1409); recomputed by
   *  replaceAll (07 6.8) */
  nextSectionId;
  /** @type {WallPivot} */
  pivot;

  /**
   * Side effects: none.
   * @param {{sections?: WallSection[], nextSectionId?: number, pivot?: WallPivot}} [options]
   *   defaults: the legacy bootstrap wall (one default section), nextSectionId 1, identity pivot
   */
  constructor({ sections = [WallSection.createDefault()], nextSectionId = 1, pivot = new WallPivot() } = {}) {
    this.#sections = sections;
    this.nextSectionId = nextSectionId;
    this.pivot = pivot;
  }

  /**
   * The live array (legacy `wallSections`). Mutated by push in appendLikeLast; REPLACED (new array) by
   * removeById and replaceAll, exactly like legacy. Callers that need a stable copy must slice().
   * Side effects: none.
   * @returns {WallSection[]}
   */
  get sections() {
    return this.#sections;
  }

  /**
   * Side effects: none.
   * @returns {number} sections.length
   */
  get count() {
    return this.#sections.length;
  }

  /**
   * The id of the next added section: the `nextFree()` of spec 07 6.8 over the live ids (07 4.1 `Wall.allocateId`,
   * delivered by the 08 P2-3b review follow-up, P2-3b2). From nextSectionId upward it skips every id a live section
   * uses; once that would pass 2^31 - 1 it returns the smallest id no live section uses (nextSectionId then stays above
   * the range, so every later call takes that fallback too). Whenever nextSectionId is above every live id, which holds
   * in every state except right after an import whose ids reach the top of the range, this is exactly the legacy
   * `nextSectionId++`. Without it, the fallback of replaceAll (the smallest unused id, which can lie below live ids)
   * made the legacy `++` hand out ids that live sections already used (duplicate ids; Delete then removed both).
   * Only a valid id is stepped over; a nextSectionId that is not one (NaN, -Infinity, a fraction: unreachable since
   * 08 P2-3b, whose replaceAll always computes a valid id) is handed out with the legacy `++` while no live section
   * uses it, and otherwise takes the fallback, so the call always terminates.
   * Ports: index.html@cd3fd3f line 4089 (`id: nextSectionId++`).
   * Side effects: advances nextSectionId past the returned id (not in the fallback).
   * @returns {number} an id no live section uses (an integer in [0, 2^31 - 1] whenever nextSectionId is one)
   */
  allocateId() {
    const used = new Set(this.#sections.map(s => s.id));
    while (isValidSectionId(this.nextSectionId) && used.has(this.nextSectionId)) this.nextSectionId++;
    if (this.nextSectionId <= MAX_SECTION_ID && !used.has(this.nextSectionId)) return this.nextSectionId++;
    let id = 0;
    while (used.has(id)) id++;
    return id;
  }

  /**
   * Appends a copy of the last section's geometry with a fresh id, the next default name, no offset and the
   * next palette colour. Evaluation order matters: `id: this.allocateId()` and the name are evaluated
   * BEFORE `last.panelCols` (on an empty wall, which legacy reached through an import of `sections: []`, B-L8, the
   * allocator was incremented before the TypeError; since 08 P2-3b the wall is never empty).
   * Ports: index.html@cd3fd3f lines 4088-4103.
   * Side effects: advances nextSectionId (allocateId); pushes onto the live sections array.
   * @param {ReadonlyArray<string>} sectionColors  the palette (legacy `sectionColors`)
   * @returns {WallSection} the new section
   * @throws {TypeError} on an empty wall (after the allocator was incremented)
   */
  appendLikeLast(sectionColors) {
    const sections = this.#sections;
    const last = sections[sections.length - 1];
    const newColorIndex = sections.length % sectionColors.length;
    // The literal's evaluation order (id, name, then last.*) is kept. Since 08 P2-3b (B-L8 fixed) the wall is never
    // empty (the validator refuses a file without sections and deleteSection keeps one) and nextSectionId is an
    // integer (replaceAll recomputes it from validated ids); WallController.addSection refuses a 201st section. The id
    // is the 07 6.8 next free id (allocateId, 08 P2-3b2): the legacy `nextSectionId++` unless that id is in use.
    const newSection = new WallSection({
      id: this.allocateId(),
      name: `Wall ${sections.length + 1}`,
      panelCols: last.panelCols,
      panelRows: last.panelRows,
      panelWidth: last.panelWidth,
      panelHeight: last.panelHeight,
      ledX: last.ledX,
      ledY: last.ledY,
      curveIntensity: last.curveIntensity,
      angleOffset: 0,
      color: sectionColors[newColorIndex],
    });
    sections.push(newSection);
    return newSection;
  }

  /**
   * Removes every section whose id is strictly equal to `id` (duplicates included, B-L8).
   * Ports: index.html@cd3fd3f line 4133.
   * Side effects: replaces the sections array with a new one.
   * @param {*} id
   */
  removeById(id) {
    this.#sections = this.#sections.filter(s => s.id !== id);
  }

  /**
   * Can one more section be added (08 P2-3b; spec 07 4.1)?
   * Side effects: none.
   * @returns {boolean} this.count < Wall.MAX_SECTIONS
   */
  canAddSection() {
    return this.count < Wall.MAX_SECTIONS;
  }

  /**
   * Replaces the whole section list (import) and recomputes the id allocator. The ids are the validator's (08 P2-3b:
   * unique integers in [0, 2^31 - 1]), and nextSectionId is the next free id of spec 07 6.8 (createIdAllocator):
   * `max(ids) + 1`, exactly the legacy `Math.max(...ids) + 1`, or the smallest unused id once that would pass
   * 2^31 - 1 (that id can lie below other live ids, so appendLikeLast allocates through allocateId, which skips them).
   * It is recomputed on every import and never stored in a file.
   * Ports: index.html@cd3fd3f lines 4976, 4989.
   * Side effects: replaces the sections array; writes nextSectionId.
   * @param {WallSection[]} sections
   */
  replaceAll(sections) {
    this.#sections = sections;
    this.nextSectionId = createIdAllocator(new Set(sections.map(s => s.id).filter(isValidSectionId))).next();
  }

  /**
   * Header statistics, accumulated in section order with the legacy expressions.
   * Ports: index.html@cd3fd3f lines 2308-2313 (the DOM writes 2314-2317 live in ui/HeaderStats).
   * Side effects: none.
   * @returns {{totalPixels: number, totalPanels: number, totalSections: number, totalArc: number}}
   */
  totals() {
    let totalPixels = 0, totalPanels = 0, totalArc = 0;
    this.#sections.forEach(s => {
      totalPixels += s.panelCols * s.panelRows * s.ledX * s.ledY;
      totalPanels += s.panelCols * s.panelRows;
      totalArc += s.panelCols * Math.abs(s.curveIntensity);
    });
    return { totalPixels, totalPanels, totalSections: this.#sections.length, totalArc };
  }

}
