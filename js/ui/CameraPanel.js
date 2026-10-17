/**
 * @module ui/CameraPanel
 * The "Camera Frustum Preview" section of the control panel (everything except the preview window itself):
 * the preview and safe-distance toggles, the filmback select, the lens and pose inputs, the reset and
 * export buttons (commands down), and the mirrors of the preview options block, filmback inputs, lens readout,
 * coverage readout, pose inputs and export button (events up).
 * Owns #toggle-camera-preview, #camera-preview-options, #camera-filmback, #custom-filmback, #filmback-width,
 * #filmback-height, #camera-focal-length, #camera-hfov, #camera-vfov, #camera-aspect, #camera-pos-x/y/z,
 * #camera-rot-x/y/z, #frustum-width, #frustum-height, #frustum-status-text, #safe-distance,
 * #toggle-safe-distance, #reset-camera and #export-safe-distance.
 * Legacy source: index.html@cd3fd3f 2369-2371 (lens readout), 2484-2485 / 2515-2525 / 2533 (coverage readout),
 * 2567-2572 (reset write-back), 3342-3344 / 3378-3384 (gizmo write-back), 3554-3555 / 3614-3616 (pilot
 * write-back), 4230-4329 (camera handlers).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

import { Events } from '../core/EventBus.js';
import { CineCamera } from '../domain/CineCamera.js';
import { byId, flipToggle, setDisplay } from './dom.js';

/**
 * The `min` attribute of #camera-pos-z for a wall plane at stage z = wallZ (03 3.5, until step F = 08 P2-11c removes
 * the Z minimum): "0.1" (the markup value) while wallZ === 0 (+0 or -0, the identity and every on-plane pivot), else the
 * posZ rule's floor minZ = r3(wallZ + 0.1) FLOORED to the 0.1 grid, so that with step="0.1" every whole tenth (0
 * included) stays a valid step; the rule itself still clamps to the exact minZ on change.
 * Side effects: none.
 * @param {number} wallZ  0 - stageOrigin.z (metres; 0 for a null resolution)
 * @returns {string} e.g. "0.1", "-1.9" (wallZ = -2), "-2.3" (wallZ = -2.3397), "2.1" (wallZ = 2)
 */
export function cameraZMinAttribute(wallZ) {
  if (wallZ === 0) return '0.1';
  const minZ = Math.round((wallZ + 0.1) * 1000) / 1000;
  return (Math.floor(Math.round(minZ * 1000) / 100) / 10).toFixed(1);
}

/**
 * The wall-plane z of a pivot resolution in the stage frame (03 3.5): 0 - stageOrigin.z, or 0 for a null resolution.
 * Side effects: none.
 * @param {{stageOrigin: {z: number}}|null|undefined} resolution
 * @returns {number}
 */
const wallZOf = (resolution) => (resolution ? 0 - resolution.stageOrigin.z : 0);

/**
 * The camera-section panel: binds the camera controls to CameraController / ProjectIO (down) and mirrors the
 * camera events into its own elements (up). One instance, constructed by App before the bootstrap rebuild.
 */
export class CameraPanel {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../app/CameraController.js').CameraController} */
  #cameraController;
  /** @type {import('../app/ProjectIO.js').ProjectIO} */
  #projectIO;
  /** @type {{ui: {status: {within: string, offCenter: string, exceeds: string}}}} */
  #theme;
  /** @type {HTMLElement} */ #togglePreview;
  /** @type {HTMLElement} */ #previewOptions;
  /** @type {HTMLSelectElement} */ #filmback;
  /** @type {HTMLElement} */ #customFilmback;
  /** @type {HTMLInputElement} */ #filmbackWidth;
  /** @type {HTMLInputElement} */ #filmbackHeight;
  /** @type {HTMLInputElement} */ #focalLength;
  /** @type {HTMLElement} */ #hfov;
  /** @type {HTMLElement} */ #vfov;
  /** @type {HTMLElement} */ #aspect;
  /** @type {HTMLInputElement} */ #posX;
  /** @type {HTMLInputElement} */ #posY;
  /** @type {HTMLInputElement} */ #posZ;
  /** @type {HTMLInputElement} */ #rotX;
  /** @type {HTMLInputElement} */ #rotY;
  /** @type {HTMLInputElement} */ #rotZ;
  /** @type {HTMLElement} */ #frustumWidth;
  /** @type {HTMLElement} */ #frustumHeight;
  /** @type {HTMLElement} */ #statusText;
  /** @type {HTMLElement} */ #safeDistance;
  /** @type {HTMLElement} */ #toggleSafeDistance;
  /** @type {HTMLElement} */ #resetCamera;
  /** @type {HTMLElement} */ #exportSafeDistance;

