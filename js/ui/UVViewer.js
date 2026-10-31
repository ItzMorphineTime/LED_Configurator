/**
 * @module ui/UVViewer
 * The UV viewer and editor panel (docs/improvements/04-uvs-uv-editor.md 3.2-3.8, 5.3; UV-12, UV-13): a FloatingPanel
 * (#uv-viewer) with the section, background, channel and view selects (Channel: UV1 · Section, editable; UV1 · Atlas and
 * UV2 · Combined canvas, read-only), the UV canvas (UVCanvas), the edit mode switch
 * (Island | Vertices), the numeric fields with their commit semantics (input previews, change commits, Escape cancels),
 * Turn feed, Source, Flip, the presets, Copy to all, the vertex fields and resets of the Vertices mode, undo / redo, the
 * status chips, the hint line and the hover readout; and the #toggle-uv-viewer toolbar button. The two modes' rows share
 * one grid cell (the inactive one is hidden, not removed), the chips and the readout reserve fixed heights: the canvas
 * keeps its size until the panel is resized.
 * Commands go down to UvController; the panel mirrors UV_VIEWER_CHANGED, UV_DATA_CHANGED, UV_TRANSFORM_CHANGED and
 * UV_HOVER_CHANGED (R3: DOM and its own canvas only). Undo / redo (07 H1, C16, 04 UV-18's history part): ↶ and ↷ step
 * the app's one undo stack (UvController.undo / redo), so they may revert a non-UV edit; HISTORY_CHANGED gives their
 * disabled state and their titles, "Undo <label>" / "Redo <label>" as in the header.
 * Keys (04 3.6, path B, the owner's decision: spec 07's keymap does not exist yet): U is ViewportInput's global key. One
 * bubbling keydown listener on #uv-viewer scopes the panel: the viewer keys (arrows nudge, Shift+arrows by a panel, H / V
 * flip, [ / ] turn the feed, F fit, 0 reset, Home frame, Space+drag pan, Escape cancels a drag; in the Vertices mode the
 * arrows nudge the selected vertices) act only on the focused canvas (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl/⌘+Y are the
 * global chords of ui/HistoryControls, whose capture-phase listener takes them first);
 * in the Vertices mode Ctrl/⌘+A selects every vertex and Escape cancels a vertex drag or a box, else clears the selection,
 * wherever the focus is in the panel except a field; every other unmodified key pressed inside the panel stops there
 * (so G R L P O N, WASD / QE / arrows and the rest never reach the viewport), except U (it toggles the viewer unless
 * typed into a field) and Escape without a drag; modified chords pass through; keyup is never stopped.
 * Owns #toggle-uv-viewer, #uv-viewer and every #uv-* / #uv-viewer-* id inside it.
 * Legacy source: none (Feature 4).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

import { Events } from '../core/EventBus.js';
import { byId } from './dom.js';
import { FloatingPanel } from './FloatingPanel.js';
import { UVCanvas } from './UVCanvas.js';
import { historyTitles } from './HistoryControls.js';

/** The panel's body markup (static: no project value is interpolated; names go through textContent). */
const BODY_HTML = `
<div class="uv-viewer__bar">
  <label class="uv-viewer__inline">Section <select id="uv-viewer-section" class="ui-select uv-viewer__select"></select></label>
  <label class="uv-viewer__inline">Show <select id="uv-viewer-background" class="ui-select uv-viewer__select">
    <option value="panelIds">Panel IDs</option><option value="ledSim">LED pixels</option><option value="checker">UV checker</option><option value="none">None</option>
  </select></label>
</div>
<div class="uv-viewer__bar">
  <label class="uv-viewer__inline"><select id="uv-viewer-channel" class="ui-select uv-viewer__select uv-viewer__select--wide" aria-label="UV channel" title="UV channel. UV1: the UVs you edit (glTF TEXCOORD_0, OBJ vt); its Atlas view is read-only (Single Combined Mesh with the Atlas layout). UV2: the combined canvas, read-only (glTF TEXCOORD_1)">
    <option value="section">UV1 · Section (0–1)</option><option value="atlas">UV1 · Atlas</option><option value="canvas">UV2 · Combined canvas</option>
  </select></label>
  <label class="uv-viewer__inline">View <select id="uv-viewer-aspect" class="ui-select uv-viewer__select" title="Texture: source pixels square; Square: raw UV space; Auto: Texture unless the source is longer than 8:1">
    <option value="auto">Auto</option><option value="texture">Texture</option><option value="square">Square (UV)</option>
  </select></label>
</div>
<div class="uv-viewer__stage">
  <canvas id="uv-viewer-canvas" class="uv-viewer__canvas" tabindex="0" aria-label="UV editor canvas"></canvas>
  <div id="uv-viewer-message" class="uv-viewer__message" hidden></div>
</div>
<div class="uv-viewer__controls">
  <div class="uv-row">
    <span class="uv-row__label">Edit</span>
    <div class="uv-seg" role="group" aria-label="Edit mode">
      <button type="button" id="uv-mode-island" class="uv-seg__btn" aria-pressed="true" title="Move, scale and rotate the whole island">Island</button>
      <button type="button" id="uv-mode-vertices" class="uv-seg__btn" aria-pressed="false" title="Move single grid vertices (panel corners); the island transform keeps them">Vertices</button>
    </div>
    <span id="uv-vertex-count" class="uv-row__note"></span>
  </div>
  <div class="uv-swap">
    <div class="uv-swap__pane" id="uv-pane-island">
      <div class="uv-row">
        <span class="uv-row__label">Offset</span>
        <label class="uv-num">U <input type="number" id="uv-offset-u" step="0.0001" min="-8" max="8"></label>
        <label class="uv-num">V <input type="number" id="uv-offset-v" step="0.0001" min="-8" max="8"></label>
        <select id="uv-units" class="ui-select uv-viewer__select uv-units" aria-label="Offset units" title="Offset units: UV, or source pixels"><option value="uv">UV</option><option value="px">px</option></select>
      </div>
      <div class="uv-row">
        <span class="uv-row__label">Scale</span>
        <label class="uv-num">U <input type="number" id="uv-scale-u" step="0.1" min="1" max="1600"></label>
        <label class="uv-num">V <input type="number" id="uv-scale-v" step="0.1" min="1" max="1600"></label>
        <span class="uv-unit">%</span>
        <button type="button" id="uv-scale-lock" class="uv-btn uv-btn--icon" aria-pressed="true" aria-label="Lock scales" title="Lock: editing one scale sets both"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
      </div>
    </div>
    <div class="uv-swap__pane" id="uv-pane-vertices" data-inactive>
      <div class="uv-row">
        <span class="uv-row__label">Vertex</span>
        <label class="uv-num">U <input type="number" id="uv-vertex-u" step="0.0001" title="One vertex: its U; several: their centre (moves them all)"></label>
        <label class="uv-num">V <input type="number" id="uv-vertex-v" step="0.0001" title="One vertex: its V; several: their centre (moves them all)"></label>
        <select id="uv-vertex-units" class="ui-select uv-viewer__select uv-units" aria-label="Vertex units" title="Vertex units: UV, or source pixels"><option value="uv">UV</option><option value="px">px</option></select>
      </div>
      <div class="uv-row">
        <button type="button" id="uv-vertex-reset" class="uv-btn" title="The selected vertices lose their edits">Reset selected</button>
        <button type="button" id="uv-vertex-reset-all" class="uv-btn" title="Every vertex of this section loses its edits (the island transform stays)">Reset all vertex edits</button>
      </div>
    </div>
  </div>
  <div class="uv-row">
    <span class="uv-row__label">Rotate</span>
    <label class="uv-num"><input type="number" id="uv-rotation" step="0.1" aria-label="Rotate (degrees)" title="Island rotation (counter-clockwise). The image on the wall turns the other way."></label>
    <span class="uv-unit">°</span>
    <span class="uv-row__label uv-row__label--inner">Turn feed</span>
    <button type="button" id="uv-rot-ccw" class="uv-btn" title="Turn feed 90° counter-clockwise (island turns clockwise)">⟲ 90</button>
    <button type="button" id="uv-rot-cw" class="uv-btn" title="Turn feed 90° clockwise (island turns counter-clockwise)">⟳ 90</button>
  </div>
  <div class="uv-row">
    <span class="uv-row__label" id="uv-source-label">Source</span>
    <div class="uv-seg" role="group" aria-labelledby="uv-source-label" id="uv-source-group">
      <button type="button" id="uv-source-wh" class="uv-seg__btn" aria-pressed="true"></button>
      <button type="button" id="uv-source-hw" class="uv-seg__btn" aria-pressed="false"></button>
    </div>
    <span class="uv-row__label uv-row__label--inner">Flip</span>
    <button type="button" id="uv-flip-u" class="uv-btn" aria-pressed="false" title="Flip U">↔ U</button>
    <button type="button" id="uv-flip-v" class="uv-btn" aria-pressed="false" title="Flip V">↕ V</button>
  </div>
  <div class="uv-row uv-row--wrap">
    <button type="button" id="uv-preset-reset" class="uv-btn" title="Identity (0)">Reset</button>
    <button type="button" id="uv-preset-fit" class="uv-btn" title="The largest undistorted island inside 0–1, centred (F)">Fit 0–1</button>
    <button type="button" id="uv-preset-pixel" class="uv-btn" title="Scale 100 %, rotation snapped to 90°, offsets on whole source pixels">Pixel-accurate</button>
    <button type="button" id="uv-copy-all" class="uv-btn" title="Apply this section's UV transform to every section (a Fit is re-fitted per section)">Copy to all</button>
    <button type="button" id="uv-undo" class="uv-btn uv-btn--icon uv-btn--push" disabled aria-label="Undo" title="Nothing to undo">↶</button>
    <button type="button" id="uv-redo" class="uv-btn uv-btn--icon" disabled aria-label="Redo" title="Nothing to redo">↷</button>
  </div>
  <div class="uv-row">
    <div id="uv-status" class="uv-status" aria-live="polite"></div>
  </div>
  <p id="uv-hint" class="uv-hint"></p>
</div>
<div id="uv-readout" class="uv-readout">Hover the front of the wall or the UV canvas</div>
`;

