/**
 * @module render/SceneManager
 * Owns the main three.js scene, the main (orbit) camera, the WebGL renderer, the two lights, the floor grid and
 * the axes helper (all created by an explicit init(), never by the constructor), plus the helper registry with its
 * render layers (07 R1: every registered helper subtree is re-tagged with its layer at the start of every rendered
 * frame; the main camera sees every layer, the pilot view hides HELPERS, the camera preview sees DEFAULT and
 * ENVIRONMENT only), the grid toggle, window resizing and the render loop, and (03 T5; 07 C46) the pre-render hooks that
 * run before every main render (the pivot marker's minimum screen size).
 * Legacy source: index.html@cd3fd3f 1426-1449 (init body), 1453 (resize listener), 1454 + 3884-3890 (animate),
 * 2578-2583 (toggleGrid), 3877-3882 (onResize).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). The theme is injected.
 */

import THREE from '../vendor/three.js';

/**
 * Render layers (07 R1; 07 5.2.1 and 6.2). DEFAULT: the wall, its frames and the props. HELPERS: the grid, the axes, the
 * camera rig, the safe-distance floor and the pivot marker (with its pick proxy). ENVIRONMENT: Feature 5's backdrop dome
 * (nothing yet). DEBUG: Feature 1's normal lines. The hand-written gizmo stays on DEFAULT as a 'default' helper (see
 * addHelper): it is hidden around the preview pass instead, and it stays visible in pilot mode until 08 P2-9j (B-L26).
 */
export const LAYERS = Object.freeze({ DEFAULT: 0, HELPERS: 1, ENVIRONMENT: 2, DEBUG: 3 });

/**
 * The camera layer masks (07 6.2): the main camera sees every layer (0b1111); in pilot mode HELPERS is off (0b1101,
 * 07 Q7: a clean camera view; the normal lines and the dome stay); the preview camera sees DEFAULT and ENVIRONMENT only
 * (0b0101), so no helper and no debug overlay ever reaches the preview (B-M11).
 */
export const LAYER_MASKS = Object.freeze({
  MAIN: (1 << LAYERS.DEFAULT) | (1 << LAYERS.HELPERS) | (1 << LAYERS.ENVIRONMENT) | (1 << LAYERS.DEBUG),
  MAIN_PILOT: (1 << LAYERS.DEFAULT) | (1 << LAYERS.ENVIRONMENT) | (1 << LAYERS.DEBUG),
  PREVIEW: (1 << LAYERS.DEFAULT) | (1 << LAYERS.ENVIRONMENT),
});

/**
 * The main scene and its renderer. The main camera is shared by reference with the orbit, pilot and picking
 * code, which read `sceneManager.camera` at use time.
 */
export class SceneManager {
  /** @type {HTMLCanvasElement} */
  #canvas;
  /** @type {Window} */
  #win;
  /** @type {import('../domain/Project.js').DisplaySettings} */
  #display;
  /** @type {{scene: object}} */
  #theme;

  /** @type {THREE.Scene|null} legacy `scene` */
  #scene = null;
  /** @type {THREE.PerspectiveCamera|null} legacy `camera` */
  #camera = null;
  /** @type {THREE.WebGLRenderer|null} legacy `renderer` */
  #renderer = null;
  /** @type {THREE.GridHelper|null} legacy `gridHelper` */
  #grid = null;
  /** @type {THREE.AxesHelper|null} the unnamed legacy AxesHelper (1449) */
  #axes = null;
  /** @type {Map<THREE.Object3D, number|'default'>} the registered helper roots and their layers (07 R1, 6.2) */
  #helperRoots = new Map();
  /** @type {Set<THREE.Object3D>} the 'default' helper roots, hidden around the preview pass (withPassHidden) */
  #passHidden = new Set();
  /** @type {boolean} the ?debug=1 helper audit is on (07 6.2; read once by init()) */
  #audit = false;
  /** @type {number} rendered frames, for the audit's period */
  #framesRendered = 0;
  /** @type {Array<(camera: THREE.PerspectiveCamera) => void>} pre-render hooks, in registration order (07 C46) */
  #preRender = [];

