/**
 * @module render/NormalsDebugView
 * The normal lines of the normals debug view (docs/improvements/01-normals.md 3.3, 5.2, 6.7): one merged
 * LineSegments on LAYERS.HELPERS holding the vertex normals (lime, what lighting uses) and the face normals derived
 * from the winding (magenta, what culling uses) of every LED mesh, each line fading from 35 % at the surface to full
 * colour at the tip. It is the first subscriber of the WALL_REBUILT seam. Nothing is allocated while the lines are
 * off: the first sync() with the lines on creates the geometry; later syncs rewrite the buffers in place and upload
 * only the written prefix (updateRange). The lines are never pickable (raycast is a no-op, they are in no pick list),
 * never in the camera preview (its camera sees layer 0 only) and never exported (exporters read the layout).
 * Legacy source: none (Feature 1).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). Collaborators and the theme are injected.
 */

import THREE from '../vendor/three.js';
import { Events } from '../core/EventBus.js';
import { RENDER_ORDER } from '../core/renderOrder.js';
import {
  MAX_NORMAL_LINES, autoNormalLength, countNormalLines, decimationStride, formatNormalStats, uploadCount,
  writeFaceNormalLines, writeVertexNormalLines,
} from '../geometry/NormalLines.js';
import { LAYERS } from './SceneManager.js';

/** The smallest buffer capacity in lines (6.7.5). */
const MIN_CAPACITY = 1024;

/**
 * The normal-lines view.
 */
