/**
 * @module interaction/TransformGizmo
 * The hand-written translate/rotate gizmo bound to the selected Selectable: build (exact legacy allocation
 * order), world/local orientation, position follow, hover highlight, drag start/move/end. The domain writes of
 * a drag go through the Selectable (applyGizmoTranslate / applyGizmoRotate).
 * Legacy source: index.html@cd3fd3f 1358-1367 (gizmo state), 2997-3099 (createGizmo), 3101-3137 (orientation
 * and position, generic parts), 3146-3152 (deselect part), 3169-3193 (mode, space), 3195-3230 (hover),
 * 3232-3425 (mouse down/move/up), 4426-4431 (Escape mode reset).
 * Layer: interaction (may import vendor/three, core, legacy, interaction, and render/ResourceTracker only).
 */
import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { disposeObject3D } from '../render/ResourceTracker.js';

/** @typedef {import('./SelectionManager.js').Selectable} Selectable */

/**
 * The translate/rotate gizmo of the selected Selectable, registered with SceneManager as a helper. Owns the
 * legacy globals `gizmoMode`, `gizmoSpace`, `gizmoGroup`, `gizmoHandles`, `activeGizmoAxis`, `hoveredGizmoAxis`,
 * `dragStartPoint` and `dragPlane`, and is the only writer of InteractionState.isDraggingGizmo.
 * Wiring (App): SelectionManager attaches and detaches the target; ViewportInput routes the canvas pointer events
 * and the G/R/L/Escape keys here, ViewportToolbar its mode and space buttons; the constructor subscribes to
 * SELECTABLE_MOVED so the gizmo follows its target.
 */