  /**
   * Stores the collaborators, looks up the owned elements and subscribes the eight mirrors:
   *  CAMERA_PREVIEW_CHANGED({enabled}): #camera-preview-options display (4233)
   *  CAMERA_FILMBACK_CHANGED({key}): #custom-filmback display; the size inputs unless custom (4254-4262)
   *  CAMERA_LENS_CHANGED({hFov, vFov, filmbackWidth, filmbackHeight}): #camera-hfov/vfov/aspect (2369-2371)
   *  CAMERA_COVERAGE_CHANGED({frameWidth, frameHeight, status, safeDistance}): frame size, status text and
   *    colour, max distance (2484-2533)
   *  CAMERA_POSE_CHANGED({source, axis}): the pose inputs with the per-source precision
   *  CAMERA_SAFE_DISTANCE_TOGGLED({enabled}): #export-safe-distance display (4325)
   *  WALL_PIVOT_CHANGED({resolution}) and WALL_REBUILT({layout}) (03 T4, 3.5): the `min` attribute of #camera-pos-z
   *    from the pivot resolution (cameraZMinAttribute; "0.1" at the identity, the markup value)
   * Side effects: DOM lookups (no mutation); eight bus subscriptions.
   * @param {{doc: Document, project: import('../domain/Project.js').Project,
   *          cameraController: import('../app/CameraController.js').CameraController,
   *          projectIO: import('../app/ProjectIO.js').ProjectIO,
   *          bus: import('../core/EventBus.js').EventBus,
   *          theme: {ui: {status: {within: string, offCenter: string, exceeds: string}}}}} deps
   *   theme: { ui: UiColors } (status colours)
   */
  constructor({ doc, project, cameraController, projectIO, bus, theme }) {
    this.#project = project;
    this.#cameraController = cameraController;
    this.#projectIO = projectIO;
    this.#theme = theme;

    this.#togglePreview = byId(doc, 'toggle-camera-preview');
    this.#previewOptions = byId(doc, 'camera-preview-options');
    this.#filmback = byId(doc, 'camera-filmback');
    this.#customFilmback = byId(doc, 'custom-filmback');
    this.#filmbackWidth = byId(doc, 'filmback-width');
    this.#filmbackHeight = byId(doc, 'filmback-height');
    this.#focalLength = byId(doc, 'camera-focal-length');
    this.#hfov = byId(doc, 'camera-hfov');
    this.#vfov = byId(doc, 'camera-vfov');
    this.#aspect = byId(doc, 'camera-aspect');
    this.#posX = byId(doc, 'camera-pos-x');
    this.#posY = byId(doc, 'camera-pos-y');
    this.#posZ = byId(doc, 'camera-pos-z');
    this.#rotX = byId(doc, 'camera-rot-x');
    this.#rotY = byId(doc, 'camera-rot-y');
    this.#rotZ = byId(doc, 'camera-rot-z');
    this.#frustumWidth = byId(doc, 'frustum-width');
    this.#frustumHeight = byId(doc, 'frustum-height');
    this.#statusText = byId(doc, 'frustum-status-text');
    this.#safeDistance = byId(doc, 'safe-distance');
    this.#toggleSafeDistance = byId(doc, 'toggle-safe-distance');
    this.#resetCamera = byId(doc, 'reset-camera');
    this.#exportSafeDistance = byId(doc, 'export-safe-distance');

    bus.on(Events.CAMERA_PREVIEW_CHANGED, (payload) => this.#mirrorPreview(payload));
    bus.on(Events.CAMERA_FILMBACK_CHANGED, (payload) => this.#mirrorFilmback(payload));
    bus.on(Events.CAMERA_LENS_CHANGED, (payload) => this.#mirrorLens(payload));
    bus.on(Events.CAMERA_COVERAGE_CHANGED, (payload) => this.#mirrorCoverage(payload));
    bus.on(Events.CAMERA_POSE_CHANGED, (payload) => this.#mirrorPose(payload));
    bus.on(Events.CAMERA_SAFE_DISTANCE_TOGGLED, (payload) => this.#mirrorSafeDistanceToggle(payload));
    bus.on(Events.WALL_PIVOT_CHANGED, ({ resolution }) => this.#mirrorZMin(resolution));
    bus.on(Events.WALL_REBUILT, ({ layout }) => this.#mirrorZMin(layout?.pivot?.resolution ?? null));
  }

  /**
   * Adds the camera-section listeners in legacy order: preview toggle, filmback select, the nine lens/pose inputs
   * (filmback width, height, focal length, pos x/y/z, rot x/y/z), reset button, safe-distance toggle, export
   * button. Each input stores its parsed value, writes it back iff CineCamera.FIELD_RULES[field].writeBack
   * (pos-x has no write-back) and then commits (hub refresh iff the preview is on).
   * Ports: index.html@cd3fd3f lines 4230-4329.
   * Side effects: adds 14 listeners (click / change).
   * @returns {void}
   */
  bind() {
    const controller = this.#cameraController;

    const togglePreview = this.#togglePreview;
    togglePreview.addEventListener('click', () => {
      controller.setPreviewEnabled(flipToggle(togglePreview));
    });

    const filmback = this.#filmback;
    filmback.addEventListener('change', () => {
      controller.setFilmback(filmback.value);
    });

    for (const [input, field] of this.#fieldInputs()) {
      input.addEventListener('change', () => {
        const value = controller.setCameraField(field, input.value);
        if (CineCamera.FIELD_RULES[field].writeBack) input.value = value;
        controller.commitCameraField();
      });
    }

    this.#resetCamera.addEventListener('click', () => controller.resetPose());

    // Safe distance toggle
    const toggleSafeDistance = this.#toggleSafeDistance;
    toggleSafeDistance.addEventListener('click', () => {
      controller.setSafeDistanceEnabled(flipToggle(toggleSafeDistance));
    });

    this.#exportSafeDistance.addEventListener('click', () => this.#projectIO.exportSafeDistanceOBJ());
  }

  /**
   * The lens and pose inputs with their CineCamera field, in legacy listener order (4266-4317).
   * @returns {[HTMLInputElement, string][]}
   */
  #fieldInputs() {
    return [
      [this.#filmbackWidth, 'filmbackWidth'],
      [this.#filmbackHeight, 'filmbackHeight'],
      [this.#focalLength, 'focalLength'],
      [this.#posX, 'posX'],
      [this.#posY, 'posY'],
      [this.#posZ, 'posZ'],
      [this.#rotX, 'rotX'],
      [this.#rotY, 'rotY'],
      [this.#rotZ, 'rotZ'],
    ];
  }

  /**
   * CAMERA_PREVIEW_CHANGED mirror: the options block under the preview toggle.
   * Ports: index.html@cd3fd3f line 4233.
   * @param {{enabled: boolean}} payload
   */
  #mirrorPreview({ enabled }) {
    setDisplay(this.#previewOptions, enabled);
  }

  /**
   * CAMERA_FILMBACK_CHANGED mirror: the custom size block, and the preset's size in the inputs unless custom.
   * Ports: index.html@cd3fd3f lines 4254-4262.
   * @param {{key: string}} payload
   */
  #mirrorFilmback({ key }) {
    const cine = this.#project.camera;
    if (key === 'custom') {
      setDisplay(this.#customFilmback, true);
    } else {
      setDisplay(this.#customFilmback, false);
      this.#filmbackWidth.value = cine.filmbackWidth;
      this.#filmbackHeight.value = cine.filmbackHeight;
    }
  }

  /**
   * CAMERA_LENS_CHANGED mirror: horizontal / vertical FOV in degrees and the filmback aspect.
   * Ports: index.html@cd3fd3f lines 2369-2371.
   * @param {{hFov: number, vFov: number, filmbackWidth: number, filmbackHeight: number}} payload  radians, mm
   */
  #mirrorLens({ hFov, vFov, filmbackWidth, filmbackHeight }) {
    this.#hfov.textContent = `${(hFov * 180 / Math.PI).toFixed(1)}°`;
    this.#vfov.textContent = `${(vFov * 180 / Math.PI).toFixed(1)}°`;
    this.#aspect.textContent = `${(filmbackWidth / filmbackHeight).toFixed(2)}:1`;
  }

  /**
   * CAMERA_COVERAGE_CHANGED mirror: frame size at the wall, coverage status (text, then colour) and the
   * maximum safe distance.
   * Ports: index.html@cd3fd3f lines 2484-2485, 2515-2525, 2533.
   * @param {{frameWidth: number, frameHeight: number, status: 'within'|'offCenter'|'exceeds',
   *          safeDistance: number}} payload
   */
  #mirrorCoverage({ frameWidth, frameHeight, status, safeDistance }) {
    this.#frustumWidth.textContent = `${frameWidth.toFixed(2)}m`;
    this.#frustumHeight.textContent = `${frameHeight.toFixed(2)}m`;

    const statusEl = this.#statusText;
    const colors = this.#theme.ui.status;
    if (status === 'within') {
      statusEl.textContent = 'Within bounds';
      statusEl.style.color = colors.within;
    } else if (status === 'offCenter') {
      statusEl.textContent = 'Off-center';
      statusEl.style.color = colors.offCenter;
    } else {
      statusEl.textContent = 'Exceeds wall';
      statusEl.style.color = colors.exceeds;
    }

    this.#safeDistance.textContent = `≤ ${safeDistance.toFixed(2)}m`;
  }

  /**
   * CAMERA_POSE_CHANGED mirror: writes the pose inputs with the precision of the legacy site of each source.
   * Ports: index.html@cd3fd3f lines 2567-2572 ('reset': X/Y toFixed(1), Z and rotations raw), 3342-3344
   * ('gizmo-translate': toFixed(2)), 3378 / 3381 / 3384 ('gizmo-rotate': the dragged axis, toFixed(1)),
   * 3554-3555 ('pilot-look': rot-x then rot-y, toFixed(1)), 3614-3616 ('pilot-move': toFixed(2)).
   * 'pivot' (03 T4, 5.5: the re-expression after a pivot edit moved the stage origin): pos-x, pos-z toFixed(2), the
   * two components translateStage writes.
   * @param {{source: 'reset'|'gizmo-translate'|'gizmo-rotate'|'pilot-look'|'pilot-move'|'pivot', axis?: 'x'|'y'|'z'}} payload
   */
  #mirrorPose({ source, axis }) {
    const cine = this.#project.camera;
    switch (source) {
      case 'pivot':
        this.#posX.value = cine.posX.toFixed(2);
        this.#posZ.value = cine.posZ.toFixed(2);
        break;
      case 'reset':
        this.#posX.value = cine.posX.toFixed(1);
        this.#posY.value = cine.posY.toFixed(1);
        this.#posZ.value = cine.posZ;
        this.#rotX.value = cine.rotX;
        this.#rotY.value = cine.rotY;
        this.#rotZ.value = cine.rotZ;
        break;
      case 'gizmo-translate':
      case 'pilot-move':
        this.#posX.value = cine.posX.toFixed(2);
        this.#posY.value = cine.posY.toFixed(2);
        this.#posZ.value = cine.posZ.toFixed(2);
        break;
      case 'gizmo-rotate':
        if (axis === 'x') {
          this.#rotX.value = cine.rotX.toFixed(1);
        } else if (axis === 'y') {
          this.#rotY.value = cine.rotY.toFixed(1);
        } else {
          this.#rotZ.value = cine.rotZ.toFixed(1);
        }
        break;
      case 'pilot-look':
        this.#rotX.value = cine.rotX.toFixed(1);
        this.#rotY.value = cine.rotY.toFixed(1);
        break;
      default:
        break;
    }
  }

  /**
   * CAMERA_SAFE_DISTANCE_TOGGLED mirror: the export button is shown only while the overlay toggle is on.
   * Ports: index.html@cd3fd3f line 4325.
   * @param {{enabled: boolean}} payload
   */
  #mirrorSafeDistanceToggle({ enabled }) {
    setDisplay(this.#exportSafeDistance, enabled);
  }

  /**
   * WALL_PIVOT_CHANGED / WALL_REBUILT mirror (03 T4, 3.5): the `min` attribute of #camera-pos-z. At the identity (and
   * for every pivot whose stage origin lies on the wall plane) it stays "0.1", the markup value. Step F (08 P2-11c)
   * removes the attribute and this mirror.
   * @param {{stageOrigin: {z: number}}|null} resolution  the pivot resolution of the payload (null: wallZ = 0)
   */
  #mirrorZMin(resolution) {
    this.#posZ.setAttribute('min', cameraZMinAttribute(wallZOf(resolution)));
  }
}
