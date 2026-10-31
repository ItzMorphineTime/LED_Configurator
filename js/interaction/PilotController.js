/**
 * @module interaction/PilotController
 * Pilot mode: PilotCameraDriver puts the MAIN camera at the film camera's pose (it has no dependency on the
 * camera hub, which breaks the pilot <-> hub cycle); PilotController owns the toggle, mouse look, keyboard
 * fly and fly speed.
 * Legacy source: index.html@cd3fd3f 1370-1377 (pilot state), 3477-3509 (togglePilotMode), 3511-3536
 * (enterPilotView, updatePilotView), 3538-3631 (pilot mouse, keyboard, wheel).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { NO_HISTORY } from '../core/historyRecorder.js';

/**
 * Drives the main camera from the CineCamera while pilot mode is on.
 */
export class PilotCameraDriver {
  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('../domain/CineCamera.js').CineCamera} */
  #cine;
  /** @type {import('../render/CameraRigView.js').CameraRigView} */
  #rig;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;

  /**
   * Stores the collaborators.
   * Side effects: none.
   * @param {{sceneManager: import('../render/SceneManager.js').SceneManager,
   *          cine: import('../domain/CineCamera.js').CineCamera,
   *          rig: import('../render/CameraRigView.js').CameraRigView,
   *          interaction: import('./InputState.js').InteractionState}} deps
   */
  constructor({ sceneManager, cine, rig, interaction }) {
    this.#sceneManager = sceneManager;
    this.#cine = cine;
    this.#rig = rig;
    this.#interaction = interaction;
  }

  /**
   * Legacy enterPilotView: the main camera takes the film camera's position, look direction (tilt about X,
   * then pan about Y), roll and vertical FOV. The main camera keeps the viewport aspect (an 8.4 observation).
   * Ports: index.html@cd3fd3f lines 3511-3530.
   * Side effects: writes the main camera position, orientation and fov; updates its projection matrix.
   */
  enterView() {
    const cine = this.#cine;
    if (!cine.enabled || !this.#rig.exists) return;

    const camera = this.#sceneManager.camera;
    camera.position.set(cine.posX, cine.posY, cine.posZ);

    const tilt = cine.rotX * Math.PI / 180;
    const pan = cine.rotY * Math.PI / 180;

    const lookDir = new THREE.Vector3(0, 0, -1);
    lookDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
    lookDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), pan);

    const lookTarget = camera.position.clone().add(lookDir);
    camera.lookAt(lookTarget);
    camera.rotateZ(cine.rotZ * Math.PI / 180);

    // `(2 * atan(...)) * (180 / Math.PI)`: this association differs from the preview's `* 180 / Math.PI`.
    const vFov = cine.vFov() * (180 / Math.PI);
    camera.fov = vFov;
    camera.updateProjectionMatrix();
  }

  /**
   * Legacy updatePilotView: re-drives the main camera iff pilot mode is on (called by the camera hub).
   * Ports: index.html@cd3fd3f lines 3532-3536.
   * Side effects: see enterView().
   */
  refresh() {
    if (this.#interaction.pilotMode) {
      this.enterView();
    }
  }
}

/**
 * Pilot mode: the toggle (which saves and restores the orbit camera), mouse look, keyboard fly and the wheel fly
 * speed. Owns the legacy globals `pilotMoveSpeed` (moveSpeed), `savedCameraState`, `isPilotLooking` and
 * `pilotLastMouse`, and is the only writer of InteractionState.pilotMode (legacy `pilotMode`).
 * Wiring (App): toggle() is called by ViewportInput (P, Escape), ViewportToolbar (#gizmo-pilot) and
 * CameraController (preview turned off while piloting); ViewportInput routes the canvas pointer and wheel events
 * here while pilot mode is on; tickKeyboard() runs in the frame tick after OrbitController.tickKeyboard().
 */