export class TransformGizmo {
  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('./InputState.js').PointerRay} */
  #pointerRay;
  /** @type {import('./InputState.js').InteractionState} */
  #interaction;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {{x: number, y: number, z: number, idleOpacity: number, hoverOpacity: number, dimmedOpacity: number}} */
  #colors;
  /** @type {'translate'|'rotate'|null} legacy `gizmoMode` */
  #mode = null;
  /** @type {'world'|'local'} legacy `gizmoSpace` */
  #space = 'world';
  /** @type {Selectable|null} the selected Selectable (legacy `selectedObject`, as an object) */
  #target = null;
  /** @type {THREE.Group|null} legacy `gizmoGroup` */
  #group = null;
  /** @type {Record<string, THREE.Object3D>} legacy `gizmoHandles` */
  #handles = {};
  /** @type {string|null} legacy `activeGizmoAxis` */
  #activeAxis = null;
  /** @type {string|null} legacy `hoveredGizmoAxis` */
  #hoveredAxis = null;
  /** @type {THREE.Vector3} legacy `dragStartPoint` */
  #dragStart = new THREE.Vector3();
  /** @type {THREE.Plane} legacy `dragPlane` */
  #dragPlane = new THREE.Plane();

  /**
   * Stores the collaborators and subscribes to SELECTABLE_MOVED: when the moved Selectable is the gizmo's
   * target, the gizmo follows it (position only, B-L23, tagged at updatePosition).
   * Allocates no THREE Object3D/Material/Geometry (R4).
   * Side effects: one bus subscription.
   * @param {{sceneManager: import('../render/SceneManager.js').SceneManager,
   *          pointerRay: import('./InputState.js').PointerRay,
   *          interaction: import('./InputState.js').InteractionState,
   *          bus: import('../core/EventBus.js').EventBus,
   *          theme: {scene: import('../theme/Theme.js').SceneTheme}}} deps
   */
  constructor({ sceneManager, pointerRay, interaction, bus, theme }) {
    this.#sceneManager = sceneManager;
    this.#pointerRay = pointerRay;
    this.#interaction = interaction;
    this.#bus = bus;
    this.#colors = theme.scene.gizmo;
    bus.on(Events.SELECTABLE_MOVED, ({ id }) => {
      if (this.#target && this.#target.id === id) this.updatePosition();
    });
  }

  /** Side effects: none. @returns {'translate'|'rotate'|null} legacy gizmoMode */
  get mode() {
    return this.#mode;
  }

  /** Side effects: none. @returns {'world'|'local'} legacy gizmoSpace */
  get space() {
    return this.#space;
  }

  /** Side effects: none. @returns {THREE.Group|null} legacy gizmoGroup */
  get group() {
    return this.#group;
  }

  /** Side effects: none. @returns {Selectable|null} the Selectable the gizmo is bound to */
  get target() {
    return this.#target;
  }

  /** Side effects: none. @returns {string|null} legacy activeGizmoAxis */
  get activeAxis() {
    return this.#activeAxis;
  }

  /** Side effects: none. @returns {string|null} legacy hoveredGizmoAxis */
  get hoveredAxis() {
    return this.#hoveredAxis;
  }

  /**
   * Binds the gizmo to a newly selected Selectable and rebuilds it (the createGizmo call of selectObject).
   * Ports: index.html@cd3fd3f line 3142.
   * Side effects: see rebuild().
   * @param {Selectable} target
   */
  attach(target) {
    this.#target = target;
    this.rebuild();
  }

  /**
   * Unbinds the gizmo and removes its group from the scene (the gizmo part of deselectObject).
   * Ports: index.html@cd3fd3f lines 3146-3152.
   * Side effects: resets hoveredAxis; removes the group helper from the scene and disposes its geometries and
   *   materials (Strategies.dispose.gizmo).
   */
  detach() {
    this.#target = null;
    this.#hoveredAxis = null;
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      // The removed group's geometries and materials are disposed when Strategies.dispose.gizmo is true (true
      // since Phase 1C H2, which fixed B-L12; legacy leaked them). No other object shares them.
      if (Strategies.dispose.gizmo) disposeObject3D(this.#group);
      this.#group = null;
    }
  }

  /**
   * Toggles the requested mode (same mode again turns the gizmo off), mirrors it, rebuilds.
   * Ports: index.html@cd3fd3f lines 3169-3180.
   * Side effects: emits GIZMO_MODE_CHANGED {mode} (toolbar buttons), then rebuild().
   * @param {'translate'|'rotate'} requested
   */
  setMode(requested) {
    if (this.#mode === requested) {
      this.#mode = null;
    } else {
      this.#mode = requested;
    }
    this.#bus.emit(Events.GIZMO_MODE_CHANGED, { mode: this.#mode });
    this.rebuild();
  }

  /**
   * Turns the gizmo mode off (the Escape branch of the shortcut handler).
   * Ports: index.html@cd3fd3f lines 4427-4430.
   * Side effects: emits GIZMO_MODE_CHANGED {mode: null} (toolbar buttons), then rebuild() (which only removes).
   */
  clearMode() {
    this.#mode = null;
    this.#bus.emit(Events.GIZMO_MODE_CHANGED, { mode: null });
    this.rebuild();
  }

  /**
   * Toggles world/local space, mirrors it, re-orients an existing gizmo.
   * Ports: index.html@cd3fd3f lines 3182-3193.
   * Side effects: emits GIZMO_SPACE_CHANGED {space} (toolbar button); may write the group rotation.
   */
  toggleSpace() {
    this.#space = this.#space === 'world' ? 'local' : 'world';
    this.#bus.emit(Events.GIZMO_SPACE_CHANGED, { space: this.#space });
    if (this.#group) {
      this.updateOrientation();
    }
  }

  /**
   * Legacy createGizmo: removes the previous group, then (iff there is a target and a mode) builds the
   * handles in the exact legacy allocation order, orients and positions the group and adds it to the scene.
   * Never resets hoveredAxis (legacy keeps a stale hover across rebuilds).
   * Ports: index.html@cd3fd3f lines 2997-3099.
   * Side effects: removes/adds the gizmo helper; disposes the replaced group's geometries and materials
   *   (Strategies.dispose.gizmo); allocates THREE groups, geometries, materials and meshes.
   */
  rebuild() {
    if (this.#group) {
      this.#sceneManager.removeHelper(this.#group);
      // The replaced group is disposed when Strategies.dispose.gizmo is true (true since Phase 1C H2, which fixed
      // B-L12; legacy leaked its geometries and materials on every rebuild). The full golden master, including the
      // keyboard and gizmo_drag screenshots, was unchanged by the flip (freed materials could have changed WebGL
      // program ids and so the draw order).
      if (Strategies.dispose.gizmo) disposeObject3D(this.#group);
      this.#group = null;
    }

    if (!this.#target || !this.#mode) return;

    // LEGACY(B-L26): pilot mode does not hide or skip the gizmo; it is built and rendered as usual.
    const gizmoGroup = new THREE.Group();
    this.#group = gizmoGroup;
    gizmoGroup.renderOrder = 999;
    this.#handles = {};

    const scale = 0.7; // Larger gizmos

    // LEGACY(B-L22): every handle is built whatever the target, so props show a Y arrow and X/Z rings
    // that do nothing (Prop.translateBy ignores dy, Prop.rotateBy ignores x and z).
    if (this.#mode === 'translate') {
      this.#buildTranslateHandles(gizmoGroup, scale);
    } else if (this.#mode === 'rotate') {
      this.#buildRotateHandles(gizmoGroup, scale);
    }

    this.updateOrientation();
    this.updatePosition();
    this.#sceneManager.addHelper(gizmoGroup);
  }

  /**
   * Resets the group rotation; in local space the target orients it.
   * Ports: index.html@cd3fd3f lines 3101-3120 (the per-object branches 3107-3118 are Selectable.orientGizmo).
   * Side effects: writes the group rotation.
   */
  updateOrientation() {
    if (!this.#group || !this.#target) return;

    this.#group.rotation.set(0, 0, 0);

    if (this.#space === 'local') {
      this.#target.orientGizmo(this.#group.rotation);
    }
  }

  /**
   * Moves the group to the target's gizmo anchor (when the target's scene object exists).
   * Ports: index.html@cd3fd3f lines 3122-3137 (the per-object branches 3126-3134 are
   * Selectable.hasGizmoTarget / gizmoAnchor).
   * Side effects: writes the group position.
   */
  updatePosition() {
    if (!this.#group || !this.#target) return;

    // LEGACY(B-L23): position-only follow; outside drags the local-space orientation is not refreshed when
    // the target rotates (inputs, pilot look), so it goes stale.
    if (!this.#target.hasGizmoTarget()) return;

    this.#group.position.copy(this.#target.gizmoAnchor(new THREE.Vector3()));
  }

  /**
   * Hover highlight of the handle under the pointer (mousemove without drag).
   * Ports: index.html@cd3fd3f lines 3195-3230.
   * Side effects: writes the shared pick ray, handle mesh userData, hoveredAxis and handle opacities.
   * @param {MouseEvent} event
   */
  onHover(event) {
    if (!this.#group || this.#interaction.isDraggingGizmo || this.#interaction.pilotMode) return;

    const raycaster = this.#pointerRay.fromEvent(event);
    const intersects = raycaster.intersectObjects(this.#collectHandleMeshes(), false);
    const newHovered = intersects.length > 0 ? intersects[0].object.userData.axis : null;

    if (newHovered !== this.#hoveredAxis) {
      this.#hoveredAxis = newHovered;
      this.#paintHandles(this.#hoveredAxis, this.#colors.hoverOpacity, this.#colors.idleOpacity);
    }
  }

  /**
   * Starts a drag when a handle is hit: active axis, drag flag, highlight, drag plane, drag start point.
   * Ports: index.html@cd3fd3f lines 3232-3307.
   * Side effects: writes the shared pick ray, handle mesh userData; on a hit also activeAxis,
   * interaction.isDraggingGizmo, handle opacities, the drag plane and the drag start point.
   * @param {MouseEvent} event
   * @returns {boolean} true iff a handle was hit (the event is then not used for picking)
   */
  onMouseDown(event) {
    if (!this.#group || !this.#target || this.#interaction.pilotMode) return false;

    const raycaster = this.#pointerRay.fromEvent(event);
    const intersects = raycaster.intersectObjects(this.#collectHandleMeshes(), false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      this.#activeAxis = hit.object.userData.axis;
      this.#interaction.isDraggingGizmo = true;

      // Highlight active axis
      this.#paintHandles(this.#activeAxis, this.#colors.hoverOpacity, this.#colors.dimmedOpacity);

      const gizmoPos = this.#group.position.clone();

      if (this.#mode === 'translate') {
        const axisDir = this.#axisDirection(this.#activeAxis);
        const camera = this.#sceneManager.camera;
        const cameraDir = camera.position.clone().sub(gizmoPos).normalize();
        const planeNormal = cameraDir.clone().cross(axisDir).cross(axisDir).normalize();

        if (planeNormal.length() < 0.1) {
          planeNormal.copy(cameraDir);
        }

        this.#dragPlane.setFromNormalAndCoplanarPoint(planeNormal, gizmoPos);
      } else if (this.#mode === 'rotate') {
        const planeNormal = this.#axisDirection(this.#activeAxis);
        this.#dragPlane.setFromNormalAndCoplanarPoint(planeNormal, gizmoPos);
      }

      raycaster.ray.intersectPlane(this.#dragPlane, this.#dragStart);
      return true;
    }

    return false;
  }

  /**
   * Continues a drag: projects the pointer on the drag plane and hands the translation (along the active
   * axis) or the signed rotation angle (degrees) to the target, then follows it.
   * Ports: index.html@cd3fd3f lines 3309-3409 (the per-object branches 3337-3361 and 3375-3400 are
   * Selectable.applyGizmoTranslate / applyGizmoRotate).
   * Side effects: writes the shared pick ray and the drag start point; the target writes the domain, emits
   * its pose events and refreshes; may write the group rotation and position.
   * @param {MouseEvent} event
   */
  onMouseMove(event) {
    if (!this.#interaction.isDraggingGizmo || !this.#activeAxis || !this.#group) return;

    const raycaster = this.#pointerRay.fromEvent(event);

    const currentPoint = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(this.#dragPlane, currentPoint)) return;

    // A group exists only while a target is bound (rebuild builds it only with a target; detach clears both).
    if (this.#mode === 'translate') {
      const delta = currentPoint.clone().sub(this.#dragStart);
      const axisDir = this.#axisDirection(this.#activeAxis);

      const axisDelta = delta.dot(axisDir);
      const movement = axisDir.clone().multiplyScalar(axisDelta);

      this.#target.applyGizmoTranslate(movement);
    } else if (this.#mode === 'rotate') {
      const gizmoPos = this.#group.position.clone();
      const startDir = this.#dragStart.clone().sub(gizmoPos).normalize();
      const currentDir = currentPoint.clone().sub(gizmoPos).normalize();

      let angle = Math.atan2(
        startDir.clone().cross(currentDir).dot(this.#dragPlane.normal),
        startDir.dot(currentDir)
      );

      angle = angle * (180 / Math.PI);

      // LEGACY(B-M12): the angle is applied with Strategies.gizmoRotateSign (-1), so the target turns opposite
      // to the drag; `value + (-1 * angle)` is bit-identical to the legacy `value - angle`.
      this.#target.applyGizmoRotate(this.#activeAxis, Strategies.gizmoRotateSign * angle);

      if (this.#space === 'local') {
        this.updateOrientation();
      }
    }

    this.#dragStart.copy(currentPoint);
    this.updatePosition();
  }

  /**
   * Ends a drag (canvas and window mouseup both call it; idempotent) and restores the hover highlight.
   * Ports: index.html@cd3fd3f lines 3411-3425.
   * Side effects: writes interaction.isDraggingGizmo, activeAxis and handle opacities.
   */
  onMouseUp() {
    this.#interaction.isDraggingGizmo = false;
    this.#activeAxis = null;

    if (this.#group) {
      this.#paintHandles(this.#hoveredAxis, this.#colors.hoverOpacity, this.#colors.idleOpacity);
    }
  }

  /**
   * Legacy createGizmoMaterial.
   * Ports: index.html@cd3fd3f lines 3012-3020.
   * @param {number} color
   * @returns {THREE.MeshBasicMaterial}
   */
  #material(color) {
    return new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: this.#colors.idleOpacity,
      depthTest: false,
      depthWrite: false
    });
  }

  /**
   * The three translate arrows (X red, Y green, Z blue), in the exact legacy allocation order.
   * Ports: index.html@cd3fd3f lines 3023-3066.
   * @param {THREE.Group} gizmoGroup
   * @param {number} scale
   */
  #buildTranslateHandles(gizmoGroup, scale) {
    const colors = this.#colors;
    const gizmoHandles = this.#handles;
    const arrowLength = 1.2 * scale;
    const arrowHeadLength = 0.28 * scale;
    const arrowHeadRadius = 0.12 * scale;
    const shaftRadius = 0.04 * scale;

    // X axis (red)
    const xMat = this.#material(colors.x);
    const xShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, arrowLength - arrowHeadLength, 12), xMat);
    xShaft.rotation.z = -Math.PI / 2;
    xShaft.position.x = (arrowLength - arrowHeadLength) / 2;
    const xHead = new THREE.Mesh(new THREE.ConeGeometry(arrowHeadRadius, arrowHeadLength, 16), xMat);
    xHead.rotation.z = -Math.PI / 2;
    xHead.position.x = arrowLength - arrowHeadLength / 2;
    const xArrow = new THREE.Group();
    xArrow.add(xShaft, xHead);
    xArrow.userData = { axis: 'x', type: 'translate', material: xMat, color: colors.x };
    gizmoHandles.x = xArrow;
    gizmoGroup.add(xArrow);

    // Y axis (green)
    const yMat = this.#material(colors.y);
    const yShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, arrowLength - arrowHeadLength, 12), yMat);
    yShaft.position.y = (arrowLength - arrowHeadLength) / 2;
    const yHead = new THREE.Mesh(new THREE.ConeGeometry(arrowHeadRadius, arrowHeadLength, 16), yMat);
    yHead.position.y = arrowLength - arrowHeadLength / 2;
    const yArrow = new THREE.Group();
    yArrow.add(yShaft, yHead);
    yArrow.userData = { axis: 'y', type: 'translate', material: yMat, color: colors.y };
    gizmoHandles.y = yArrow;
    gizmoGroup.add(yArrow);

    // Z axis (blue)
    const zMat = this.#material(colors.z);
    const zShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, arrowLength - arrowHeadLength, 12), zMat);
    zShaft.rotation.x = Math.PI / 2;
    zShaft.position.z = (arrowLength - arrowHeadLength) / 2;
    const zHead = new THREE.Mesh(new THREE.ConeGeometry(arrowHeadRadius, arrowHeadLength, 16), zMat);
    zHead.rotation.x = Math.PI / 2;
    zHead.position.z = arrowLength - arrowHeadLength / 2;
    const zArrow = new THREE.Group();
    zArrow.add(zShaft, zHead);
    zArrow.userData = { axis: 'z', type: 'translate', material: zMat, color: colors.z };
    gizmoHandles.z = zArrow;
    gizmoGroup.add(zArrow);
  }

  /**
   * The three rotate rings (X red, Y green, Z blue), in the exact legacy allocation order.
   * Ports: index.html@cd3fd3f lines 3069-3093.
   * @param {THREE.Group} gizmoGroup
   * @param {number} scale
   */
  #buildRotateHandles(gizmoGroup, scale) {
    const colors = this.#colors;
    const gizmoHandles = this.#handles;
    const ringRadius = 0.65 * scale;
    const tubeRadius = 0.04 * scale;

    // X rotation ring (red)
    const xMat = this.#material(colors.x);
    const xRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, tubeRadius, 12, 48), xMat);
    xRing.rotation.y = Math.PI / 2;
    xRing.userData = { axis: 'x', type: 'rotate', material: xMat, color: colors.x };
    gizmoHandles.rx = xRing;
    gizmoGroup.add(xRing);

    // Y rotation ring (green)
    const yMat = this.#material(colors.y);
    const yRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, tubeRadius, 12, 48), yMat);
    yRing.rotation.x = Math.PI / 2;
    yRing.userData = { axis: 'y', type: 'rotate', material: yMat, color: colors.y };
    gizmoHandles.ry = yRing;
    gizmoGroup.add(yRing);

    // Z rotation ring (blue)
    const zMat = this.#material(colors.z);
    const zRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, tubeRadius, 12, 48), zMat);
    zRing.userData = { axis: 'z', type: 'rotate', material: zMat, color: colors.z };
    gizmoHandles.rz = zRing;
    gizmoGroup.add(zRing);
  }

  /**
   * Every handle mesh, each given a copy of its handle's userData (axis, type, material, color).
   * Ports: index.html@cd3fd3f lines 3205-3213 (== 3242-3250).
   * @returns {THREE.Mesh[]}
   */
  #collectHandleMeshes() {
    const gizmoMeshes = [];
    Object.values(this.#handles).forEach(handle => {
      handle.traverse(child => {
        if (child.isMesh) {
          child.userData = { ...handle.userData };
          gizmoMeshes.push(child);
        }
      });
    });
    return gizmoMeshes;
  }

  /**
   * Sets the opacity of every handle material: `onOpacity` for the handle of `axis`, `offOpacity` for the others.
   * Ports: index.html@cd3fd3f lines 3221-3228 (hover), 3260-3267 (active), 3416-3423 (release).
   * @param {string|null} axis
   * @param {number} onOpacity
   * @param {number} offOpacity
   */
  #paintHandles(axis, onOpacity, offOpacity) {
    Object.values(this.#handles).forEach(handle => {
      const isOn = handle.userData.axis === axis;
      handle.traverse(child => {
        if (child.material) {
          child.material.opacity = isOn ? onOpacity : offOpacity;
        }
      });
    });
  }

  /**
   * The unit vector of a gizmo axis ('x', 'y', anything else = z), rotated into local space when the space
   * is 'local'.
   * Ports: index.html@cd3fd3f lines 3272-3279 (== 3290-3297 == 3325-3332).
   * @param {string} axis
   * @returns {THREE.Vector3} a new vector
   */
  #axisDirection(axis) {
    const axisDir = new THREE.Vector3();
    if (axis === 'x') axisDir.set(1, 0, 0);
    else if (axis === 'y') axisDir.set(0, 1, 0);
    else axisDir.set(0, 0, 1);

    if (this.#space === 'local') {
      axisDir.applyQuaternion(this.#group.quaternion);
    }
    return axisDir;
  }
}
