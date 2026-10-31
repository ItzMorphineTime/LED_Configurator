/**
 * @module render/SectionHighlightView
 * The selected wall section's highlight in the viewport (the owner's request of 2026-10-31; the single-selection part of
 * docs/improvements/02-section-editing-offsets.md 5.2's SectionHighlightView, without hover): a translucent tint over the
 * section's grid cells (depth-tested, no depth write, pulled towards the camera by a polygon offset, never raycast) and a
 * two-tone outline along the section's border, ONE explicitly closed THREE.Line geometry (never LineLoop) drawn twice
 * without depth test: the Morph Black halo (RENDER_ORDER.HIGHLIGHT_HALO) under the dashed core
 * (RENDER_ORDER.SECTION_HIGHLIGHT, below the gizmo). Its points are the stage layout's grid corners
 * (WallLayout.worldVertices(), the corners the wall meshes are built from in every mesh mode), so it follows every mesh
 * mode, pivot and orientation without being parented to the wall group. Mirrors only (R3): SELECTION_CHANGED (the
 * section of a 'section:<id>' selection; anything else hides it) and WALL_REBUILT (the layout; the section is found
 * again by id, and a section missing from the layout hides it). One group registered with SceneManager.addHelper (the
 * HELPERS layer: never in the camera preview or the pilot view; exports never read the scene). Nothing is allocated
 * before a section is selected (R4: the bootstrap THREE ids are unchanged).
 * Legacy source: none (new feature).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { RENDER_ORDER } from '../core/renderOrder.js';
import { sectionKeyOf } from '../core/sectionIds.js';

/**
 * The corner grid of one section of a layout: worldVertices()[index], whose rows each hold `perRow` points (the columns
 * 0..panelCols that have an edge, as worldVertices walks them).
 * Side effects: none (worldVertices is memoised per layout).
 * @param {import('../geometry/WallLayout.js').WallLayout} layout
 * @param {number} index  the section's position in the layout
 * @returns {{points: ArrayLike<number>, perRow: number, rows: number}|null}  null when the grid has fewer than 2 x 2
 *   points or its points do not fill whole rows
 */
export function sectionCornerGrid(layout, index) {
  const sl = layout?.sections?.[index];
  const points = sl ? layout.worldVertices()[index] : null;
  if (!points) return null;
  let perRow = 0;
  for (let col = 0; col <= sl.section.panelCols; col++) if (sl.edges[col]) perRow++;
  const n = points.length / 3;
  if (perRow < 2 || n % perRow !== 0 || n / perRow < 2) return null;
  return { points, perRow, rows: n / perRow };
}

/**
 * The closed border loop of a corner grid as point indices: the bottom row left to right, the last column upwards, the
 * top row right to left and the first column downwards, ending on the first point again (an explicitly closed line).
 * Side effects: none.
 * @param {number} perRow  points per row (>= 2)
 * @param {number} rows    rows of points (>= 2)
 * @returns {number[]}
 */
export function borderLoop(perRow, rows) {
  const at = (r, c) => r * perRow + c;
  const out = [];
  for (let c = 0; c < perRow; c++) out.push(at(0, c));
  for (let r = 1; r < rows; r++) out.push(at(r, perRow - 1));
  for (let c = perRow - 2; c >= 0; c--) out.push(at(rows - 1, c));
  for (let r = rows - 2; r >= 0; r--) out.push(at(r, 0));
  return out;
}

/**
 * The tint's triangles: two per grid cell (a, b, c) and (a, c, d) for the cell's corners a = (r, c), b = (r, c + 1),
 * c = (r + 1, c + 1), d = (r + 1, c), as a flat xyz array.
 * Side effects: none.
 * @param {{points: ArrayLike<number>, perRow: number, rows: number}} grid
 * @returns {Float32Array}
 */
export function cellTriangles({ points, perRow, rows }) {
  const out = new Float32Array((rows - 1) * (perRow - 1) * 18);
  let k = 0;
  const put = (i) => {
    out[k++] = points[i * 3];
    out[k++] = points[i * 3 + 1];
    out[k++] = points[i * 3 + 2];
  };
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < perRow; c++) {
      const a = r * perRow + c;
      const b = a + 1;
      const d = a + perRow;
      const e = d + 1;
      put(a); put(b); put(e);
      put(a); put(e); put(d);
    }
  }
  return out;
}

