/**
 * @module geometry/UvMapper
 * The UV transform maths of spec 04 (docs/improvements/04-uvs-uv-editor.md 6.3-6.8, UV-6): the source-pixel transform
 * and its inverse, the per-section UV plans every consumer reads (viewport `uv`, OBJ `vt`, glTF TEXCOORD_0: one
 * function, sectionUv, produces all three through WallMeshBuilder), the presets and quarter turns, the pixel-accuracy
 * classification and the drag maths of the UV editor.
 * Conventions (04 6.1): section base UV (u, v) with u along the column order and v up; section pixels P = (u·W, v·H)
 * with W = panelCols·ledX, H = panelRows·ledY; source pixels X = (u'·Ws, v'·Hs) with [Ws, Hs] = sourceSize(t, W, H).
 * The transform is X − X_c = R(θ)·diag(fu·su, fv·sv)·(P − P_c): it places the island (the wall's footprint in the
 * source), so a positive θ turns the island counter-clockwise and the image on the wall clockwise.
 * Identity is short-circuited everywhere (04 R5): an identity transform returns (u, v) untouched, so identity outputs
 * are bit-identical to the untransformed ones.
 * Legacy source: none (Feature 4).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { UvTransform } from '../domain/UvSettings.js';
import { computeAtlas } from './TextureAtlas.js';

/** clamp without importing domain/rules into every hot path. */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * A SectionUvPlan (04 5.3): what one section's UVs are in one consumer.
 * @typedef {{a: number, b: number, cc: number, d: number}} UvLinear  the 2x2 part of 6.3
 * @typedef {{offsetU: number, widthU: number, heightV: number}} AtlasRect
 * @typedef {{sectionId: *, sectionIndex: number, transform: UvTransform|null, linear: UvLinear|null, W: number, H: number,
 *            sourceW: number, sourceH: number, rect: AtlasRect|null, panelUvs: 'section'|'panel', valid: boolean,
 *            deltas?: import('../domain/UvSettings.js').UvVertexEdits|null}} SectionUvPlan
 *   transform / linear null: untransformed base UVs (identity for this W x H, LED-mask content, invalid counts, or the
 *   legacy per-panel UVs); rect: the atlas placement (Combined + atlas layout only); valid false: non-integer counts;
 *   deltas: the section's vertex edits, added to the grid vertices' base UVs before the transform (null or absent: none;
 *   null in exactly the cases where transform is null for any reason but the identity, and for edits made for another
 *   grid size).
 */

/** The zero delta of a vertex without an edit. */
const ZERO = Object.freeze([0, 0]);

/**
 * Content that shows physical pixels and therefore ignores UV transforms (04 D4, 6.5): LED simulation and spec 05's
 * HDRI LED mask.
 * Side effects: none.
 * @param {string} content  a DisplaySettings.content value
 * @returns {boolean}
 */
export function isLedMaskContent(content) {
  return content === 'ledSim' || content === 'hdri';
}

/**
 * [cos, sin] of an angle in degrees, exact at the multiples of 90 (04 6.3: Math.cos(π/2) is 6.1e-17).
 * Side effects: none.
 * @param {number} deg
 * @returns {[number, number]}
 */
