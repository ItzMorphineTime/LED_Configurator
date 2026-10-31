/**
 * @module geometry/PixelMap
 * Conversions between section base UVs and pixels, panels and atlas positions (docs/improvements/04-uvs-uv-editor.md
 * 6.9, 6.10, 4.2; UV-6): the hover readout's pixel description, the wall point of a base UV (spec 05's bake) and the
 * derived `pixel_map` / `atlas` JSON blocks (written once 04 UV-5c lands project file v2).
 * Section pixel canvas: top-left origin, px right, py down, W = panelCols·ledX, H = panelRows·ledY; panel (col, row)
 * occupies x in [col·ledX, (col+1)·ledX) and y in [(rows−1−row)·ledY, (rows−row)·ledY) (04 6.1).
 * Legacy source: none (Feature 4).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { panelLabel } from './PanelNaming.js';
import { sectionPxPerLed } from './TextureAtlas.js';
import { transformPoint } from './WallLayout.js';
import { applyUv, sectionUv } from './UvMapper.js';

/**
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @returns {{W: number, H: number}} the section's pixel size
 */
export function sectionCanvasSize(section) {
  return { W: section.panelCols * section.ledX, H: section.panelRows * section.ledY };
}

/**
 * The pixel under a base UV (6.9): px = min(W−1, floor(u·W)), pyTop = min(H−1, floor((1−v)·H)), then the panel
 * (col, row) and the LED inside it.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {number} u
 * @param {number} v
 * @returns {{px: number, pyTop: number, col: number, row: number, lx: number, lyTop: number}}
 */
export function baseUvToPixel(section, u, v) {
  const { W, H } = sectionCanvasSize(section);
  const px = Math.min(W - 1, Math.floor(u * W));
  const pyTop = Math.min(H - 1, Math.floor((1 - v) * H));
  const col = Math.floor(px / section.ledX);
  const rowFromTop = Math.floor(pyTop / section.ledY);
  const row = section.panelRows - 1 - rowFromTop;
  return { px, pyTop, col, row, lx: px - col * section.ledX, lyTop: pyTop - rowFromTop * section.ledY };
}

/**
 * The base UV of a pixel centre (6.2): [(px + 0.5) / W, 1 − (pyTop + 0.5) / H].
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {number} px
 * @param {number} pyTop
 * @returns {[number, number]}
 */
export function pixelCenterToBaseUv(section, px, pyTop) {
  const { W, H } = sectionCanvasSize(section);
  return [(px + 0.5) / W, 1 - (pyTop + 0.5) / H];
}

/**
 * The base-UV rectangle of one panel.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {number} col
 * @param {number} row
 * @returns {{u0: number, v0: number, u1: number, v1: number}}
 */
export function panelBaseRect(section, col, row) {
  const cols = section.panelCols;
  const rows = section.panelRows;
  return { u0: col / cols, v0: row / rows, u1: (col + 1) / cols, v1: (row + 1) / rows };
}

/**
 * The atlas LED pixel of a section pixel (the atlasCanvas placement: bottom-aligned, sections side by side).
 * Side effects: none.
 * @param {{totalLedY: number}} atlas  computeAtlas()
 * @param {{ledOffsetX: number}} entry  the section's atlas entry
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {number} px
 * @param {number} pyTop
 * @returns {{gx: number, gy: number}} LED px, top-left origin
 */
export function atlasLedPixel(atlas, entry, section, px, pyTop) {
  const { H } = sectionCanvasSize(section);
  return { gx: entry.ledOffsetX + px, gy: (atlas.totalLedY - H) + pyTop };
}

/**
 * The wall point of a base UV in the builder's vertex space (6.10): x and z interpolated along the column edges, y from
 * the section bottom (baseY, 03 6.4), then the section's postTransform (spec 02's seam) applied here, so callers never
 * apply it again. At u = k/cols the point equals edges[k] (the 1e-12 guards (k/cols)·cols < k).
 * Side effects: none.
 * @param {import('./WallLayout.js').SectionLayout} sl
 * @param {number} u
 * @param {number} v
 * @returns {{x: number, y: number, z: number}}
 */
