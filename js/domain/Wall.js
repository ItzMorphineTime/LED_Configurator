/**
 * @module domain/Wall
 * The ordered list of wall sections (legacy `wallSections`), the section id allocator (legacy `nextSectionId`),
 * the header totals, the legacy flat bounds, and the pivot seam (Feature 3; always the identity in Phase 1).
 * Legacy source: index.html@cd3fd3f 1395-1409 (state), 2307-2313 (totals), 2487-2493 / 2551-2557 / 2597-2603 /
 * 3757-3762 (flat bounds), 4088-4103 (add), 4133 (delete), 4976 + 4989 (import replace + allocator).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { MM_TO_M, WallSection } from './WallSection.js';
import { MAX_SECTION_ID, createIdAllocator, isValidSectionId } from './rules.js';

/** Where the wall's local origin sits (Feature 3 seam). */
export const PivotMode = Object.freeze({ BOTTOM_LEFT: 'bottom-left', MESH_CENTER: 'mesh-center', WALL_CENTER: 'wall-center' });

/** Wall pivot and offset (Feature 3 seam). Phase 1 never changes it, so it is always the identity. */
export class WallPivot {
  /** @type {string} a PivotMode value */
  mode = PivotMode.BOTTOM_LEFT;
  /** @type {{x: number, y: number, z: number}} metres */
  offset = { x: 0, y: 0, z: 0 };

  /**
   * Side effects: none.
   * @returns {boolean} true when the pivot is bottom-left with a zero offset (the implicit legacy pivot)
   */
  get isIdentity() {
    return this.mode === PivotMode.BOTTOM_LEFT && this.offset.x === 0 && this.offset.y === 0 && this.offset.z === 0;
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

  /**
   * The legacy "wall dimensions": the sum of flat section widths and the tallest section, ignoring curvature
   * and angle offsets. Computed live on every call (== the four legacy copies 2489-2493, 2553-2557, 2598-2603,
   * 3758-3762).
   * Ports: index.html@cd3fd3f lines 2489-2493.
   * Side effects: none.
   * @returns {{totalWidth: number, maxHeight: number}} metres
   */
  flatBounds() {
    // LEGACY(B-L2, B-M10): flat bounds feed the orbit target, camera reset, coverage status and safe distance.
    let totalWidth = 0, maxHeight = 0;
    this.#sections.forEach(s => {
      totalWidth += s.panelCols * s.panelWidth * MM_TO_M;
      maxHeight = Math.max(maxHeight, s.panelRows * s.panelHeight * MM_TO_M);
    });
    return { totalWidth, maxHeight };
  }
}
