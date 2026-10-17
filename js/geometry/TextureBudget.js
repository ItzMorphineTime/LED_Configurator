/**
 * @module geometry/TextureBudget
 * The viewport texture budgets: 07 X3's module (docs/improvements/07-platform-foundations.md 6.12, C25, C38), delivered
 * early by 08 P2-12d (docs/improvements/08-bugfix-roadmap.md 6.15) with the two budgets, the canvas side cap and the
 * wall-wide panel-mode px/LED. 07 X3 later adds fitPxPerLed, estimateGpuBytes and the probed device limits.
 * - SECTION_TEXTURE_BUDGET_PX: the sum of one rebuild's section canvases (04 UV-7 computes its px/LED against it).
 * - PANEL_TEXTURE_BUDGET_PX: the sum of every per-panel canvas of one rebuild, WALL-WIDE. Only 04's
 *   `uv.panel_uvs = 'panel'` option still draws per-panel canvases: since 08 P2-12d panel mode with panel IDs samples one
 *   section canvas per section (B-M16, B-L19).
 * - MAX_CANVAS_SIDE: each canvas side stays at most min(renderer maxTextureSize, 4096) (the legacy per-canvas cap of
 *   index.html@cd3fd3f 2003 and the common mobile limit).
 * Export densities are not budgeted here (the exports keep the legacy px/LED and the CANVAS_HARD_LIMITS guard).
 * Layer: geometry (imports nothing; THREE-free and DOM-free).
 */

/** Pixels of all section canvases of one rebuild (04 UV-7, 07 C38): 16,777,216 (4096 x 4096). */
export const SECTION_TEXTURE_BUDGET_PX = 16777216;

/** Pixels of all per-panel canvases of one rebuild, wall-wide (07 6.12; 04's 'panel' option only): 33,554,432. */
export const PANEL_TEXTURE_BUDGET_PX = 33554432;

/** The largest canvas side the viewport budgets allow (each side <= min(maxTextureSize, 4096), 07 C38). */
export const MAX_CANVAS_SIDE = 4096;

/**
 * The px/LED of every per-panel canvas of one rebuild (07 6.12; 08 6.15): one value for the whole wall, from the
 * wall-wide LED count, so the sum of the panel canvases stays within the budget whatever the number of panels.
 *   p = min(floor(sqrt(budgetPixels / wallPanelLeds)), floor(maxSide / maxLedSide), 16)
 *   p >= 1 -> {pxPerLed: p, fits: true}; otherwise {pxPerLed: 0, fits: false} (even 1 px/LED exceeds the budget)
 * Worked examples (07 6.12): the default wall (15 panels of 32 x 32 LEDs, 15,360) -> 16, as legacy; 15 panels of
 * 176 x 176 (464,640) -> 8 (legacy 16); large_wall (3,200 panels of 32 x 32, 3,276,800) -> 3 (legacy 16); one panel of
 * 1024 x 1024 (1,048,576) -> 4, a 4096 px canvas.
 * Side effects: none.
 * @param {{wallPanelLeds: number, maxLedSide: number}} wall  wallPanelLeds: the sum over the sections of
 *   panelCols * panelRows * ledX * ledY; maxLedSide: the largest ledX or ledY of any section
 * @param {{budgetPixels?: number, maxSide?: number}} [limits]  defaults PANEL_TEXTURE_BUDGET_PX and MAX_CANVAS_SIDE
 *   (maxSide = min(renderer maxTextureSize, 4096) when the caller knows the renderer)
 * @returns {{pxPerLed: number, fits: boolean}}
 */
export function panelModePxPerLed({ wallPanelLeds, maxLedSide }, { budgetPixels = PANEL_TEXTURE_BUDGET_PX, maxSide = MAX_CANVAS_SIDE } = {}) {
  const p = Math.min(Math.floor(Math.sqrt(budgetPixels / wallPanelLeds)), Math.floor(maxSide / maxLedSide), 16);
  if (p >= 1) return { pxPerLed: p, fits: true };
  return { pxPerLed: 0, fits: false };
}