export class NormalsDebugView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('../domain/DebugViewSettings.js').DebugViewSettings} */
  #settings;
  /** @type {import('./DebugMaterials.js').DebugMaterials} */
  #materials;
  /** @type {{scene: {debug: {vertexNormal: number, faceNormal: number, lineBaseFactor: number}}}} */
  #theme;
  /** @type {{textContent: string, classList: {toggle(name: string, on: boolean): void}}|null} #debug-normals-stats (from 01 T7) */
  #statsEl;
  /** @type {{layout: import('../geometry/WallLayout.js').WallLayout, view: import('./LEDWallView.js').LEDWallView}|null} */
  #last = null;
  /** @type {THREE.LineSegments|null} */
  #lines = null;
  /** @type {THREE.BufferGeometry|null} */
  #geometry = null;
  /** @type {number} the line capacity of #geometry */
  #capacity = 0;
  /** @type {number} the line length of the last full sync (kept by live drags) */
  #lengthM = 0;
  /** @type {{vertexLines: number, faceLines: number, total: number, stride: number, lengthM: number, written: number}|null} */
  #stats = null;
  /** One scratch normal matrix (no THREE id) and its copied elements; one reused source descriptor (6.7.1). */
  #nm = new THREE.Matrix3();
  #nmEl = new Float64Array(9);
  #src = { positions: null, normals: null, index: null, matrix: null, normalMatrix: null };
  #out = { positions: null, colors: null, count: 0, seen: 0 };
  /** Tip colours as [r, g, b] in 0..1 (read from the theme on first use). */
  #tips = null;

  /**
   * Stores the collaborators and subscribes to WALL_REBUILT (R3: the handler only touches this view's own
   * LineSegments and stats element). Allocates no THREE object with an id (the scratch Matrix3 has none, R4).
   *   WALL_REBUILT ({layout, view}) => { #last = {layout, view}; if (settings.normals.enabled) sync() }
   * From spec 02 T6 it also subscribes SECTION_CHANGED with `live: true` -> sync({keepLength: true}) (01 CR-5).
   * Side effects: bus subscription.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager, bus: import('../core/EventBus.js').EventBus,
   *          settings: import('../domain/DebugViewSettings.js').DebugViewSettings,
   *          materials: import('./DebugMaterials.js').DebugMaterials,
   *          theme: {scene: object}, elements?: {stats?: object|null}}} deps
   *   elements.stats is optional: F1-1 constructs the view before #debug-normals-stats exists (01 T7 adds it).
   */
  constructor({ sceneManager, bus, settings, materials, theme, elements = {} }) {
    this.#sceneManager = sceneManager;
    this.#settings = settings;
    this.#materials = materials;
    this.#theme = theme;
    this.#statsEl = elements.stats ?? null;
    bus.on(Events.WALL_REBUILT, ({ layout, view }) => {
      this.#last = { layout, view };
      if (this.#settings.normals.enabled) this.sync();
    });
  }

  /** Side effects: none. @returns {THREE.LineSegments|null} the lines while they are shown */
  get object3D() {
    return this.#lines;
  }

  /**
   * Side effects: none.
   * @returns {{vertexLines: number, faceLines: number, total: number, stride: number, lengthM: number, written: number}|null}
   *   the counts of the last sync with the lines on (null while off)
   */
  get stats() {
    return this.#stats;
  }

  /**
   * Re-reads the settings and (re)draws the lines (6.7): off, or no rebuild seen yet -> the lines are removed.
   * On: counts the candidate lines of view.meshes(), picks the decimation stride, the length (auto 6.7.4 times
   * lengthScale; keepLength reuses the last one, for live drags whose cached layout is the pre-drag one), grows the
   * buffers if needed, writes vertex then face lines mesh by mesh with one running sample counter, uploads only the
   * written prefix, sets the line material ("Draw on top": depthTest off and RENDER_ORDER.NORMAL_LINES_ON_TOP) and
   * writes the stats element if it exists. Timed with performance mark/measure 'normals:sync' (AC 14b; the latest
   * measurement only).
   * Side effects: may allocate or dispose the line geometry and add or remove the helper; writes the stats element.
   * @param {{keepLength?: boolean}} [options]
   * @returns {void}
   */
  sync({ keepLength = false } = {}) {
    const perf = typeof performance === 'undefined' ? null : performance;
    if (perf) perf.mark('normals:sync-start');
    this.#sync(keepLength);
    if (perf) {
      // Only the latest measurement is kept, so colour-picker drags with the lines on do not grow the timeline.
      perf.clearMeasures('normals:sync');
      perf.measure('normals:sync', 'normals:sync-start');
      perf.clearMarks('normals:sync-start');
    }
  }

  #sync(keepLength) {
    const s = this.#settings.normals;
    if (!s.enabled || !this.#last) {
      this.#remove();
      return;
    }
    const { layout, view } = this.#last;
    const meshes = view.meshes().filter((m) => m.isMesh && m.geometry && m.geometry.attributes.position);
    if (!layout || layout.sections.length === 0 || meshes.length === 0) {
      this.#remove();
      this.#writeStats({ empty: true, vertex: s.vertex, face: s.face });
      return;
    }
    if (!s.vertex && !s.face) {
      this.#remove();
      this.#writeStats({ vertex: false, face: false });
      return;
    }

    const counts = countNormalLines(meshes.map((m) => ({
      vertexCount: m.geometry.attributes.position.count,
      indexCount: m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count,
    })), { vertex: s.vertex, face: s.face });
    const total = counts.vertexLines + counts.faceLines;
    const stride = decimationStride(total);
    const kept = Math.ceil(total / stride);
    const lengthM = keepLength && this.#lengthM > 0 ? this.#lengthM : autoNormalLength(layout, s.lengthScale);
    this.#lengthM = lengthM;

    this.#ensureCapacity(kept);
    const position = this.#geometry.attributes.position;
    const color = this.#geometry.attributes.color;
    const out = this.#out;
    out.positions = position.array;
    out.colors = color.array;
    out.count = 0;
    out.seen = 0;
    const tips = this.#tipColors();
    const baseFactor = this.#theme.scene.debug.lineBaseFactor;
    const vertexOpts = { length: lengthM, stride, tip: tips.vertex, baseFactor };
    const faceOpts = { length: lengthM, stride, tip: tips.face, baseFactor };
    const src = this.#src;
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);              // panel meshes: matrixWorld is stale until the next render
      this.#nmEl.set(this.#nm.getNormalMatrix(mesh.matrixWorld).elements);
      const geometry = mesh.geometry;
      src.positions = geometry.attributes.position.array;
      src.normals = geometry.attributes.normal ? geometry.attributes.normal.array : null;
      src.index = geometry.index ? geometry.index.array : null;
      src.matrix = mesh.matrixWorld.elements;
      src.normalMatrix = this.#nmEl;
      if (s.vertex) writeVertexNormalLines(out, src, vertexOpts);
      if (s.face) writeFaceNormalLines(out, src, faceOpts);
    }
    const written = out.count;
    for (const attribute of [position, color]) {
      attribute.updateRange.offset = 0;
      attribute.updateRange.count = uploadCount(written);
      attribute.needsUpdate = true;
    }
    this.#geometry.setDrawRange(0, 2 * written);

    const material = this.#materials.lineMaterial({ onTop: s.onTop });
    if (!this.#lines) {
      const lines = new THREE.LineSegments(this.#geometry, material);
      lines.layers.set(LAYERS.HELPERS);
      lines.raycast = () => {};
      lines.frustumCulled = false;
      lines.matrixAutoUpdate = false;
      lines.userData.helper = true;
      this.#lines = lines;
      this.#sceneManager.addHelper(lines);
    } else {
      this.#lines.geometry = this.#geometry;
      this.#lines.material = material;
    }
    this.#lines.renderOrder = s.onTop ? RENDER_ORDER.NORMAL_LINES_ON_TOP : RENDER_ORDER.DEFAULT;

    this.#stats = { vertexLines: counts.vertexLines, faceLines: counts.faceLines, total, stride, lengthM, written };
    this.#writeStats({ ...this.#stats, vertex: s.vertex, face: s.face });
  }

  /**
   * Makes the buffers hold at least `kept` lines: capacity min(MAX_NORMAL_LINES, max(1024, nextPowerOfTwo(kept))).
   * A larger need allocates a new geometry and disposes the old one; otherwise the arrays are reused.
   * @param {number} kept
   */
  #ensureCapacity(kept) {
    if (this.#geometry && kept <= this.#capacity) return;
    let capacity = MIN_CAPACITY;
    while (capacity < kept) capacity *= 2;
    capacity = Math.min(MAX_NORMAL_LINES, capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(capacity * 6), 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(capacity * 6), 3));
    geometry.setDrawRange(0, 0);
    if (this.#geometry) this.#geometry.dispose();
    this.#geometry = geometry;
    this.#capacity = capacity;
  }

  /** The vertex- and face-line tip colours from theme.scene.debug, as [r, g, b] in 0..1 (no colour id). */
  #tipColors() {
    if (!this.#tips) {
      const debug = this.#theme.scene.debug;
      const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
      this.#tips = { vertex: rgb(debug.vertexNormal), face: rgb(debug.faceNormal) };
    }
    return this.#tips;
  }

  /** Writes the stats element (if it exists) from formatNormalStats. */
  #writeStats(stats) {
    if (!this.#statsEl) return;
    const { text, warning } = formatNormalStats({ vertexLines: 0, faceLines: 0, total: 0, stride: 1, lengthM: 0, ...stats });
    this.#statsEl.textContent = text;
    this.#statsEl.classList.toggle('warning', warning);
  }

  /** Removes the lines (helper and geometry; the shared material stays) and forgets the stats. */
  #remove() {
    if (this.#lines) this.#sceneManager.removeHelper(this.#lines);
    if (this.#geometry) this.#geometry.dispose();
    this.#lines = null;
    this.#geometry = null;
    this.#capacity = 0;
    this.#stats = null;
    if (this.#statsEl) {
      this.#statsEl.textContent = '';
      this.#statsEl.classList.toggle('warning', false);
    }
  }

  /**
   * Removes the lines: removeHelper, geometry.dispose(), stats text '' (the shared line material stays with
   * DebugMaterials).
   * Side effects: scene removal; THREE dispose event; writes the stats element.
   * @returns {void}
   */
  dispose() {
    this.#remove();
  }
}
