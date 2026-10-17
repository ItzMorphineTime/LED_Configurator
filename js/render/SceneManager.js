/**
 * @module render/SceneManager
 * Owns the main three.js scene, the main (orbit) camera, the WebGL renderer, the two lights, the floor grid and
 * the axes helper (all created by an explicit init(), never by the constructor), plus the helper registry,
 * the grid toggle, window resizing and the render loop, and (03 T5; 07 C46) the pre-render hooks that run before every
 * main render (the pivot marker's minimum screen size).
 * Legacy source: index.html@cd3fd3f 1426-1449 (init body), 1453 (resize listener), 1454 + 3884-3890 (animate),
 * 2578-2583 (toggleGrid), 3877-3882 (onResize).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). The theme is injected.
 */

import THREE from '../vendor/three.js';

/**
 * Render layers (Feature 1/5 seam). The existing helpers are not moved (R6): grid, axes, rig, safe distance and gizmo
 * stay on layer 0; since 08 P2-10a (B-M11 fixed) the camera preview hides every registered helper during its own
 * render instead (PreviewWindow.render). Since 01 F1-1 the main camera also sees HELPERS, the layer of the normal lines
 * (NormalsDebugView), which the preview camera never sees.
 */
export const LAYERS = Object.freeze({ DEFAULT: 0, HELPERS: 1 });

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
  /** @type {Set<THREE.Object3D>} objects added through addHelper (bookkeeping only) */
  #helpers = new Set();
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
   * allocated from global counters, so the order is part of the output: R5). The camera also renders LAYERS.HELPERS
   * (01 F1-1; Layers carry no id).
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
    // 01 F1-1 (5.5): the main (and pilot) view renders LAYERS.HELPERS, where only the normal lines live. Nothing else
    // is on that layer, so this changes no pixel; the preview camera keeps layer 0 only.
    this.#camera.layers.enable(LAYERS.HELPERS);

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
   * Adds a helper (grid, axes, camera rig, safe-distance group, gizmo, normal lines) to the scene and records its
   * membership in the helper registry, whose members the camera preview hides during its render (08 P2-10a, B-M11).
   * No extra parent, no layer (R6).
   * Side effects: scene.add(object3D).
   * @param {THREE.Object3D} object3D
   * @returns {void}
   */
  addHelper(object3D) {
    this.#helpers.add(object3D);
    this.#scene.add(object3D);
  }

  /**
   * Removes a helper from the scene and from the registry.
   * Side effects: scene.remove(object3D).
   * @param {THREE.Object3D} object3D
   * @returns {void}
   */
  removeHelper(object3D) {
    this.#scene.remove(object3D);
    this.#helpers.delete(object3D);
  }

  /**
   * The registered helpers, hidden by the camera preview during its render (08 P2-10a; Feature 1/5 seam: 07 R1 moves
   * them to LAYERS.HELPERS for its single-renderer pass).
   * Side effects: none.
   * @returns {ReadonlySet<THREE.Object3D>}
   */
  get helpers() {
    return this.#helpers;
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
   * Runs the pre-render hooks (registration order), then renders the scene with the main camera.
   * Ports: index.html@cd3fd3f line 3888.
   * Side effects: whatever the hooks write (03 T5: the marker's scale; a no-op while it is hidden); draws into the main
   *   canvas.
   * @returns {void}
   */
  render() {
    for (const hook of this.#preRender) hook(this.#camera);
    this.#renderer.render(this.#scene, this.#camera);
  }
}
