/**
 * @module ui/UVCanvas
 * The UV viewer's 2D canvas (docs/improvements/04-uvs-uv-editor.md 3.4, 6.11; UV-12, UV-13): the view transform (zoom
 * about a point, pan, framing of the 0-1 rect with an 8 % margin, Texture / Square / Auto aspect), the drawing (background
 * in the 0-1 rect, the dimmed outside, the source-pixel grid, the panel wireframe, the island with its handles and rotate
 * knob, the hover crosshair and panel, the drag tooltip) and the hit-testing of the handles on a general quadrilateral.
 * It draws a precomputed SectionUvData (UvViewModel) and maps between screen and UV only: every transform computation
 * stays in the controller. The island's screen corners (BL, BR, TR, TL; CSS px relative to the canvas) are written to
 * the canvas's data-island attribute after every draw, for the harness.
 * Legacy source: none (Feature 4).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

/** Hit radius of the handles and the knob (CSS px). */
const HANDLE_RADIUS = 8;
/** Distance of the rotate knob beyond the TL-TR edge (CSS px). */
const KNOB_OFFSET = 24;
/** Zoom limits relative to the framed view (04 3.4). */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 64;
/** Framing margin (04 3.4: 8 %). */
const FRAME_MARGIN = 0.08;
/** Corner handles in island order (BL, BR, TR, TL). */
const CORNERS = Object.freeze(['bl', 'br', 'tr', 'tl']);
/** Edge handles: [name, corner a, corner b] (the midpoint of a-b). */
const EDGES = Object.freeze([['l', 0, 3], ['r', 1, 2], ['b', 0, 1], ['t', 3, 2]]);
/** Resize cursors by the handle's screen angle from the centroid, in 45° buckets (y down). */
const RESIZE_CURSORS = Object.freeze(['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']);

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Point in a convex quadrilateral (04 3.4): every edge cross product has the sign of the signed area, so flipped
 * (clockwise) islands work too.
 * Side effects: none.
 * @param {number[][]} pts  four screen points
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function insideQuad(pts, x, y) {
  let area = 0;
  for (let k = 0; k < 4; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % 4];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area < 0 ? -1 : 1;
  for (let k = 0; k < 4; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % 4];
    if (((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) * sign < 0) return false;
  }
  return true;
}

/** The UV viewer canvas. */
export class UVCanvas {
  /** @type {HTMLCanvasElement} */
  #canvas;
  /** @type {Window} */
  #win;
  /** @type {object} theme.uv (UvViewerTheme) */
  #theme;
  /** @type {object|null} the SectionUvData drawn */
  #data = null;
  /** @type {'auto'|'texture'|'square'} */
  #aspect = 'auto';
  #zoom = 1;
  #panX = 0;
  #panY = 0;
  #fitW = 1;
  /** whether the user zoomed or panned since the last framing (a resize then keeps the view) */
  #userView = false;
  #cssW = 0;
  #cssH = 0;
  /** @type {{u: number, v: number, col: number|null, row: number|null}|null} */
  #hover = null;
  /** @type {{text: string, x: number, y: number}|null} */
  #tooltip = null;
  /** @type {string|null} the handle being dragged */
  #active = null;
  /** @type {{ledZoom: boolean, thin: boolean}} what the last draw found (the viewer's view chips) */
  #drawState = { ledZoom: false, thin: false };

  /**
   * Side effects: none.
   * @param {{canvas: HTMLCanvasElement, win: Window, theme: object}} deps  theme: theme.uv
   */
  constructor({ canvas, win, theme }) {
    this.#canvas = canvas;
    this.#win = win;
    this.#theme = theme;
  }

