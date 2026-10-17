/**
 * @module render/PreviewWindow
 * The floating camera preview (#camera-preview-window and its children, injected by App): the second
 * WebGLRenderer, the preview PerspectiveCamera that mirrors the film camera, the three preview labels and the
 * top-left resize handle. Owns the window's display, its inline size and the canvas size.
 * Legacy source: index.html@cd3fd3f 3634-3645 (initPreviewCamera), 3647-3700 (setupPreviewResize),
 * 3702-3740 (updatePreviewCamera), 3742-3745 (renderPreviewCamera), 4234 (window display).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { LAYER_MASKS } from './SceneManager.js';

/**
 * @typedef {object} PreviewElements  the six preview elements, looked up by App
 * @property {HTMLElement} windowEl            #camera-preview-window (the key is not `window`: static check rule 3)
 * @property {HTMLCanvasElement} canvas        #camera-preview-canvas
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
 * The camera preview window: a second renderer drawing the scene through the film camera.
 */
export class PreviewWindow {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;
  /** @type {import('../domain/CineCamera.js').CineCamera} */
  #cine;
  /** @type {PreviewElements} */
  #elements;
  /** @type {THREE.WebGLRenderer|null} legacy `previewRenderer` (never disposed, as legacy) */
  #renderer = null;
  /** @type {THREE.PerspectiveCamera|null} legacy `previewCamera` */
  #camera = null;
  /** @type {ResizeState|null} the resize handler state; null until the resize listeners are registered */
  #resize = null;

  /**
   * Stores the dependencies only (R4): no renderer, camera or listener until init().
   * Side effects: none.
   * @param {{doc: Document, win: Window, cine: import('../domain/CineCamera.js').CineCamera,
   *          elements: PreviewElements}} deps
   *   doc: resize listeners and body cursor; win: devicePixelRatio (read at call time)
   */
  constructor({ doc, win, cine, elements }) {
    this.#doc = doc;
    this.#win = win;
    this.#cine = cine;
    this.#elements = elements;
  }

  /** Side effects: none. @returns {boolean} whether the renderer exists (legacy `if (!previewRenderer)`) */
  get initialized() {
    return !!this.#renderer;
  }

  /** Side effects: none. @returns {THREE.PerspectiveCamera|null} legacy `previewCamera` */
  get camera() {
    return this.#camera;
  }

