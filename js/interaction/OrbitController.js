/**
 * @module interaction/OrbitController
 * The custom spherical orbit camera: canvas drag and wheel, WASD/QE target offset (per frame), view presets,
 * the flat-bounds orbit target, and the snapshot/restore used by pilot mode.
 * Legacy source: index.html@cd3fd3f 3747-3754 (state), 3756-3764 (updateTargetPosition), 3766-3817
 * (handleKeyboardMovement), 3819-3840 (setupControls, canvas part), 3857-3863 (updateCameraPosition),
 * 3865-3875 (setView), 3488-3502 (pilot save/restore of the orbit state).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import THREE from '../vendor/three.js';

/**
 * @typedef {object} OrbitSnapshot  the orbit part of the pilot's saved camera state (3488-3494)
 * @property {{theta: number, phi: number}} angle  a copy of `angle`
 * @property {number} distance
 * @property {THREE.Vector3} offset                a clone of `offset`
 */

/**
 * The main camera's custom spherical orbit. Owns the legacy globals `cameraAngle` (angle), `cameraDistance`
 * (distance), `targetPosition` (target), `targetOffset` (offset), `isDragging`, `previousMousePosition` and the
 * `moveSpeed` constant (MOVE_SPEED).
 * Wiring (App): attach() in the init phase, before ViewportInput's canvas listeners; tickKeyboard() first in the
 * frame tick; setView('reset') at the end of the bootstrap. ViewportToolbar calls setView(), WallController
 * updateCameraPosition() after each rebuild, and PilotController snapshot() / restore().
 */
export class OrbitController {
  /** Target-offset step per frame for WASD/QE (legacy `moveSpeed`, 3754). */
  static MOVE_SPEED = 0.08;

