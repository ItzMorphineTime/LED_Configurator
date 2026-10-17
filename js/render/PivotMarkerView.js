/**
 * @module render/PivotMarkerView
 * The wall-pivot marker in the viewport (Feature 3, docs/improvements/03-pivot.md 3.3, 5.3): a two-tone glyph at the
 * pivot (a dashed light cross over a Morph Black halo and a light octahedron core over a black one, both Morph Red while
 * the pivot is selected), an invisible pick proxy, a dashed drop line to the floor when the pivot is raised, and a grey
 * anchor ghost with a dashed link to the glyph when the offset is non-zero. Everything is in the STAGE frame (the glyph
 * at (0, P.y, 0)), drawn through the wall (depthTest off) at RENDER_ORDER.PIVOT_MARKER, on LAYERS.HELPERS (the main
 * camera sees it, the preview camera never does), and registered as a helper, so the preview render hides it too
 * (08 P2-10a, B-M11). The glyph and the ghost keep a minimum on-screen size (updateScale, a pre-render hook).
 * 06 5.12 (D15): two-tone overlays, closed LineSegments geometry (never LineLoop), the halo under the core.
 * Hidden in pilot mode (03 T9: 3.3 and AC 12, "hidden and unpickable in pilot"; Q9's previs views stay clean once the
 * marker is shown by default). Mirrors only (R3): it subscribes WALL_REBUILT, WALL_PIVOT_CHANGED, SELECTION_CHANGED and
 * PILOT_CHANGED and writes its own objects.
 * Legacy source: none (new view).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { RENDER_ORDER } from '../core/renderOrder.js';
import { ResourceTracker } from './ResourceTracker.js';
import { LAYERS } from './SceneManager.js';
import { turnXZ, yawTrig } from '../geometry/WallOrientation.js';

/** The anchor ghost's cross half-size in metres (03 3.3: a grey cross of +-0.12 m). */
const GHOST_HALF_SIZE_M = 0.12;
/** The core octahedron's halo is the same shape scaled by this factor and drawn first (06 5.12). */
const CORE_HALO_SCALE = 1.35;
/** A raised pivot (|P.y| above this, metres) gets the dashed drop line to the floor. */
const DROP_EPSILON_M = 1e-6;

/**
 * Six vertices of a three-axis cross of half-size h around the origin, as LineSegments pairs.
 * @param {number} h
 * @returns {number[]}
 */
const crossVertices = (h) => [-h, 0, 0, h, 0, 0, 0, -h, 0, 0, h, 0, 0, 0, -h, 0, 0, h];

/**
 * The pivot marker. One instance, constructed with the other views (R4: nothing allocated) and allocated by init() as
 * the LAST bootstrap step, so every legacy THREE id, and so the r128 draw order, is unchanged (03 5.8).
 */
