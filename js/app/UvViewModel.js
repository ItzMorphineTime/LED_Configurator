/**
 * @module app/UvViewModel
 * The UV viewer's state and data (docs/improvements/04-uvs-uv-editor.md 5.2-5.4, 6.11; UV-11, UV-12): the viewer state
 * (open, viewed section, pin, background, space, aspect; in memory for the session, the owner's path-B decision: no
 * app/Prefs.js), the SectionUvData of the viewed section (its display plan with the transform applied, so the viewer
 * shows the transform even while the wall shows LED-mask content), the status chips and the background canvases
 * (panel IDs within the 4 MP preview budget, the LED tile, the read-only atlas), cached per section and kind until the
 * next rebuild or rename. It emits the viewer events; UvController drives it and UVViewer mirrors it.
 * Legacy source: none (Feature 4).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

import { Events } from '../core/EventBus.js';
import {
  planSectionUv, sectionUv, sourceSize, islandCorners, islandBounds, pixelAccuracy, placeInRect,
} from '../geometry/UvMapper.js';
import { canvasFits } from '../geometry/TextureAtlas.js';

/** The viewer backgrounds (04 3.3; 'hdri' arrives with spec 05). */
export const UV_BACKGROUNDS = Object.freeze(['panelIds', 'ledSim', 'checker', 'none']);
/** The viewer spaces: the section's own 0..1 space, or the read-only atlas (Combined + atlas layout only). */
export const UV_SPACES = Object.freeze(['section', 'atlas']);
/** The viewer aspects: auto = texture unless the source is longer than 8:1, then square (04 3.3). */
export const UV_ASPECTS = Object.freeze(['auto', 'texture', 'square']);
/** The background preview budget of 04 6.11 (pixels). */
const PREVIEW_BUDGET_PX = 4e6;

/**
 * The background canvas scale of 04 6.11: s0 = clamp(floor(4096 / max(W, H)), 1, 4) (the legacy default) and
 * s = min(s0, sqrt(4e6 / (W·H))), so the canvas stays within 4 MP for every section size (no lower floor).
 * Side effects: none.
 * @param {number} W
 * @param {number} H
 * @returns {{s0: number, s: number, downscaled: boolean}}
 */
export function backgroundScale(W, H) {
  const s0 = Math.max(1, Math.min(4, Math.floor(4096 / Math.max(W, H))));
  const s = Math.min(s0, Math.sqrt(PREVIEW_BUDGET_PX / (W * H)));
  return { s0, s, downscaled: s < s0 };
}

/** Whether every count of a section is a positive integer (the viewer's error state otherwise, 04 3.8). */
const validCounts = (s) => [s.panelCols, s.panelRows, s.ledX, s.ledY].every((n) => Number.isInteger(n) && n >= 1);

/** The UV grid of a plan: (cols+1)·(rows+1) (u, v) pairs, row-major from row 0 = bottom. */
function gridUvs(plan, cols, rows) {
  const uvs = new Float64Array((cols + 1) * (rows + 1) * 2);
  const out = [0, 0];
  let k = 0;
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      sectionUv(plan, col / cols, row / rows, out);
      uvs[k++] = out[0];
      uvs[k++] = out[1];
    }
  }
  return uvs;
}

/** The UV viewer's view model. */
export class UvViewModel {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../render/textures/PanelIdRenderer.js').PanelIdRenderer} */
  #panelIds;
  /** @type {import('../render/textures/LEDPixelTextureFactory.js').LEDPixelTextureFactory} */
  #ledTiles;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  #open = false;
  /** @type {*} the viewed section's id (null before the first open) */
  #sectionId = null;
  #pinned = false;
  #background = 'panelIds';
  #space = 'section';
  #aspect = 'auto';
  /** @type {number} the viewed section's index at the last refresh (the "nearest section" after a delete) */
  #viewedIndex = 0;
  /** @type {Map<string, {canvas: HTMLCanvasElement|null, downscaled: boolean}>} panel-ID backgrounds per section */
  #bgCache = new Map();
  /** @type {HTMLCanvasElement|null|undefined} the atlas background (undefined: not drawn since the last rebuild) */
  #atlasCanvas = undefined;

