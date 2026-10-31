/**
 * @module ui/UVViewer
 * The UV viewer and editor panel (docs/improvements/04-uvs-uv-editor.md 3.2-3.8, 5.3; UV-12, UV-13): a FloatingPanel
 * (#uv-viewer) with the section, background, space and view selects, the UV canvas (UVCanvas), the numeric fields with
 * their commit semantics (input previews, change commits, Escape cancels), Turn feed, Source, Flip, the presets, Copy to
 * all, undo / redo, the status chips, the hint line and the hover readout; and the #toggle-uv-viewer toolbar button.
 * Commands go down to UvController; the panel mirrors UV_VIEWER_CHANGED, UV_DATA_CHANGED, UV_TRANSFORM_CHANGED and
 * UV_HOVER_CHANGED (R3: DOM and its own canvas only).
 * Keys (04 3.6, path B, the owner's decision: spec 07's keymap does not exist yet): U is ViewportInput's global key. One
 * bubbling keydown listener on #uv-viewer scopes the panel: the viewer keys (arrows nudge, Shift+arrows by a panel, H / V
 * flip, [ / ] turn the feed, F fit, 0 reset, Home frame, Space+drag pan, Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo,
 * Escape cancels a drag) act only on the focused canvas; every other unmodified key pressed inside the panel stops there
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

/** The panel's body markup (static: no project value is interpolated; names go through textContent). */
const BODY_HTML = `
<div class="uv-viewer__bar">
  <label class="uv-viewer__inline">Section <select id="uv-viewer-section" class="ui-select uv-viewer__select"></select></label>
  <label class="uv-viewer__inline">Show <select id="uv-viewer-background" class="ui-select uv-viewer__select">
    <option value="panelIds">Panel IDs</option><option value="ledSim">LED pixels</option><option value="checker">UV checker</option><option value="none">None</option>
  </select></label>
</div>
<div class="uv-viewer__bar">
  <span class="uv-viewer__label">Space</span>
  <div class="uv-seg" role="group" aria-label="UV space">
    <button type="button" id="uv-viewer-space-section" class="uv-seg__btn" aria-pressed="true">Section</button>
    <button type="button" id="uv-viewer-space-atlas" class="uv-seg__btn" aria-pressed="false" title="The pixel-accurate atlas, read-only (Single Combined Mesh with the Atlas layout)">Atlas</button>
  </div>
  <label class="uv-viewer__inline">View <select id="uv-viewer-aspect" class="ui-select uv-viewer__select">
    <option value="auto">Auto</option><option value="texture">Texture aspect</option><option value="square">Square (UV space)</option>
  </select></label>
</div>
<div class="uv-viewer__stage">
  <canvas id="uv-viewer-canvas" class="uv-viewer__canvas" tabindex="0" aria-label="UV editor canvas"></canvas>
  <div id="uv-viewer-message" class="uv-viewer__message" hidden></div>
</div>
<div class="uv-viewer__controls">
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
  </div>
  <div class="uv-row uv-row--wrap">
    <button type="button" id="uv-undo" class="uv-btn uv-btn--icon" disabled aria-label="Undo" title="Nothing to undo">↶</button>
    <button type="button" id="uv-redo" class="uv-btn uv-btn--icon" disabled aria-label="Redo" title="Nothing to redo">↷</button>
    <div id="uv-status" class="uv-status" aria-live="polite"></div>
  </div>
  <p class="uv-hint">Moving the island right shows content from further right of the source (the image slides left on the wall). UV edits are session-only: they are not saved in project files yet.</p>
</div>
<div id="uv-readout" class="uv-readout">Hover the front of the wall or the UV canvas</div>
`;

/** The header slot markup: the colour dot, the section name and the pin. */
const HEADER_HTML = `<span id="uv-viewer-dot" class="uv-viewer__dot" aria-hidden="true"></span><span id="uv-viewer-name" class="uv-viewer__name"></span><button type="button" id="uv-viewer-pin" class="uv-btn uv-btn--icon" aria-pressed="false" aria-label="Pin" title="Pin: ignore selection changes"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 17v5"/><path d="M9 3h6l-1 7 4 4H6l4-4z"/></svg></button>`;