export function wallPointFromBaseUv(sl, u, v) {
  const cols = sl.section.panelCols;
  const rows = sl.section.panelRows;
  const cf = u * cols;
  const k = Math.max(0, Math.min(cols - 1, Math.floor(cf + 1e-12)));
  const f = cf - k;
  const e0 = sl.edges[k];
  const e1 = sl.edges[k + 1];
  const p = {
    x: e0.x + f * (e1.x - e0.x),
    y: (sl.baseY ?? 0) + v * rows * sl.panelH,
    z: e0.z + f * (e1.z - e0.z),
  };
  return sl.postTransform ? transformPoint(sl.postTransform, p) : p;
}

/**
 * The derived pixel-map blocks of 04 4.2: per section `pixel_map` (LED px, top-left origin; the ZIP texture density of
 * sectionPxPerLed, never the viewport budget) and the top-level `atlas` (the panel-ID image's LED and px size;
 * texture_file only when given, the ZIP variant with the atlas written).
 * Side effects: none.
 * @param {import('./WallLayout.js').WallLayout} layout
 * @param {{totalLedX: number, totalLedY: number, pxPerLed: number, entries: object[]}} atlas  computeAtlas() of the sections
 * @param {{atlasFile?: string|null}} [options]
 * @returns {{sections: object[], atlas: object}}
 */
export function pixelMapJson(layout, atlas, { atlasFile = null } = {}) {
  const sections = layout.sections.map((sl, i) => {
    const { W, H } = sectionCanvasSize(sl.section);
    const p = sectionPxPerLed(W, H);
    return {
      width_led: W, height_led: H, atlas_x_led: atlas.entries[i].ledOffsetX, atlas_y_led: atlas.totalLedY - H,
      texture_px_per_led: p, texture_width_px: W * p, texture_height_px: H * p,
    };
  });
  const block = {
    width_led: atlas.totalLedX, height_led: atlas.totalLedY, png_px_per_led: atlas.pxPerLed,
    png_width_px: atlas.totalLedX * atlas.pxPerLed, png_height_px: atlas.totalLedY * atlas.pxPerLed,
  };
  if (atlasFile) block.texture_file = atlasFile;
  return { sections, atlas: block };
}

/**
 * The hover description of a base UV (6.9): the panel label (columns continued from startCol), the pixel and LED, the
 * atlas LED pixel, the final UV under the (export) plan and the sampled source pixel (null when the transformed UV lies
 * outside [0, 1)).
 * Side effects: none.
 * @param {{sl: import('./WallLayout.js').SectionLayout, startCol: number, atlas: object, entry: object,
 *          plan: import('./UvMapper.js').SectionUvPlan|null, baseU: number, baseV: number}} args
 * @returns {{sectionId: *, sectionIndex: number, name: *, label: string, col: number, row: number, lx: number,
 *            lyTop: number, px: number, pyTop: number, W: number, H: number, gx: number, gy: number, baseU: number,
 *            baseV: number, finalU: number, finalV: number, sourcePx: {x: number, y: number}|null}}
 */
export function describeHit({ sl, startCol, atlas, entry, plan, baseU, baseV }) {
  const s = sl.section;
  const { W, H } = sectionCanvasSize(s);
  const pix = baseUvToPixel(s, baseU, baseV);
  const { gx, gy } = atlasLedPixel(atlas, entry, s, pix.px, pix.pyTop);
  const [finalU, finalV] = plan ? sectionUv(plan, baseU, baseV) : [baseU, baseV];
  const T = plan && plan.transform ? applyUv(plan.transform, W, H, baseU, baseV) : [baseU, baseV];
  const Ws = plan ? plan.sourceW : W;
  const Hs = plan ? plan.sourceH : H;
  const inside = T[0] >= 0 && T[0] < 1 && T[1] >= 0 && T[1] < 1;
  return {
    sectionId: sl.sectionId, sectionIndex: sl.sectionIndex, name: s.name, label: panelLabel(startCol + pix.col, pix.row),
    col: pix.col, row: pix.row, lx: pix.lx, lyTop: pix.lyTop, px: pix.px, pyTop: pix.pyTop, W, H, gx, gy,
    baseU, baseV, finalU, finalV, sourcePx: inside ? { x: Math.floor(T[0] * Ws), y: Math.floor((1 - T[1]) * Hs) } : null,
  };
}