export class PivotMarkerView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('../domain/Project.js').DisplaySettings} */
  #display;
  /** @type {object} SceneTheme.pivot */
  #style;
  /** @type {ResourceTracker} */
  #tracker = new ResourceTracker({ disposeMaps: false });
  /** @type {THREE.Group|null} the root (registered helper) */
  #group = null;
  /** @type {THREE.Group|null} the glyph: cross, core and pick proxy (scaled by updateScale) */
  #glyph = null;
  /** @type {THREE.Group|null} the anchor ghost cross (scaled by updateScale) */
  #ghost = null;
  /** @type {THREE.Mesh|null} the invisible pick proxy */
  #proxy = null;
  /** @type {THREE.Material[]} the core materials whose colour follows the selection (cross core, octahedron core) */
  #selectable = [];
  /** @type {{core: THREE.LineSegments, halo: THREE.LineSegments}|null} the drop line (floor to glyph) */
  #drop = null;
  /** @type {{core: THREE.LineSegments, halo: THREE.LineSegments}|null} the link line (ghost to glyph) */
  #link = null;
  /** @type {import('../geometry/WallLayout.js').PivotResolution|null} the last placed resolution */
  #resolution = null;
  /** @type {{x: number, y: number, z: number}} the drag preview (glyph displacement, stage frame) */
  #preview = { x: 0, y: 0, z: 0 };
  /** @type {boolean} the pivot is the selected Selectable (the last SELECTION_CHANGED) */
  #selected = false;
  /** @type {boolean} pilot mode is on (the last PILOT_CHANGED; 03 T9) */
  #pilot = false;

  /**
   * Stores the dependencies and subscribes the four mirrors (R4: no THREE allocation):
   *  WALL_REBUILT({layout}) -> #place(layout.pivot.resolution)   (ignored until init)
   *  WALL_PIVOT_CHANGED({resolution}) -> #place(resolution); visibility (the marker toggle)
   *  SELECTION_CHANGED({id}) -> colour (selected vs idle); visibility
   *  PILOT_CHANGED({active}) -> visibility (03 T9: hidden in pilot)
   * Side effects: four bus subscriptions.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, bus: import('../core/EventBus.js').EventBus,
   *          display: import('../domain/Project.js').DisplaySettings, theme: {scene: {pivot: object}}}} deps
   */
  constructor({ sceneManager, bus, display, theme }) {
    this.#sceneManager = sceneManager;
    this.#display = display;
    this.#style = theme.scene.pivot;
    bus.on(Events.WALL_REBUILT, ({ layout }) => {
      if (this.#group) this.#place(layout?.pivot?.resolution ?? null);
    });
    bus.on(Events.WALL_PIVOT_CHANGED, ({ resolution }) => {
      if (this.#group) this.#place(resolution);
    });
    bus.on(Events.SELECTION_CHANGED, ({ id }) => {
      this.#selected = id === 'pivot';
      if (this.#group) this.#applyColor();
      if (this.#group) this.#applyVisibility();
    });
    bus.on(Events.PILOT_CHANGED, ({ active }) => {
      this.#pilot = active === true;
      if (this.#group) this.#applyVisibility();
    });
  }

  /** Side effects: none. @returns {boolean} the marker is allocated (after init) */
  get exists() {
    return !!this.#group;
  }

  /** Side effects: none. @returns {boolean} the marker is shown */
  get visible() {
    return !!this.#group && this.#group.visible;
  }

  /** Side effects: none. @returns {boolean} the last placed resolution is non-null */
  get hasResolution() {
    return this.#resolution !== null;
  }

  /** Side effects: none. @returns {THREE.Group|null} the root group (a registered helper) */
  get group() {
    return this.#group;
  }

  /**
   * Allocates the marker and registers it as a helper, then places it. Called once, as the last bootstrap step (03 5.8).
   * Side effects: allocates THREE groups, geometries, materials, lines and meshes; sceneManager.addHelper(group).
   * @param {import('../geometry/WallLayout.js').PivotResolution|null} resolution  WallController.pivotResolution
   */
  init(resolution) {
    if (this.#group) return;
    const st = this.#style;
    const group = this.#newGroup();
    this.#group = group;

    const glyph = this.#newGroup();
    this.#glyph = glyph;
    const cross = this.#tracker.track(this.#crossGeometry(st.glyphHalfSize));
    const crossCore = this.#dashedMaterial(st.color);
    glyph.add(this.#line(cross, this.#haloMaterial(), 0), this.#line(cross, crossCore, 1));
    const core = new THREE.OctahedronGeometry(st.coreRadius);
    this.#tracker.track(core);
    const coreHalo = new THREE.Mesh(core, this.#solidMaterial(st.haloColor));
    coreHalo.scale.setScalar(CORE_HALO_SCALE);
    const coreCore = new THREE.Mesh(core, this.#solidMaterial(st.color));
    this.#prepare(coreHalo, 0);
    this.#prepare(coreCore, 1);
    glyph.add(coreHalo, coreCore);
    const proxyGeometry = this.#tracker.track(new THREE.SphereGeometry(st.pickRadius, 12, 8));
    const proxyMaterial = this.#tracker.track(new THREE.MeshBasicMaterial({ visible: false }));
    this.#proxy = new THREE.Mesh(proxyGeometry, proxyMaterial);
    this.#prepare(this.#proxy, 0);
    glyph.add(this.#proxy);
    this.#selectable = [crossCore, coreCore.material];

    const ghost = this.#newGroup();
    this.#ghost = ghost;
    const ghostCross = this.#tracker.track(this.#crossGeometry(GHOST_HALF_SIZE_M));
    ghost.add(this.#line(ghostCross, this.#haloMaterial(), 0), this.#line(ghostCross, this.#dashedMaterial(st.anchorColor), 1));

    this.#drop = this.#segment(st.color);
    this.#link = this.#segment(st.anchorColor);

    group.add(ghost, this.#link.halo, this.#link.core, this.#drop.halo, this.#drop.core, glyph);
    this.#sceneManager.addHelper(group);
    this.#applyColor();
    this.#place(resolution);
  }

  /**
   * The pick meshes of the Selectable 'pivot'.
   * Side effects: none.
   * @returns {THREE.Object3D[]} [the pick proxy], or [] before init
   */
  pickMeshes() {
    return this.#proxy ? [this.#proxy] : [];
  }

  /**
   * The glyph position in the STAGE frame: (0, P.y, 0) plus the drag preview; the preview alone for a null resolution
   * (never dereferences null).
   * Side effects: writes `out`.
   * @param {THREE.Vector3} out
   * @returns {THREE.Vector3} out
   */
  glyphPosition(out) {
    const p = this.#preview;
    const r = this.#resolution;
    return r ? out.set(0 + p.x, r.point.y + p.y, 0 + p.z) : out.set(p.x, p.y, p.z);
  }

  /**
   * The drag preview: the glyph, the drop line and the link follow; the anchor ghost stays.
   * Side effects: writes the preview and the marker geometry.
   * @param {number} dx  metres, stage frame
   * @param {number} dy
   * @param {number} dz
   */
  setPreview(dx, dy, dz) {
    this.#preview = { x: dx, y: dy, z: dz };
    if (this.#group && this.#resolution) this.#layout();
  }

  /** Side effects: clears the preview and re-places the glyph. */
  clearPreview() {
    this.setPreview(0, 0, 0);
  }

  /**
   * Minimum screen size (03 3.3): the glyph and the ghost are scaled by s = max(1, minPx * worldPerPixel / glyphHalfSize)
   * with worldPerPixel = 2 d tan(fov / 2) / heightPx, d the camera's distance to the glyph (camera.fov is in degrees in
   * r128). A pre-render hook (SceneManager.addPreRender, 07 C46): runs before every main render.
   * Side effects: writes the glyph and ghost scale. No-op before init, while hidden or for a zero-height canvas.
   * @param {THREE.PerspectiveCamera} camera  the main camera
   * @param {number} heightPx  the canvas height in CSS pixels
   */
  updateScale(camera, heightPx) {
    if (!this.#group || !this.#group.visible || !(heightPx > 0)) return;
    const st = this.#style;
    const d = camera.position.distanceTo(this.#glyph.position);
    const worldPerPixel = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / heightPx;
    const s = Math.max(1, st.minScreenHalfSizePx * worldPerPixel / st.glyphHalfSize);
    this.#glyph.scale.setScalar(s);
    this.#ghost.scale.setScalar(s);
  }

  /**
   * Removes the marker from the scene and disposes it (not called by the app; for completeness and tests).
   * Side effects: sceneManager.removeHelper(group); disposes every geometry and material (maps: false).
   */
  dispose() {
    if (!this.#group) return;
    this.#sceneManager.removeHelper(this.#group);
    this.#tracker.dispose();
    this.#group = null;
    this.#glyph = null;
    this.#ghost = null;
    this.#proxy = null;
    this.#drop = null;
    this.#link = null;
    this.#selectable = [];
  }

  // ---- private ----------------------------------------------------------------------------------------------

  /**
   * Stores the resolution and lays the marker out (a null resolution hides it and skips every geometry update).
   * @param {import('../geometry/WallLayout.js').PivotResolution|null} resolution
   */
  #place(resolution) {
    this.#resolution = resolution ?? null;
    if (this.#resolution) this.#layout();
    this.#applyVisibility();
  }

  /** Positions the glyph and the ghost and rebuilds the drop and link lines (stage frame). */
  #layout() {
    const r = this.#resolution;
    const p = this.#preview;
    const gx = p.x;
    const gy = r.point.y + p.y;
    const gz = p.z;
    this.#glyph.position.set(gx, gy, gz);
    // The anchor in the stage frame: A - O = (A.x - P.x, A.y, A.z - P.z) = (-offset.x, A.y, -offset.z).
    // 03 12.5: turned by the wall yaw about the stage origin's vertical
    const yaw = r.yawDeg ?? 0;
    const t = yaw === 0 ? { x: r.anchor.x - r.stageOrigin.x, z: r.anchor.z - r.stageOrigin.z }
      : turnXZ(r.anchor.x - r.stageOrigin.x, r.anchor.z - r.stageOrigin.z, yawTrig(yaw));
    const ax = t.x;
    const ay = r.anchor.y;
    const az = t.z;
    this.#ghost.position.set(ax, ay, az);
    const linked = gx !== ax || gy !== ay || gz !== az;
    this.#ghost.visible = linked;
    this.#setSegment(this.#link, linked, ax, ay, az, gx, gy, gz);
    this.#setSegment(this.#drop, Math.abs(gy) > DROP_EPSILON_M, gx, 0, gz, gx, gy, gz);
  }

  /** visible = hasResolution && !pilot && (display.showPivotMarker || the pivot is selected) (03 3.3; pilot since 03 T9). */
  #applyVisibility() {
    this.#group.visible = this.#resolution !== null && !this.#pilot && (this.#display.showPivotMarker === true || this.#selected);
  }

  /** The cores of the glyph: the selected colour while the pivot is selected, else the idle colour. */
  #applyColor() {
    const color = this.#selected ? this.#style.selectedColor : this.#style.color;
    for (const m of this.#selectable) m.color.setHex(color);
  }

  /** A group of the marker: the marker's render order (r128 group order), on LAYERS.HELPERS. @returns {THREE.Group} */
  #newGroup() {
    const g = new THREE.Group();
    g.renderOrder = RENDER_ORDER.PIVOT_MARKER;
    g.layers.set(LAYERS.HELPERS);
    return g;
  }

  /**
   * A tracked LineSegments of the marker.
   * @param {THREE.BufferGeometry} geometry  shared by the halo and the core
   * @param {THREE.Material} material
   * @param {number} order  0 for the halo, 1 for the core (drawn after the halo inside the marker's group order)
   * @returns {THREE.LineSegments}
   */
  #line(geometry, material, order) {
    const line = new THREE.LineSegments(geometry, material);
    this.#prepare(line, order);
    if (material.isLineDashedMaterial) line.computeLineDistances();
    return line;
  }

  /**
   * Layer, render order and culling of one drawable of the marker.
   * @param {THREE.Object3D} object
   * @param {number} order
   */
  #prepare(object, order) {
    object.renderOrder = order;
    object.layers.set(LAYERS.HELPERS);
    object.frustumCulled = false;
  }

  /**
   * A cross geometry (three closed segments, never a LineLoop: 06 6.6).
   * @param {number} h  half-size in metres
   * @returns {THREE.BufferGeometry}
   */
  #crossGeometry(h) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(crossVertices(h), 3));
    return g;
  }

  /**
   * A two-vertex dashed segment (halo + dashed core sharing one geometry), positioned by #setSegment.
   * @param {number} color  the core colour
   * @returns {{core: THREE.LineSegments, halo: THREE.LineSegments}}
   */
  #segment(color) {
    const g = this.#tracker.track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    g.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, 0], 1));
    const halo = new THREE.LineSegments(g, this.#haloMaterial());
    const core = new THREE.LineSegments(g, this.#dashedMaterial(color));
    this.#prepare(halo, 0);
    this.#prepare(core, 1);
    return { halo, core };
  }

  /**
   * Shows a segment from a to b, or hides it. The two vertices and their line distances (0 and |b - a|, what r128's
   * LineSegments.computeLineDistances writes for one segment) are written in place: no allocation per drag step.
   * @param {{core: THREE.LineSegments, halo: THREE.LineSegments}} seg
   * @param {boolean} on
   */
  #setSegment(seg, on, ax, ay, az, bx, by, bz) {
    seg.core.visible = on;
    seg.halo.visible = on;
    if (!on) return;
    const geometry = seg.core.geometry;
    const position = geometry.getAttribute('position');
    position.setXYZ(0, ax, ay, az);
    position.setXYZ(1, bx, by, bz);
    position.needsUpdate = true;
    const distance = geometry.getAttribute('lineDistance');
    distance.setX(0, 0);
    distance.setX(1, Math.hypot(bx - ax, by - ay, bz - az));
    distance.needsUpdate = true;
  }

  /** @returns {THREE.LineBasicMaterial} the Morph Black halo of a line (tracked) */
  #haloMaterial() {
    const st = this.#style;
    return this.#tracker.track(new THREE.LineBasicMaterial({
      color: st.haloColor, transparent: true, opacity: st.opacity, depthTest: false, depthWrite: false,
    }));
  }

  /**
   * @param {number} color
   * @returns {THREE.LineDashedMaterial} a dashed core (tracked)
   */
  #dashedMaterial(color) {
    const st = this.#style;
    return this.#tracker.track(new THREE.LineDashedMaterial({
      color, dashSize: st.dash, gapSize: st.dash, transparent: true, opacity: st.opacity, depthTest: false, depthWrite: false,
    }));
  }

  /**
   * @param {number} color
   * @returns {THREE.MeshBasicMaterial} a solid core or halo of the octahedron (tracked)
   */
  #solidMaterial(color) {
    const st = this.#style;
    return this.#tracker.track(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: st.opacity, depthTest: false, depthWrite: false,
    }));
  }
}