/** The readout placeholder (04 3.3). */
const READOUT_EMPTY = 'Hover the front of the wall or the UV canvas';

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
  /** @type {{pointerId: number, x: number, y: number}|null} */
  #pan = null;
  #spaceHeld = false;
  /** @type {string} the section dropdown's current option signature */
  #sectionsKey = '';

  /**
   * Looks up the toolbar button and subscribes the four viewer mirrors (R4: no DOM is created here).
   * Side effects: one DOM lookup; four bus subscriptions.
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
  }

  /**
   * The setupUI step: the toolbar button's click, the panel (mounted hidden) with its content and listeners.
   * Side effects: DOM creation inside the viewport; listeners.
   */
  bind() {
    const ctl = this.#uvController;
    this.#toggleBtn?.addEventListener('click', () => ctl.toggleViewer());
    // 04 3.1's 380 x 440 left the canvas at its 120 px minimum under the controls, so the default is taller (re-clamped
    // to 90 % of the viewport, and shrunk above the camera preview window while at its default place).
    const panel = new FloatingPanel({
      doc: this.#doc, win: this.#win, host: this.#host, id: 'uv-viewer', title: 'UV Viewer',
      defaults: { top: 20, right: 72, width: 380, height: 600 }, avoidElement: this.#avoidElement,
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
      spaceSection: q('uv-viewer-space-section'), spaceAtlas: q('uv-viewer-space-atlas'),
      canvas: q('uv-viewer-canvas'), message: q('uv-viewer-message'),
      offsetU: q('uv-offset-u'), offsetV: q('uv-offset-v'), units: q('uv-units'),
      scaleU: q('uv-scale-u'), scaleV: q('uv-scale-v'), lock: q('uv-scale-lock'), rotation: q('uv-rotation'),
      rotCcw: q('uv-rot-ccw'), rotCw: q('uv-rot-cw'), sourceGroup: q('uv-source-group'),
      sourceWh: q('uv-source-wh'), sourceHw: q('uv-source-hw'), flipU: q('uv-flip-u'), flipV: q('uv-flip-v'),
      reset: q('uv-preset-reset'), fit: q('uv-preset-fit'), pixel: q('uv-preset-pixel'), copyAll: q('uv-copy-all'),
      undo: q('uv-undo'), redo: q('uv-redo'), status: q('uv-status'), readout: q('uv-readout'),
    };
    this.#els = els;
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
    els.spaceSection.addEventListener('click', () => ctl.setSpace('section'));
    els.spaceAtlas.addEventListener('click', () => ctl.setSpace('atlas'));

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
    els.units.addEventListener('change', () => {
      this.#units = els.units.value === 'px' ? 'px' : 'uv';
      const step = this.#units === 'px' ? '1' : '0.0001';
      els.offsetU.step = step;
      els.offsetV.step = step;
      els.offsetU.removeAttribute('min');
      els.offsetU.removeAttribute('max');
      els.offsetV.removeAttribute('min');
      els.offsetV.removeAttribute('max');
      if (this.#data?.transform) this.#writeFields(this.#data.transform, false);
    });
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
      if (!d || d.message || d.atlasView) return;
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
      canvas.style.cursor = view.cursorFor(hit.handle);
      if (d && !d.message && !d.atlasView) ctl.probeUv(d.sectionId, hit.uv[0], hit.uv[1]);
    });
    const end = (e) => {
      if (this.#pan && e.pointerId === this.#pan.pointerId) this.#pan = null;
      if (this.#drag && e.pointerId === this.#drag.pointerId) {
        this.#drag = null;
        ctl.endDrag();
        this.#endDragUi();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
      if (!this.#drag && !this.#pan) ctl.probeUv(null);
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
      if (e.target === canvas && this.#canvasKey(e)) {
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
    if (e.ctrlKey || e.metaKey) {
      if (e.altKey) return false;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        if (e.shiftKey) ctl.redo();
        else ctl.undo();
        return true;
      }
      if (k === 'y' && e.ctrlKey) {
        ctl.redo();
        return true;
      }
      return false;
    }
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
    if (!d || d.message || d.atlasView) return false;
    const id = d.sectionId;
    const nudges = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (nudges[e.key]) {
      ctl.nudge(id, nudges[e.key][0], nudges[e.key][1], e.shiftKey);
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
    els.spaceSection.setAttribute('aria-pressed', String(state.space === 'section'));
    els.spaceAtlas.setAttribute('aria-pressed', String(state.space === 'atlas'));
    els.pin.setAttribute('aria-pressed', String(state.pinned));
    this.#view.setAspect(state.aspect);
    if (state.open) {
      panel.show();
      this.#redraw();
    } else {
      this.#drag = null;
      this.#pan = null;
      panel.hide(this.#toggleBtn);
    }
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
    const editable = !message && !data.atlasView;
    const controls = [els.offsetU, els.offsetV, els.scaleU, els.scaleV, els.rotation, els.rotCcw, els.rotCw, els.sourceWh,
      els.sourceHw, els.flipU, els.flipV, els.reset, els.fit, els.pixel, els.copyAll];
    for (const el of controls) el.disabled = !editable;
    els.copyAll.disabled = !editable || data.sections.length < 2;
    els.spaceAtlas.disabled = !data.atlasAvailable;
    els.spaceSection.setAttribute('aria-pressed', String(!data.atlasView));
    els.spaceAtlas.setAttribute('aria-pressed', String(!!data.atlasView));
    const h = data.history;
    els.undo.disabled = !(h && h.canUndo);
    els.redo.disabled = !(h && h.canRedo);
    els.undo.title = h && h.canUndo ? `Undo: ${h.undoLabel}` : 'Nothing to undo';
    els.redo.title = h && h.canRedo ? `Redo: ${h.redoLabel}` : 'Nothing to redo';
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
    this.#els.readout.textContent = hit ? readoutText(hit) : READOUT_EMPTY;
    this.#view.setHover(this.#hoverPoint());
    this.#redraw();
  }

  /** @returns {{u: number, v: number, col: number, row: number}|null} the crosshair of the viewed section */
  #hoverPoint() {
    const h = this.#hover;
    const d = this.#data;
    if (!h || !d || !Object.is(h.sectionId, d.sectionId)) return null;
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
   * Redraws the canvas and the chips that depend on the view (LED zoom, thin island). The chips are laid out first, so
   * the canvas is measured at its final size; a chip line that appears or goes away resizes the canvas, which the
   * canvas's ResizeObserver turns into one more draw.
   */
  #redraw() {
    if (!this.#panel || !this.#panel.visible) return;
    this.#renderChips();
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
