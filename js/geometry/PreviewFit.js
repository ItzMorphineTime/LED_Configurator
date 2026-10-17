/**
 * @module geometry/PreviewFit
 * The camera preview's geometry (07 R2; docs/improvements/07-platform-foundations.md 3.6 and 6.1, 08 6.14): the per-axis
 * clamps of the preview window (B-L32), the letterbox of the filmback aspect inside the preview rectangle (B-M9), and the
 * integer device-pixel rectangles of the scissor pass that the main renderer draws the preview with.
 * Legacy source: index.html@cd3fd3f 3664-3692 (the resize clamps this replaces).
 * Layer: geometry (pure: may import domain, legacy; no THREE, no DOM).
 */

import { clamp } from '../domain/rules.js';

/** The preview window's outer size limits in CSS px, each axis on its own (08 6.14, 07 3.6). */
export const PREVIEW_SIZE_LIMITS = Object.freeze({ minWidth: 200, maxWidth: 800, minHeight: 120, maxHeight: 600 });

/** Windows smaller than this (CSS px) are not drawn (07 6.1). */
const MIN_DRAWN = Object.freeze({ width: 50, height: 30 });

/**
 * Clamps a window size to PREVIEW_SIZE_LIMITS, each axis on its own (B-L32: legacy re-derived the width from the clamped
 * height without clamping it again, so a 100 x 1 mm filmback gave a 12,000 px window).
 * Side effects: none.
 * @param {number} w  outer width, CSS px
 * @param {number} h  outer height, CSS px
 * @returns {{w: number, h: number}}
 */
export function clampPreviewSize(w, h) {
  const L = PREVIEW_SIZE_LIMITS;
  return { w: clamp(w, L.minWidth, L.maxWidth), h: clamp(h, L.minHeight, L.maxHeight) };
}

/**
 * The largest rectangle of aspect `aspect` (width / height) centred in a boxW x boxH box: bars left and right when the
 * box is wider than the aspect, top and bottom otherwise (B-M9: the image is never stretched). An aspect that is not a
 * positive finite number fills the box.
 * Side effects: none.
 * @param {number} boxW
 * @param {number} boxH
 * @param {number} aspect
 * @returns {{vx: number, vy: number, vw: number, vh: number}}  offsets from the box's top left, same units as the box
 */
export function letterboxRect(boxW, boxH, aspect) {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return { vx: 0, vy: 0, vw: boxW, vh: boxH };
  let vw;
  let vh;
  if (boxW / boxH > aspect) {
    vw = boxH * aspect;
    vh = boxH;
  } else {
    vw = boxW;
    vh = boxW / aspect;
  }
  return { vx: (boxW - vw) / 2, vy: (boxH - vh) / 2, vw, vh };
}

/**
 * The CSS value that three.js's setViewport / setScissor (which multiply by the pixel ratio and floor) turn back into
 * exactly `n` device pixels (07 6.1).
 * Side effects: none.
 * @param {number} n  device px (an integer)
 * @param {number} dpr  the renderer's pixel ratio
 * @returns {number}
 */
export const cssForDevicePx = (n, dpr) => (n + 0.5) / dpr;

/**
 * 07 6.1 in integer device pixels: the preview rectangle (the client rect of the window's placeholder, clipped to the main
 * canvas) and the letterboxed image inside it, both in WebGL's convention (x from the left, y from the BOTTOM of the
 * drawing buffer). The y flip uses the integer drawing-buffer height H, so the image is never off by one row.
 * Side effects: none.
 * @param {{canvasRect: {left: number, top: number}, contentRect: {left: number, top: number, right: number,
 *          bottom: number}, dpr: number, size: {x: number, y: number}, aspect: number}} p
 *   canvasRect: the main canvas's client rect; contentRect: the preview rectangle's client rect (CSS px, fractional);
 *   dpr: renderer.getPixelRatio(); size: renderer.getSize() (the integer CSS size the drawing buffer was made from);
 *   aspect: the filmback aspect
 * @returns {null|{W: number, H: number, box: {x: number, y: number, w: number, h: number},
 *          image: {x: number, y: number, w: number, h: number}}}  null when the clipped rectangle is smaller than
 *   50 x 30 CSS px (tiny or off-canvas windows are not drawn)
 */
export function previewDeviceRects({ canvasRect: c, contentRect: p, dpr, size, aspect }) {
  const W = Math.floor(size.x * dpr);
  const H = Math.floor(size.y * dpr);
  const X0 = Math.max(Math.round((p.left - c.left) * dpr), 0);
  const X1 = Math.min(Math.round((p.right - c.left) * dpr), W);
  const Y0 = Math.max(Math.round((p.top - c.top) * dpr), 0);
  const Y1 = Math.min(Math.round((p.bottom - c.top) * dpr), H);
  const w = X1 - X0;
  const h = Y1 - Y0;
  if (!(w >= MIN_DRAWN.width * dpr) || !(h >= MIN_DRAWN.height * dpr)) return null;
  const fit = letterboxRect(w, h, aspect);
  const vw = Math.round(fit.vw);
  const vh = Math.round(fit.vh);
  const vx = X0 + Math.floor((w - vw) / 2);
  const vyTop = Y0 + Math.floor((h - vh) / 2);
  return { W, H, box: { x: X0, y: H - Y1, w, h }, image: { x: vx, y: H - (vyTop + vh), w: vw, h: vh } };
}
