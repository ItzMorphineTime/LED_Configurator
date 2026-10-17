/**
 * @module app/CameraController
 * The film-camera use cases:
 * - CameraHub: pipeline P2 (legacy updateCameraFrustum + updateSafeDistance), the single ordered refresh of the
 *   rig, coverage readout, preview camera, safe-distance overlay, pilot view and gizmo follow (ARCHITECTURE.md 6.3);
 * - CameraController: preview on/off (P-PREVIEW, 6.5), pose reset, filmback, lens/pose inputs, safe-distance
 *   toggle, and the Selectable 'camera' driven by the transform gizmo.
 * Never imports or calls ui/: the panels mirror the emitted events (CAMERA_PREVIEW_CHANGED,
 * CAMERA_FILMBACK_CHANGED, CAMERA_COVERAGE_CHANGED, CAMERA_POSE_CHANGED, CAMERA_SAFE_DISTANCE_TOGGLED;
 * SELECTABLE_MOVED moves the gizmo). Collaborators are injected; their types appear in JSDoc only.
 * Legacy source: index.html@cd3fd3f 2451-2469 (updateCameraFrustum), 2460 (the coverage readout; its flat-rectangle test
 * 2471-2534 is replaced by geometry/FrustumCoverage since 08 P2-11a, B-M10),
 * 2550-2575 (resetCameraPosition), 2778-2784 (updateSafeDistance), 3101-3137 (gizmo orientation and anchor for
 * the camera), 3337-3346 / 3375-3387 (gizmo drags on the camera), 3438-3444 (camera pick gating),
 * 4230-4327 (preview, filmback, lens, pose, reset and safe-distance handlers).
 * Layer: app (may import core, legacy, domain, geometry).
 */

import { Events } from '../core/EventBus.js';
import { layoutProject } from '../geometry/WallLayout.js';
import { analyzeCoverage } from '../geometry/FrustumCoverage.js';

/**
 * Pipeline P2: keeps every view of the film camera in step with the model. Called after every lens or pose
 * change while the preview is on, and by the wall rebuild (P1 step 5).
 */
export class CameraHub {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../render/CameraRigView.js').CameraRigView} */
  #rig;
  /** @type {import('../render/PreviewPass.js').PreviewPass} the preview pass (07 R2: its camera and labels) */
  #preview;
  /** @type {import('../render/SafeDistanceView.js').SafeDistanceView} */
  #safeDistance;
  /** @type {import('../interaction/PilotController.js').PilotCameraDriver} */
  #pilotDriver;
  /** @type {() => import('../geometry/WallLayout.js').Framing} */
  #frameBounds;
  /** @type {() => import('../geometry/WallLayout.js').WallLayout} */
  #stageLayout;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /**
   * Stores the collaborators only.
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          rig: import('../render/CameraRigView.js').CameraRigView,
   *          preview: import('../render/PreviewPass.js').PreviewPass,
   *          safeDistance: import('../render/SafeDistanceView.js').SafeDistanceView,
   *          pilotDriver: import('../interaction/PilotController.js').PilotCameraDriver,
   *          frameBounds: () => import('../geometry/WallLayout.js').Framing,
   *          stageLayout: () => import('../geometry/WallLayout.js').WallLayout,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   *   frameBounds: the framing of the stage layout (08 P2-11c: framingBounds(wallController.currentLayout), memoised per
   *   layout), evaluated per call; stageLayout (08 P2-11a): the stage layout of the last rebuild
   *   (WallController.currentLayout), whose memoised columnQuads() the coverage analyser reads
   */
  constructor({ project, rig, preview, safeDistance, pilotDriver, frameBounds, stageLayout, bus }) {
    this.#project = project;
    this.#rig = rig;
    this.#preview = preview;
    this.#safeDistance = safeDistance;
    this.#pilotDriver = pilotDriver;
    this.#frameBounds = frameBounds;
    this.#stageLayout = stageLayout;
    this.#bus = bus;
  }

