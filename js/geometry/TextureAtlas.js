/**
 * @module geometry/TextureAtlas
 * Single source of the LED atlas bookkeeping: wall LED totals, the combined-atlas px/LED, and per section the start
 * column (panel-ID labels), the LED x offset (atlas drawing) and the combined-mesh U offset and width. Replaces the
 * 4 legacy `cumulativeCol` loops (1696-1705, 1711/1772, 1777/1800, 4534-4542) and the 2 totals loops (1586-1590,
 * 1681-1685); also hosts the two per-canvas px/LED rules.
 * Legacy source: index.html@cd3fd3f 1586-1596 + 1643 (combined mesh UVs), 1681-1705 (combined panel-ID atlas),
 * 2003 (panel canvas px/LED), 2056 (section canvas px/LED).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

/**
 * Per-section atlas bookkeeping.
 * @typedef {object} AtlasEntry
 * @property {import('../domain/WallSection.js').WallSection} section
 * @property {number} sectionIndex
 * @property {number|string} startCol  the running `cumulativeCol` BEFORE this section (0 for the first), accumulated
 *   with raw `+= section.panelCols`, so imported string column counts concatenate exactly like legacy
 * @property {number} ledOffsetX  the running `xOffset` BEFORE this section (LED columns; x px = ledOffsetX * pxPerLed)
 * @property {number} uvWidth     (section.panelCols * section.ledX) / totalLedX
 * @property {number} uvOffsetX   running sum of the previous uvWidth values
 */

/**
 * Computes the wall atlas bookkeeping in one pass per legacy loop:
 *   totalLedX += s.panelCols * s.ledX; totalLedY = Math.max(totalLedY, s.panelRows * s.ledY)       (1586-1590 == 1681-1685)
 *   pxPerLed = Math.max(1, Math.min(4, Math.floor(4096 / Math.max(totalLedX, totalLedY))))        (1687)
 *   entries[i] = {section, sectionIndex, startCol, ledOffsetX, uvWidth, uvOffsetX}, with
 *     startCol = cumulativeCol before `cumulativeCol += section.panelCols`                          (1697, 1704)
 *     ledOffsetX = xOffset before `xOffset += section.panelCols * section.ledX`                      (1696, 1703)
 *     uvWidth = (section.panelCols * section.ledX) / totalLedX                                        (1595-1596)
 *     uvOffsetX = the value before `uvOffsetX += uvWidth`                                             (1592, 1643)
 * Ports: index.html@cd3fd3f lines 1586-1596, 1643, 1681-1705.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection[]} sections  read raw, never coerced
 * @returns {{totalLedX: number, totalLedY: number, pxPerLed: number, entries: AtlasEntry[]}}
 */
export function computeAtlas(sections) {
  let totalLedX = 0, totalLedY = 0;
  sections.forEach(s => {
    totalLedX += s.panelCols * s.ledX;
    totalLedY = Math.max(totalLedY, s.panelRows * s.ledY);
  });

  const pxPerLed = Math.max(1, Math.min(4, Math.floor(4096 / Math.max(totalLedX, totalLedY))));

  const entries = [];
  let xOffset = 0;
  let cumulativeCol = 0;
  let uvOffsetX = 0;
  sections.forEach((section, sectionIndex) => {
    const sectionLedX = section.panelCols * section.ledX;
    const uvWidth = sectionLedX / totalLedX;
    entries.push({ section, sectionIndex, startCol: cumulativeCol, ledOffsetX: xOffset, uvWidth, uvOffsetX });
    xOffset += section.panelCols * section.ledX;
    cumulativeCol += section.panelCols;
    uvOffsetX += uvWidth;
  });

  return { totalLedX, totalLedY, pxPerLed, entries };
}

/**
 * Pixels per LED of a section panel-ID canvas (callers keep the legacy `overrideScale || ...` in front of it).
 * Ports: index.html@cd3fd3f line 2056.
 * Side effects: none.
 * @param {number} w  canvas width in LEDs (section.panelCols * section.ledX)
 * @param {number} h  canvas height in LEDs (section.panelRows * section.ledY)
 * @returns {number} Math.max(1, Math.min(4, Math.floor(4096 / Math.max(w, h))))
 */
export function sectionPxPerLed(w, h) {
  return Math.max(1, Math.min(4, Math.floor(4096 / Math.max(w, h))));
}

/**
 * Pixels per LED of a panel-mode panel-ID canvas.
 * Ports: index.html@cd3fd3f line 2003.
 * Side effects: none.
 * @param {number} ledX
 * @param {number} ledY
 * @returns {number} Math.max(4, Math.min(16, Math.floor(4096 / Math.max(ledX, ledY))))
 */
export function panelPxPerLed(ledX, ledY) {
  // LEGACY(B-M16): every panel gets its own 4-16 px/LED canvas with no global texture budget.
  return Math.max(4, Math.min(16, Math.floor(4096 / Math.max(ledX, ledY))));
}