export function cosSinDeg(deg) {
  const d = UvTransform.normalizeRotation(deg);
  if (d === 0) return [1, 0];
  if (d === 90) return [0, 1];
  if (d === 180) return [-1, 0];
  if (d === -90) return [0, -1];
  const r = (d * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

/**
 * The source size of a transform (04 6.3): [H, W] when t.sourceRotated, else [W, H] (also for t null).
 * Side effects: none.
 * @param {UvTransform|null} t
 * @param {number} W
 * @param {number} H
 * @returns {[number, number]} [Ws, Hs]
 */
export function sourceSize(t, W, H) {
  return t && t.sourceRotated ? [H, W] : [W, H];
}

/**
 * The linear part of 6.3 for any transform (no identity short-circuit). The k ratios are computed first, so a ratio of
 * equal sizes is exactly 1 (04 6.14).
 * @param {UvTransform} t
 * @param {number} W
 * @param {number} H
 * @returns {UvLinear}
 */
function linearOf(t, W, H) {
  const [c, s] = cosSinDeg(t.rotation);
  const fu = t.flipU ? -1 : 1;
  const fv = t.flipV ? -1 : 1;
  const su = t.scaleU;
  const sv = t.scaleV;
  const [Ws, Hs] = sourceSize(t, W, H);
  const kWW = W / Ws;
  const kHW = H / Ws;
  const kWH = W / Hs;
  const kHH = H / Hs;
  return { a: c * su * fu * kWW, b: -s * sv * fv * kHW, cc: s * su * fu * kWH, d: c * sv * fv * kHH };
}

/**
 * The linear part of 6.3, or null for no transform or the identity of this size.
 * Side effects: none.
 * @param {UvTransform|null} t
 * @param {number} W
 * @param {number} H
 * @returns {UvLinear|null}
 */
export function uvLinear(t, W, H) {
  if (t === null || t === undefined || t.isIdentityFor(W, H)) return null;
  return linearOf(t, W, H);
}

/**
 * u' = a·(u − 0.5) + b·(v − 0.5) + 0.5 + ou, v' = cc·(u − 0.5) + d·(v − 0.5) + 0.5 + ov, in exactly this order (6.3).
 * @param {UvLinear} L
 * @param {number} ou
 * @param {number} ov
 * @param {number} u
 * @param {number} v
 * @param {number[]} out
 * @returns {number[]} out
 */
function applyLinear(L, ou, ov, u, v, out) {
  const du = u - 0.5;
  const dv = v - 0.5;
  out[0] = L.a * du + L.b * dv + 0.5 + ou;
  out[1] = L.cc * du + L.d * dv + 0.5 + ov;
  return out;
}

/**
 * The transformed UV of a base UV (6.3); the identity (or t null) returns u, v untouched.
 * Side effects: writes `out`.
 * @param {UvTransform|null} t
 * @param {number} W
 * @param {number} H
 * @param {number} u
 * @param {number} v
 * @param {number[]} [out]
 * @returns {number[]} out
 */
export function applyUv(t, W, H, u, v, out = [0, 0]) {
  if (t === null || t === undefined || t.isIdentityFor(W, H)) {
    out[0] = u;
    out[1] = v;
    return out;
  }
  return applyLinear(linearOf(t, W, H), t.offsetU, t.offsetV, u, v, out);
}

/**
 * The base UV of a transformed UV (the inverse of 6.3; spec 05's bake calls exactly this signature); the identity (or t
 * null) returns u, v untouched.
 * Side effects: writes `out`.
 * @param {UvTransform|null} t
 * @param {number} W
 * @param {number} H
 * @param {number} u  u'
 * @param {number} v  v'
 * @param {number[]} [out]
 * @returns {number[]} out
 */
export function invertUv(t, W, H, u, v, out = [0, 0]) {
  if (t === null || t === undefined || t.isIdentityFor(W, H)) {
    out[0] = u;
    out[1] = v;
    return out;
  }
  const [c, s] = cosSinDeg(t.rotation);
  const fu = t.flipU ? -1 : 1;
  const fv = t.flipV ? -1 : 1;
  const [Ws, Hs] = sourceSize(t, W, H);
  const x = (u - 0.5 - t.offsetU) * Ws;
  const y = (v - 0.5 - t.offsetV) * Hs;
  const qx = c * x + s * y;
  const qy = -s * x + c * y;
  out[0] = qx / (fu * t.scaleU * W) + 0.5;
  out[1] = qy / (fv * t.scaleV * H) + 0.5;
  return out;
}

/**
 * Places a UV in an atlas rect (6.4): u' = rect.offsetU + u · rect.widthU, v' = v · rect.heightV (the expressions of
 * 08 P2-7a, so an identity plan reproduces the pixel-accurate atlas UVs bit for bit).
 * Side effects: writes `out`.
 * @param {AtlasRect} rect
 * @param {number} u
 * @param {number} v
 * @param {number[]} [out]
 * @returns {number[]} out
 */
export function placeInRect(rect, u, v, out = [0, 0]) {
  out[0] = rect.offsetU + u * rect.widthU;
  out[1] = v * rect.heightV;
  return out;
}

/**
 * The final UV of a base UV under a plan: the transform (iff plan.transform), then the atlas rect (iff plan.rect).
 * Side effects: writes `out`.
 * @param {SectionUvPlan} plan
 * @param {number} u
 * @param {number} v
 * @param {number[]} [out]
 * @returns {number[]} out
 */
export function sectionUv(plan, u, v, out = [0, 0]) {
  if (plan.transform !== null) {
    applyLinear(plan.linear, plan.transform.offsetU, plan.transform.offsetV, u, v, out);
  } else {
    out[0] = u;
    out[1] = v;
  }
  if (plan.rect !== null) placeInRect(plan.rect, out[0], out[1], out);
  return out;
}

/**
 * The final UV of grid vertex (col, row) of a cols x rows section under a plan: the base UV (col / cols, row / rows),
 * plus the vertex's delta when plan.deltas holds one, then sectionUv. Without a delta the base UV is exactly the legacy
 * expression, so plans without edits stay bit-identical. Every consumer of the panel-corner grid writes its UVs here
 * (WallMeshBuilder's grid writer and panelUvs, the viewer's grid).
 * Side effects: writes `out`.
 * @param {SectionUvPlan} plan
 * @param {number} col  0..cols
 * @param {number} row  0..rows (0 = bottom)
 * @param {number} cols
 * @param {number} rows
 * @param {number[]} [out]
 * @returns {number[]} out
 */
export function sectionGridUv(plan, col, row, cols, rows, out = [0, 0]) {
  const e = plan.deltas;
  if (e) {
    const d = e.get(row * (cols + 1) + col);
    if (d !== undefined) return sectionUv(plan, col / cols + d[0], row / rows + d[1], out);
  }
  return sectionUv(plan, col / cols, row / rows, out);
}

/**
 * The vertex delta at a base UV inside the grid (the hover readout of a section with vertex edits): the deltas of the
 * cell's corners interpolated over the cell's triangle, split along the BL-TR diagonal like every strip mesh
 * (WallMeshBuilder.quadIndices), so a strip mode's rendered UV is reproduced exactly. Outside 0..1 the edge cells extend.
 * Side effects: writes `out`.
 * @param {import('../domain/UvSettings.js').UvVertexEdits} edits
 * @param {number} u  base u
 * @param {number} v  base v
 * @param {number[]} [out]
 * @returns {number[]} out = [du, dv]
 */
export function vertexDeltaAt(edits, u, v, out = [0, 0]) {
  const cols = edits.cols;
  const rows = edits.rows;
  const cf = u * cols;
  const rf = v * rows;
  const c = clamp(Math.floor(cf), 0, cols - 1);
  const r = clamp(Math.floor(rf), 0, rows - 1);
  const fu = cf - c;
  const fv = rf - r;
  const at = (cc, rr) => edits.get(rr * (cols + 1) + cc) ?? ZERO;
  const bl = at(c, r);
  const br = at(c + 1, r);
  const tl = at(c, r + 1);
  const tr = at(c + 1, r + 1);
  // the BL-BR-TR triangle (below the diagonal, fu >= fv) or BL-TR-TL
  const [wbl, wbr, wtr, wtl] = fu >= fv ? [1 - fu, fu - fv, fv, 0] : [1 - fv, 0, fu, fv - fu];
  out[0] = wbl * bl[0] + wbr * br[0] + wtr * tr[0] + wtl * tl[0];
  out[1] = wbl * bl[1] + wbr * br[1] + wtr * tr[1] + wtl * tl[1];
  return out;
}

/**
 * The edited base UV of a base UV: (u, v) plus vertexDeltaAt; (u, v) untouched for null edits.
 * Side effects: writes `out`.
 * @param {import('../domain/UvSettings.js').UvVertexEdits|null} edits
 * @param {number} u
 * @param {number} v
 * @param {number[]} [out]
 * @returns {number[]} out
 */
export function warpBaseUv(edits, u, v, out = [0, 0]) {
  if (!edits) {
    out[0] = u;
    out[1] = v;
    return out;
  }
  vertexDeltaAt(edits, u, v, out);
  out[0] += u;
  out[1] += v;
  return out;
}

/**
 * The inverse of warpBaseUv (the canvas hover readout): the base UV whose edited base UV is (u, v), by a search of the
 * edited grid's triangles (BL-BR-TR, BL-TR-TL per cell); the first triangle that holds the point wins where edits fold
 * the grid over itself. (u, v) untouched for null edits.
 * Side effects: none.
 * @param {import('../domain/UvSettings.js').UvVertexEdits|null} edits
 * @param {number} u  an edited base u
 * @param {number} v
 * @returns {number[]|null} [baseU, baseV], or null when no triangle holds the point
 */
export function unwarpBaseUv(edits, u, v) {
  if (!edits) return [u, v];
  const cols = edits.cols;
  const rows = edits.rows;
  const P = (col, row) => {
    const d = edits.get(row * (cols + 1) + col) ?? ZERO;
    return [col / cols + d[0], row / rows + d[1], col / cols, row / rows];
  };
  const eps = 1e-9;
  const inTriangle = (a, b, c) => {
    const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (det === 0) return null;
    const wb = ((u - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (v - a[1])) / det;
    const wc = ((b[0] - a[0]) * (v - a[1]) - (u - a[0]) * (b[1] - a[1])) / det;
    const wa = 1 - wb - wc;
    if (wa < -eps || wb < -eps || wc < -eps) return null;
    return [wa * a[2] + wb * b[2] + wc * c[2], wa * a[3] + wb * b[3] + wc * c[3]];
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const bl = P(col, row);
      const br = P(col + 1, row);
      const tl = P(col, row + 1);
      const tr = P(col + 1, row + 1);
      const hit = inTriangle(bl, br, tr) ?? inTriangle(bl, tr, tl);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * A displacement in the section's UV space (the viewer canvas) as a base-space displacement: the inverse of the
 * transform's linear part (6.3; the offset cancels in a difference), so a vertex dragged by (du, dv) on the canvas gets
 * the base delta that moves its UV by exactly (du, dv). The identity (or t null) returns (du, dv) untouched.
 * Side effects: writes `out`.
 * @param {UvTransform|null} t
 * @param {number} W
 * @param {number} H
 * @param {number} du
 * @param {number} dv
 * @param {number[]} [out]
 * @returns {number[]} out
 */
export function uvDeltaToBase(t, W, H, du, dv, out = [0, 0]) {
  const L = uvLinear(t, W, H);
  if (L === null) {
    out[0] = du;
    out[1] = dv;
    return out;
  }
  const det = L.a * L.d - L.b * L.cc;
  out[0] = (L.d * du - L.b * dv) / det;
  out[1] = (L.a * dv - L.cc * du) / det;
  return out;
}

/**
 * The combined canvas of the glTF second UV channel (TEXCOORD_1; the owner's request of 2026-10-31, after the reference
 * LED_Wall_Gen.blend's "UVMap_Combined"): every section side by side in wall order along the bottom of one square
 * canvas of side W = sum of w_j pixels, with w_i = panelCols·ledX and h_i = panelRows·ledY, so the pixels stay square;
 * section i starts at x_i = sum of w_j for j < i. Five equal sections give the strips [0, 0.2] … [0.8, 1] with v in
 * [0, 0.2].
 * Side effects: none.
 * @param {{panelCols: number, panelRows: number, ledX: number, ledY: number}[]} sections  in wall order
 * @returns {{W: number, entries: {x: number, w: number, h: number}[]}|null} null when W is not positive and finite
 */
export function combinedCanvas(sections) {
  let W = 0;
  const entries = sections.map((s) => {
    const e = { x: W, w: s.panelCols * s.ledX, h: s.panelRows * s.ledY };
    W += e.w;
    return e;
  });
  return Number.isFinite(W) && W > 0 ? { W, entries } : null;
}

/**
 * Section-space UVs mapped onto the combined canvas (combinedCanvas): u1 = (x_i + u0·w_i) / W, v1 = v0·h_i / W, where
 * (u0, v0) is the section-space UV after the section's UV transform.
 * Side effects: none.
 * @param {{W: number, entries: {x: number, w: number, h: number}[]}} canvas
 * @param {number} i  the section's index in wall order
 * @param {number[]} uvs  flat u0, v0 pairs
 * @returns {number[]} a new flat array of u1, v1 pairs
 */
export function canvasUvs(canvas, i, uvs) {
  const { x, w, h } = canvas.entries[i];
  const { W } = canvas;
  const out = new Array(uvs.length);
  for (let k = 0; k < uvs.length; k += 2) {
    out[k] = (x + uvs[k] * w) / W;
    out[k + 1] = (uvs[k + 1] * h) / W;
  }
  return out;
}

/**
 * The island corners [BL, BR, TR, TL] = applyUv of (0, 0), (1, 0), (1, 1), (0, 1).
 * Side effects: none.
 * @param {UvTransform|null} t
 * @param {number} W
 * @param {number} H
 * @returns {number[][]} four new [u, v] pairs
 */
export function islandCorners(t, W, H) {
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => applyUv(t, W, H, u, v));
}

/**
 * The bounding box of the island in UV.
 * Side effects: none.
 * @param {UvTransform|null} t
 * @param {number} W
 * @param {number} H
 * @returns {{minU: number, minV: number, maxU: number, maxV: number}}
 */
export function islandBounds(t, W, H) {
  const corners = islandCorners(t, W, H);
  const us = corners.map((c) => c[0]);
  const vs = corners.map((c) => c[1]);
  return { minU: Math.min(...us), minV: Math.min(...vs), maxU: Math.max(...us), maxV: Math.max(...vs) };
}

/**
 * The plan of one layout section (6.4). The transform applies when applyTransforms is set (false for LED-mask content),
 * the counts are valid integers, the mesh is not in the legacy per-panel UV space, and the transform is not the
 * identity of the section's size; the vertex edits (deltas) under the same conditions, identity or not, when they were
 * made for the section's grid size; the atlas rect applies in the Combined + atlas layout only.
 * Side effects: none.
 * @param {import('./WallLayout.js').SectionLayout} sl
 * @param {number} sectionIndex  the index in the layout
 * @param {{atlas?: object|null, settings?: import('../domain/UvSettings.js').UvSettings|null, meshMode: string,
 *          applyTransforms: boolean}} options  atlas: computeAtlas of the layout's sections (needed for the atlas layout
 *   only); settings: Project.uv (null: the defaults)
 * @returns {SectionUvPlan}
 */
export function planSectionUv(sl, sectionIndex, { atlas = null, settings = null, meshMode, applyTransforms }) {
  const s = sl.section;
  const cols = s.panelCols;
  const rows = s.panelRows;
  const W = cols * s.ledX;
  const H = rows * s.ledY;
  const valid = Number.isInteger(cols) && cols >= 1 && Number.isInteger(rows) && rows >= 1;
  const t = s.uvTransform instanceof UvTransform ? s.uvTransform : null;
  const panelUvs = settings?.panelUvs ?? 'section';
  const perPanel = meshMode === 'panel' && panelUvs === 'panel';
  const transform = applyTransforms && valid && !perPanel && t !== null && !t.isIdentityFor(W, H) ? t : null;
  // the vertex edits follow the transform's rules (not for LED-mask content, invalid counts or per-panel UVs) and apply
  // only to the grid size they were made for (a rebuild plans before UvController drops stale edits)
  const e = s.uvVertexEdits ?? null;
  const deltas = applyTransforms && valid && !perPanel && e !== null && !e.isEmpty && e.matches(cols, rows) ? e : null;
  const [sourceW, sourceH] = sourceSize(t, W, H);
  let rect = null;
  if (meshMode === 'combined' && (settings?.combinedLayout ?? 'per-section') === 'atlas') {
    const e = atlas.entries[sectionIndex];
    rect = { offsetU: e.uvOffsetX, widthU: e.uvWidth, heightV: e.uvHeight };
  }
  return {
    sectionId: sl.sectionId, sectionIndex, transform, linear: uvLinear(transform, W, H), W, H, sourceW, sourceH, rect,
    panelUvs, valid, deltas,
  };
}

/**
 * One plan per layout section (index = sectionIndex), 04 6.4 and 6.13 step 3.
 * Side effects: none.
 * @param {{layout: import('./WallLayout.js').WallLayout, atlas?: object|null,
 *          settings?: import('../domain/UvSettings.js').UvSettings|null, meshMode: string, applyTransforms: boolean}} args
 *   atlas: computeAtlas of the layout's sections (computed here when the atlas layout needs it and none is given)
 * @returns {SectionUvPlan[]}
 */
export function planSectionUvs({ layout, atlas = null, settings = null, meshMode, applyTransforms }) {
  const needsAtlas = meshMode === 'combined' && settings?.combinedLayout === 'atlas';
  const atlasNow = atlas ?? (needsAtlas ? computeAtlas(layout.sections.map((sl) => sl.section)) : null);
  return layout.sections.map((sl, i) => planSectionUv(sl, i, { atlas: atlasNow, settings, meshMode, applyTransforms }));
}

/**
 * Fit 0–1 (6.6): θ, flips and sourceRotated kept; zero offsets; the largest uniform scale whose island's bounding box
 * lies inside [0, 1]² (it touches both edges on at least one axis).
 * Side effects: none.
 * @param {UvTransform} t
 * @param {number} W
 * @param {number} H
 * @returns {UvTransform} a new transform
 */
export function presetFit(t, W, H) {
  const unit = new UvTransform({ ...t, offsetU: 0, offsetV: 0, scaleU: 1, scaleV: 1, rotation: UvTransform.normalizeRotation(t.rotation) });
  const L = linearOf(unit, W, H);
  const A1 = Math.abs(L.a) + Math.abs(L.b);
  const B1 = Math.abs(L.cc) + Math.abs(L.d);
  const sigma = clamp(1 / Math.max(A1, B1), 0.01, 16);
  return new UvTransform({ ...unit, scaleU: sigma, scaleV: sigma });
}

/**
 * Whether t is a Fit result (6.6): zero offsets and a uniform scale equal to presetFit's within 1e-9.
 * Side effects: none.
 * @param {UvTransform} t
 * @param {number} W
 * @param {number} H
 * @returns {boolean}
 */
export function isFitResult(t, W, H) {
  const sigma = presetFit(t, W, H).scaleU;
  return t.offsetU === 0 && t.offsetV === 0 && Math.abs(t.scaleU - sigma) <= 1e-9 && Math.abs(t.scaleV - sigma) <= 1e-9;
}

/**
 * Pixel-accurate (6.6): θ rounded to a quarter turn, the source orientation that fills it (W !== H; kept when W === H),
 * unit scales, offsets rounded to whole source pixels, flips kept.
 * Side effects: none.
 * @param {UvTransform} t
 * @param {number} W
 * @param {number} H
 * @returns {UvTransform} a new transform
 */
export function presetPixelAccurate(t, W, H) {
  const theta = UvTransform.normalizeRotation(90 * Math.round(t.rotation / 90));
  const quarter = (((theta / 90) % 4) + 4) % 4;
  const sourceRotated = W !== H ? quarter % 2 === 1 : t.sourceRotated;
  const [Ws, Hs] = sourceRotated ? [H, W] : [W, H];
  return new UvTransform({
    ...t, rotation: theta, sourceRotated, scaleU: 1, scaleV: 1,
    offsetU: Math.round(t.offsetU * Ws) / Ws, offsetV: Math.round(t.offsetV * Hs) / Hs,
  });
}

/**
 * Turn the feed (6.6): dir +1 turns the image on the wall clockwise (the island counter-clockwise): θ + 90·dir, the
 * source orientation toggled iff W !== H; scales, flips and offsets kept.
 * Side effects: none.
 * @param {UvTransform} t
 * @param {1|-1} dir
 * @param {number} W
 * @param {number} H
 * @returns {UvTransform} a new transform
 */
export function quarterTurn(t, dir, W, H) {
  return new UvTransform({
    ...t, rotation: UvTransform.normalizeRotation(t.rotation + 90 * dir),
    sourceRotated: W !== H ? !t.sourceRotated : t.sourceRotated,
  });
}

/**
 * The pixel-accuracy classification of 6.7.
 * Side effects: none.
 * @param {UvTransform} t
 * @param {number} W
 * @param {number} H
 * @returns {{kind: 'exact'|'resampled', rotatedGrid: boolean, ratioU: number, ratioV: number, sourceW: number,
 *            sourceH: number, fills: boolean}}
 */
export function pixelAccuracy(t, W, H) {
  const [Ws, Hs] = sourceSize(t, W, H);
  const q = UvTransform.normalizeRotation(t.rotation) / 90;
  const rotatedGrid = !Number.isInteger(q);
  const corners = islandCorners(t, W, H);
  const onGrid = (x) => Math.abs(x - Math.round(x)) <= 1e-6;
  const cornersOnGrid = corners.every(([u, v]) => onGrid(u * Ws) && onGrid(v * Hs));
  const exact = !rotatedGrid && Math.abs(t.scaleU - 1) <= 1e-9 && Math.abs(t.scaleV - 1) <= 1e-9 && cornersOnGrid;
  const b = islandBounds(t, W, H);
  const fills = Math.abs(b.minU) <= 1e-9 && Math.abs(b.minV) <= 1e-9 && Math.abs(b.maxU - 1) <= 1e-9 && Math.abs(b.maxV - 1) <= 1e-9;
  return { kind: exact ? 'exact' : 'resampled', rotatedGrid, ratioU: t.scaleU, ratioV: t.scaleV, sourceW: Ws, sourceH: Hs, fills };
}

/** The base-UV points of the drag handles (6.8): corners and edge midpoints. */
const HANDLE_POINTS = Object.freeze({
  bl: [0, 0], br: [1, 0], tr: [1, 1], tl: [0, 1], l: [0, 0.5], r: [1, 0.5], b: [0.5, 0], t: [0.5, 1],
});
/** The anchor (opposite point) of each handle. */
const OPPOSITE = Object.freeze({ bl: 'tr', br: 'tl', tr: 'bl', tl: 'br', l: 'r', r: 'l', b: 't', t: 'b' });

/**
 * Translate drag (6.8): O' = O0 + (uv1 − uv0); axisLock 'u' keeps only the u component, 'v' only the v component;
 * snap rounds the offsets to whole source pixels; both offsets are clamped to [−8, 8].
 * Side effects: none.
 * @param {UvTransform} t0  the transform at the drag start
 * @param {number} W
 * @param {number} H
 * @param {number[]} uv0  the pointer at the drag start, in section UV
 * @param {number[]} uv1  the pointer now
 * @param {{snap?: boolean, axisLock?: 'u'|'v'|null}} [options]
 * @returns {UvTransform} a new transform
 */
export function dragTranslate(t0, W, H, uv0, uv1, { snap = false, axisLock = null } = {}) {
  const [Ws, Hs] = sourceSize(t0, W, H);
  let ou = t0.offsetU + (axisLock === 'v' ? 0 : uv1[0] - uv0[0]);
  let ov = t0.offsetV + (axisLock === 'u' ? 0 : uv1[1] - uv0[1]);
  if (snap) {
    ou = Math.round(ou * Ws) / Ws;
    ov = Math.round(ov * Hs) / Hs;
  }
  return new UvTransform({ ...t0, offsetU: clamp(ou, -8, 8), offsetV: clamp(ov, -8, 8) });
}

/**
 * Scale drag from a handle (6.8), measured in source pixels in the island-rotated frame, so the opposite corner or edge
 * midpoint (the anchor) stays fixed: corner handles scale both axes, l/r only u, b/t only v; `uniform` projects onto the
 * start displacement and scales both by the same factor. Scales are clamped to [0.01, 16] (never through zero: flips
 * only through Flip) and snapped to 0.01 unless snapPercent is false; the offsets keep the anchor in place.
 * Side effects: none.
 * @param {UvTransform} t0
 * @param {number} W
 * @param {number} H
 * @param {'bl'|'br'|'tr'|'tl'|'l'|'r'|'b'|'t'} handle
 * @param {number[]} uvPointer  the pointer, in section UV
 * @param {{uniform?: boolean, snapPercent?: boolean}} [options]
 * @returns {UvTransform} a new transform
 */
export function dragScale(t0, W, H, handle, uvPointer, { uniform = false, snapPercent = true } = {}) {
  const ck = HANDLE_POINTS[handle];
  const cj = HANDLE_POINTS[OPPOSITE[handle]];
  if (!ck) throw new RangeError(`Unknown handle ${JSON.stringify(handle)}`);
  const [Ws, Hs] = sourceSize(t0, W, H);
  const [c, s] = cosSinDeg(t0.rotation);
  const fu = t0.flipU ? -1 : 1;
  const fv = t0.flipV ? -1 : 1;
  const dx = ck[0] - cj[0];
  const dy = ck[1] - cj[1];
  const Auv = applyLinear(linearOf(t0, W, H), t0.offsetU, t0.offsetV, cj[0], cj[1], [0, 0]);
  const px = uvPointer[0] * Ws - Auv[0] * Ws;
  const py = uvPointer[1] * Hs - Auv[1] * Hs;
  const d = [c * px + s * py, -s * px + c * py];   // R(−θ)·(toSrc(pointer) − A)
  let su = t0.scaleU;
  let sv = t0.scaleV;
  if (uniform) {
    const d0 = [dx !== 0 ? t0.scaleU * fu * dx * W : 0, dy !== 0 ? t0.scaleV * fv * dy * H : 0];
    const k = (d[0] * d0[0] + d[1] * d0[1]) / (d0[0] * d0[0] + d0[1] * d0[1]);
    su = k * t0.scaleU;
    sv = k * t0.scaleV;
  } else {
    if (dx !== 0) su = d[0] / (fu * dx * W);
    if (dy !== 0) sv = d[1] / (fv * dy * H);
  }
  const snap = (v) => (snapPercent ? Math.round(v * 100) / 100 : v);
  su = clamp(snap(su), 0.01, 16);
  sv = clamp(snap(sv), 0.01, 16);
  const next = new UvTransform({ ...t0, scaleU: su, scaleV: sv });
  const L = linearOf(next, W, H);
  // O' = A_uv − C − L'·(c_j − C)
  const ou = Auv[0] - 0.5 - (L.a * (cj[0] - 0.5) + L.b * (cj[1] - 0.5));
  const ov = Auv[1] - 0.5 - (L.cc * (cj[0] - 0.5) + L.d * (cj[1] - 0.5));
  next.offsetU = clamp(ou, -8, 8);
  next.offsetV = clamp(ov, -8, 8);
  return next;
}

/**
 * Rotate drag about the island centre (6.8): the angle between the start and current pointer vectors from the centre,
 * measured in source pixels (isotropic on any section aspect), added to θ0 and snapped to snapDeg (0 or null: free).
 * Offsets and the source orientation are unchanged (the centre is invariant).
 * Side effects: none.
 * @param {UvTransform} t0
 * @param {number} W
 * @param {number} H
 * @param {number[]} uv0
 * @param {number[]} uv1
 * @param {{snapDeg?: number|null}} [options]  default 15 (Shift: 90, Alt: free, chosen by the caller)
 * @returns {UvTransform} a new transform
 */
export function dragRotate(t0, W, H, uv0, uv1, { snapDeg = 15 } = {}) {
  const [Ws, Hs] = sourceSize(t0, W, H);
  const Px = (t0.offsetU + 0.5) * Ws;
  const Py = (t0.offsetV + 0.5) * Hs;
  const a = [uv0[0] * Ws - Px, uv0[1] * Hs - Py];
  const b = [uv1[0] * Ws - Px, uv1[1] * Hs - Py];
  const delta = (Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180) / Math.PI;
  let theta = UvTransform.normalizeRotation(t0.rotation + delta);
  if (snapDeg) theta = UvTransform.normalizeRotation(Math.round(theta / snapDeg) * snapDeg);
  return new UvTransform({ ...t0, rotation: theta });
}