/** The header slot markup: the colour dot, the section name and the pin. */
const HEADER_HTML = `<span id="uv-viewer-dot" class="uv-viewer__dot" aria-hidden="true"></span><span id="uv-viewer-name" class="uv-viewer__name"></span><button type="button" id="uv-viewer-pin" class="uv-btn uv-btn--icon" aria-pressed="false" aria-label="Pin" title="Pin: ignore selection changes"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 17v5"/><path d="M9 3h6l-1 7 4 4H6l4-4z"/></svg></button>`;

/**
 * The hint line of each edit mode (three lines reserved, css: clamped with an ellipsis, the full text as the tooltip).
 * The presets act on the island transform only: vertex edits stay until Reset all vertex edits.
 */
const HINTS = Object.freeze({
  island: 'Moving the island right shows more of the source’s right side (the image slides left on the wall). Reset, Fit 0–1 and Pixel-accurate keep vertex edits.',
  vertices: 'Click, Shift+click, a box or Ctrl+A selects; drag moves (Alt free, Shift fine), arrows nudge. Reset, Fit 0–1 and Pixel-accurate change the island only; Reset all vertex edits clears vertex edits.',
});

/** The readout placeholder (04 3.3). */
const READOUT_EMPTY = 'Hover the front of the wall or the UV canvas';