  /** Legacy `cameraAngle` (3748). REPLACED by a new object in setView() and restore(), as legacy. */
  angle = { theta: 0, phi: Math.PI / 2 };
  /** Legacy `cameraDistance` (3748). */
  distance = 8;
  /** @type {THREE.Vector3} legacy `targetPosition` (3749) */
  target = new THREE.Vector3(0, 0, 0);
  /** @type {THREE.Vector3} legacy `targetOffset` (3750): manual offset from the calculated centre */
  offset = new THREE.Vector3(0, 0, 0);

  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('./InputState.js').KeyboardState} */
  #keyboard;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;
  /** @type {() => {totalWidth: number, maxHeight: number, minX: number, wallZ: number}} 'flat-pivot' bounds (03 T3) */
  #frameBounds;
  /** legacy `isDragging` (3747) */
  #dragging = false;
  /** legacy `previousMousePosition` (3747) */
  #prevMouse = { x: 0, y: 0 };

  /**
   * Stores the collaborators (no listeners here: see attach()).
   * Side effects: none.
   * @param {{sceneManager: import('../render/SceneManager.js').SceneManager,
   *          keyboard: import('./InputState.js').KeyboardState,
   *          interaction: import('./InputState.js').InteractionState,
   *          frameBounds: () => {totalWidth: number, maxHeight: number, minX: number, wallZ: number}}} deps
   *   frameBounds is the injected `framingBounds(project, wallController.pivotResolution)` (the 'flat-pivot' bounds,
   *   03 T3; the flat bounds in Phase 1)
   */
  constructor({ sceneManager, keyboard, interaction, frameBounds }) {
    this.#sceneManager = sceneManager;
    this.#keyboard = keyboard;
    this.#interaction = interaction;
    this.#frameBounds = frameBounds;
  }

  /**
   * Registers the orbit listeners on the main canvas, in legacy order: mousedown, mousemove, mouseup,
   * mouseleave, wheel (no options object, as legacy). Drag is ignored while dragging the gizmo or in pilot
   * mode; the wheel is ignored in pilot mode. Registered in the init phase, before ViewportInput's.
   * Ports: index.html@cd3fd3f lines 3820-3840.
   * Side effects: adds 5 canvas listeners; the handlers write angle/distance and move the main camera.
   */
  attach() {
    const canvas = this.#sceneManager.renderer.domElement;
    const interaction = this.#interaction;
    canvas.addEventListener('mousedown', (e) => {
      if (interaction.isDraggingGizmo || interaction.pilotMode) return;
      this.#dragging = true;
      this.#prevMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.#dragging || interaction.isDraggingGizmo || interaction.pilotMode) return;
      this.angle.theta -= (e.clientX - this.#prevMouse.x) * 0.01;
      this.angle.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.angle.phi - (e.clientY - this.#prevMouse.y) * 0.01));
      this.#prevMouse = { x: e.clientX, y: e.clientY };
      this.updateCameraPosition();
    });
    canvas.addEventListener('mouseup', () => {
      this.#dragging = false;
    });
    canvas.addEventListener('mouseleave', () => {
      this.#dragging = false;
    });
    canvas.addEventListener('wheel', (e) => {
      if (interaction.pilotMode) return;
      e.preventDefault();
      this.distance = Math.max(2, Math.min(30, this.distance + e.deltaY * 0.01));
      this.updateCameraPosition();
    });
  }

  /**
   * Recomputes the orbit target: the centre of the framing bounds plus the manual offset. Since 03 T3 the 'flat-pivot'
   * bounds (03 6.6): x = minX + totalWidth / 2 + offset.x, z = wallZ + offset.z (the flat wall translated by the stage
   * origin). At the identity pivot minX = wallZ = +0, so x and y are the legacy values bit for bit and z differs only in
   * the sign of a zero offset.z (0 + -0), which lookAt and the rendering cannot observe.
   * Ports: index.html@cd3fd3f lines 3756-3764 (the bounds loop 3757-3762 is the injected frameBounds).
   * Side effects: writes target.
   */
  updateTargetPosition() {
    // LEGACY(B-L2): the target uses the flat bounds (sum of section widths along +X, max height), via the
    // injected frameBounds (= framingBounds 'flat-pivot'), whatever the curve or angle of the wall.
    const b = this.#frameBounds();
    this.target.set(b.minX + b.totalWidth / 2 + this.offset.x, b.maxHeight / 2 + this.offset.y, b.wallZ + this.offset.z);
  }

  /**
   * Places the main camera on the sphere around the target and aims it at the target.
   * Ports: index.html@cd3fd3f lines 3857-3863.
   * Side effects: writes target, the main camera position and orientation.
   */
  updateCameraPosition() {
    this.updateTargetPosition();
    const camera = this.#sceneManager.camera;
    const targetPosition = this.target;
    camera.position.x = targetPosition.x + this.distance * Math.sin(this.angle.phi) * Math.sin(this.angle.theta);
    camera.position.y = targetPosition.y + this.distance * Math.cos(this.angle.phi);
    camera.position.z = targetPosition.z + this.distance * Math.sin(this.angle.phi) * Math.cos(this.angle.theta);
    camera.lookAt(targetPosition);
  }

  /**
   * Per-frame WASD/arrows (horizontal, relative to theta) and Q/E (vertical) movement of the target offset.
   * Skipped in pilot mode.
   * Ports: index.html@cd3fd3f lines 3766-3817.
   * Side effects: writes offset; moves the main camera iff a movement key is held.
   */
  tickKeyboard() {
    // Skip movement controls in pilot mode
    if (this.#interaction.pilotMode) return;

    // Calculate forward/right vectors based on camera angle
    const forward = new THREE.Vector3(
      Math.sin(this.angle.theta),
      0,
      Math.cos(this.angle.theta)
    );
    const right = new THREE.Vector3(
      Math.cos(this.angle.theta),
      0,
      -Math.sin(this.angle.theta)
    );

    // LEGACY(B-L27): a fixed MOVE_SPEED step per frame (no delta time), so the speed depends on the frame rate.
    const moveSpeed = OrbitController.MOVE_SPEED;
    const keys = this.#keyboard;
    const targetOffset = this.offset;
    let moved = false;

    // W/S - Forward/Backward
    if (keys.isDown('KeyW') || keys.isDown('ArrowUp')) {
      targetOffset.add(forward.clone().multiplyScalar(-moveSpeed));
      moved = true;
    }
    if (keys.isDown('KeyS') || keys.isDown('ArrowDown')) {
      targetOffset.add(forward.clone().multiplyScalar(moveSpeed));
      moved = true;
    }

    // A/D - Left/Right
    if (keys.isDown('KeyA') || keys.isDown('ArrowLeft')) {
      targetOffset.add(right.clone().multiplyScalar(-moveSpeed));
      moved = true;
    }
    if (keys.isDown('KeyD') || keys.isDown('ArrowRight')) {
      targetOffset.add(right.clone().multiplyScalar(moveSpeed));
      moved = true;
    }

    // Q/E - Down/Up
    if (keys.isDown('KeyQ')) {
      targetOffset.y -= moveSpeed;
      moved = true;
    }
    if (keys.isDown('KeyE')) {
      targetOffset.y += moveSpeed;
      moved = true;
    }

    if (moved) {
      this.updateCameraPosition();
    }
  }

  /**
   * View presets: 'front', 'side', 'top'; anything else resets (theta 0.3, phi PI / 2.5, distance 8,
   * offset 0). Replaces `angle` with a new object, as legacy.
   * Ports: index.html@cd3fd3f lines 3865-3875.
   * Side effects: writes angle (and distance/offset on reset); moves the main camera.
   * @param {string} view
   */
  setView(view) {
    // LEGACY(B-L25): no pilot guard; in pilot mode the preset moves the main camera away from the pilot view.
    if (view === 'front') this.angle = { theta: 0, phi: Math.PI / 2 };
    else if (view === 'side') this.angle = { theta: Math.PI / 2, phi: Math.PI / 2 };
    else if (view === 'top') this.angle = { theta: 0, phi: 0.1 };
    else {
      this.angle = { theta: 0.3, phi: Math.PI / 2.5 };
      this.distance = 8;
      this.offset.set(0, 0, 0); // Reset offset on view reset
    }
    this.updateCameraPosition();
  }

  /**
   * The orbit part of the pilot's saved camera state.
   * Ports: index.html@cd3fd3f lines 3490-3492.
   * Side effects: none.
   * @returns {OrbitSnapshot} { angle: { ...angle }, distance, offset: offset.clone() }
   */
  snapshot() {
    return {
      angle: { ...this.angle },
      distance: this.distance,
      offset: this.offset.clone(),
    };
  }

  /**
   * Restores a snapshot taken by snapshot(); `angle` becomes a new object, as legacy.
   * Does not move the camera (the pilot calls updateCameraPosition() after restoring the fov).
   * Ports: index.html@cd3fd3f lines 3500-3502.
   * Side effects: writes angle, distance, offset.
   * @param {OrbitSnapshot} s
   */
  restore(s) {
    this.angle = { ...s.angle };
    this.distance = s.distance;
    this.offset.copy(s.offset);
  }
}
