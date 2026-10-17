/**
 * @module render/PreviewPass
 * The camera preview drawn by the MAIN renderer into the main canvas (07 R2; docs/improvements/07-platform-foundations.md
 * 5.2.2 and 6.1): after the main pass, the preview rectangle (the client rect of the window's placeholder
 * #camera-preview-canvas) is cleared black by scissor, and the film camera's view is drawn into its letterboxed part. One
 * WebGL context in the page: two overlapping WebGL canvases left a stale rectangle of the main view after the preview
 * window was enlarged (a browser compositing bug, the owner's report of 2026-10-17). Owns the preview PerspectiveCamera
 * (moved here from PreviewWindow), whose layer mask is DEFAULT | ENVIRONMENT (07 R1: no helper, no debug overlay), and the
 * three labels' texts (written through PreviewWindow.setLabels).
 * Legacy source: index.html@cd3fd3f 3702-3740 (updatePreviewCamera), 3742-3745 (renderPreviewCamera).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { cssForDevicePx, previewDeviceRects } from '../geometry/PreviewFit.js';
import { LAYER_MASKS } from './SceneManager.js';

/**
 * The scissor pass of the camera preview. SceneManager runs it after every main render (setPasses); CameraHub.refresh
 * calls updateCamera.
 */
export class PreviewPass {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('../domain/CineCamera.js').CineCamera} */
  #cine;
  /** @type {import('./PreviewWindow.js').PreviewWindow} */
  #previewWindow;
  /** @type {THREE.PerspectiveCamera|null} legacy `previewCamera` (created by the first updateCamera) */
  #camera = null;
  /** @type {THREE.Vector2|null} scratch for renderer.getSize */
  #size = null;
  /** @type {THREE.Color|null} scratch for renderer.getClearColor */
  #clearColor = null;

  /**
   * Stores the dependencies only (R4).
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager,
   *          cine: import('../domain/CineCamera.js').CineCamera,
   *          previewWindow: import('./PreviewWindow.js').PreviewWindow}} deps
   *   (07 5.2.2 names the window `window`; the key is `previewWindow` here: static check rule 3)
   */
  constructor({ sceneManager, cine, previewWindow }) {
    this.#sceneManager = sceneManager;
    this.#cine = cine;
    this.#previewWindow = previewWindow;
  }

  /** Side effects: none. @returns {THREE.PerspectiveCamera|null} the preview camera (legacy `previewCamera`) */
  get camera() {
    return this.#camera;
  }

  /**
   * Matches the preview camera to the film camera (vertical FOV in degrees, filmback aspect, pose with Euler order
   * 'YXZ') and writes the three preview labels.
   * Ports: index.html@cd3fd3f lines 3702-3740 (moved from PreviewWindow.updateCamera by 07 R2).
   * Side effects: creates the PerspectiveCamera on the first call (layer mask LAYER_MASKS.PREVIEW), else updates
   *   fov/aspect and its projection; writes the camera pose; previewWindow.setLabels (the textContent of
   *   #camera-preview-info, #camera-preview-fov and #camera-preview-res).
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
    // Approximate resolution from the aspect
    const baseHeight = 1080;
    const width = Math.round(baseHeight * aspect);
    this.#previewWindow.setLabels({
      info: `${cine.focalLength}mm • ${cine.presetShortName()}`,
      fov: `H: ${hFov.toFixed(1)}° V: ${vFov.toFixed(1)}°`,
      res: `${width}×${baseHeight}`,
    });
  }

  /**
   * The scissor pass (07 6.1), after the main render of the same frame. Nothing happens while the preview is off, its
   * window hidden, its camera not yet created, or its rectangle (clipped to the canvas) under 50 x 30 CSS px. Otherwise:
   * the whole rectangle is cleared black (the letterbox bars), then the scene is drawn through the preview camera into
   * the letterboxed image (scene.background clears that box), inside sceneManager.withPassHidden (the gizmo); the clear
   * colour, the scissor test and the full viewport are restored afterwards, also when the draw throws.
   * Ports: index.html@cd3fd3f lines 3742-3745 (the second renderer's draw, now a pass of the main renderer).
   * Side effects: draws into the main canvas's drawing buffer inside the preview rectangle; reads the client rects of
   *   the main canvas and of the placeholder; the camera's aspect and projection if the filmback aspect changed.
   * @param {THREE.Scene} scene
   * @returns {void}
   */
  render(scene) {
    const cine = this.#cine;
    const camera = this.#camera;
    if (!cine.enabled || !camera || !this.#previewWindow.visible) return;
    const sceneManager = this.#sceneManager;
    const renderer = sceneManager.renderer;
    const dpr = renderer.getPixelRatio();
    const size = renderer.getSize(this.#size ??= new THREE.Vector2());
    const aspect = cine.filmbackWidth / cine.filmbackHeight;
    const rects = previewDeviceRects({
      canvasRect: sceneManager.canvas.getBoundingClientRect(),
      contentRect: this.#previewWindow.contentRect(),
      dpr,
      size,
      aspect,
    });
    if (!rects) return;

    const css = (n) => cssForDevicePx(n, dpr);
    const prevColor = renderer.getClearColor(this.#clearColor ??= new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    try {
      renderer.setScissorTest(true);
      // pass 1: the black bars (the whole rectangle)
      const box = rects.box;
      renderer.setViewport(css(box.x), css(box.y), css(box.w), css(box.h));
      renderer.setScissor(css(box.x), css(box.y), css(box.w), css(box.h));
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      // pass 2: the image, letterboxed to the filmback aspect (B-M9)
      const img = rects.image;
      if (img.w >= 1 && img.h >= 1) {
        renderer.setViewport(css(img.x), css(img.y), css(img.w), css(img.h));
        renderer.setScissor(css(img.x), css(img.y), css(img.w), css(img.h));
        if (camera.aspect !== aspect) {
          camera.aspect = aspect;
          camera.updateProjectionMatrix();
        }
        sceneManager.withPassHidden(() => renderer.render(scene, camera));
      }
    } finally {
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
    }
  }
}