  /**
   * P2 (ARCHITECTURE.md 6.3), legacy updateCameraFrustum. No-op while the preview is off. The coverage is analysed
   * first (pure; 08 P2-11b: its corner depths end the frustum at the wall; PR7), then the rig is created only when
   * missing (its own frustum build publishes the lens readout once), the frustum is rebuilt again (second readout, as
   * legacy), the rig placed, the coverage published (the analyser of 08 P2-11a on the stage layout), the preview camera
   * and labels updated, the safe-distance overlay synced, the pilot view re-driven and the gizmo told to follow.
   * Ports: index.html@cd3fd3f lines 2451-2469 (2460: the coverage readout).
   * Side effects: rig.create(cine, cornerDepths) (iff missing), rig.rebuildFrustum(cine, cornerDepths) (emits
   *   CAMERA_LENS_CHANGED), rig.updateTransform; emits CAMERA_COVERAGE_CHANGED (the coverage() payload);
   *   preview.updateCamera(); syncSafeDistance(); pilotDriver.refresh(); emits SELECTABLE_MOVED {id: 'camera'}.
   * @returns {void}
   */
  refresh() {
    const cine = this.#project.camera;
    if (!cine.enabled) return;

    // 08 P2-11b: the analysis first (pure, PR7); its corner depths shape the frustum
    const { payload, cornerDepths } = this.#analyze();

    if (!this.#rig.exists) {
      this.#rig.create(cine, cornerDepths);
    }

    // LEGACY(B-L30): every call (each gizmo mousemove, each pilot frame, each input) rebuilds the
    // frustum geometry and the whole safe-distance group (new canvas and texture).
    this.#rig.rebuildFrustum(cine, cornerDepths);
    this.#rig.updateTransform(cine);
    this.#bus.emit(Events.CAMERA_COVERAGE_CHANGED, payload);
    this.#preview.updateCamera();
    this.syncSafeDistance();
    this.#pilotDriver.refresh();

    // The gizmo follows iff the camera is the selected target
    this.#bus.emit(Events.SELECTABLE_MOVED, { id: 'camera' });
  }

  /**
   * The coverage payload (08 6.10, P2-11a, B-M10): FrustumCoverage.analyzeCoverage of the camera against the
   * stage layout of the last rebuild (its memoised column quads; every direction from the pose and the geometry, so a
   * rotated camera or wall is measured as it is). `fits` compares the frame with FramingPolicy's stageExtent (08
   * P2-11c: the wall seen face-on), and safeDistance is cine.maxSafeDistance of the same extent, so they always agree.
   * Side effects: none (reads the layout's memo).
   * @returns {{frameWidth: number|null, frameHeight: number|null, status: 'offWall'|'within'|'offCenter'|'exceeds',
   *            safeDistance: number, distToWall: number|null}}  distToWall is the analyser's D0, the optical-axis distance
   *   to the wall plane the camera is aimed at ("Distance to wall plane"); frameWidth, frameHeight and distToWall are
   *   null when no wall plane lies ahead
   */
  coverage() {
    return this.#analyze().payload;
  }

  /**
   * One analysis of the camera against the stage layout: the coverage payload and the frustum's far-corner depths
   * (08 P2-11b, camera-space metres, TL, TR, BR, BL).
   * Side effects: none.
   * @returns {{payload: ReturnType<CameraHub['coverage']>, cornerDepths: number[]}}
   */
  #analyze() {
    const cine = this.#project.camera;
    const extent = this.#frameBounds().stageExtent;
    const c = analyzeCoverage(this.#stageLayout(), cine, { hFov: cine.hFov(), vFov: cine.vFov() }, extent);
    return {
      payload: {
        frameWidth: c.frameWidth, frameHeight: c.frameHeight, status: c.status, safeDistance: cine.maxSafeDistance(extent),
        distToWall: c.distance,
      },
      cornerDepths: c.cornerDepths,
    };
  }

