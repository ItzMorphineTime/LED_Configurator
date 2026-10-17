/**
 * @module render/CameraRigView
 * The film-camera rig in the viewport (legacy `previewCameraGroup`): the body box (the pick target) with its edge
 * outline, the frustum lines and the translucent frustum fill, and the rig transform. Publishes the lens readout
 * (CAMERA_LENS_CHANGED) at the legacy DOM-write point of updateFrustumGeometry. The rig is a registered helper
 * (SceneManager.addHelper) on LAYERS.HELPERS (07 R1): out of the camera preview and the pilot view; the body stays
 * pickable (PointerRay tests every layer).
 * 08 P2-11b (B-L33 fixed; docs/improvements/08-bugfix-roadmap.md 6.10): the frustum ends at the wall. Each far corner is
 * built at the camera-space depth the coverage analyser resolved for it (the corner ray's hit on the wall, else the
 * frame distance D0, else MAX_FRUSTUM_DEPTH_M = 15 m, the legacy depth), so neither the lines nor the fill pokes through
 * the wall; with every depth at 15 m the rig is the legacy one bit for bit.
 * 06 T5 (docs/improvements/06-morph-branding.md 3.8, 5.7, 6.6, D15): the body is Signal Red (opaque at the theme's
 * opacity 1.0) with a 1 px Morph Black edge outline, a child LineSegments of the body that is never picked; the
 * frustum lines are two-tone: a solid Morph Black halo (LineBasicMaterial, render order DEFAULT) under a dashed light
 * core (LineDashedMaterial, RENDER_ORDER.RIG_CORE), two LineSegments sharing one geometry, so each segment carries its
 * own line distances and no closing edge squeezes a dash cycle (never LineLoop, 06 6.6).
 * Legacy source: index.html@cd3fd3f 2321-2344 (createCameraPreview), 2346-2429 (updateFrustumGeometry),
 * 2431-2449 (updateCameraPreviewTransform), 2536-2548 (removeCameraPreview).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { MAX_FRUSTUM_DEPTH_M } from '../geometry/FrustumCoverage.js';
import { disposeObject3D } from './ResourceTracker.js';
import { RENDER_ORDER } from '../core/renderOrder.js';

/**
 * The eight frustum corners in camera space, each [x, y, z] (the camera looks down -Z).
 * @typedef {{nearTL: number[], nearTR: number[], nearBL: number[], nearBR: number[],
 *            farTL: number[], farTR: number[], farBL: number[], farBR: number[]}} FrustumCorners
 */

/**
 * The viewport representation of the film camera: body, frustum lines and frustum fill under one group.
 */
export class CameraRigView {
  /** The depth of a far corner that has no resolved depth (08 P2-11b: the analyser's fallback; the legacy 15 m). */
  static MAX_FRUSTUM_DEPTH_M = MAX_FRUSTUM_DEPTH_M;

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
  /** @type {THREE.LineSegments|null} legacy `frustumHelper`, first half: the solid halo of the frustum lines (06 T5) */
  #linesHalo = null;
  /** @type {THREE.LineSegments|null} legacy `frustumHelper`, second half: the dashed core (same geometry as the halo) */
  #linesCore = null;
  /** @type {THREE.Mesh|null} legacy `frustumOutline` (it is the frustum fill mesh) */
  #fill = null;

  /**
   * Stores the dependencies only (R4): nothing is allocated until create().
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, bus: import('../core/EventBus.js').EventBus,
   *          theme: {scene: object}}} deps
   *   theme: { scene: SceneTheme } (cameraBody incl. outlineColor, frustumLines incl. haloColor, dashSize and gapSize,
   *   frustumFill)
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
   * @returns {THREE.Mesh|null} legacy `cameraBodyMesh`: set by create(), null after remove() (08 P2-4a; legacy kept a
   *   stale reference after the preview was switched off, and picking relied on the preview flag)
   */
  get bodyMesh() {
    return this.#bodyMesh;
  }

