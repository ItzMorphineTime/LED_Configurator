/**
 * @module geometry/TextureAtlas
 * Single source of the LED atlas bookkeeping: wall LED totals, the combined-atlas px/LED, and per section the start
 * column (panel-ID labels), the LED x offset (atlas drawing) and the combined-mesh U offset and width. Replaces the
 * 4 legacy `cumulativeCol` loops (1696-1705, 1711/1772, 1777/1800, 4534-4542) and the 2 totals loops (1586-1590,
 * 1681-1685); also hosts the two per-canvas px/LED rules.
 * Legacy source: index.html@cd3fd3f 1586-1596 + 1643 (combined mesh UVs), 1681-1705 (combined panel-ID atlas),
 * 2003 (panel canvas px/LED; wall-wide budget since 08 P2-12d), 2056 (section canvas px/LED). The canvas-size guard
 * (CANVAS_HARD_LIMITS, canvasFits) is new in 08 P2-1c (B-L4, 08 6.3).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { panelModePxPerLed, MAX_CANVAS_SIDE } from './TextureBudget.js';

/**
 * The largest canvas every supported browser can create (08 6.3): 32,767 px per side and 268,435,456 px (16,384 x 16,384)
 * in area. Chrome itself draws up to 65,535 px per side; 32,767 is the stricter limit of other browsers. A device with
 * lower limits (iOS Safari allows about 16.7 MP) can still fail, which the exports detect from toBlob / toDataURL
 * (M-EXP-3, the ZIP's late skip); 07's CanvasProbe later replaces these hard limits with probed ones (08 5.6).
 * @type {Readonly<{maxSide: number, maxArea: number}>}
 */
export const CANVAS_HARD_LIMITS = Object.freeze({ maxSide: 32767, maxArea: 268435456 });

/**
 * Whether a w x h canvas can be created (08 6.3, B-L4 fixed in 08 P2-1c):
 * w >= 1 && h >= 1 && w <= maxSide && h <= maxSide && w * h <= maxArea. NaN, 0 and negative sizes do not fit.
 * Side effects: none.
 * @param {number} w  width in px
 * @param {number} h  height in px
 * @param {{maxSide: number, maxArea: number}} [limits]
 * @returns {boolean}
 */
export function canvasFits(w, h, limits = CANVAS_HARD_LIMITS) {
  return w >= 1 && h >= 1 && w <= limits.maxSide && h <= limits.maxSide && w * h <= limits.maxArea;
}

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
 * Pixels per LED of the per-panel panel-ID canvases of one rebuild (08 P2-12d, 08 6.15, 07 6.12; B-M16 fixed): one value
 * for the whole wall from the WALL-WIDE budget of geometry/TextureBudget.js, so the sum of the panel canvases stays within
 * PANEL_TEXTURE_BUDGET_PX however many panels the wall has, and each canvas side within maxSide:
 *   wallPanelLeds = sum of panelCols * panelRows * ledX * ledY; maxLedSide = the largest ledX or ledY;
 *   panelModePxPerLed({wallPanelLeds, maxLedSide}, {maxSide}) -> its pxPerLed when it fits, else 1 (08 6.15: at least
 *   1 px/LED; the canvasFits guard of PanelIdRenderer.panelCanvas still refuses a canvas beyond CANVAS_HARD_LIMITS).
 * Legacy (2003) gave every panel its own Math.max(4, Math.min(16, Math.floor(4096 / Math.max(ledX, ledY)))) with no
 * budget (a 176 x 176 LED panel became a 2816 px square, per panel). Since 08 P2-12d only 04's `uv.panel_uvs = 'panel'`
 * option reaches the per-panel canvases: panel mode with panel IDs samples one section canvas per section.
 * The default wall keeps 16 px/LED, as legacy.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection[]} sections  the sections of the wall (all of them: the budget is
 *   wall-wide)
 * @param {{maxSide?: number}} [limits]  maxSide: min(renderer maxTextureSize, 4096); default MAX_CANVAS_SIDE (4096)
 * @returns {number} px per LED, an integer in 1..16
 */
export function panelPxPerLed(sections, { maxSide = MAX_CANVAS_SIDE } = {}) {
  let wallPanelLeds = 0;
  let maxLedSide = 0;
  for (const s of sections) {
    wallPanelLeds += s.panelCols * s.panelRows * s.ledX * s.ledY;
    maxLedSide = Math.max(maxLedSide, s.ledX, s.ledY);
  }
  const { pxPerLed, fits } = panelModePxPerLed({ wallPanelLeds, maxLedSide }, { maxSide });
  return fits ? pxPerLed : 1;
}