/** The selected section's tint and outline. */
export class SectionHighlightView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {{scene: {selection: {color: number, haloColor: number, fillOpacity: number, dashSize: number, gapSize: number}}}} */
  #theme;
  /** @type {string|null} the selected section's key (String(section.id)), null when no section is selected */
  #key = null;
  /** @type {import('../geometry/WallLayout.js').WallLayout|null} the stage layout of the last rebuild */
  #layout = null;
  /** @type {THREE.Group|null} */
  #group = null;
  /** @type {THREE.Mesh|null} */
  #tint = null;
  /** @type {THREE.Line|null} */
  #halo = null;
  /** @type {THREE.Line|null} */
  #core = null;

  /**
   * Stores the collaborators and subscribes SELECTION_CHANGED and WALL_REBUILT (R4: nothing is allocated here).
   * Side effects: two bus subscriptions.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, bus: import('../core/EventBus.js').EventBus,
   *          theme: {scene: {selection: object}}}} deps
   */
  constructor({ sceneManager, bus, theme }) {
    this.#sceneManager = sceneManager;
    this.#theme = theme;
    bus.on(Events.SELECTION_CHANGED, ({ id }) => {
      this.#key = sectionKeyOf(id);
      this.refresh();
    });
    bus.on(Events.WALL_REBUILT, ({ layout }) => {
      this.#layout = layout;
      this.refresh();
    });
  }

  /** Side effects: none. @returns {boolean} the highlight is shown */
  get visible() {
    return !!this.#group && this.#group.visible;
  }

  /** Side effects: none. @returns {THREE.Group|null} the helper group (null until a section was first selected) */
  get group() {
    return this.#group;
  }

  /**
   * Shows the highlight of the selected section in the last layout, or hides it (no section selected, the section is not
   * in the layout, or its grid is degenerate). The geometries are replaced (the old ones disposed) on every refresh.
   * Side effects: THREE allocation on the first highlight; geometry replacement and disposal; visibility.
   */
  refresh() {
    const key = this.#key;
    const layout = this.#layout;
    const index = key === null || !layout ? -1 : layout.sections.findIndex((sl) => String(sl.sectionId) === key);
    const grid = index >= 0 ? sectionCornerGrid(layout, index) : null;
    if (!grid) {
      if (this.#group) this.#group.visible = false;
      return;
    }
    this.#ensureObjects();
    const tintGeometry = new THREE.BufferGeometry();
    tintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cellTriangles(grid), 3));
    const loop = borderLoop(grid.perRow, grid.rows);
    const linePositions = new Float32Array(loop.length * 3);
    loop.forEach((p, i) => {
      linePositions[i * 3] = grid.points[p * 3];
      linePositions[i * 3 + 1] = grid.points[p * 3 + 1];
      linePositions[i * 3 + 2] = grid.points[p * 3 + 2];
    });
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const oldTint = this.#tint.geometry;
    const oldLine = this.#halo.geometry;
    this.#tint.geometry = tintGeometry;
    this.#halo.geometry = lineGeometry;
    this.#core.geometry = lineGeometry;
    this.#core.computeLineDistances();
    oldTint.dispose();
    oldLine.dispose();
    this.#group.visible = true;
  }

  /** Allocates the group, the materials and the three objects once (the first highlight). */
  #ensureObjects() {
    if (this.#group) return;
    const st = this.#theme.scene.selection;
    const group = new THREE.Group();
    const tint = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      color: st.color, transparent: true, opacity: st.fillOpacity, depthTest: true, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    tint.raycast = () => {};
    const placeholder = new THREE.BufferGeometry();
    const halo = new THREE.Line(placeholder, new THREE.LineBasicMaterial({
      color: st.haloColor, depthTest: false, depthWrite: false, transparent: true,
    }));
    halo.renderOrder = RENDER_ORDER.HIGHLIGHT_HALO;
    const core = new THREE.Line(placeholder, new THREE.LineDashedMaterial({
      color: st.color, dashSize: st.dashSize, gapSize: st.gapSize, depthTest: false, depthWrite: false, transparent: true,
    }));
    core.renderOrder = RENDER_ORDER.SECTION_HIGHLIGHT;
    group.add(tint);
    group.add(halo);
    group.add(core);
    this.#group = group;
    this.#tint = tint;
    this.#halo = halo;
    this.#core = core;
    this.#sceneManager.addHelper(group);
  }
}