/** Whether the viewer shows no editable UV1 section space (no data, a message, or the read-only Atlas or UV2). */
const readOnly = (d) => !d || !!d.message || !!d.atlasView || !!d.canvasView;

/** A number for an input: rounded to `digits` decimals, without trailing zeros. */
const fmt = (x, digits) => String(Number(x.toFixed(digits)));
/** A UV for the readout: 4 decimals, the leading zero dropped (".4547"). */
const fmtUv = (x) => x.toFixed(4).replace(/^(-?)0\./, '$1.');

/**
 * The hover readout of 04 3.5 (three lines).
 * Side effects: none.
 * @param {object} h  a HitDescription (PixelMap.describeHit plus ledX, ledY)
 * @returns {string}
 */
export function readoutText(h) {
  return `${h.name} · Panel ${h.label} (c${h.col + 1} r${h.row + 1}) · LED ${h.lx},${h.lyTop}/${h.ledX}×${h.ledY}\n`
    + `px ${h.px},${h.pyTop}/${h.W}×${h.H} · atlas LED ${h.gx},${h.gy}\n`
    + `uv ${fmtUv(h.baseU)},${fmtUv(h.baseV)} → ${fmtUv(h.finalU)},${fmtUv(h.finalV)}`;
}

/** The UV viewer panel. */
export class UVViewer {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;
  /** @type {import('../app/UvController.js').UvController} */
  #uvController;
  /** @type {object} theme.uv */
  #theme;
  /** @type {HTMLElement} the viewport element the panel floats in */
  #host;
  /** @type {() => (HTMLElement|null)} */
  #avoidElement;
  /** @type {HTMLElement|null} #toggle-uv-viewer */
  #toggleBtn;
  /** @type {FloatingPanel|null} */
  #panel = null;
  /** @type {Record<string, HTMLElement>} */
  #els = {};
  /** @type {UVCanvas|null} */
  #view = null;
  /** @type {object|null} the last UV_VIEWER_CHANGED state */
  #state = null;
  /** @type {object|null} the last SectionUvData */
  #data = null;
  /** @type {object|null} the hovered description shown */
  #hover = null;
  /** @type {'uv'|'px'} offset units (viewer preference, in memory) */
  #units = 'uv';
  /** the scale lock (viewer preference, in memory; on by default) */
  #lock = true;
  /** @type {{pointerId: number, handle: string, x0: number, y0: number, axisLock: 'u'|'v'|null}|null} */
  #drag = null;
  /**
   * @type {{kind: 'vertex'|'box', pointerId: number, x0: number, y0: number, key?: number, uv0?: number[],
   *         shift?: boolean, started: boolean}|null} the Vertices mode's pointer gesture (a vertex drag or a box)
   */
  #vgesture = null;
  /** @type {{pointerId: number, x: number, y: number}|null} */
  #pan = null;
  #spaceHeld = false;
  /** @type {string} the section dropdown's current option signature */
  #sectionsKey = '';
  /** @type {{canUndo: boolean, canRedo: boolean, undoLabel: string|null, redoLabel: string|null}|null} the last HISTORY_CHANGED */
  #historyState = null;