  /** Side effects: none. @returns {THREE.WebGLRenderer|null} legacy `previewRenderer` */
  get renderer() {
    return this.#renderer;
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
   * Creates the preview renderer and camera and registers the resize handle (on the first call; the controller
   * calls init() only while `initialized` is false, like legacy).
   * Ports: index.html@cd3fd3f lines 3634-3645.
   * Side effects: creates a WebGLRenderer on the preview canvas and sets its size (canvas size and inline style)
   *   and pixel ratio; updateCamera() (camera and labels); the resize listeners (handle mousedown, document
   *   mousemove and mouseup).
   * @returns {void}
   */
  init() {
    const previewCanvas = this.#elements.canvas;
    this.#renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
    // LEGACY(B-M9): fixed 320x180 outer size (Strategies.previewRendererSize), never refitted to the filmback
    // aspect, so the image is stretched (and the canvas overflows the 2 px border box) until the user resizes.
    this.#renderer.setSize(...Strategies.previewRendererSize);
    this.#renderer.setPixelRatio(Math.min(this.#win.devicePixelRatio, 2));

    // Preview camera with settings matching the frustum
    this.updateCamera();

    // Resize handle (registered once)
    if (!this.#resize) this.#setupResize();
  }

  /**
   * Matches the preview camera to the film camera (vertical FOV in degrees, filmback aspect, pose with Euler
   * order 'YXZ') and writes the three preview labels.
   * Ports: index.html@cd3fd3f lines 3702-3740.
   * Side effects: creates the PerspectiveCamera on the first call (its layer mask LAYER_MASKS.PREVIEW, DEFAULT and
   *   ENVIRONMENT: 07 R1), else updates fov/aspect and its projection; writes the camera pose; writes the textContent
   *   of #camera-preview-info, #camera-preview-fov and #camera-preview-res.
   * @returns {void}
   */
  updateCamera() {
    const cine = this.#cine;
    const hFov = cine.hFov() * 180 / Math.PI;
    const vFov = cine.vFov() * 180 / Math.PI;
    const aspect = cine.aspect();

    if (!this.#camera) {
      this.#camera = new THREE.PerspectiveCamera(vFov, aspect, 0.1, 100);
      // 07 R1 (6.2): the preview sees DEFAULT and ENVIRONMENT only, never a helper or a debug overlay (B-M11)
      this.#camera.layers.mask = LAYER_MASKS.PREVIEW;
    } else {
      this.#camera.fov = vFov;
      this.#camera.aspect = aspect;
      this.#camera.updateProjectionMatrix();
    }
    const previewCamera = this.#camera;

    // Position and rotate to match the frustum camera
    previewCamera.position.set(
      cine.posX,
      cine.posY,
      cine.posZ
    );

    // Rotations in YXZ order
    const tilt = cine.rotX * Math.PI / 180;
    const pan = cine.rotY * Math.PI / 180;
    const roll = cine.rotZ * Math.PI / 180;

    previewCamera.rotation.order = 'YXZ';
    previewCamera.rotation.set(tilt, pan, roll);

    // LEGACY(B-L34): the header shows only the first word of the preset name, and the resolution label is a
    // made-up round(1080 * aspect) x 1080, not tied to any camera format.
    const { info, fov, res } = this.#elements;
    info.textContent =
      `${cine.focalLength}mm • ${cine.presetShortName()}`;
    fov.textContent =
      `H: ${hFov.toFixed(1)}° V: ${vFov.toFixed(1)}°`;

    // Approximate resolution from the aspect
    const baseHeight = 1080;
    const width = Math.round(baseHeight * aspect);
    res.textContent = `${width}×${baseHeight}`;
  }

  /**
   * Draws the scene through the preview camera (every frame, after the main render), so the preview shows only what
   * the film camera would see (B-M11, fixed by 08 P2-10a; mechanism since 07 R1): the camera's layer mask
   * (LAYER_MASKS.PREVIEW) leaves out every HELPERS and DEBUG object (grid, axes, camera rig with its frustum fill,
   * safe-distance floor, pivot marker, normal lines), and App runs this inside SceneManager.withPassHidden, which hides
   * the 'default' helper (the gizmo) for the draw.
   * Ports: index.html@cd3fd3f lines 3742-3745 (legacy rendered the whole scene, so the frustum fill's near quad tinted
   *   the full frame orange).
   * Side effects: draws into the preview canvas.
   * @param {THREE.Scene} scene
   * @returns {void}
   */
  render(scene) {
    if (!this.#cine.enabled || !this.#renderer || !this.#camera) return;
    this.#renderer.render(scene, this.#camera);
  }

  /**
   * The top-left resize handle: drag to resize the window (anchored bottom-right) keeping the filmback aspect,
   * width clamped to 200-800 and height to 120-600. Registered once.
   * Ports: index.html@cd3fd3f lines 3647-3700.
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
      let newWidth = Math.max(200, Math.min(800, state.startWidth + deltaX));
      let newHeight = newWidth / aspect;

      // LEGACY(B-L32): the width is recomputed from the clamped height and NOT clamped again, so extreme custom
      // filmback aspects blow the window out (100x1 mm gives 12000 px, 1x100 mm gives 6 px).
      if (newHeight < 120) {
        newHeight = 120;
        newWidth = newHeight * aspect;
      } else if (newHeight > 600) {
        newHeight = 600;
        newWidth = newHeight * aspect;
      }

      previewWindow.style.width = `${newWidth}px`;
      previewWindow.style.height = `${newHeight}px`;

      // Renderer size follows the window
      if (this.#renderer) {
        this.#renderer.setSize(newWidth, newHeight);
      }
    });

    doc.addEventListener('mouseup', () => {
      if (state.isResizing) {
        state.isResizing = false;
        doc.body.style.cursor = '';
      }
    });
  }
}