  /**
   * Stores the dependencies only (R4): no THREE allocation, no DOM access, no listener.
   * Side effects: none.
   * @param {{canvas: HTMLCanvasElement, win: Window,
   *          display: import('../domain/Project.js').DisplaySettings,
   *          theme: {scene: object}}} deps
   *   canvas: #three-canvas; win: the window (looked up at call time); display: project.display (showGrid);
   *   theme: { scene: SceneTheme } (only theme.scene is read)
   */
  constructor({ canvas, win, display, theme }) {
    this.#canvas = canvas;
    this.#win = win;
    this.#display = display;
    this.#theme = theme;
  }

  /**
   * Creates the scene, camera, renderer, lights, grid and axes in the legacy statement order (THREE ids are
   * allocated from global counters, so the order is part of the output: R5). The camera sees every layer
   * (LAYER_MASKS.MAIN, 07 R1; Layers carry no id). The grid and the axes are HELPERS.
   * Ports: index.html@cd3fd3f lines 1427-1449.
   * Side effects: allocates the WebGL context on the canvas, sizes the canvas, adds the lights, grid and axes
   * to the scene.
   * @returns {void}
   */
  init() {
    const sceneTheme = this.#theme.scene;
    const canvas = this.#canvas;
    const container = canvas.parentElement;

    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color(sceneTheme.background);

    this.#camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.#camera.position.set(0, 0, 8);
    // 07 R1 (6.2): the main view sees every layer; pilot mode turns HELPERS off (setHelpersVisibleInMain).
    this.#camera.layers.mask = LAYER_MASKS.MAIN;
    // 07 6.2: the helper audit runs under ?debug=1 only
    this.#audit = /[?&]debug=1(?:&|$)/.test(this.#win.location?.search ?? '');

    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.#renderer.setSize(container.clientWidth, container.clientHeight);
    this.#renderer.setPixelRatio(Math.min(this.#win.devicePixelRatio, 2));

    this.#addLights(sceneTheme.lights);

    // Floor grid - larger area, on Y=0 plane
    const grid = sceneTheme.grid;
    this.#grid = new THREE.GridHelper(grid.size, grid.divisions, grid.centerColor, grid.color);
    // 03 T10 (Q8): the theme centres the grid on the stage origin (legacy: offset to cover the area in front of the wall)
    this.#grid.position.set(grid.position[0], grid.position[1], grid.position[2]);
    this.addHelper(this.#grid);
    this.#axes = new THREE.AxesHelper(sceneTheme.axesSize);
    this.addHelper(this.#axes);
  }

  /**
   * Ambient light, then the point light (created, positioned, added).
   * Ports: index.html@cd3fd3f lines 1440-1443.
   * @param {{ambient: {color: number, intensity: number},
   *          point: {color: number, intensity: number, position: number[]}}} lights
   */
  #addLights(lights) {
    this.#scene.add(new THREE.AmbientLight(lights.ambient.color, lights.ambient.intensity));
    const pointLight = new THREE.PointLight(lights.point.color, lights.point.intensity);
    pointLight.position.set(lights.point.position[0], lights.point.position[1], lights.point.position[2]);
    this.#scene.add(pointLight);
  }

  /** Side effects: none. @returns {THREE.Scene} legacy `scene` (valid after init()) */
  get scene() {
    return this.#scene;
  }

  /** Side effects: none. @returns {THREE.PerspectiveCamera} legacy `camera`, shared by reference (valid after init()) */
  get camera() {
    return this.#camera;
  }

  /** Side effects: none. @returns {THREE.WebGLRenderer} legacy `renderer` (valid after init()) */
  get renderer() {
    return this.#renderer;
  }

  /** Side effects: none. @returns {HTMLCanvasElement} the injected #three-canvas */
  get canvas() {
    return this.#canvas;
  }

  /** Side effects: none. @returns {THREE.GridHelper|null} legacy `gridHelper` (null before init()) */
  get grid() {
    return this.#grid;
  }

  /** Side effects: none. @returns {THREE.AxesHelper|null} the axes helper (null before init()) */
  get axes() {
    return this.#axes;
  }

  /**
   * Adds a content object (wall, frames, props) to the scene.
   * Side effects: scene.add(object3D).
   * @param {THREE.Object3D} object3D
   * @returns {void}
   */
  add(object3D) {
    this.#scene.add(object3D);
  }

  /**
   * Removes a content object from the scene (a no-op for a non-child, as THREE's remove is).
   * Side effects: scene.remove(object3D).
   * @param {THREE.Object3D} object3D
   * @returns {void}
   */
  remove(object3D) {
    this.#scene.remove(object3D);
  }

  /**
   * Adds a helper root (grid, axes, camera rig, safe-distance group, gizmo, normal lines, pivot marker) to the scene and
   * registers it with its layer (07 R1, 5.2.1). Its whole subtree is tagged now and again at the start of every rendered
   * frame (`Object3D.layers` is not inherited, and views add children to registered roots later). 'default' leaves the
   * subtree as it is (layer 0) and puts the root in the pass-hidden set instead, which withPassHidden hides around the
   * preview pass: the hand-written gizmo, which stays visible in pilot mode until 08 P2-9j (B-L26). No extra parent (R6).
   * Side effects: scene.add(object3D); writes the layers of its subtree (unless 'default').
   * @param {THREE.Object3D} object3D
   * @param {{layer?: number|'default'}} [options]  layer: LAYERS.HELPERS (default), LAYERS.DEBUG, LAYERS.ENVIRONMENT
   *   or 'default'
   * @returns {void}
   */
  addHelper(object3D, { layer = LAYERS.HELPERS } = {}) {
    this.#helperRoots.set(object3D, layer);
    if (layer === 'default') this.#passHidden.add(object3D);
    this.#scene.add(object3D);
    this.#tagSubtree(object3D, layer);
  }

  /**
   * Re-tags, now, the subtree of `object3D`, which lies under (or is) a registered helper root, with that root's layer
   * (07 5.2.1; optional: the per-frame enforcement covers it anyway). A no-op for an object under no registered root and
   * under a 'default' root.
   * Side effects: writes the layers of the subtree.
   * @param {THREE.Object3D} object3D
   * @returns {void}
   */
  tagHelper(object3D) {
    for (let node = object3D; node; node = node.parent) {
      if (this.#helperRoots.has(node)) {
        this.#tagSubtree(object3D, this.#helperRoots.get(node));
        return;
      }
    }
  }

  /**
   * Removes a helper root from the scene and from the registry.
   * Side effects: scene.remove(object3D).
   * @param {THREE.Object3D} object3D
   * @returns {void}
   */
  removeHelper(object3D) {
    this.#scene.remove(object3D);
    this.#helperRoots.delete(object3D);
    this.#passHidden.delete(object3D);
  }

  /**
   * Turns the HELPERS layer of the main camera on or off (07 5.2.1; called by PilotController.toggle): off while piloting
   * (07 Q7: the grid, the axes, the camera rig with its frustum fill, the safe-distance floor and the pivot marker leave
   * the pilot view), on otherwise. DEFAULT, ENVIRONMENT and DEBUG stay on in both states.
   * Side effects: camera.layers.
   * @param {boolean} on
   * @returns {void}
   */
  setHelpersVisibleInMain(on) {
    if (on) this.#camera.layers.enable(LAYERS.HELPERS);
    else this.#camera.layers.disable(LAYERS.HELPERS);
  }

  /**
   * Runs fn() with every 'default' helper root hidden (07 6.2): saves each root's own `visible`, sets it false, and
   * restores each saved value afterwards (also when fn throws), so a root hidden for another reason stays hidden. The
   * camera preview pass runs inside it.
   * Side effects: the roots' visible flags during fn(); whatever fn() does.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  withPassHidden(fn) {
    const roots = [...this.#passHidden];
    const saved = roots.map((o) => o.visible);
    for (const o of roots) o.visible = false;
    try {
      return fn();
    } finally {
      for (let i = 0; i < roots.length; i++) roots[i].visible = saved[i];
    }
  }

  /** layers.set(layer) on every node of the subtree; a no-op for 'default'. */
  #tagSubtree(object3D, layer) {
    if (layer === 'default') return;
    object3D.traverse((node) => node.layers.set(layer));
  }

