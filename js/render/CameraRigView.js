/**
 * @module render/CameraRigView
 * The film-camera rig in the viewport (legacy `previewCameraGroup`): the orange body box (the pick target), the
 * frustum lines and the translucent frustum fill, and the rig transform. Publishes the lens readout
 * (CAMERA_LENS_CHANGED) at the legacy DOM-write point of updateFrustumGeometry. The rig is a registered helper
 * (SceneManager.addHelper), on layer 0 like every helper in Phase 1.
 * Legacy source: index.html@cd3fd3f 2321-2344 (createCameraPreview), 2346-2429 (updateFrustumGeometry),
 * 2431-2449 (updateCameraPreviewTransform), 2536-2548 (removeCameraPreview).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { disposeObject3D } from './ResourceTracker.js';

/**
 * The eight frustum corners in camera space, each [x, y, z] (the camera looks down -Z).
 * @typedef {{nearTL: number[], nearTR: number[], nearBL: number[], nearBR: number[],
 *            farTL: number[], farTR: number[], farBL: number[], farBR: number[]}} FrustumCorners
 */

/**
 * The viewport representation of the film camera: body, frustum lines and frustum fill under one group.
 */
export class CameraRigView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {{scene: object}} */
  #theme;
  /** @type {THREE.Group|null} legacy `previewCameraGroup` */
  #group = null;
  /** @type {THREE.Mesh|null} legacy `cameraBodyMesh`: set by create(), never nulled (legacy 2536-2548) */
  #bodyMesh = null;
  /** @type {THREE.LineSegments|null} legacy `frustumHelper` (the frustum lines) */
  #lines = null;
  /** @type {THREE.Mesh|null} legacy `frustumOutline` (it is the frustum fill mesh) */
  #fill = null;

  /**
   * Stores the dependencies only (R4): nothing is allocated until create().
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, bus: import('../core/EventBus.js').EventBus,
   *          theme: {scene: object}}} deps
   *   theme: { scene: SceneTheme } (cameraBody, frustumLines, frustumFill)
   */
  constructor({ sceneManager, bus, theme }) {
    this.#sceneManager = sceneManager;
    this.#bus = bus;
    this.#theme = theme;
  }

  /** Side effects: none. @returns {boolean} whether the rig group exists (legacy `previewCameraGroup` truthiness) */
  get exists() {
    return !!this.#group;
  }

  /** Side effects: none. @returns {THREE.Group|null} the rig group (legacy `previewCameraGroup`) */
  get group() {
    return this.#group;
  }

  /**
   * Side effects: none.
   * @returns {THREE.Mesh|null} legacy `cameraBodyMesh`: set by create(), NEVER nulled by remove(), so it keeps a
   *   stale reference after the preview is switched off (picking is gated by the preview flag instead)
   */
  get bodyMesh() {
    return this.#bodyMesh;
  }

  /**
   * Builds the rig: a new group with the body box, the frustum (which publishes the lens readout), adds it to
   * the scene as a helper and applies the pose. The dispose branch for an existing group is unreachable through
   * CameraHub (it creates only when the rig is missing) and is kept verbatim.
   * Ports: index.html@cd3fd3f lines 2321-2344.
   * Side effects: allocates THREE objects (group, body geometry, material, mesh, then the frustum); emits
   *   CAMERA_LENS_CHANGED (via rebuildFrustum; the hub's next rebuildFrustum emits it again, as legacy wrote the
   *   readout twice on the first enable); adds the group to the scene.
   * @param {import('../domain/CineCamera.js').CineCamera} cine
   * @returns {void}
   */
  create(cine) {
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      disposeObject3D(this.#group);
    }

    this.#group = new THREE.Group();

    // Camera body (simple box), positioned behind the camera view point so it does not block the view
    const body = this.#theme.scene.cameraBody;
    const bodyGeom = new THREE.BoxGeometry(0.15, 0.1, 0.2);
    const bodyMat = new THREE.MeshBasicMaterial({ color: body.color, transparent: true, opacity: body.opacity });
    this.#bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    this.#bodyMesh.position.z = 0.15;
    this.#group.add(this.#bodyMesh);

    // Frustum wireframe and fill
    this.rebuildFrustum(cine);

    this.#sceneManager.addHelper(this.#group);
    this.updateTransform(cine);
  }

  /**
   * Replaces the frustum lines and fill for the current lens. The lens readout event sits exactly at the legacy
   * DOM-write point (after the old frustum is disposed, before the new one is built). The dead
   * `wallIntersectionPlane` branch of legacy (2358-2362) is dropped: that object was never created.
   * Requires the group to exist (callers: create() and CameraHub.refresh after create()).
   * Ports: index.html@cd3fd3f lines 2346-2429.
   * Side effects: removes and disposes the previous lines and fill; emits CAMERA_LENS_CHANGED
   *   {hFov, vFov, filmbackWidth, filmbackHeight} (radians, mm); allocates the line geometry, line material,
   *   LineSegments, then the fill geometry, fill material and Mesh, and adds both to the group.
   * @param {import('../domain/CineCamera.js').CineCamera} cine
   * @returns {void}
   */
  rebuildFrustum(cine) {
    // Remove old frustum
    if (this.#lines) {
      this.#group.remove(this.#lines);
      this.#lines.geometry.dispose();
      this.#lines.material.dispose();
    }
    if (this.#fill) {
      this.#group.remove(this.#fill);
      this.#fill.geometry.dispose();
      this.#fill.material.dispose();
    }

    // FOV from filmback and focal length
    const hFov = cine.hFov();
    const vFov = cine.vFov();

    // Lens readout (legacy wrote #camera-hfov, #camera-vfov and #camera-aspect here)
    this.#bus.emit(Events.CAMERA_LENS_CHANGED, {
      hFov, vFov, filmbackWidth: cine.filmbackWidth, filmbackHeight: cine.filmbackHeight,
    });

    // LEGACY(B-L33): the frustum is always drawn to Strategies.frustumDepthM (15 m), not clipped at the wall.
    const frustumDepth = Strategies.frustumDepthM; // meters
    const nearPlane = 0.2;

    const corners = this.#corners(hFov, vFov, nearPlane, frustumDepth);
    this.#lines = this.#buildLines(corners);
    this.#group.add(this.#lines);
    this.#fill = this.#buildFill(corners);
    this.#group.add(this.#fill);
  }

  /**
   * Places and orients the rig (Euler order 'YXZ': pan, then tilt, then roll). No-op without a group.
   * Ports: index.html@cd3fd3f lines 2431-2449.
   * Side effects: writes the group position and rotation.
   * @param {import('../domain/CineCamera.js').CineCamera} cine
   * @returns {void}
   */
  updateTransform(cine) {
    if (!this.#group) return;
    const group = this.#group;

    // Position camera (Z is the distance from the wall, so the camera stands at +Z)
    group.position.set(
      cine.posX,
      cine.posY,
      cine.posZ
    );

    // Rotations in YXZ order: pan (Y) first, then tilt (X), then roll (Z)
    const tilt = cine.rotX * Math.PI / 180;
    const pan = cine.rotY * Math.PI / 180;
    const roll = cine.rotZ * Math.PI / 180;

    group.rotation.order = 'YXZ';
    group.rotation.set(tilt, pan, roll);
  }

  /**
   * Removes and disposes the rig (no maps). The safe-distance group is NOT touched here: it stays in the scene
   * when the preview is switched off (B-M8, tagged at CameraController.setPreviewEnabled). bodyMesh keeps its
   * stale reference.
   * Ports: index.html@cd3fd3f lines 2536-2548.
   * Side effects: removes the group helper from the scene and disposes its geometries and materials.
   * @returns {void}
   */
  remove() {
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      disposeObject3D(this.#group);
      this.#group = null;
      this.#lines = null;
      this.#fill = null;
    }
  }

  /**
   * The meshes to raycast for the Selectable 'camera': only the body, never the frustum.
   * Ports: index.html@cd3fd3f lines 3440-3443.
   * Side effects: none.
   * @returns {THREE.Mesh[]} [bodyMesh]
   */
  pickMeshes() {
    return [this.#bodyMesh];
  }

  /**
   * The eight frustum corners in camera space (the camera looks down -Z).
   * Ports: index.html@cd3fd3f lines 2377-2396.
   * @param {number} hFov  radians
   * @param {number} vFov  radians
   * @param {number} nearPlane     metres
   * @param {number} frustumDepth  metres
   * @returns {FrustumCorners}
   */
  #corners(hFov, vFov, nearPlane, frustumDepth) {
    // Frustum corners at the near and far planes
    const nearHalfW = Math.tan(hFov / 2) * nearPlane;
    const nearHalfH = Math.tan(vFov / 2) * nearPlane;
    const farHalfW = Math.tan(hFov / 2) * frustumDepth;
    const farHalfH = Math.tan(vFov / 2) * frustumDepth;

    // Near plane corners (looking down -Z)
    const nearTL = [-nearHalfW, nearHalfH, -nearPlane];
    const nearTR = [nearHalfW, nearHalfH, -nearPlane];
    const nearBL = [-nearHalfW, -nearHalfH, -nearPlane];
    const nearBR = [nearHalfW, -nearHalfH, -nearPlane];

    // Far plane corners
    const farTL = [-farHalfW, farHalfH, -frustumDepth];
    const farTR = [farHalfW, farHalfH, -frustumDepth];
    const farBL = [-farHalfW, -farHalfH, -frustumDepth];
    const farBR = [farHalfW, -farHalfH, -frustumDepth];

    return { nearTL, nearTR, nearBL, nearBR, farTL, farTR, farBL, farBR };
  }

  /**
   * The frustum wireframe: near rectangle, far rectangle, then the four connecting edges (24 vertices).
   * Ports: index.html@cd3fd3f lines 2383-2407.
   * @param {FrustumCorners} corners
   * @returns {THREE.LineSegments} allocated as geometry, then material, then LineSegments
   */
  #buildLines({ nearTL, nearTR, nearBL, nearBR, farTL, farTR, farBL, farBR }) {
    const frustumVertices = [];

    // Near plane rectangle
    frustumVertices.push(...nearTL, ...nearTR, ...nearTR, ...nearBR, ...nearBR, ...nearBL, ...nearBL, ...nearTL);
    // Far plane rectangle
    frustumVertices.push(...farTL, ...farTR, ...farTR, ...farBR, ...farBR, ...farBL, ...farBL, ...farTL);
    // Connecting lines
    frustumVertices.push(...nearTL, ...farTL, ...nearTR, ...farTR, ...nearBL, ...farBL, ...nearBR, ...farBR);

    const style = this.#theme.scene.frustumLines;
    const frustumGeom = new THREE.BufferGeometry();
    frustumGeom.setAttribute('position', new THREE.Float32BufferAttribute(frustumVertices, 3));
    return new THREE.LineSegments(frustumGeom, new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity }));
  }

  /**
   * The semi-transparent frustum fill: near plane and four sides, two triangles each (30 vertices).
   * Ports: index.html@cd3fd3f lines 2410-2427.
   * @param {FrustumCorners} corners
   * @returns {THREE.Mesh} allocated as geometry, then material, then Mesh
   */
  #buildFill({ nearTL, nearTR, nearBL, nearBR, farTL, farTR, farBL, farBR }) {
    const style = this.#theme.scene.frustumFill;
    const fillGeom = new THREE.BufferGeometry();
    const fillVertices = new Float32Array([
      // Near plane
      ...nearTL, ...nearTR, ...nearBR, ...nearTL, ...nearBR, ...nearBL,
      // Left side
      ...nearTL, ...nearBL, ...farBL, ...nearTL, ...farBL, ...farTL,
      // Right side
      ...nearTR, ...farTR, ...farBR, ...nearTR, ...farBR, ...nearBR,
      // Top side
      ...nearTL, ...farTL, ...farTR, ...nearTL, ...farTR, ...nearTR,
      // Bottom side
      ...nearBL, ...nearBR, ...farBR, ...nearBL, ...farBR, ...farBL
    ]);
    fillGeom.setAttribute('position', new THREE.BufferAttribute(fillVertices, 3));
    return new THREE.Mesh(fillGeom, new THREE.MeshBasicMaterial({
      color: style.color, transparent: true, opacity: style.opacity, side: THREE.DoubleSide, depthWrite: false
    }));
  }
}