  /** Side effects: none. @returns {{ledZoom: boolean, thin: boolean}} */
  get drawState() {
    return { ...this.#drawState };
  }

  /**
   * Sets the data to draw; the view is framed again when the section or the space changed, or while the user has not
   * zoomed or panned.
   * Side effects: view state.
   * @param {object|null} data  SectionUvData
   */
  setData(data) {
    const prev = this.#data;
    this.#data = data;
    if (!this.#userView || !prev || !data || !Object.is(prev.sectionId, data.sectionId) || prev.space !== data.space) {
      this.frame();
    }
  }

  /** Side effects: view state (reframed unless the user moved the view). @param {'auto'|'texture'|'square'} kind */
  setAspect(kind) {
    if (this.#aspect === kind) return;
    this.#aspect = kind;
    this.frame();
  }

  /** Side effects: view state. @param {{u: number, v: number, col: number|null, row: number|null}|null} hover */
  setHover(hover) {
    this.#hover = hover;
  }

  /** Side effects: view state. @param {string|null} text @param {number} [x] @param {number} [y]  canvas CSS px */
  setTooltip(text, x = 0, y = 0) {
    this.#tooltip = text ? { text, x, y } : null;
  }

  /** Side effects: view state. @param {string|null} handle */
  setActiveHandle(handle) {
    this.#active = handle;
  }

  /** The resolved aspect: 'auto' is 'texture' unless the source is longer than 8:1 (04 3.3). */
  #resolvedAspect() {
    if (this.#aspect !== 'auto') return this.#aspect;
    const { w, h } = this.#sourceDims();
    return Math.max(w / h, h / w) > 8 ? 'square' : 'texture';
  }

  /** The source size the 0-1 rect stands for (the atlas in Atlas space). */
  #sourceDims() {
    const d = this.#data;
    if (!d || d.message) return { w: 1, h: 1 };
    if (d.atlasView) return { w: d.atlasView.W, h: d.atlasView.H };
    return { w: d.sourceW, h: d.sourceH };
  }

  /** unitH / unitW (6.11). */
  #ratio() {
    if (this.#resolvedAspect() === 'square') return 1;
    const { w, h } = this.#sourceDims();
    return h / w;
  }

  #unitW() {
    return this.#zoom * this.#fitW;
  }