export class PilotController {
  /** Legacy `pilotMoveSpeed` (1375): metres per frame, changed by the wheel in [0.01, 0.3]. */
  moveSpeed = 0.05;

  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('../domain/CineCamera.js').CineCamera} */
  #cine;
  /** @type {PilotCameraDriver} */
  #driver;
  /** @type {import('./OrbitController.js').OrbitController} */
  #orbit;
  /** @type {import('./InputState.js').KeyboardState} */
  #keyboard;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;
  /** @type {{refresh(): void}} the CameraHub */
  #hub;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {{alert(msg: string): void}} */
  #dialogs;
  /** @type {(() => void)|null} reveals the camera preview controls after the alert */
  #onPreviewRequired = null;
  /** @type {{position: THREE.Vector3, orbit: import('./OrbitController.js').OrbitSnapshot, fov: number}|null}
   *  legacy `savedCameraState` (never cleared, as legacy) */
  #saved = null;
  /** legacy `isPilotLooking` */
  #looking = false;
  /** legacy `pilotLastMouse` */
  #lastMouse = { x: 0, y: 0 };
  /** @type {import('../core/historyRecorder.js').HistoryRecorder} the undo stack (07 H1, 6.10 Pilot) */
  #history;
  /** a keyboard flight moved the film camera since the last record */
  #flying = false;
  /** a mouse look turned the film camera since the last record */
  #lookMoved = false;

  /**
   * Stores the collaborators.
   * Side effects: none.
   * @param {{sceneManager: import('../render/SceneManager.js').SceneManager,
   *          cine: import('../domain/CineCamera.js').CineCamera,
   *          driver: PilotCameraDriver,
   *          orbit: import('./OrbitController.js').OrbitController,
   *          keyboard: import('./InputState.js').KeyboardState,
   *          interaction: import('./InputState.js').InteractionState,
   *          hub: import('../app/CameraController.js').CameraHub,
   *          bus: import('../core/EventBus.js').EventBus,
   *          dialogs: {alert(msg: string): void},
   *          onPreviewRequired?: (() => void)|null, history?: import('../core/historyRecorder.js').HistoryRecorder}} deps
   *          onPreviewRequired: called after the "Enable Camera Frustum Preview first" alert (App: opens the side panel
   *          and the Camera Frustum Preview card); history: the undo stack (07 H1)
   */
  constructor({ sceneManager, cine, driver, orbit, keyboard, interaction, hub, bus, dialogs, onPreviewRequired = null,
    history = NO_HISTORY }) {
    this.#sceneManager = sceneManager;
    this.#cine = cine;
    this.#driver = driver;
    this.#orbit = orbit;
    this.#keyboard = keyboard;
    this.#interaction = interaction;
    this.#hub = hub;
    this.#bus = bus;
    this.#dialogs = dialogs;
    this.#onPreviewRequired = onPreviewRequired;
    this.#history = history;
  }

  /** Side effects: none. @returns {boolean} whether pilot mode is on (interaction.pilotMode) */
  get active() {
    return this.#interaction.pilotMode;
  }

  /**
   * Legacy togglePilotMode: enter (save the main camera and orbit state, drive the camera from the film
   * camera) or leave (restore them). The only writer of interaction.pilotMode. The preview guard applies only when
   * entering (08 P2-4a, B-H4 fixed: legacy also blocked leaving once the preview was off, and the preview-off handler
   * clears the flag before it leaves pilot mode, so the app alerted and stayed in pilot mode).
   * Ports: index.html@cd3fd3f lines 3477-3509.
   * Side effects: may alert (entering only); writes interaction.pilotMode; emits PILOT_CHANGED {active} (toolbar
   * button and banner); turns the main camera's HELPERS layer off while piloting and on again on leaving
   * (sceneManager.setHelpersVisibleInMain, 07 R1, Q7); writes the main camera and the orbit state.
   */
  toggle() {
    if (!this.#interaction.pilotMode && !this.#cine.enabled) {
      this.#dialogs.alert('Enable Camera Frustum Preview first to use Pilot Mode');
      if (this.#onPreviewRequired) this.#onPreviewRequired();
      return;
    }

    const interaction = this.#interaction;
    interaction.pilotMode = !interaction.pilotMode;
    this.#bus.emit(Events.PILOT_CHANGED, { active: interaction.pilotMode });
    // 07 R1 (Q7): a clean camera view; the grid, axes, rig, safe-distance floor and pivot marker leave the pilot view
    this.#sceneManager.setHelpersVisibleInMain(!interaction.pilotMode);

    // LEGACY(B-L26): the gizmo is left untouched, so it stays visible (centred on the eye) in pilot mode.
    const camera = this.#sceneManager.camera;
    if (interaction.pilotMode) {
      this.#saved = {
        position: camera.position.clone(),
        orbit: this.#orbit.snapshot(),
        fov: camera.fov
      };

      this.#driver.enterView();
    } else {
      if (this.#saved) {
        camera.position.copy(this.#saved.position);
        this.#orbit.restore(this.#saved.orbit);
        camera.fov = this.#saved.fov;
        camera.updateProjectionMatrix();
        this.#orbit.updateCameraPosition();
      }
      this.#looking = false;
      this.#recordMove();
    }
  }

  /**
   * 07 6.10 Pilot: the flight and look since the last record become one history entry 'Pilot camera move' (coalesced
   * within 2 s): when the movement keys are released, at the end of a mouse look and when pilot mode is left.
   * Side effects: maybe one history record.
   */
  #recordMove() {
    if (!this.#flying && !this.#lookMoved) return;
    this.#flying = false;
    this.#lookMoved = false;
    this.#history.record('Pilot camera move', { coalesceKey: 'camera:pilot', coalesceMs: 2000 });
  }

  /**
   * Starts a mouse look (canvas mousedown in pilot mode).
   * Ports: index.html@cd3fd3f lines 3538-3542.
   * Side effects: writes the look state.
   * @param {MouseEvent} event
   */
  onMouseDown(event) {
    if (!this.active) return;
    this.#looking = true;
    this.#lastMouse = { x: event.clientX, y: event.clientY };
  }

  /**
   * Mouse look: pan/tilt the film camera by the pointer delta, mirror the pose, refresh the camera hub
   * (whose pilot driver re-aims the main camera).
   * Ports: index.html@cd3fd3f lines 3544-3558.
   * Side effects: writes the look state and cine.rotX/rotY; emits CAMERA_POSE_CHANGED {source: 'pilot-look'};
   * hub.refresh() iff the preview is on.
   * @param {MouseEvent} event
   */
  onMouseMove(event) {
    if (!this.active || !this.#looking) return;

    const deltaX = event.clientX - this.#lastMouse.x;
    const deltaY = event.clientY - this.#lastMouse.y;
    this.#lastMouse = { x: event.clientX, y: event.clientY };

    this.#cine.pilotLook(deltaX, deltaY);
    this.#lookMoved = true;

    this.#bus.emit(Events.CAMERA_POSE_CHANGED, { source: 'pilot-look' });

    if (this.#cine.enabled) this.#hub.refresh();
  }

  /**
   * Ends a mouse look (canvas mouseup in pilot mode, and every window mouseup).
   * Ports: index.html@cd3fd3f lines 3560-3562.
   * Side effects: writes the look state.
   */
  onMouseUp() {
    this.#looking = false;
    if (this.#lookMoved) this.#recordMove();
  }

  /**
   * Wheel in pilot mode changes the fly speed (down: x0.85, min 0.01; up: x1.15, max 0.3).
   * Ports: index.html@cd3fd3f lines 3622-3631.
   * Side effects: preventDefault on the event; writes moveSpeed.
   * @param {WheelEvent} event
   */
  onWheel(event) {
    if (!this.active) return;
    event.preventDefault();

    if (event.deltaY > 0) {
      this.moveSpeed = Math.max(0.01, this.moveSpeed * 0.85);
    } else {
      this.moveSpeed = Math.min(0.3, this.moveSpeed * 1.15);
    }
  }

  /**
   * Per-frame keyboard fly of the film camera (W/S along the look direction, A/D sideways, Q/E down/up).
   * The film camera clamps posY at the stage floor 0 on every call, even without a key (08 P2-8c, B-L10 fixed).
   * Ports: index.html@cd3fd3f lines 3564-3620 (the movement statements 3578-3611 are CineCamera.pilotFly).
   * Side effects: writes cine.posX/posY/posZ; iff moved: emits CAMERA_POSE_CHANGED {source: 'pilot-move'},
   * then hub.refresh() iff the preview is on.
   */
  tickKeyboard() {
    if (!this.active) return;

    const cine = this.#cine;
    const pan = cine.rotY * Math.PI / 180;
    const tilt = cine.rotX * Math.PI / 180;

    // LEGACY(B-M13): the vertical component of the fly direction is Strategies.pilotForwardYSign (-1) times
    // sin(tilt), so W/S move vertically opposite to the look direction.
    const forward = new THREE.Vector3(
      -Math.sin(pan) * Math.cos(tilt),
      Strategies.pilotForwardYSign * Math.sin(tilt),
      -Math.cos(pan) * Math.cos(tilt)
    ).normalize();

    const right = new THREE.Vector3(Math.cos(pan), 0, -Math.sin(pan)).normalize();

    const keysPressed = this.#keyboard;
    const keys = {
      forward: keysPressed.isDown('KeyW') || keysPressed.isDown('ArrowUp'),
      back: keysPressed.isDown('KeyS') || keysPressed.isDown('ArrowDown'),
      left: keysPressed.isDown('KeyA') || keysPressed.isDown('ArrowLeft'),
      right: keysPressed.isDown('KeyD') || keysPressed.isDown('ArrowRight'),
      down: keysPressed.isDown('KeyQ'),
      up: keysPressed.isDown('KeyE'),
    };

    // LEGACY(B-L27): a fixed moveSpeed step per frame (no delta time), so the speed depends on the frame rate.
    const moved = cine.pilotFly(keys, forward, right, this.moveSpeed);

    if (moved) {
      this.#flying = true;
      this.#bus.emit(Events.CAMERA_POSE_CHANGED, { source: 'pilot-move' });

      if (cine.enabled) this.#hub.refresh();
    } else if (this.#flying) {
      this.#recordMove();
    }
  }
}