  /**
   * Builds the rig: a new group with the body box, the frustum (which publishes the lens readout), adds it to
   * the scene as a helper and applies the pose. The dispose branch for an existing group is unreachable through
   * CameraHub (it creates only when the rig is missing) and is kept verbatim.
   * Ports: index.html@cd3fd3f lines 2321-2344.
   * Side effects: allocates THREE objects (group, body geometry, material, mesh, the outline's edges geometry,
   *   material and LineSegments, then the frustum); emits
   *   CAMERA_LENS_CHANGED (via rebuildFrustum; the hub's next rebuildFrustum emits it again, as legacy wrote the
   *   readout twice on the first enable); adds the group to the scene.
   * @param {import('../domain/CineCamera.js').CineCamera} cine
   * @param {number[]|null} [cornerDepths]  the far-corner depths of rebuildFrustum (08 P2-11b)
   * @returns {void}
   */
  create(cine, cornerDepths = null) {
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      disposeObject3D(this.#group);
    }

    this.#group = new THREE.Group();

    // Camera body (simple box), positioned behind the camera view point so it does not block the view
    const body = this.#theme.scene.cameraBody;
    const bodyGeom = new THREE.BoxGeometry(0.15, 0.1, 0.2);
    const bodyMat = new THREE.MeshBasicMaterial({ color: body.color, transparent: body.opacity < 1, opacity: body.opacity });
    this.#bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    this.#bodyMesh.position.z = 0.15;
    // 06 T5 (D15, 6.6): a 1 px edge outline in the halo colour, so the red body keeps >= 3:1 on any section colour.
    // A child of the body: it moves with it and disposeObject3D(group) disposes it; pickMeshes() never returns it.
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeom), new THREE.LineBasicMaterial({ color: body.outlineColor }));
    this.#bodyMesh.add(outline);
    this.#group.add(this.#bodyMesh);

    // Frustum wireframe and fill
    this.rebuildFrustum(cine, cornerDepths);

    this.#sceneManager.addHelper(this.#group);
    this.updateTransform(cine);
  }

  /**
   * Replaces the frustum lines and fill for the current lens. The lens readout event sits exactly at the legacy
   * DOM-write point (after the old frustum is disposed, before the new one is built). The dead
   * `wallIntersectionPlane` branch of legacy (2358-2362) is dropped: that object was never created.
   * Requires the group to exist (callers: create() and CameraHub.refresh after create()).
   * 08 P2-11b (B-L33 fixed): the far corners take the camera-space depths the coverage analyser resolved
   * (FrustumCoverage.analyzeCoverage's cornerDepths, TL, TR, BR, BL: the corner ray's hit on the wall, else D0, else
   * MAX_FRUSTUM_DEPTH_M), each floored at the near plane (0.2 m) so the frustum never turns inside out next to the wall;
   * without depths every corner is at MAX_FRUSTUM_DEPTH_M, the legacy rig.
   * Ports: index.html@cd3fd3f lines 2346-2429.
   * Side effects: removes and disposes the previous lines (halo and core) and fill; emits CAMERA_LENS_CHANGED
   *   {hFov, vFov, filmbackWidth, filmbackHeight} (radians, mm); allocates the line geometry, the halo material and
   *   LineSegments, the core material and LineSegments (with their line distances), then the fill geometry, fill
   *   material and Mesh, and adds them to the group.
   * @param {import('../domain/CineCamera.js').CineCamera} cine
   * @param {number[]|null} [cornerDepths]  camera-space depths of the far corners TL, TR, BR, BL (metres)
   * @returns {void}
   */
  rebuildFrustum(cine, cornerDepths = null) {
    // Remove old frustum (the halo and the core share one geometry)
    if (this.#linesHalo) {
      this.#group.remove(this.#linesHalo);
      this.#group.remove(this.#linesCore);
      this.#linesHalo.geometry.dispose();
      this.#linesHalo.material.dispose();
      this.#linesCore.material.dispose();
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

    // 08 P2-11b: the far corners end at the wall (the analyser's depths), never nearer than the near plane
    const nearPlane = 0.2;
    const depths = (cornerDepths ?? new Array(4).fill(CameraRigView.MAX_FRUSTUM_DEPTH_M))
      .map((d) => Math.max(nearPlane, d));

    const corners = this.#corners(hFov, vFov, nearPlane, depths);
    const { halo, core } = this.#buildLines(corners);
    this.#linesHalo = halo;
    this.#linesCore = core;
    this.#group.add(halo);
    this.#group.add(core);
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
   * Removes and disposes the rig (no maps). The safe-distance group is not touched here: CameraController removes it
   * right after, through CameraHub.syncSafeDistance (B-M8 fixed in 08 P2-4b). bodyMesh is nulled with the group
   * (08 P2-4a, the 08 2.2 observation: legacy kept a stale `cameraBodyMesh`).
   * Ports: index.html@cd3fd3f lines 2536-2548.
   * Side effects: removes the group helper from the scene and disposes its geometries and materials.
   * @returns {void}
   */
  remove() {
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      disposeObject3D(this.#group);
      this.#group = null;
      this.#bodyMesh = null;
      this.#linesHalo = null;
      this.#linesCore = null;
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
   * The eight frustum corners in camera space (the camera looks down -Z). Each far corner c sits at its own depth z_c:
   * (sx·tan(hFov/2)·z_c, sy·tan(vFov/2)·z_c, -z_c), which is the point of the corner ray at that depth (08 6.10); with
   * every depth equal to D this is the legacy far rectangle at D.
   * Ports: index.html@cd3fd3f lines 2377-2396.
   * @param {number} hFov  radians
   * @param {number} vFov  radians
   * @param {number} nearPlane     metres
   * @param {number[]} depths      metres, the far corners TL, TR, BR, BL
   * @returns {FrustumCorners}
   */
  #corners(hFov, vFov, nearPlane, [dTL, dTR, dBR, dBL]) {
    // Frustum corners at the near plane and at each far corner's depth
    const tx = Math.tan(hFov / 2);
    const ty = Math.tan(vFov / 2);
    const nearHalfW = tx * nearPlane;
    const nearHalfH = ty * nearPlane;

    // Near plane corners (looking down -Z)
    const nearTL = [-nearHalfW, nearHalfH, -nearPlane];
    const nearTR = [nearHalfW, nearHalfH, -nearPlane];
    const nearBL = [-nearHalfW, -nearHalfH, -nearPlane];
    const nearBR = [nearHalfW, -nearHalfH, -nearPlane];

    // Far corners, each at its own depth (the legacy farHalfW = tan(hFov / 2) * depth)
    const farTL = [-(tx * dTL), ty * dTL, -dTL];
    const farTR = [tx * dTR, ty * dTR, -dTR];
    const farBL = [-(tx * dBL), -(ty * dBL), -dBL];
    const farBR = [tx * dBR, -(ty * dBR), -dBR];

    return { nearTL, nearTR, nearBL, nearBR, farTL, farTR, farBL, farBR };
  }

  /**
   * The frustum wireframe: near rectangle, far rectangle, then the four connecting edges (24 vertices, 12
   * independent segments), drawn twice from one geometry (06 T5, 6.6): the solid halo first (render order DEFAULT),
   * then the dashed core (RENDER_ORDER.RIG_CORE) at equal depth, which wins under the default LessEqual depth test, so
   * the line alternates light dashes and dark gaps. LineSegments.computeLineDistances gives every segment its own
   * distance range, so no dash cycle is squeezed into a closing edge. Opaque while the theme opacity is 1.
   * Ports: index.html@cd3fd3f lines 2383-2407.
   * @param {FrustumCorners} corners
   * @returns {{halo: THREE.LineSegments, core: THREE.LineSegments}} allocated as geometry, halo material, halo
   *   LineSegments, core material, core LineSegments
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
    const transparent = style.opacity < 1;
    const frustumGeom = new THREE.BufferGeometry();
    frustumGeom.setAttribute('position', new THREE.Float32BufferAttribute(frustumVertices, 3));
    const halo = new THREE.LineSegments(frustumGeom, new THREE.LineBasicMaterial({
      color: style.haloColor, transparent, opacity: style.opacity,
    }));
    halo.renderOrder = RENDER_ORDER.DEFAULT;
    const core = new THREE.LineSegments(frustumGeom, new THREE.LineDashedMaterial({
      color: style.color, dashSize: style.dashSize, gapSize: style.gapSize, transparent, opacity: style.opacity,
    }));
    core.renderOrder = RENDER_ORDER.RIG_CORE;
    core.computeLineDistances();
    return { halo, core };
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