  /**
   * Looks up the toolbar button and subscribes the four viewer mirrors and HISTORY_CHANGED (R4: no DOM is created here).
   * Side effects: one DOM lookup; five bus subscriptions.
   * @param {{doc: Document, win: Window, uvController: import('../app/UvController.js').UvController,
   *          bus: import('../core/EventBus.js').EventBus, theme: {uv: object}, host: HTMLElement,
   *          avoidElement?: () => (HTMLElement|null)}} deps
   *   host: the viewport element (.viewport); avoidElement: the camera preview window (the auto-offset of 04 3.1)
   */
  constructor({ doc, win, uvController, bus, theme, host, avoidElement = () => null }) {
    this.#doc = doc;
    this.#win = win;
    this.#uvController = uvController;
    this.#theme = theme.uv;
    this.#host = host;
    this.#avoidElement = avoidElement;
    this.#toggleBtn = byId(doc, 'toggle-uv-viewer');
    bus.on(Events.UV_VIEWER_CHANGED, (p) => this.#onViewer(p));
    bus.on(Events.UV_DATA_CHANGED, (p) => this.#onData(p));
    bus.on(Events.UV_TRANSFORM_CHANGED, (p) => this.#onTransform(p));
    bus.on(Events.UV_HOVER_CHANGED, (p) => this.#onHover(p));
    bus.on(Events.HISTORY_CHANGED, (state) => {
      this.#historyState = state;
      this.#writeHistory();
    });
  }

  /**
   * The setupUI step: the toolbar button's click, the panel (mounted hidden) with its content and listeners.
   * Side effects: DOM creation inside the viewport; listeners.
   */
  bind() {
    const ctl = this.#uvController;
    this.#toggleBtn?.addEventListener('click', () => ctl.toggleViewer());
    // 04 3.1's 380 x 440 left the canvas at its 120 px minimum under the controls, so the default is taller (re-clamped
    // to 90 % of the viewport, and shrunk above the camera preview window while at its default place); 660 since the
    // Edit row and the fixed chip and hint lines.
    const panel = new FloatingPanel({
      doc: this.#doc, win: this.#win, host: this.#host, id: 'uv-viewer', title: 'UV Viewer',
      defaults: { top: 20, right: 72, width: 380, height: 660 }, avoidElement: this.#avoidElement,
    });
    panel.mount();
    this.#panel = panel;
    panel.headerExtra.innerHTML = HEADER_HTML;
    panel.body.innerHTML = BODY_HTML;
    const root = panel.element;
    const q = (id) => root.querySelector(`#${id}`);
    const els = {
      dot: q('uv-viewer-dot'), name: q('uv-viewer-name'), pin: q('uv-viewer-pin'),
      section: q('uv-viewer-section'), background: q('uv-viewer-background'), aspect: q('uv-viewer-aspect'),
      channel: q('uv-viewer-channel'),
      canvas: q('uv-viewer-canvas'), message: q('uv-viewer-message'),
      offsetU: q('uv-offset-u'), offsetV: q('uv-offset-v'), units: q('uv-units'),
      scaleU: q('uv-scale-u'), scaleV: q('uv-scale-v'), lock: q('uv-scale-lock'), rotation: q('uv-rotation'),
      rotCcw: q('uv-rot-ccw'), rotCw: q('uv-rot-cw'), sourceGroup: q('uv-source-group'),
      sourceWh: q('uv-source-wh'), sourceHw: q('uv-source-hw'), flipU: q('uv-flip-u'), flipV: q('uv-flip-v'),
      reset: q('uv-preset-reset'), fit: q('uv-preset-fit'), pixel: q('uv-preset-pixel'), copyAll: q('uv-copy-all'),
      undo: q('uv-undo'), redo: q('uv-redo'), status: q('uv-status'), readout: q('uv-readout'),
      modeIsland: q('uv-mode-island'), modeVertices: q('uv-mode-vertices'), vertexCount: q('uv-vertex-count'),
      paneIsland: q('uv-pane-island'), paneVertices: q('uv-pane-vertices'), vertexU: q('uv-vertex-u'),
      vertexV: q('uv-vertex-v'), vertexUnits: q('uv-vertex-units'), vertexReset: q('uv-vertex-reset'),
      vertexResetAll: q('uv-vertex-reset-all'), hint: q('uv-hint'),
    };
    this.#els = els;
    this.#writeHistory();
    this.#view = new UVCanvas({ canvas: els.canvas, win: this.#win, theme: this.#theme });

    panel.onClose(() => ctl.closeViewer());
    panel.onResize(() => this.#redraw());

    // header and selects
    els.pin.addEventListener('click', () => ctl.setPinned(!(this.#state && this.#state.pinned)));
    els.section.addEventListener('change', () => {
      const s = this.#data?.sections?.[Number(els.section.value)];
      if (s) ctl.viewSection(s.id);
    });
    els.background.addEventListener('change', () => ctl.setBackground(els.background.value));
    els.aspect.addEventListener('change', () => ctl.setAspect(els.aspect.value));
    els.channel.addEventListener('change', () => ctl.setSpace(els.channel.value));

    // numeric fields (04 3.3)
    for (const [el, field] of [[els.offsetU, 'offsetU'], [els.offsetV, 'offsetV'], [els.scaleU, 'scaleU'],
      [els.scaleV, 'scaleV'], [els.rotation, 'rotation']]) {
      el.addEventListener('input', () => {
        const id = this.#sectionId();
        if (id !== null) ctl.previewField(id, this.#fieldOf(field), this.#toModel(field, el.value));
      });
      el.addEventListener('change', () => {
        const id = this.#sectionId();
        if (id !== null) ctl.commitField(id, this.#fieldOf(field), this.#toModel(field, el.value));
      });
      el.addEventListener('keydown', (e) => {
        const id = this.#sectionId();
        if (e.key === 'Escape' && id !== null) ctl.cancelField(id);
      });
    }
    // one units preference for the offsets and the vertex fields (both selects show it)
    const setUnits = (value) => {
      this.#units = value === 'px' ? 'px' : 'uv';
      els.units.value = this.#units;
      els.vertexUnits.value = this.#units;
      const step = this.#units === 'px' ? '1' : '0.0001';
      for (const el of [els.offsetU, els.offsetV, els.vertexU, els.vertexV]) {
        el.step = step;
        el.removeAttribute('min');
        el.removeAttribute('max');
      }
      if (this.#data?.transform) this.#writeFields(this.#data.transform, false);
      this.#writeVertexFields(false);
    };
    els.units.addEventListener('change', () => setUnits(els.units.value));
    els.vertexUnits.addEventListener('change', () => setUnits(els.vertexUnits.value));
    els.lock.addEventListener('click', () => {
      this.#lock = !this.#lock;
      els.lock.setAttribute('aria-pressed', String(this.#lock));
    });

    // buttons
    const act = (el, fn) => el.addEventListener('click', () => {
      const id = this.#sectionId();
      if (id !== null) fn(id);
    });
    act(els.rotCcw, (id) => ctl.turnFeed(id, -1));
    act(els.rotCw, (id) => ctl.turnFeed(id, 1));
    act(els.sourceWh, (id) => ctl.setSourceRotated(id, false));
    act(els.sourceHw, (id) => ctl.setSourceRotated(id, true));
    act(els.flipU, (id) => ctl.toggleFlip(id, 'u'));
    act(els.flipV, (id) => ctl.toggleFlip(id, 'v'));
    act(els.reset, (id) => ctl.applyPreset(id, 'reset'));
    act(els.fit, (id) => ctl.applyPreset(id, 'fit'));
    act(els.pixel, (id) => ctl.applyPreset(id, 'pixel'));
    act(els.copyAll, (id) => ctl.copyToAll(id));
    els.modeIsland.addEventListener('click', () => ctl.setEditMode('island'));
    els.modeVertices.addEventListener('click', () => ctl.setEditMode('vertices'));
    act(els.vertexReset, (id) => ctl.resetSelectedVertices(id));
    act(els.vertexResetAll, (id) => ctl.resetAllVertexEdits(id));
    for (const [el, axis] of [[els.vertexU, 'u'], [els.vertexV, 'v']]) {
      el.addEventListener('change', () => {
        const id = this.#sectionId();
        if (id !== null) ctl.setVertexUv(id, axis, this.#vertexToModel(axis, el.value));
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.#writeVertexFields(false);
      });
    }
    els.undo.addEventListener('click', () => ctl.undo());
    els.redo.addEventListener('click', () => ctl.redo());
    els.status.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="showPanelIds"]')) ctl.showPanelIds();
    });

    this.#bindCanvas(els.canvas);
    this.#bindKeyScope(root, els.canvas);
    // The canvas follows its own size (the panel's resizes, the narrow sheet, chip lines, late web fonts).
    const RO = this.#win.ResizeObserver;
    if (typeof RO === 'function') new RO(() => this.#redraw()).observe(els.canvas);
  }

  // ---- canvas gestures (04 3.4) -----------------------------------------------------------------------------------

  /** Drags of the island, handles and knob; hover readout; wheel zoom; middle-drag or Space-drag pan; double-click frame. */
  #bindCanvas(canvas) {
    const ctl = this.#uvController;
    canvas.addEventListener('pointerdown', (e) => {
      const view = this.#view;
      if (e.button === 1 || (e.button === 0 && this.#spaceHeld)) {
        e.preventDefault();
        this.#pan = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      const d = this.#data;
      if (readOnly(d)) return;
      if (d.editMode === 'vertices') {
        this.#vertexDown(e, canvas);
        return;
      }
      const hit = view.hitTest(e.clientX, e.clientY);
      if (!hit.handle || !ctl.beginDrag(d.sectionId, hit.handle, hit.uv)) return;
      this.#drag = { pointerId: e.pointerId, handle: hit.handle, x0: e.clientX, y0: e.clientY, axisLock: null };
      canvas.setPointerCapture(e.pointerId);
      view.setActiveHandle(hit.handle);
      canvas.style.cursor = view.cursorFor(hit.handle, true);
      this.#redraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      const view = this.#view;
      if (this.#pan && e.pointerId === this.#pan.pointerId) {
        view.panBy(e.clientX - this.#pan.x, e.clientY - this.#pan.y);
        this.#pan.x = e.clientX;
        this.#pan.y = e.clientY;
        this.#redraw();
        return;
      }
      if (this.#vgesture && e.pointerId === this.#vgesture.pointerId) {
        this.#vertexMove(e, canvas);
        return;
      }
      const g = this.#drag;
      if (g && e.pointerId === g.pointerId) {
        if (g.handle === 'island' && e.shiftKey) {
          if (!g.axisLock && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= 4) {
            g.axisLock = Math.abs(e.clientX - g.x0) >= Math.abs(e.clientY - g.y0) ? 'u' : 'v';
          }
        } else {
          g.axisLock = null;
        }
        const r = ctl.updateDrag(view.toUv(e.clientX, e.clientY), {
          alt: e.altKey, shift: e.shiftKey, axisLock: g.axisLock, lock: this.#lock,
        });
        const box = canvas.getBoundingClientRect();
        view.setTooltip(r ? r.tooltip : null, e.clientX - box.left, e.clientY - box.top);
        this.#redraw();
        return;
      }
      const d = this.#data;
      const hit = view.hitTest(e.clientX, e.clientY);
      const overVertex = d && d.editMode === 'vertices' && view.hitVertex(e.clientX, e.clientY).key !== null;
      canvas.style.cursor = view.cursorFor(overVertex ? 'vertex' : hit.handle);
      if (!readOnly(d)) ctl.probeUv(d.sectionId, hit.uv[0], hit.uv[1]);
    });
    const end = (e) => {
      if (this.#pan && e.pointerId === this.#pan.pointerId) this.#pan = null;
      if (this.#vgesture && e.pointerId === this.#vgesture.pointerId) this.#vertexUp(e);
      if (this.#drag && e.pointerId === this.#drag.pointerId) {
        this.#drag = null;
        ctl.endDrag();
        this.#endDragUi();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
      if (!this.#drag && !this.#pan && !this.#vgesture) ctl.probeUv(null);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.#view.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      this.#redraw();
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      if (this.#view.hitTest(e.clientX, e.clientY).handle) return;
      this.#view.frame();
      this.#redraw();
    });
    canvas.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.#spaceHeld = false;
    });
    canvas.addEventListener('blur', () => { this.#spaceHeld = false; });
  }

  /**
   * Vertices mode pointerdown: on a vertex, Shift toggles it (no drag), else a press that becomes a drag after 3 px (a
   * click selects that vertex alone); on empty canvas, a box after 3 px (Shift adds to the selection; a click without
   * Shift clears it).
   */
  #vertexDown(e, canvas) {
    const hit = this.#view.hitVertex(e.clientX, e.clientY);
    if (hit.key !== null && e.shiftKey) {
      this.#uvController.selectVertices([hit.key], 'toggle');
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    this.#vgesture = hit.key !== null
      ? { kind: 'vertex', pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, key: hit.key, uv0: hit.uv, started: false }
      : { kind: 'box', pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, shift: e.shiftKey, started: false };
  }

  /** Vertices mode pointermove of the gesture: the vertex drag (with its tooltip) or the box. */
  #vertexMove(e, canvas) {
    const g = this.#vgesture;
    const view = this.#view;
    const ctl = this.#uvController;
    const moved = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= 3;
    if (g.kind === 'vertex') {
      if (!g.started && moved) {
        g.started = ctl.beginVertexDrag(this.#data.sectionId, g.key, g.uv0);
        if (g.started) canvas.style.cursor = 'move';
      }
      if (!g.started) return;
      const r = ctl.updateVertexDrag(view.toUv(e.clientX, e.clientY), { alt: e.altKey, shift: e.shiftKey });
      const box = canvas.getBoundingClientRect();
      view.setTooltip(r ? r.tooltip : null, e.clientX - box.left, e.clientY - box.top);
    } else {
      if (!g.started && !moved) return;
      g.started = true;
      view.setBox([g.x0, g.y0, e.clientX, e.clientY]);
    }
    this.#redraw();
  }

  /** Vertices mode pointerup: ends the drag (one undo step), applies the box, or the click's selection. */
  #vertexUp(e) {
    const g = this.#vgesture;
    const ctl = this.#uvController;
    this.#vgesture = null;
    if (g.kind === 'vertex') {
      if (g.started) ctl.endVertexDrag();
      else ctl.selectVertices([g.key], 'replace');
    } else if (g.started) {
      ctl.selectVertices(this.#view.verticesInBox(g.x0, g.y0, e.clientX, e.clientY), g.shift ? 'add' : 'replace');
    } else if (!g.shift) {
      ctl.clearVertexSelection();
    }
    this.#view.setBox(null);
    this.#endDragUi();
  }

  /**
   * The Vertices mode keys wherever the focus is in the panel except a field: Ctrl/⌘+A selects every vertex; Escape
   * cancels a vertex drag or a box, else clears the selection (unhandled with nothing selected: the global chain).
   * @param {KeyboardEvent} e
   * @returns {boolean} whether the key was handled
   */
  #vertexKey(e) {
    const d = this.#data;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    if (typing || readOnly(d) || d.editMode !== 'vertices') return false;
    const ctl = this.#uvController;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
      ctl.selectAllVertices();
      return true;
    }
    if (e.key !== 'Escape') return false;
    const g = this.#vgesture;
    if (g) {
      this.#vgesture = null;
      if (g.kind === 'vertex' && g.started) ctl.cancelVertexDrag();
      this.#view.setBox(null);
      this.#endDragUi();
      return true;
    }
    return ctl.clearVertexSelection();
  }

  /** Clears the drag's view state (tooltip, active handle, cursor). */
  #endDragUi() {
    const view = this.#view;
    view.setTooltip(null);
    view.setActiveHandle(null);
    this.#els.canvas.style.cursor = 'default';
    this.#redraw();
  }

  // ---- key scope (04 3.6, path B) ------------------------------------------------------------------------------

  /** The panel's bubbling keydown listener: the focus scoping rule of 04 3.6. */
  #bindKeyScope(root, canvas) {
    root.addEventListener('keydown', (e) => {
      if (this.#vertexKey(e) || (e.target === canvas && this.#canvasKey(e))) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // modified chords pass through
      if (e.key === 'u' || e.key === 'U') return;        // the global U (ignored there while typing in a field)
      if (e.key === 'Escape') return;                    // no drag: the global Escape chain
      e.stopPropagation();
    });
  }

  /**
   * The viewer keys on the focused canvas.
   * @param {KeyboardEvent} e
   * @returns {boolean} whether the key was handled (then it is consumed)
   */
  #canvasKey(e) {
    const ctl = this.#uvController;
    if (e.key === 'Escape') {
      if (!this.#drag) return false;
      this.#drag = null;
      ctl.cancelDrag();
      this.#endDragUi();
      return true;
    }
    if (e.ctrlKey || e.metaKey) return false;   // the history chords are ui/HistoryControls' (global)
    if (e.altKey) return false;
    if (e.key === ' ') {
      this.#spaceHeld = true;
      return true;
    }
    if (e.key === 'Home') {
      this.#view.frame();
      this.#redraw();
      return true;
    }
    const d = this.#data;
    if (readOnly(d)) return false;
    const id = d.sectionId;
    const nudges = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (nudges[e.key]) {
      if (d.editMode === 'vertices') ctl.nudgeVertices(id, nudges[e.key][0], nudges[e.key][1], e.shiftKey);
      else ctl.nudge(id, nudges[e.key][0], nudges[e.key][1], e.shiftKey);
      return true;
    }
    const once = (fn) => {
      if (!e.repeat) fn();
      return true;
    };
    if (e.code === 'BracketLeft') return once(() => ctl.turnFeed(id, -1));
    if (e.code === 'BracketRight') return once(() => ctl.turnFeed(id, 1));
    switch (e.key.toLowerCase()) {
      case 'h': return once(() => ctl.toggleFlip(id, 'u'));
      case 'v': return once(() => ctl.toggleFlip(id, 'v'));
      case 'f': return once(() => ctl.applyPreset(id, 'fit'));
      case '0': return once(() => ctl.applyPreset(id, 'reset'));
      default: return false;
    }
  }

  // ---- mirrors (R3: own DOM and canvas only) ----------------------------------------------------------------------

  /** UV_VIEWER_CHANGED: visibility, the toolbar button, selects, space buttons, pin, aspect. */
  #onViewer(state) {
    this.#state = state;
    const btn = this.#toggleBtn;
    if (btn) {
      btn.classList.toggle('active', state.open);
      btn.setAttribute('aria-pressed', String(state.open));
    }
    const panel = this.#panel;
    if (!panel) return;
    const els = this.#els;
    els.background.value = state.background;
    els.aspect.value = state.aspect;
    els.channel.value = state.space;
    els.pin.setAttribute('aria-pressed', String(state.pinned));
    const vertices = state.editMode === 'vertices';
    els.modeIsland.setAttribute('aria-pressed', String(!vertices));
    els.modeVertices.setAttribute('aria-pressed', String(vertices));
    // the two panes share one grid cell: the inactive one is hidden, not removed, so the canvas keeps its size
    els.paneIsland.toggleAttribute('data-inactive', vertices);
    els.paneVertices.toggleAttribute('data-inactive', !vertices);
    els.hint.textContent = HINTS[vertices ? 'vertices' : 'island'];
    els.hint.title = els.hint.textContent;
    this.#view.setAspect(state.aspect);
    if (state.open) {
      panel.show();
      this.#redraw();
    } else {
      this.#drag = null;
      this.#vgesture = null;
      this.#pan = null;
      panel.hide(this.#toggleBtn);
    }
  }

  /** HISTORY_CHANGED (and the mount): ↶ / ↷ disabled state and titles. */
  #writeHistory() {
    const els = this.#els;
    if (!els.undo) return;
    const h = this.#historyState;
    const titles = historyTitles(h);
    els.undo.disabled = !(h && h.canUndo);
    els.redo.disabled = !(h && h.canRedo);
    els.undo.title = titles.undo;
    els.redo.title = titles.redo;
  }

  /** UV_DATA_CHANGED: header, dropdown, message, fields (unless focused), buttons, chips, the canvas. */
  #onData({ data }) {
    this.#data = data;
    if (!this.#panel || !data) return;
    const els = this.#els;
    els.name.textContent = data.name === undefined ? '' : String(data.name);
    els.dot.style.background = data.color ?? 'transparent';
    this.#renderSections(data);
    const message = data.message;
    els.message.hidden = !message;
    els.message.textContent = message || '';
    els.canvas.hidden = !!message;
    const editable = !readOnly(data);
    const controls = [els.offsetU, els.offsetV, els.scaleU, els.scaleV, els.rotation, els.rotCcw, els.rotCw, els.sourceWh,
      els.sourceHw, els.flipU, els.flipV, els.reset, els.fit, els.pixel, els.copyAll, els.modeIsland, els.modeVertices];
    for (const el of controls) el.disabled = !editable;
    els.copyAll.disabled = !editable || data.sections.length < 2;
    const vx = editable && data.vertices ? data.vertices : null;
    const selected = vx ? vx.selection.length : 0;
    els.vertexU.disabled = !selected;
    els.vertexV.disabled = !selected;
    els.vertexReset.disabled = !vx || !vx.selection.some((k) => vx.edited.includes(k));
    els.vertexResetAll.disabled = !vx || !vx.edited.length;
    els.vertexCount.textContent = vx ? `${selected} selected · ${vx.edited.length} edited${data.perPanel ? ' · not applied (per-panel UVs)' : ''}` : '';
    this.#writeVertexFields(true);
    els.channel.querySelector('option[value="atlas"]').disabled = !data.atlasAvailable;
    els.channel.value = data.canvasView ? 'canvas' : data.atlasView ? 'atlas' : 'section';
    if (!message) {
      els.sourceWh.textContent = `${data.W}×${data.H}`;
      els.sourceHw.textContent = `${data.H}×${data.W}`;
      els.sourceGroup.hidden = data.W === data.H;
      els.sourceGroup.previousElementSibling.hidden = data.W === data.H;
      this.#writeFields(data.transform, true);
    }
    if (this.#hover && !Object.is(this.#hover.sectionId, data.sectionId)) this.#hover = null;
    this.#view.setHover(this.#hoverPoint());
    this.#view.setData(data);
    this.#redraw();
  }

  /** UV_TRANSFORM_CHANGED: the fields of the viewed section (a live preview leaves the focused field alone). */
  #onTransform({ sectionId, transform, source, live }) {
    const d = this.#data;
    if (!this.#panel || !d || d.message || !Object.is(sectionId, d.sectionId)) return;
    d.transform = transform;
    this.#writeFields(transform, live && source === 'preview');
  }

  /** UV_HOVER_CHANGED: the readout and the crosshair. */
  #onHover({ hit }) {
    if (!this.#panel) return;
    this.#hover = hit;
    const text = hit ? readoutText(hit) : READOUT_EMPTY;
    // three fixed lines (css: clipped with an ellipsis), the full text as the tooltip
    this.#els.readout.textContent = text;
    this.#els.readout.title = text;
    this.#view.setHover(this.#hoverPoint());
    this.#redraw();
  }

  /** @returns {{u: number, v: number, col: number, row: number}|null} the crosshair of the viewed section (UV2: on the canvas) */
  #hoverPoint() {
    const h = this.#hover;
    const d = this.#data;
    if (!h || !d || !Object.is(h.sectionId, d.sectionId)) return null;
    const c = d.canvasView;
    if (c) return { u: (c.entry.x + h.viewU * c.entry.w) / c.W, v: (h.viewV * c.entry.h) / c.W, col: h.col, row: h.row };
    return { u: h.viewU, v: h.viewV, col: h.col, row: h.row };
  }

  /** The section dropdown (rebuilt only when the names or ids changed). */
  #renderSections(data) {
    const els = this.#els;
    const sections = data.sections || [];
    const key = JSON.stringify(sections.map((s) => [String(s.id), String(s.name)]));
    if (key !== this.#sectionsKey) {
      this.#sectionsKey = key;
      els.section.textContent = '';
      sections.forEach((s, i) => {
        const opt = this.#doc.createElement('option');
        opt.value = String(i);
        opt.textContent = String(s.name);
        els.section.appendChild(opt);
      });
    }
    const i = sections.findIndex((s) => Object.is(s.id, data.sectionId));
    if (i >= 0) els.section.value = String(i);
  }

  /** Writes the transform into the fields and toggle buttons (skipFocused: a live preview keeps the typed text). */
  #writeFields(t, skipFocused) {
    const d = this.#data;
    if (!d || d.message) return;
    const els = this.#els;
    const active = this.#doc.activeElement;
    const set = (el, value) => {
      if (!(skipFocused && el === active)) el.value = value;
    };
    const [Ws, Hs] = t.sourceRotated && d.W !== d.H ? [d.H, d.W] : [d.W, d.H];
    if (this.#units === 'px') {
      set(els.offsetU, fmt(t.offsetU * Ws, 2));
      set(els.offsetV, fmt(t.offsetV * Hs, 2));
    } else {
      set(els.offsetU, fmt(t.offsetU, 4));
      set(els.offsetV, fmt(t.offsetV, 4));
    }
    set(els.scaleU, fmt(t.scaleU * 100, 2));
    set(els.scaleV, fmt(t.scaleV * 100, 2));
    set(els.rotation, fmt(t.rotation, 2));
    els.flipU.setAttribute('aria-pressed', String(!!t.flipU));
    els.flipV.setAttribute('aria-pressed', String(!!t.flipV));
    els.sourceWh.setAttribute('aria-pressed', String(!t.sourceRotated));
    els.sourceHw.setAttribute('aria-pressed', String(!!t.sourceRotated));
  }

  /**
   * Redraws the canvas, then the chips that depend on the view (LED zoom, thin island). The chip line and the readout
   * reserve fixed heights (css/features/uv-viewer.css), so neither changes the canvas size: only a panel resize does,
   * which the canvas's ResizeObserver turns into a draw.
   */
  #redraw() {
    if (!this.#panel || !this.#panel.visible) return;
    this.#view.draw();
    this.#renderChips();
  }

  /** The status chips: the data's notices plus the view's (04 3.7). */
  #renderChips() {
    const d = this.#data;
    const els = this.#els;
    const chips = d && !d.message ? [...(d.notices || [])] : [];
    const view = this.#view.drawState;
    if (d && !d.message && view.ledZoom) chips.push({ kind: 'info', text: 'ⓘ Zoom in to see LEDs' });
    if (d && !d.message && view.thin) chips.push({ kind: 'info', text: 'ⓘ Zoom in to edit handles' });
    const key = JSON.stringify(chips);
    if (els.status.dataset.key === key) return;
    els.status.dataset.key = key;
    els.status.textContent = '';
    for (const c of chips) {
      const chip = this.#doc.createElement('span');
      chip.className = `uv-chip uv-chip--${c.kind}`;
      chip.textContent = c.text;
      chip.title = c.text;
      if (c.action) {
        const b = this.#doc.createElement('button');
        b.type = 'button';
        b.className = 'uv-chip__action';
        b.dataset.action = c.action;
        b.textContent = c.actionLabel;
        chip.append(' ', b);
      }
      els.status.appendChild(chip);
    }
  }

  /**
   * The vertex U / V fields: the selected vertex's UV or the selection's centre (UV units, or source pixels), empty
   * without a selection (skipFocused: a refresh during typing keeps the typed text).
   */
  #writeVertexFields(skipFocused) {
    const d = this.#data;
    const els = this.#els;
    if (!els.vertexU) return;
    const c = d && !d.message && d.vertices ? d.vertices.selectionUv : null;
    const active = this.#doc.activeElement;
    const set = (el, value) => {
      if (!(skipFocused && el === active)) el.value = value;
    };
    if (!c) {
      set(els.vertexU, '');
      set(els.vertexV, '');
      return;
    }
    const [Ws, Hs] = this.#sourceSize();
    if (this.#units === 'px') {
      set(els.vertexU, fmt(c[0] * Ws, 2));
      set(els.vertexV, fmt(c[1] * Hs, 2));
    } else {
      set(els.vertexU, fmt(c[0], 4));
      set(els.vertexV, fmt(c[1], 4));
    }
  }

  /** A vertex field's text in section UV units (px / source size in px units). */
  #vertexToModel(axis, value) {
    const x = parseFloat(value);
    if (this.#units !== 'px') return x;
    const [Ws, Hs] = this.#sourceSize();
    return x / (axis === 'u' ? Ws : Hs);
  }

  /** @returns {number[]} the viewed section's source size [Ws, Hs] (1 x 1 without data) */
  #sourceSize() {
    const d = this.#data;
    if (!d || d.message || !d.transform) return [1, 1];
    return d.transform.sourceRotated && d.W !== d.H ? [d.H, d.W] : [d.W, d.H];
  }

  /** @returns {*} the viewed section's id, or null */
  #sectionId() {
    const d = this.#data;
    if (d && d.sectionId !== undefined && d.sectionId !== null) return d.sectionId;
    return this.#state?.sectionId ?? null;
  }

  /** The controller field of an input: a scale field sets both scales while the lock is on. */
  #fieldOf(field) {
    return (field === 'scaleU' || field === 'scaleV') && this.#lock ? 'scale' : field;
  }

  /** An input's text in model units: offsets UV (px / source size), scales as fractions (% / 100), degrees. */
  #toModel(field, value) {
    const x = parseFloat(value);
    const d = this.#data;
    if (field === 'scaleU' || field === 'scaleV') return x / 100;
    if ((field === 'offsetU' || field === 'offsetV') && this.#units === 'px' && d && !d.message) {
      const t = d.transform;
      const [Ws, Hs] = t.sourceRotated && d.W !== d.H ? [d.H, d.W] : [d.W, d.H];
      return x / (field === 'offsetU' ? Ws : Hs);
    }
    return x;
  }
}