  /**
   * Shows the safe-distance overlay iff both the overlay toggle and the preview are on; otherwise removes it.
   * The layout and the extent are argument expressions, so they are evaluated before create() removes the old
   * group and allocates the new one (legacy computed them after both: permitted reordering PR7). Since 08 P2-11c the
   * extent is the framing's stageExtent (D from the wall seen face-on).
   * Ports: index.html@cd3fd3f lines 2778-2784.
   * Side effects: safeDistance.create(...) or safeDistance.remove().
   * @returns {void}
   */
  syncSafeDistance() {
    const project = this.#project;
    const cine = project.camera;
    if (project.display.showSafeDistance && cine.enabled) {
      this.#safeDistance.create({ layout: layoutProject(project), cine, extent: this.#frameBounds().stageExtent });
    } else {
      this.#safeDistance.remove();
    }
  }
}

/**
 * The film-camera use cases and the Selectable 'camera' (registered first with the SelectionManager, so it wins
 * raycast ties like the legacy push order).
 * @implements {import('../interaction/SelectionManager.js').Selectable}
 */
export class CameraController {
  /** Selectable id (legacy `selectedObject === 'camera'`). */
  id = 'camera';
  /** Selection badge text (legacy names map, 3161). */
  label = 'Camera';

  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../render/CameraRigView.js').CameraRigView} */
  #rig;
  /** @type {import('../render/PreviewWindow.js').PreviewWindow} */
  #preview;
  /** @type {CameraHub} */
  #hub;
  /** @type {import('../interaction/PilotController.js').PilotController} */
  #pilot;
  /** @type {import('../interaction/SelectionManager.js').SelectionManager} */
  #selection;
  /** @type {() => import('../geometry/WallLayout.js').Framing} */
  #frameBounds;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /**
   * Stores the collaborators only.
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          rig: import('../render/CameraRigView.js').CameraRigView,
   *          preview: import('../render/PreviewWindow.js').PreviewWindow,
   *          hub: CameraHub,
   *          pilot: import('../interaction/PilotController.js').PilotController,
   *          selection: import('../interaction/SelectionManager.js').SelectionManager,
   *          frameBounds: () => import('../geometry/WallLayout.js').Framing,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ project, rig, preview, hub, pilot, selection, frameBounds, bus }) {
    this.#project = project;
    this.#rig = rig;
    this.#preview = preview;
    this.#hub = hub;
    this.#pilot = pilot;
    this.#selection = selection;
    this.#frameBounds = frameBounds;
    this.#bus = bus;
  }

  /**
   * P-PREVIEW (ARCHITECTURE.md 6.5), after CameraPanel flipped the toggle class. On: the preview window's resize
   * handle is registered on the first enable (07 R2: no second renderer; the main renderer's preview pass draws the
   * image), then the pose is reset (which runs P2). Off: the rig and the safe-distance floor are
   * removed (the floor since 08 P2-4b, B-M8), pilot mode is left (cleanly since 08 P2-4a, B-H4: the pilot guard applies
   * only on entry) and the camera is deselected.
   * Ports: index.html@cd3fd3f lines 4232-4248.
   * Side effects: writes cine.enabled; emits CAMERA_PREVIEW_CHANGED {enabled} (#camera-preview-options);
   *   preview.setVisible (#camera-preview-window); on: preview.init() (first time), resetPose();
   *   off: rig.remove(), hub.syncSafeDistance() (removes the safe-distance group, 08 P2-4b), pilot.toggle() when in pilot
   *   mode (restores the orbit view), selection.deselect() when the camera is selected.
   * @param {boolean} on  the toggle's new state
   * @returns {void}
   */
  setPreviewEnabled(on) {
    const cine = this.#project.camera;
    cine.enabled = on;
    this.#bus.emit(Events.CAMERA_PREVIEW_CHANGED, { enabled: on });
    this.#preview.setVisible(on);
    if (on) {
      if (!this.#preview.initialized) this.#preview.init();
      this.resetPose();
    } else {
      // The rig, then the safe-distance group (B-M8 fixed in 08 P2-4b: legacy removed only the rig, so the floor stayed
      // in the scene, stale, while its toggle was hidden with the preview options). syncSafeDistance removes it because
      // cine.enabled is already false, and the next enable rebuilds it through resetPose's refresh.
      this.#rig.remove();
      this.#hub.syncSafeDistance();
      // Pilot mode is left after cine.enabled was cleared; since 08 P2-4a (B-H4 fixed) the pilot guard applies only on
      // entry, so this exits cleanly (legacy alerted and stayed in pilot mode).
      if (this.#pilot.active) {
        this.#pilot.toggle();
      }
      // Deselect the camera if selected
      if (this.#selection.isSelected('camera')) {
        this.#selection.deselect();
      }
    }
  }

  /**
   * Puts the camera 5 m in front of the wall, looking at its centre (08 P2-11c: CineCamera.resetTo of the framing; B-L2
   * fixed); the hub runs unconditionally (it guards itself). Also the #reset-camera click.
   * Ports: index.html@cd3fd3f lines 2550-2575.
   * Side effects: writes the camera pose; emits CAMERA_POSE_CHANGED {source: 'reset'} (pose inputs); hub.refresh().
   * @returns {void}
   */
  resetPose() {
    const cine = this.#project.camera;
    cine.resetTo(this.#frameBounds());
    this.#bus.emit(Events.CAMERA_POSE_CHANGED, { source: 'reset' });
    this.#hub.refresh();
  }

  /**
   * Selects a filmback preset (the custom preset keeps the current size).
   * Ports: index.html@cd3fd3f lines 4251-4264.
   * Side effects: writes filmback (and width/height unless 'custom'); emits CAMERA_FILMBACK_CHANGED {key}
   *   (custom block, size inputs); hub.refresh() iff the preview is on.
   * @param {string} key  a FILMBACK_PRESETS key (the #camera-filmback value)
   * @returns {void}
   */
  setFilmback(key) {
    const cine = this.#project.camera;
    cine.applyPreset(key);
    this.#bus.emit(Events.CAMERA_FILMBACK_CHANGED, { key });
    if (cine.enabled) this.#hub.refresh();
  }

  /**
   * Stores a lens or pose input (model only; the panel writes back iff CineCamera.FIELD_RULES[field].writeBack,
   * then calls commitCameraField()). The rules get the wall-plane context {wallZ: frameBounds().wallZ} (03 4.1, T3):
   * since 08 P2-11c the posZ rule has no minimum and falls back to wallZ + 5 for a non-numeric entry.
   * Ports: index.html@cd3fd3f lines 4267, 4273, 4279, 4285, 4290, 4296, 4302, 4308, 4314.
   * Side effects: writes cine[field].
   * @param {string} field  a CineCamera.FIELD_RULES key
   * @param {string} raw    the input's value
   * @returns {number} the stored value
   */
  setCameraField(field, raw) {
    return this.#project.camera.setField(field, raw, { wallZ: this.#frameBounds().wallZ });
  }

  /**
   * StageAnchored participant (03 5.3, 6.5): re-expresses the camera after an explicit pivot edit moved the stage
   * origin by -(dx, dz), clamped through CineCamera.LIMITS (07 C45), and mirrors the pose inputs. No hub refresh: the
   * pivot commit's rebuild runs it (03 5.6).
   * Side effects: writes posX, posZ; emits CAMERA_POSE_CHANGED {source: 'pivot'}.
   * @param {number} dx  metres
   * @param {number} dz  metres
   * @returns {void}
   */
  translateStage(dx, dz) {
    this.#project.camera.translateStage(dx, dz);
    this.#bus.emit(Events.CAMERA_POSE_CHANGED, { source: 'pivot' });
  }

  /**
   * The `if (cameraPreviewEnabled) updateCameraFrustum()` tail of every lens/pose input handler.
   * Ports: index.html@cd3fd3f lines 4269, 4275, 4281, 4286, 4292, 4298, 4304, 4310, 4316.
   * Side effects: hub.refresh() iff the preview is on.
   * @returns {void}
   */
  commitCameraField() {
    if (this.#project.camera.enabled) this.#hub.refresh();
  }

  /**
   * The "Show Safe Distance 3D" toggle, after CameraPanel flipped its class.
   * Ports: index.html@cd3fd3f lines 4324-4326.
   * Side effects: writes display.showSafeDistance; emits CAMERA_SAFE_DISTANCE_TOGGLED {enabled}
   *   (#export-safe-distance); hub.syncSafeDistance().
   * @param {boolean} on  the toggle's new state
   * @returns {void}
   */
  setSafeDistanceEnabled(on) {
    const display = this.#project.display;
    display.showSafeDistance = on;
    this.#bus.emit(Events.CAMERA_SAFE_DISTANCE_TOGGLED, { enabled: on });
    this.#hub.syncSafeDistance();
  }

  // ---- Selectable 'camera' --------------------------------------------------------------------------------

  /**
   * Pick gating: the preview flag and the body mesh (nulled by CameraRigView.remove since 08 P2-4a).
   * Ports: index.html@cd3fd3f line 3441.
   * Side effects: none.
   * @returns {boolean}
   */
  isPickable() {
    return this.#project.camera.enabled && !!this.#rig.bodyMesh;
  }

  /**
   * Ports: index.html@cd3fd3f lines 3442-3443.
   * Side effects: none.
   * @returns {import('three').Object3D[]} the camera body only, never the frustum
   */
  pickMeshes() {
    return this.#rig.pickMeshes();
  }

  /**
   * Gizmo follow gating (legacy `selectedObject === 'camera' && previewCameraGroup`).
   * Ports: index.html@cd3fd3f line 3126.
   * Side effects: none.
   * @returns {boolean}
   */
  hasGizmoTarget() {
    return this.#rig.exists;
  }

  /**
   * The gizmo position: the camera eye.
   * Ports: index.html@cd3fd3f line 3127.
   * Side effects: writes `out`.
   * @param {import('three').Vector3} out
   * @returns {import('three').Vector3} out
   */
  gizmoAnchor(out) {
    const cine = this.#project.camera;
    return out.set(cine.posX, cine.posY, cine.posZ);
  }

  /**
   * Local-space gizmo orientation: the camera's Euler angles in order 'YXZ'.
   * Ports: index.html@cd3fd3f lines 3108-3113.
   * Side effects: writes `rotation` (order and angles).
   * @param {import('three').Euler} rotation  the gizmo group's rotation
   * @returns {void}
   */
  orientGizmo(rotation) {
    const cine = this.#project.camera;
    rotation.order = 'YXZ';
    rotation.set(
      cine.rotX * Math.PI / 180,
      cine.rotY * Math.PI / 180,
      cine.rotZ * Math.PI / 180
    );
  }

  /**
   * Gizmo translate drag step on the camera.
   * Ports: index.html@cd3fd3f lines 3337-3346.
   * Side effects: writes posX/posY/posZ (posY clamped at 0: B-L10, tagged at CineCamera.translateBy); emits
   *   CAMERA_POSE_CHANGED {source: 'gizmo-translate'} (pos inputs); hub.refresh() iff the preview is on.
   * @param {import('three').Vector3} movement  world-space movement along the active axis
   * @returns {void}
   */
  applyGizmoTranslate(movement) {
    const cine = this.#project.camera;
    cine.translateBy(movement.x, movement.y, movement.z);
    this.#bus.emit(Events.CAMERA_POSE_CHANGED, { source: 'gizmo-translate' });
    if (cine.enabled) this.#hub.refresh();
  }

  /**
   * Gizmo rotate drag step on the camera (deltaDeg already carries Strategies.gizmoRotateSign: B-M12, tagged at
   * TransformGizmo.onMouseMove).
   * Ports: index.html@cd3fd3f lines 3375-3387.
   * Side effects: writes rotX, rotY or rotZ (B-L28, tagged at CineCamera.rotateBy); emits CAMERA_POSE_CHANGED
   *   {source: 'gizmo-rotate', axis} (that rotation input); hub.refresh() iff the preview is on.
   * @param {'x'|'y'|'z'} axis
   * @param {number} deltaDeg  signed degrees
   * @returns {void}
   */
  applyGizmoRotate(axis, deltaDeg) {
    const cine = this.#project.camera;
    cine.rotateBy(axis, deltaDeg);
    this.#bus.emit(Events.CAMERA_POSE_CHANGED, { source: 'gizmo-rotate', axis });
    if (cine.enabled) this.#hub.refresh();
  }
}