  /**
   * Stores the collaborators only (R4).
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          panelIds: import('../render/textures/PanelIdRenderer.js').PanelIdRenderer,
   *          ledTiles: import('../render/textures/LEDPixelTextureFactory.js').LEDPixelTextureFactory,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ project, panelIds, ledTiles, bus }) {
    this.#project = project;
    this.#panelIds = panelIds;
    this.#ledTiles = ledTiles;
    this.#bus = bus;
  }

  /** Side effects: none. @returns {boolean} */
  get open() { return this.#open; }
  /** Side effects: none. @returns {*} */
  get sectionId() { return this.#sectionId; }
  /** Side effects: none. @returns {boolean} */
  get pinned() { return this.#pinned; }
  /** Side effects: none. @returns {string} */
  get background() { return this.#background; }
  /** Side effects: none. @returns {string} */
  get space() { return this.#space; }
  /** Side effects: none. @returns {string} */
  get aspect() { return this.#aspect; }
  /** Side effects: none. @returns {number} the viewed section's index at the last refresh */
  get viewedIndex() { return this.#viewedIndex; }

  /**
   * Side effects: none.
   * @returns {{open: boolean, sectionId: *, pinned: boolean, background: string, space: string, aspect: string}}
   */
  get state() {
    return {
      open: this.#open, sectionId: this.#sectionId, pinned: this.#pinned, background: this.#background,
      space: this.#space, aspect: this.#aspect,
    };
  }

  /** Side effects: emits UV_VIEWER_CHANGED iff the value changed. @param {boolean} on */
  setOpen(on) {
    if (this.#open === !!on) return;
    this.#open = !!on;
    this.#emitViewer();
  }

  /** Side effects: emits UV_VIEWER_CHANGED iff the value changed. @param {*} id */
  setSection(id) {
    if (Object.is(this.#sectionId, id)) return;
    this.#sectionId = id;
    this.#emitViewer();
  }

  /** Side effects: emits UV_VIEWER_CHANGED iff the value changed. @param {boolean} on */
  setPinned(on) {
    if (this.#pinned === !!on) return;
    this.#pinned = !!on;
    this.#emitViewer();
  }

  /** Side effects: emits UV_VIEWER_CHANGED iff the value changed. @param {string} kind  one of UV_BACKGROUNDS */
  setBackground(kind) {
    if (!UV_BACKGROUNDS.includes(kind) || this.#background === kind) return;
    this.#background = kind;
    this.#emitViewer();
  }

  /** Side effects: emits UV_VIEWER_CHANGED iff the value changed. @param {string} space  one of UV_SPACES */
  setSpace(space) {
    if (!UV_SPACES.includes(space) || this.#space === space) return;
    this.#space = space;
    this.#emitViewer();
  }

  /** Side effects: emits UV_VIEWER_CHANGED iff the value changed. @param {string} kind  one of UV_ASPECTS */
  setAspect(kind) {
    if (!UV_ASPECTS.includes(kind) || this.#aspect === kind) return;
    this.#aspect = kind;
    this.#emitViewer();
  }

  /** Side effects: emits UV_VIEWER_CHANGED with the state. */
  #emitViewer() {
    this.#bus.emit(Events.UV_VIEWER_CHANGED, this.state);
  }

  /**
   * Recomputes the viewed section's SectionUvData and emits UV_DATA_CHANGED, iff the viewer is open. backgroundDirty
   * (a rebuild) first drops the cached background canvases, also while closed; drags and field previews pass false, so
   * they never re-render a texture.
   * Side effects: may draw background canvases; emits UV_DATA_CHANGED iff open.
   * @param {{layout: import('../geometry/WallLayout.js').WallLayout, atlas: object}|null} cache  the last rebuild's
   * @param {{backgroundDirty?: boolean, history?: {canUndo: boolean, canRedo: boolean, undoLabel: string|null,
   *          redoLabel: string|null}|null}} [options]
   */
  refresh(cache, { backgroundDirty = true, history = null } = {}) {
    if (backgroundDirty) {
      this.#bgCache.clear();
      this.#atlasCanvas = undefined;
    }
    if (!this.#open || !cache) return;
    this.#bus.emit(Events.UV_DATA_CHANGED, { sectionId: this.#sectionId, data: this.#compute(cache, history) });
  }

  /**
   * Side effects: emits UV_HOVER_CHANGED.
   * @param {'wall'|'uv-canvas'} source
   * @param {object|null} hit  a HitDescription (PixelMap.describeHit plus ledX, ledY, viewU, viewV) or null
   * @param {{x: number, y: number, z: number}[]|null} [panelCorners3D]
   */
  publishHover(source, hit, panelCorners3D = null) {
    this.#bus.emit(Events.UV_HOVER_CHANGED, { source, hit, panelCorners3D: hit ? panelCorners3D : null });
  }

  /**
   * The SectionUvData of 04 5.4 for the viewed section (or a message for the empty and error states, 3.8).
   * @param {{layout: object, atlas: object}} cache
   * @param {object|null} history
   * @returns {object}
   */
  #compute({ layout, atlas }, history) {
    const project = this.#project;
    const uv = project.uv;
    const base = {
      sectionId: this.#sectionId, sections: layout.sections.map((sl) => ({ id: sl.sectionId, name: sl.section.name })),
      history, meshMode: project.meshMode, combinedLayout: uv.combinedLayout, panelUvs: uv.panelUvs,
      content: project.display.content, atlasAvailable: project.meshMode === 'combined' && uv.combinedLayout === 'atlas',
      space: this.#space, message: null,
    };
    const i = layout.sections.findIndex((sl) => Object.is(sl.sectionId, this.#sectionId));
    if (i < 0) return { ...base, message: 'Select a wall section: click it in the viewport, or pick one above.' };
    this.#viewedIndex = i;
    const sl = layout.sections[i];
    const s = sl.section;
    const head = { ...base, sectionIndex: i, name: s.name, color: s.color };
    if (!validCounts(s)) {
      return { ...head, message: `${s.name} has non-integer panel or pixel counts. Fix them in the section card to edit UVs.` };
    }
    const cols = s.panelCols;
    const rows = s.panelRows;
    const W = cols * s.ledX;
    const H = rows * s.ledY;
    const t = s.uvTransform;
    const [sourceW, sourceH] = sourceSize(t, W, H);
    // The display plan: section space (no atlas rect), the transform applied whatever the content (5.3).
    const plan = planSectionUv(sl, i, { atlas, settings: uv, meshMode: 'section', applyTransforms: true });
    const entry = atlas.entries[i];
    const bounds = islandBounds(t, W, H);
    const accuracy = pixelAccuracy(t, W, H);
    const notices = this.#notices(t, sourceW, sourceH, bounds, accuracy);
    const data = {
      ...head, cols, rows, ledX: s.ledX, ledY: s.ledY, W, H, sourceW, sourceH, startCol: entry.startCol,
      transform: { ...t }, summary: t.summaryFor(W, H), uvs: gridUvs(plan, cols, rows),
      perPanel: project.meshMode === 'panel' && uv.panelUvs === 'panel', island: islandCorners(t, W, H), bounds,
      atlasRect: { offsetU: entry.uvOffsetX, widthU: entry.uvWidth, heightV: entry.uvHeight }, accuracy, notices,
      background: null, atlasView: null,
    };
    if (this.#space === 'atlas' && base.atlasAvailable) {
      data.atlasView = this.#atlasView(layout, atlas, i, t, W, H);
    } else {
      data.background = this.#backgroundOf(s, i, entry.startCol, W, H, t, notices);
    }
    return data;
  }

  /**
   * The status chips of 04 3.7 that depend on the data (the zoom-dependent LED chip is the viewer's).
   * @returns {{kind: 'ok'|'warn'|'info', text: string, action?: string, actionLabel?: string}[]}
   */
  #notices(t, sourceW, sourceH, bounds, accuracy) {
    const project = this.#project;
    const out = [];
    if (accuracy.kind === 'exact') {
      out.push({ kind: 'ok', text: `● Pixel-accurate · source ${sourceW}×${sourceH}` });
    } else if (accuracy.rotatedGrid) {
      out.push({ kind: 'warn', text: `▲ Resampled · rotated pixel grid (${Number(t.rotation.toFixed(1))}°)` });
    } else if (accuracy.ratioU === 1 && accuracy.ratioV === 1) {
      out.push({ kind: 'warn', text: '▲ Resampled · offset between source pixels' });
    } else {
      out.push({ kind: 'warn', text: `▲ Resampled · 1 LED = ${accuracy.ratioU.toFixed(2)} × ${accuracy.ratioV.toFixed(2)} source px` });
    }
    const eps = 1e-9;
    const outside = bounds.minU < -eps || bounds.minV < -eps || bounds.maxU > 1 + eps || bounds.maxV > 1 + eps;
    if (outside) out.push({ kind: 'warn', text: '⚠ Outside 0–1 (edges clamp)' });
    if (outside && project.meshMode === 'combined' && project.uv.combinedLayout === 'atlas') {
      out.push({ kind: 'warn', text: '⚠ Bleeds into neighbouring sections' });
    }
    const content = project.display.content;
    if (content === 'color') {
      out.push({ kind: 'info', text: 'ⓘ Wall shows colours: UV edits are not visible on the wall', action: 'showPanelIds', actionLabel: 'Show Panel IDs' });
    } else if (content === 'ledSim') {
      out.push({ kind: 'info', text: 'ⓘ LED simulation shows physical pixels; UV transform not applied' });
    }
    if (project.meshMode === 'panel' && project.uv.panelUvs === 'panel') {
      out.push({ kind: 'info', text: 'ⓘ Per-panel UVs: transform not applied in Panel mode' });
    }
    return out;
  }

  /**
   * The section-space background (04 6.11): the panel-ID section canvas within the preview budget (cached), the LED tile
   * (no texture), the checker, or none. A canvas that would not fit the browser limits gives the checker.
   * @returns {{kind: string, canvas?: HTMLCanvasElement, led?: {tile: HTMLCanvasElement, ledsX: number, ledsY: number}}}
   */
  #backgroundOf(s, i, startCol, W, H, t, notices) {
    const kind = this.#background;
    const stretched = () => {
      if (t.sourceRotated && W !== H) {
        const [Ws, Hs] = sourceSize(t, W, H);
        notices.push({ kind: 'info', text: `ⓘ Background stretched to the ${Ws}×${Hs} source` });
      }
    };
    if (kind === 'ledSim') {
      stretched();
      return { kind, led: { tile: this.#ledTiles.tileCanvas(s.color), ledsX: W, ledsY: H } };
    }
    if (kind !== 'panelIds') return { kind };
    const key = String(s.id);
    let entry = this.#bgCache.get(key);
    if (!entry) {
      const { s: scale, downscaled } = backgroundScale(W, H);
      const canvas = canvasFits(Math.round(W * scale), Math.round(H * scale))
        ? this.#panelIds.sectionCanvas(s, i, scale, startCol) : null;
      entry = { canvas, downscaled: downscaled || !canvas };
      this.#bgCache.set(key, entry);
    }
    if (entry.downscaled) notices.push({ kind: 'info', text: 'ⓘ Preview downscaled' });
    if (!entry.canvas) return { kind: 'checker' };
    stretched();
    return { kind, canvas: entry.canvas };
  }

  /**
   * The read-only Atlas space (04 3.3): the atlas canvas (panel-ID background only), every section's rect, and the
   * viewed section's grid and island placed in its rect.
   * @returns {{canvas: HTMLCanvasElement|null, rects: object[], uvs: Float64Array, island: number[][], W: number, H: number}}
   */
  #atlasView(layout, atlas, i, t, W, H) {
    if (this.#background === 'panelIds' && this.#atlasCanvas === undefined) {
      this.#atlasCanvas = this.#panelIds.atlasCanvas(layout.sections.map((sl) => sl.section), atlas);
    }
    const sl = layout.sections[i];
    const plan = planSectionUv(sl, i, {
      atlas, settings: { combinedLayout: 'atlas', panelUvs: 'section' }, meshMode: 'combined', applyTransforms: true,
    });
    const rects = atlas.entries.map((e, k) => ({
      sectionId: layout.sections[k].sectionId, offsetU: e.uvOffsetX, widthU: e.uvWidth, heightV: e.uvHeight,
    }));
    return {
      canvas: this.#background === 'panelIds' ? this.#atlasCanvas : null, rects,
      uvs: gridUvs(plan, sl.section.panelCols, sl.section.panelRows),
      island: islandCorners(t, W, H).map(([u, v]) => placeInRect(plan.rect, u, v)), W: atlas.totalLedX, H: atlas.totalLedY,
    };
  }
}