  /** 07 6.2 #enforceHelperLayers: re-tags every registered root's subtree (the start of every rendered frame). */
  #enforceHelperLayers() {
    for (const [root, layer] of this.#helperRoots) this.#tagSubtree(root, layer);
  }

  /**
   * 07 6.2 audit (?debug=1, every 120 rendered frames): every scene node marked `userData.helper === true` must lie under
   * a registered helper root; otherwise it would be drawn on layer 0, in the preview too.
   * Side effects: win.console.warn('unregistered helper', node) per offending node.
   */
  #auditHelpers() {
    this.#scene.traverse((node) => {
      if (node.userData?.helper !== true) return;
      for (let n = node; n; n = n.parent) if (this.#helperRoots.has(n)) return;
      this.#win.console.warn('unregistered helper', node);
    });
  }

  /**
   * Flips the grid flag and the grid's visibility. The toolbar button's class is toggled by its own panel.
   * Ports: index.html@cd3fd3f lines 2578-2583.
   * Side effects: writes display.showGrid; grid.visible.
   * @returns {void}
   */
  toggleGrid() {
    this.#display.showGrid = !this.#display.showGrid;
    if (this.#grid) {
      this.#grid.visible = this.#display.showGrid;
    }
  }

  /**
   * Registers the window resize listener.
   * Ports: index.html@cd3fd3f line 1453.
   * Side effects: win.addEventListener('resize', ...).
   * @returns {void}
   */
  attachResize() {
    this.#win.addEventListener('resize', () => this.onResize());
  }

  /**
   * Fits the camera aspect and the renderer to the canvas container.
   * Ports: index.html@cd3fd3f lines 3877-3882.
   * Side effects: camera.aspect + projection matrix; renderer size (canvas size and inline style).
   * @returns {void}
   */
  onResize() {
    const container = this.#renderer.domElement.parentElement;
    this.#camera.aspect = container.clientWidth / container.clientHeight;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(container.clientWidth, container.clientHeight);
  }

  /**
   * Starts the frame loop. Each frame requests the next one BEFORE running `tick`, and the first frame runs
   * synchronously (inside the init phase, before setupUI), exactly like legacy `animate()`.
   * Ports: index.html@cd3fd3f lines 1454, 3884-3890 (the tick body itself is defined by App).
   * Side effects: win.requestAnimationFrame (looked up at call time); whatever `tick` does.
   * @param {() => void} tick  orbit keys, pilot keys, render, preview render
   * @returns {void}
   */
  startLoop(tick) {
    const frame = () => {
      this.#win.requestAnimationFrame(frame);
      tick();
    };
    frame();
  }

  /**
   * Registers a hook that runs on every main render, after the camera update and before the draw (07 C46; 07 R3 moves it
   * onto the frame graph). 03 T5 registers the pivot marker's updateScale (its minimum on-screen size).
   * Side effects: none besides the registration.
   * @param {(camera: THREE.PerspectiveCamera) => void} hook  receives the main camera
   * @returns {void}
   */
  addPreRender(hook) {
    this.#preRender.push(hook);
  }

  /**
   * Re-tags the helper layers (07 6.2), runs the pre-render hooks (registration order), then renders the scene with the
   * main camera.
   * Ports: index.html@cd3fd3f line 3888.
   * Side effects: the layers of the registered helper subtrees (under ?debug=1, every 120th frame, the helper audit);
   *   whatever the hooks write (03 T5: the marker's scale; a no-op while it is hidden); draws into the main canvas.
   * @returns {void}
   */
  render() {
    this.#enforceHelperLayers();
    if (this.#audit && ++this.#framesRendered % 120 === 0) this.#auditHelpers();
    for (const hook of this.#preRender) hook(this.#camera);
    this.#renderer.render(this.#scene, this.#camera);
  }
}
