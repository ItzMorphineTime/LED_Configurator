/**
 * @module render/PreviewWindow
 * The floating camera preview's DOM (#camera-preview-window and its children, injected by App): its display, its inline
 * size, the top-left resize handle, the three labels and the client rect of #camera-preview-canvas. Since 07 R2 it owns
 * no renderer and no camera: the main renderer draws the preview into the main canvas by scissor (render/PreviewPass.js),
 * at the place of #camera-preview-canvas, a layout placeholder with no WebGL context (07 3.6); the window's body is
 * transparent and its corners square.
 * Legacy source: index.html@cd3fd3f 3634-3645 (initPreviewCamera: only the resize registration is left), 3647-3700
 * (setupPreviewResize), 4234 (window display).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import { clampPreviewSize } from '../geometry/PreviewFit.js';

/**
 * @typedef {object} PreviewElements  the six preview elements, looked up by App
 * @property {HTMLElement} windowEl            #camera-preview-window (the key is not `window`: static check rule 3)
 * @property {HTMLCanvasElement} canvas        #camera-preview-canvas (07 R2: a layout placeholder; its client rect is
 *                                             the preview rectangle)
 * @property {HTMLElement} resizeHandle        #camera-preview-resize
 * @property {HTMLElement} info                #camera-preview-info  (`35mm • Full`)
 * @property {HTMLElement} fov                 #camera-preview-fov   (`H: 54.4° V: 37.8°`)
 * @property {HTMLElement} res                 #camera-preview-res   (`1620×1080`)
 */

/**
 * @typedef {object} ResizeState  legacy setupPreviewResize closure state (3650-3651)
 * @property {boolean} isResizing
 * @property {number|undefined} startX
 * @property {number|undefined} startY
 * @property {number|undefined} startWidth
 * @property {number|undefined} startHeight
 */

/**
 * The camera preview window: the DOM frame the main canvas's preview pass draws into.
 */
export class PreviewWindow {
  /** @type {Document} */
  #doc;
  /** @type {import('../domain/CineCamera.js').CineCamera} */
  #cine;
  /** @type {PreviewElements} */
  #elements;
  /** @type {ResizeState|null} the resize handler state; null until the resize listeners are registered */
  #resize = null;

  /**
   * Stores the dependencies only (R4): no listener until init().
   * Side effects: none.
   * @param {{doc: Document, cine: import('../domain/CineCamera.js').CineCamera, elements: PreviewElements}} deps
   *   doc: resize listeners and body cursor; cine: the filmback aspect of the resize drag
   */
  constructor({ doc, cine, elements }) {
    this.#doc = doc;
    this.#cine = cine;
    this.#elements = elements;
  }

  /** Side effects: none. @returns {boolean} whether init() has run (legacy `if (!previewRenderer)`; 07 5.2.2) */
  get initialized() {
    return this.#resize !== null;
  }

  /** Side effects: none. @returns {boolean} whether the window is shown (setVisible(true) since the last setVisible) */
  get visible() {
    return this.#elements.windowEl.style.display !== 'none';
  }

  /**
   * Shows or hides the preview window.
   * Ports: index.html@cd3fd3f line 4234.
   * Side effects: writes #camera-preview-window style.display ('block' | 'none').
   * @param {boolean} on
   * @returns {void}
   */
  setVisible(on) {
    this.#elements.windowEl.style.display = on ? 'block' : 'none';
  }

  /**
   * Registers the resize handle (on the first call; the controller calls init() only while `initialized` is false, like
   * legacy). 07 R2 deleted the second WebGLRenderer, its fixed 320 x 180 size (B-M9, Strategies.previewRendererSize) and
   * the preview camera (now PreviewPass's).
   * Ports: index.html@cd3fd3f lines 3634-3645 (the setupPreviewResize call).
   * Side effects: the resize listeners (handle mousedown, document mousemove and mouseup).
   * @returns {void}
   */
  init() {
    if (!this.#resize) this.#setupResize();
  }

  /**
   * The preview rectangle: the client rect of #camera-preview-canvas (CSS px, fractional), which the preview pass turns
   * into device pixels (07 6.1).
   * Side effects: reads layout.
   * @returns {DOMRect}
   */
  contentRect() {
    return this.#elements.canvas.getBoundingClientRect();
  }

  /**
   * Writes the three labels (PreviewPass.updateCamera computes them).
   * Side effects: the textContent of #camera-preview-info, #camera-preview-fov and #camera-preview-res.
   * @param {{info: string, fov: string, res: string}} labels
   * @returns {void}
   */
  setLabels({ info, fov, res }) {
    const el = this.#elements;
    el.info.textContent = info;
    el.fov.textContent = fov;
    el.res.textContent = res;
  }

  /**
   * The top-left resize handle: drag to resize the window (anchored bottom-right) keeping the filmback aspect, the width
   * first clamped to 200-800 as legacy, then each axis clamped on its own to 200-800 x 120-600 (07 R2, B-L32 fixed:
   * PreviewFit.clampPreviewSize). Registered once. The image inside is letterboxed by the preview pass (B-M9), so any
   * window size is valid and nothing else is resized.
   * Ports: index.html@cd3fd3f lines 3647-3700 (3677-3683 replaced by the per-axis clamp; 3685-3689 deleted: the second
   *   renderer's setSize).
   * Side effects: creates the resize state; adds the handle mousedown, document mousemove and document mouseup
   *   listeners (in this order).
   */
  #setupResize() {
    const doc = this.#doc;
    const previewWindow = this.#elements.windowEl;
    const resizeHandle = this.#elements.resizeHandle;
    const state = { isResizing: false, startX: undefined, startY: undefined, startWidth: undefined, startHeight: undefined };
    this.#resize = state;

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.isResizing = true;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.startWidth = previewWindow.offsetWidth;
      state.startHeight = previewWindow.offsetHeight;
      doc.body.style.cursor = 'nw-resize';
    });

    doc.addEventListener('mousemove', (e) => {
      if (!state.isResizing) return;

      // New dimensions (resizing from the top-left corner, window anchored to the bottom-right)
      const deltaX = state.startX - e.clientX;
      const deltaY = state.startY - e.clientY; // unused, as legacy

      // Keep the filmback aspect ratio
      const cine = this.#cine;
      const aspect = cine.filmbackWidth / cine.filmbackHeight;
      const newWidth = Math.max(200, Math.min(800, state.startWidth + deltaX));
      const newHeight = newWidth / aspect;

      // 07 R2 (B-L32 fixed): each axis is clamped on its own, so an extreme custom filmback can no longer blow the
      // window out (legacy re-derived the width from the clamped height: 100 x 1 mm gave 12,000 px)
      const { w, h } = clampPreviewSize(newWidth, newHeight);

      previewWindow.style.width = `${w}px`;
      previewWindow.style.height = `${h}px`;
    });

    doc.addEventListener('mouseup', () => {
      if (state.isResizing) {
        state.isResizing = false;
        doc.body.style.cursor = '';
      }
    });
  }
}