  #unitH() {
    return this.#unitW() * this.#ratio();
  }

  /** Reads the canvas's CSS size. @returns {boolean} whether it changed */
  #measure() {
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    const changed = w !== this.#cssW || h !== this.#cssH;
    this.#cssW = w;
    this.#cssH = h;
    return changed;
  }

  /**
   * Frames the 0-1 rect with an 8 % margin (zoom 1, centred), at least KNOB_OFFSET + 10 px, so the rotate knob of an
   * unrotated island stays on the canvas.
   * Side effects: view state.
   */
  frame() {
    this.#measure();
    const r = this.#ratio();
    const margin = Math.max(FRAME_MARGIN * Math.min(this.#cssW, this.#cssH), KNOB_OFFSET + 10);
    const availW = Math.max(1, this.#cssW - 2 * margin);
    const availH = Math.max(1, this.#cssH - 2 * margin);
    this.#fitW = Math.max(1, Math.min(availW, availH / r));
    this.#zoom = 1;
    this.#panX = (this.#cssW - this.#fitW) / 2;
    this.#panY = (this.#cssH - this.#fitW * r) / 2;
    this.#userView = false;
  }

  /**
   * Zooms about a client point (the UV under it stays put), ×0.1 to ×64 of the framed view.
   * Side effects: view state.
   * @param {number} factor
   * @param {number} clientX
   * @param {number} clientY
   */
  zoomAt(factor, clientX, clientY) {
    const [x, y] = this.#local(clientX, clientY);
    const [u, v] = this.#uvAt(x, y);
    this.#zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.#zoom * factor));
    this.#panX = x - u * this.#unitW();
    this.#panY = y - (1 - v) * this.#unitH();
    this.#userView = true;
  }

  /** Pans by CSS px. Side effects: view state. @param {number} dx @param {number} dy */
  panBy(dx, dy) {
    this.#panX += dx;
    this.#panY += dy;
    this.#userView = true;
  }

  /** @returns {number[]} a client point in canvas CSS px */
  #local(clientX, clientY) {
    const r = this.#canvas.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  }

  /** @returns {number[]} the UV at canvas CSS px */
  #uvAt(x, y) {
    return [(x - this.#panX) / this.#unitW(), 1 - (y - this.#panY) / this.#unitH()];
  }

  /**
   * The view transform (6.11): screen(u, v) = (panX + u·unitW, panY + (1 - v)·unitH), in canvas CSS px.
   * Side effects: none.
   * @param {number} u
   * @param {number} v
   * @returns {number[]}
   */
  screen(u, v) {
    return [this.#panX + u * this.#unitW(), this.#panY + (1 - v) * this.#unitH()];
  }

  /**
   * Screen to UV (the inverse of the view transform). Side effects: none.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {number[]} [u, v] in the displayed space (the section's UV space, or the atlas in Atlas space)
   */
  toUv(clientX, clientY) {
    const [x, y] = this.#local(clientX, clientY);
    return this.#uvAt(x, y);
  }

  /** The island's screen geometry: corners, edge midpoints (with their enabled state), the knob, the thin-island state. */
  #geometry() {
    const d = this.#data;
    const pts = (d.atlasView ? d.atlasView.island : d.island).map(([u, v]) => this.screen(u, v));
    const bottom = dist(pts[0], pts[1]);
    const left = dist(pts[0], pts[3]);
    const thin = bottom < 16 && left < 16;
    const edges = EDGES.map(([name, a, b]) => ({ name, p: mid(pts[a], pts[b]), enabled: !thin && dist(pts[a], pts[b]) >= 24 }));
    const c = [(pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4, (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4];
    const m = mid(pts[3], pts[2]);
    let nx = -(pts[2][1] - pts[3][1]);
    let ny = pts[2][0] - pts[3][0];
    const nl = Math.hypot(nx, ny);
    if (nl === 0) {
      nx = 0;
      ny = -1;
    } else {
      nx /= nl;
      ny /= nl;
    }
    if ((m[0] - c[0]) * nx + (m[1] - c[1]) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { pts, edges, c, m, knob: [m[0] + nx * KNOB_OFFSET, m[1] + ny * KNOB_OFFSET], thin };
  }

  /** Whether the island can be edited here (data present, no message, Section space). */
  #editable() {
    const d = this.#data;
    return !!d && !d.message && !d.atlasView;
  }

  /**
   * Hit-test (04 3.4) in order: the knob, the corners, the enabled edge midpoints (8 px radius), the interior, else
   * empty canvas. A thin island keeps the interior and the knob only; the read-only Atlas space has no handles.
   * Side effects: none.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{handle: 'island'|'bl'|'br'|'tr'|'tl'|'l'|'r'|'b'|'t'|'rotate'|null, uv: number[]}}
   */
  hitTest(clientX, clientY) {
    const [x, y] = this.#local(clientX, clientY);
    const uv = this.#uvAt(x, y);
    if (!this.#editable()) return { handle: null, uv };
    const g = this.#geometry();
    const near = (p) => Math.hypot(p[0] - x, p[1] - y) <= HANDLE_RADIUS;
    if (near(g.knob)) return { handle: 'rotate', uv };
    if (!g.thin) {
      for (let k = 0; k < 4; k++) if (near(g.pts[k])) return { handle: CORNERS[k], uv };
      for (const e of g.edges) if (e.enabled && near(e.p)) return { handle: e.name, uv };
    }
    if (insideQuad(g.pts, x, y)) return { handle: 'island', uv };
    return { handle: null, uv };
  }

  /**
   * The cursor of a handle (04 3.4): move for the interior, grab / grabbing for the knob, a resize cursor by the handle's
   * screen angle from the centroid in 45° buckets.
   * Side effects: none.
   * @param {string|null} handle
   * @param {boolean} [dragging]
   * @returns {string}
   */
  cursorFor(handle, dragging = false) {
    if (!handle) return 'default';
    if (handle === 'island') return 'move';
    if (handle === 'rotate') return dragging ? 'grabbing' : 'grab';
    if (!this.#editable()) return 'default';
    const g = this.#geometry();
    const k = CORNERS.indexOf(handle);
    const p = k >= 0 ? g.pts[k] : g.edges.find((e) => e.name === handle).p;
    const deg = ((Math.atan2(p[1] - g.c[1], p[0] - g.c[0]) * 180) / Math.PI + 360) % 180;
    return RESIZE_CURSORS[Math.round(deg / 45) % 4];
  }

  /**
   * Draws everything in the order of 04 6.11 and refreshes data-island. The backing store is the CSS size times
   * min(devicePixelRatio, 2); a size change reframes unless the user moved the view.
   * Side effects: canvas drawing; the canvas's width / height and data-island attribute.
   */
  draw() {
    const canvas = this.#canvas;
    if (this.#measure() && !this.#userView) this.frame();
    const cssW = this.#cssW;
    const cssH = this.#cssH;
    const dpr = Math.min(this.#win.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const th = this.#theme;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.checkerB;
    ctx.fillRect(0, 0, cssW, cssH);
    this.#drawState = { ledZoom: false, thin: false };
    const d = this.#data;
    if (!d || d.message) {
      delete canvas.dataset.island;
      return;
    }
    const uW = this.#unitW();
    const uH = this.#unitH();
    const [x0, y0] = this.screen(0, 1);
    this.#drawBackground(ctx, d, x0, y0, uW, uH);
    // 3. dim outside [0, 1]²
    ctx.fillStyle = th.outside;
    const top = Math.max(0, Math.min(cssH, y0));
    const bottom = Math.max(0, Math.min(cssH, y0 + uH));
    const left = Math.max(0, Math.min(cssW, x0));
    const right = Math.max(0, Math.min(cssW, x0 + uW));
    ctx.fillRect(0, 0, cssW, top);
    ctx.fillRect(0, bottom, cssW, cssH - bottom);
    ctx.fillRect(0, top, left, bottom - top);
    ctx.fillRect(right, top, cssW - right, bottom - top);
    // 4. source-pixel grid when a source pixel is at least 6 px wide
    const { w: Sw, h: Sh } = this.#sourceDims();
    if (!d.atlasView && uW / Sw >= 6 && uH / Sh >= 6) this.#drawPixelGrid(ctx, x0, y0, uW / Sw, uH / Sh, Sw, Sh);
    // 5. wireframe (the panel grid; the atlas rects in Atlas space)
    this.#drawWireframe(ctx, d);
    // 6. island, handles, knob
    const g = this.#geometry();
    this.#drawState.thin = g.thin;
    this.#strokePath(ctx, g.pts, true, th.island, 1.5);
    if (this.#editable()) this.#drawHandles(ctx, g);
    // 7. hover crosshair and panel
    if (this.#hover && !d.atlasView) this.#drawHover(ctx, d);
    // 8. drag tooltip
    if (this.#tooltip) this.#drawTooltip(ctx, cssW, cssH);
    canvas.dataset.island = JSON.stringify(g.pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
  }

  /** 6.11 step 2: the background stretched to the 0-1 rect. */
  #drawBackground(ctx, d, x0, y0, uW, uH) {
    const th = this.#theme;
    let bg = d.background;
    if (d.atlasView) bg = d.atlasView.canvas ? { kind: 'panelIds', canvas: d.atlasView.canvas } : { kind: 'checker' };
    if (!bg || bg.kind === 'none') return;
    if (bg.canvas) {
      ctx.imageSmoothingEnabled = uW / this.#sourceDims().w < 4;
      ctx.drawImage(bg.canvas, x0, y0, uW, uH);
      ctx.imageSmoothingEnabled = true;
      return;
    }
    if (bg.kind === 'ledSim' && bg.led) {
      const ledW = uW / bg.led.ledsX;
      const ledH = uH / bg.led.ledsY;
      const Matrix = this.#win.DOMMatrix;
      const pattern = Math.min(ledW, ledH) >= 3 ? ctx.createPattern(bg.led.tile, 'repeat') : null;
      if (pattern && typeof pattern.setTransform === 'function' && typeof Matrix === 'function') {
        pattern.setTransform(new Matrix().translate(x0, y0).scale(ledW / 64, ledH / 64));
        ctx.fillStyle = pattern;
      } else {
        this.#drawState.ledZoom = true;
        ctx.fillStyle = d.color;
      }
      ctx.fillRect(x0, y0, uW, uH);
      return;
    }
    if (bg.kind === 'checker') {
      const cw = uW / 8;
      const ch = uH / 8;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          ctx.fillStyle = (r + c) % 2 ? th.checkerB : th.checkerA;
          ctx.fillRect(x0 + c * cw, y0 + r * ch, cw + 0.5, ch + 0.5);
        }
      }
      if (cw >= 22 && ch >= 14) {
        ctx.fillStyle = th.wireMinor;
        ctx.font = th.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) ctx.fillText(`${'ABCDEFGH'[c]}${8 - r}`, x0 + (c + 0.5) * cw, y0 + (r + 0.5) * ch);
        }
      }
    }
  }

  /** 6.11 step 4: the visible lines of the source-pixel grid. */
  #drawPixelGrid(ctx, x0, y0, stepX, stepY, Sw, Sh) {
    const cssW = this.#cssW;
    const cssH = this.#cssH;
    ctx.strokeStyle = this.#theme.pixelGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const yTop = Math.max(0, y0);
    const yBottom = Math.min(cssH, y0 + Sh * stepY);
    const xLeft = Math.max(0, x0);
    const xRight = Math.min(cssW, x0 + Sw * stepX);
    for (let c = Math.max(0, Math.ceil(-x0 / stepX)); c <= Math.min(Sw, Math.floor((cssW - x0) / stepX)); c++) {
      const x = Math.round(x0 + c * stepX) + 0.5;
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBottom);
    }
    for (let r = Math.max(0, Math.ceil(-y0 / stepY)); r <= Math.min(Sh, Math.floor((cssH - y0) / stepY)); r++) {
      const y = Math.round(y0 + r * stepY) + 0.5;
      ctx.moveTo(xLeft, y);
      ctx.lineTo(xRight, y);
    }
    ctx.stroke();
  }

  /** 6.11 step 5: column and row lines through the grid UVs (straight: the transform is affine). */
  #drawWireframe(ctx, d) {
    const th = this.#theme;
    const uvs = d.atlasView ? d.atlasView.uvs : d.uvs;
    const { cols, rows } = d;
    const P = (row, col) => {
      const k = (row * (cols + 1) + col) * 2;
      return this.screen(uvs[k], uvs[k + 1]);
    };
    const path = () => {
      ctx.beginPath();
      for (let col = 0; col <= cols; col++) {
        const a = P(0, col);
        const b = P(rows, col);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      for (let row = 0; row <= rows; row++) {
        const a = P(row, 0);
        const b = P(row, cols);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
    };
    path();
    ctx.strokeStyle = th.halo;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = th.wireMinor;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (d.atlasView) {
      for (const r of d.atlasView.rects) {
        const pts = [[r.offsetU, 0], [r.offsetU + r.widthU, 0], [r.offsetU + r.widthU, r.heightV], [r.offsetU, r.heightV]]
          .map(([u, v]) => this.screen(u, v));
        this.#strokePath(ctx, pts, true, th.wire, 1);
      }
    }
  }

  /** A two-tone closed or open polyline (a halo 2 px wider under the core). */
  #strokePath(ctx, pts, closed, color, width) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    if (closed) ctx.closePath();
    ctx.strokeStyle = this.#theme.halo;
    ctx.lineWidth = width + 2;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** 6.11 step 6: corner and edge squares (the active one highlighted) and the rotate knob on its stem. */
  #drawHandles(ctx, g) {
    const th = this.#theme;
    const square = (p, name) => {
      ctx.fillStyle = th.halo;
      ctx.fillRect(p[0] - 4.5, p[1] - 4.5, 9, 9);
      ctx.fillStyle = this.#active === name ? th.handleActive : th.handle;
      ctx.fillRect(p[0] - 3.5, p[1] - 3.5, 7, 7);
    };
    if (!g.thin) {
      g.pts.forEach((p, k) => square(p, CORNERS[k]));
      g.edges.forEach((e) => { if (e.enabled) square(e.p, e.name); });
    }
    this.#strokePath(ctx, [g.m, g.knob], false, th.handle, 1);
    ctx.beginPath();
    ctx.arc(g.knob[0], g.knob[1], 5.5, 0, Math.PI * 2);
    ctx.fillStyle = th.halo;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(g.knob[0], g.knob[1], 4.5, 0, Math.PI * 2);
    ctx.fillStyle = this.#active === 'rotate' ? th.handleActive : th.handle;
    ctx.fill();
  }

  /** 6.11 step 7: the hovered panel's quad (from the grid UVs) and a crosshair at the hovered UV. */
  #drawHover(ctx, d) {
    const th = this.#theme;
    const h = this.#hover;
    if (h.col !== null && h.row !== null && h.col >= 0 && h.col < d.cols && h.row >= 0 && h.row < d.rows) {
      const P = (row, col) => {
        const k = (row * (d.cols + 1) + col) * 2;
        return this.screen(d.uvs[k], d.uvs[k + 1]);
      };
      this.#strokePath(ctx, [P(h.row, h.col), P(h.row, h.col + 1), P(h.row + 1, h.col + 1), P(h.row + 1, h.col)], true,
        th.crosshair, 1.5);
    }
    const [x, y] = this.screen(h.u, h.v);
    this.#strokePath(ctx, [[x - 9, y], [x + 9, y]], false, th.crosshair, 1.5);
    this.#strokePath(ctx, [[x, y - 9], [x, y + 9]], false, th.crosshair, 1.5);
  }

  /** 6.11 step 8: the drag tooltip near the pointer, kept inside the canvas. */
  #drawTooltip(ctx, cssW, cssH) {
    const th = this.#theme;
    const { text, x, y } = this.#tooltip;
    ctx.font = th.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 12;
    const h = 20;
    const bx = Math.max(2, Math.min(cssW - w - 2, x + 14));
    const by = Math.max(2, Math.min(cssH - h - 2, y + 14));
    ctx.fillStyle = th.outside;
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = th.wireMinor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = th.wire;
    ctx.fillText(text, bx + 6, by + h / 2);
  }
}
