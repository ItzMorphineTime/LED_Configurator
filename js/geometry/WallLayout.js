/**
 * @module geometry/WallLayout
 * The single cursor walk over the wall sections. It replaces the three arithmetically identical legacy walks
 * (viewport 1482-1549, safe distance 2614-2647, exports 5012-5080) and is the single source of every edge
 * position and panel transform; every consumer reaches it through layoutProject(). Also hosts the single
 * framing switch (framingBounds) and Feature 3's pivot geometry (03 T2, docs/improvements/03-pivot.md 6.1-6.6):
 * the anchors (firstEdge, lastEdge, generativeBounds, pivotPoint), baseY, translated(), resolvePivot, stageShift and
 * the frames of layoutProject (layout, stage, export). 08 P2-11a adds the world-space geometry that the coverage
 * analyser and the framing read (docs/improvements/08-bugfix-roadmap.md 6.10): columnQuads() and worldVertices()
 * (memoised per instance, after spec 02's postTransform), extentAcross(facing) and chordFacing(); 08 P2-11c makes
 * framingBounds the 'layout' framing of a layout (FramingPolicy's three named boxes, 07 C34). F3-O2 (03 section 12, the
 * owner's request of 2026-10-17) turns the stage and export frames by the wall yaw about the pivot: rotated(), the
 * orientation fields of the resolution (geometry/WallOrientation.js computes the alignment), yawShift and stageChange.
 * Legacy source: index.html@cd3fd3f 1479-1549 (walk + panel centres), 2614-2647 (flattened edges),
 * 5012-5038 + 5051-5066 (the export copy of the walk); the flat bounds of 2489-2493 / 2553-2557 / 2598-2603 / 3758-3762 are
 * replaced by the 'layout' framing (08 P2-11c).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { MM_TO_M } from '../domain/WallSection.js';
import { OrientationAlign, PivotMode } from '../domain/Wall.js';
import { wrapDeg } from '../domain/rules.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';
import { alignmentYawDeg, turnXZ, wallCentre, yawTrig } from './WallOrientation.js';

/**
 * One edge of the cursor walk: the position after a column move and the direction it was made in.
 * @typedef {{x: number, z: number, angle: number}} LayoutEdge
 */

/**
 * One panel centre (legacy `panelData` entry, 1538-1541).
 * @typedef {{x: number, y: number, z: number, rotY: number, col: number, row: number, sectionIndex: number}} LayoutPanel
 */

/** The walk result for one section (legacy `allSectionsData` entry, 1545-1548). */
export class SectionLayout {
  /** @type {import('../domain/WallSection.js').WallSection} the live section (read raw, never coerced) */
  section;
  /** @type {number} position of the section in the wall */
  sectionIndex;
  /** @type {*} === section.id (ids are never written after construction) */
  sectionId;
  /** @type {number} panel width in metres (section.panelWidth * MM_TO_M) */
  panelW;
  /** @type {number} panel height in metres (section.panelHeight * MM_TO_M) */
  panelH;
  /** @type {boolean} section.curveIntensity === 0 */
  isFlat;
  /** @type {LayoutEdge[]} legacy `edgePositions`; length panelCols + 1 for integer counts */
  edges;
  /** @type {LayoutPanel[]} legacy `panelData`, row-major (rows outer, columns inner) */
  panels;
  /**
   * Feature 2 hook: a column-major 4x4 array or null. ALWAYS null in Phase 1, never read, never fed back into
   * the cursor.
   * @type {number[]|null}
   */
  postTransform;
  /**
   * The y of the bottom of every column (Feature 3, 03 6.1, 6.4): 0 in the walk (the layout frame and the stage frame,
   * whose floor is y = 0); -P.y in the export frame. The same for every section of one layout.
   * @type {number}
   */
  baseY;

  /**
   * Side effects: none.
   * @param {{section: import('../domain/WallSection.js').WallSection, sectionIndex: number, panelW: number,
   *          panelH: number, isFlat: boolean, edges: LayoutEdge[], panels: LayoutPanel[],
   *          postTransform?: number[]|null, baseY?: number}} parts  baseY defaults to 0
   */
  constructor({ section, sectionIndex, panelW, panelH, isFlat, edges, panels, postTransform = null, baseY = 0 }) {
    this.section = section;
    this.sectionIndex = sectionIndex;
    this.sectionId = section.id;
    this.panelW = panelW;
    this.panelH = panelH;
    this.isFlat = isFlat;
    this.edges = edges;
    this.panels = panels;
    this.postTransform = postTransform;
    this.baseY = baseY;
  }

  /**
   * A translated copy (03 6.4): edges and panel centres shifted by (dx, dz) and (dx, dy, dz), baseY by dy; angles and
   * rotY unchanged (a translation has no rotation); every other walk field copied; postTransform null. Called only by
   * WallLayout.translated, which checks the raw-walk precondition first.
   * Side effects: none.
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @returns {SectionLayout}
   */
  translated(dx, dy, dz) {
    return new SectionLayout({
      section: this.section,
      sectionIndex: this.sectionIndex,
      panelW: this.panelW,
      panelH: this.panelH,
      isFlat: this.isFlat,
      edges: this.edges.map((e) => ({ x: e.x + dx, z: e.z + dz, angle: e.angle })),
      panels: this.panels.map((p) => ({
        x: p.x + dx, y: p.y + dy, z: p.z + dz, rotY: p.rotY, col: p.col, row: p.row, sectionIndex: p.sectionIndex,
      })),
      postTransform: null,
      baseY: this.baseY + dy,
    });
  }

  /**
   * A copy turned about the vertical axis through the frame origin (03 12.3, F3-O2): edges and panel centres (x, z)
   * through R_y(psi) (turnXZ), y and baseY unchanged; edge angles minus psi (a walk heading turns the other way: a
   * direction at heading a has azimuth 90 deg - a) and panel rotY plus psi (the panel quad's local +X is R_y(rotY) +X);
   * every other walk field copied; postTransform null. Called only by WallLayout.rotated, which checks the raw-walk
   * precondition first.
   * Side effects: none.
   * @param {{cos: number, sin: number}} trig  yawTrig(psi)
   * @param {number} yawRad  psi in radians
   * @returns {SectionLayout}
   */
  rotated(trig, yawRad) {
    return new SectionLayout({
      section: this.section,
      sectionIndex: this.sectionIndex,
      panelW: this.panelW,
      panelH: this.panelH,
      isFlat: this.isFlat,
      edges: this.edges.map((e) => {
        const t = turnXZ(e.x, e.z, trig);
        return { x: t.x, z: t.z, angle: e.angle - yawRad };
      }),
      panels: this.panels.map((p) => {
        const t = turnXZ(p.x, p.z, trig);
        return { x: t.x, y: p.y, z: t.z, rotY: p.rotY + yawRad, col: p.col, row: p.row, sectionIndex: p.sectionIndex };
      }),
      postTransform: null,
      baseY: this.baseY,
    });
  }
}

/** The origin (layout frame); also the translation of the identity frames. Frozen. */
const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

/** The frames layoutProject produces (03 5.1). */
const FRAMES = Object.freeze(['stage', 'export', 'layout']);

/**
 * The resolved pivot (03 6.2), layout frame: the mode and offset it was resolved from, the anchor of 6.1 (the layout
 * origin for an empty wall), the pivot point P = anchor + offset and the stage origin (P.x, 0, P.z). Since F3-O2 (03
 * 12.4) also the orientation: align and yawOffsetDeg (copied from the pivot), alignYawDeg (the alignment yaw psi_a of
 * 'center-neg-x', 0 with 'none' or without a centre) and yawDeg (the total yaw psi = wrapDeg(psi_a + yawOffsetDeg),
 * degrees about +Y through P, the three.js rotation.y sign).
 * @typedef {{mode: string, offset: {x: number, y: number, z: number}, anchor: {x: number, y: number, z: number},
 *            point: {x: number, y: number, z: number}, stageOrigin: {x: number, y: number, z: number},
 *            align: string, yawOffsetDeg: number, alignYawDeg: number, yawDeg: number}} PivotResolution
 */

/**
 * What layoutProject records on its result (03 6.3): the resolution (null for a non-finite layout), the frame, the
 * translation that was applied (the identity frames translate by ZERO and return the walk itself) and (F3-O2, 03 12.3)
 * the yaw the translated walk was turned by (0 for the layout frame, a null resolution and the identity orientation).
 * @typedef {{resolution: PivotResolution|null, frame: 'stage'|'export'|'layout',
 *            translation: {x: number, y: number, z: number}, yawDeg: number}} LayoutPivot
 */

/**
 * One column of the wall as a quad (08 6.10, P2-11a): the bottom-left corner p0, the column vector a (along the walk),
 * the height vector b (up the column) and the unit LED normal n = normalize(a × b), in the layout's frame after the
 * section's postTransform; aa = a·a and bb = b·b. Frozen.
 * @typedef {{p0: {x: number, y: number, z: number}, a: {x: number, y: number, z: number},
 *            b: {x: number, y: number, z: number}, n: {x: number, y: number, z: number}, aa: number, bb: number,
 *            sectionIndex: number, column: number}} ColumnQuad
 */

/**
 * The walk result for the whole wall. Built only by computeWallLayout and by translated(); treat it (and its edges) as
 * read-only. columnQuads() and worldVertices() are memoised on the instance (08 P2-11a): a layout is rebuilt once per
 * WALL_REBUILT, so per-pose callers never re-derive them; a translated copy computes its own.
 */
export class WallLayout {
  /** @type {SectionLayout[]} in wall order */
  sections;
  /**
   * The pivot block (Feature 3, 03 6.3): set by layoutProject on the layout it returns, null on a bare walk or copy.
   * @type {LayoutPivot|null}
   */
  pivot = null;
  /** @type {ReadonlyArray<ColumnQuad>|null} the memo of columnQuads() */
  #columnQuads = null;
  /** @type {ReadonlyArray<Float64Array>|null} the memo of worldVertices() */
  #worldVertices = null;

  /**
   * Side effects: none.
   * @param {{sections: SectionLayout[]}} parts
   */
  constructor({ sections }) {
    this.sections = sections;
  }

  /**
   * The legacy safe-distance `allEdges` (2619-2647): [] when there are no sections; otherwise sections[0].edges[0]
   * followed by every section's edges.slice(1), in order (the same edge objects; do not mutate them). Returns []
   * (does not throw) for an empty wall: legacy imports of `sections: []` with preview + safe distance on add an
   * empty group and do not throw. It is the one polyline of the safe-distance band (geometry/SafeDistanceBand's
   * bandRunOfLayout; since 08 P2-5b the band is mitred and clamped across section joins, B-M15 fixed).
   * Ports: index.html@cd3fd3f lines 2619-2647 (the `allEdges.length === 0` first-edge rule and the per-column pushes).
   * Side effects: none.
   * @returns {LayoutEdge[]} a new array
   */
  flatEdges() {
    const allEdges = [];
    if (this.sections.length === 0) return allEdges;
    allEdges.push(this.sections[0].edges[0]);
    for (const sl of this.sections) {
      for (let k = 1; k < sl.edges.length; k++) allEdges.push(sl.edges[k]);
    }
    return allEdges;
  }

  /**
   * The walk origin (the bottom-left anchor, 03 6.1).
   * Side effects: none.
   * @returns {LayoutEdge|null} sections[0].edges[0], or null for an empty wall
   */
  get firstEdge() {
    return this.sections.length === 0 ? null : this.sections[0].edges[0];
  }

  /**
   * The end of the walk (the wall-center anchor, 03 6.1).
   * Side effects: none.
   * @returns {LayoutEdge|null} the last section's last edge, or null for an empty wall
   */
  get lastEdge() {
    if (this.sections.length === 0) return null;
    const { edges } = this.sections[this.sections.length - 1];
    return edges[edges.length - 1];
  }

  /**
   * The generative box (03 6.1; FramingPolicy's `generativeBox`, 07 C34): the axis-aligned box of every grid vertex
   * before spec 02's section offsets, i.e. of the positions WallMeshBuilder emits (row = 0..panelRows,
   * col = 0..panelCols, y = baseY + row * panelH, x/z from edges[col]); frames are not part of it. Spec 02 T3 makes it
   * attached-only (identical until a section is detached). Computed on demand. A wall whose sections have no grid
   * vertices (negative, NaN or non-numeric counts; a count of 0 still has the row-0 / column-0 vertex) yields the empty
   * box {min: +Infinity, max: -Infinity}. NaN coordinates are skipped (plain < / > comparisons), and 0 and -0 are not
   * distinguished.
   * Side effects: none.
   * @returns {{min: {x: number, y: number, z: number}, max: {x: number, y: number, z: number}}|null}
   *   a new object, or null for an empty wall
   */
  generativeBounds() {
    if (this.sections.length === 0) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const sl of this.sections) {
      const { section, edges, baseY } = sl;
      for (let row = 0; row <= section.panelRows; row++) {
        const y = baseY === 0 ? row * sl.panelH : baseY + row * sl.panelH;
        for (let col = 0; col <= section.panelCols; col++) {
          const edge = edges[col];
          includePoint(min, max, edge.x, y, edge.z);
        }
      }
    }
    return { min, max };
  }

  /**
   * The transformed box of every grid vertex (FramingPolicy's `wallBox`, 07 C34; since 08 P2-11c): the box of
   * worldVertices(), every section after its postTransform (spec 02's offsets; all sections, detached ones included).
   * While no section carries a postTransform (Phase 2) it equals generativeBounds(). Same conventions: NaN coordinates
   * are skipped, 0 and -0 are not distinguished, a wall without grid vertices gives the empty box.
   * Side effects: none (reads the memoised worldVertices()).
   * @returns {{min: {x: number, y: number, z: number}, max: {x: number, y: number, z: number}}|null}
   *   a new object, or null for an empty wall
   */
  bounds() {
    if (this.sections.length === 0) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const list of this.worldVertices()) {
      for (let k = 0; k < list.length; k += 3) includePoint(min, max, list[k], list[k + 1], list[k + 2]);
    }
    return { min, max };
  }

  /**
   * The pivot anchor of a mode (03 6.1), in this layout's frame. With y0 = sections[0].baseY (0 in the layout frame,
   * so the floor modes return the Phase-1 values bit for bit):
   *   'bottom-left' (PivotMode.BOTTOM_LEFT): {x: firstEdge.x, y: y0, z: firstEdge.z} (the implicit legacy origin);
   *   'wall-center' (PivotMode.WALL_CENTER): the midpoint of firstEdge and lastEdge at y0 (the owner's "middle of
   *     entire wall");
   *   'mesh-center' (PivotMode.MESH_CENTER): the x/z centre of generativeBounds() on the floor, y = y0 (the owner's
   *     "Wall mesh centre on floor", 2026-10-17; 03 D1, Q2 (c), decision B5). The box skips NaN coordinates, so
   *     its x and z are NaN (resolvePivot: null) only for a wall without grid vertices (the empty box); the panel
   *     height no longer takes part.
   * On a translated copy every mode follows the translation: copy.pivotPoint(m) = pivotPoint(m) + (dx, dy, dz).
   * Side effects: none.
   * @param {string} mode  a PivotMode value
   * @returns {{x: number, y: number, z: number}|null} null for an empty wall
   * @throws {RangeError} for an unknown mode
   */
  pivotPoint(mode) {
    if (this.sections.length === 0) return null;
    const y0 = this.sections[0].baseY;
    switch (mode) {
      case PivotMode.BOTTOM_LEFT: {
        const first = this.firstEdge;
        return { x: first.x, y: y0, z: first.z };
      }
      case PivotMode.WALL_CENTER: {
        const first = this.firstEdge;
        const last = this.lastEdge;
        return { x: (first.x + last.x) / 2, y: y0, z: (first.z + last.z) / 2 };
      }
      case PivotMode.MESH_CENTER: {
        const { min, max } = this.generativeBounds();
        return { x: (min.x + max.x) / 2, y: y0, z: (min.z + max.z) / 2 };
      }
      default:
        throw new RangeError(`Unknown pivot mode ${JSON.stringify(mode)}`);
    }
  }

  /**
   * A copy of the raw walk translated by (dx, dy, dz) (03 6.4): every section's edges, panel centres and baseY are
   * shifted, everything else is copied; lazily derived values are recomputed on the copy from its own data, and the
   * copy has no pivot block. The single composition rule (03 5.10 #2, 07 C32): translate the raw walk, then spec 02's
   * applySectionOffsets builds the section matrices from the translated geometry; so this throws when any section
   * already carries a postTransform.
   * Side effects: none.
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @returns {WallLayout}
   * @throws {Error} 'translated() expects the raw walk: apply section offsets after the pivot translation'
   */
  translated(dx, dy, dz) {
    for (const sl of this.sections) {
      if (sl.postTransform !== null) {
        throw new Error('translated() expects the raw walk: apply section offsets after the pivot translation');
      }
    }
    return new WallLayout({ sections: this.sections.map((sl) => sl.translated(dx, dy, dz)) });
  }

  /**
   * A copy of the raw walk turned by yawDeg about the vertical axis through this frame's origin (03 12.3, F3-O2; the
   * pivot, once translated() has moved it to the origin): R_y(psi)(x, y, z) = (x cos + z sin, y, -x sin + z cos), the
   * three.js rotation.y matrix (positive = counter-clockwise seen from above). Edges and panel centres turn, headings
   * and panel rotY follow, baseY and heights are unchanged; cos and sin are exact at multiples of 90 degrees (yawTrig).
   * The copy has no pivot block. Like translated(), the raw walk only: spec 02's section offsets are built afterwards,
   * from the turned geometry.
   * Side effects: none.
   * @param {number} yawDeg
   * @returns {WallLayout}
   * @throws {Error} 'rotated() expects the raw walk: apply section offsets after the orientation'
   */
  rotated(yawDeg) {
    for (const sl of this.sections) {
      if (sl.postTransform !== null) {
        throw new Error('rotated() expects the raw walk: apply section offsets after the orientation');
      }
    }
    const trig = yawTrig(yawDeg);
    const yawRad = (yawDeg * Math.PI) / 180;
    return new WallLayout({ sections: this.sections.map((sl) => sl.rotated(trig, yawRad)) });
  }

  /**
   * The column quads of the wall (08 6.10, P2-11a; memoised per layout instance, so per-pose callers never re-derive
   * them): per section column k, p0 = T(e[k].x, baseY, e[k].z), a = T_vec(e[k+1] - e[k]), b = T_vec(0, panelRows ·
   * panelH, 0) and the LED normal n = normalize(a × b), where T is the section's postTransform (spec 02's seam;
   * identity while it is null). For the walk (angle 0 runs along +X) n is the stage side of the column: +Z for a flat
   * wall along +X, and it turns with the wall, so nothing here assumes a direction. A column whose a × b has no finite,
   * non-zero length (a degenerate input) is left out. Read by geometry/FrustumCoverage (the five rays and the projected
   * quads) and by chordFacing's frame (the layout's frame: the stage frame for layoutProject's stage layout).
   * Side effects: memoises the frozen array on the instance (the first call computes it).
   * @returns {ReadonlyArray<ColumnQuad>} frozen; the same array object on every call
   */
  columnQuads() {
    if (this.#columnQuads) return this.#columnQuads;
    const quads = [];
    for (const sl of this.sections) {
      const { section, edges, baseY, postTransform: m } = sl;
      const h = section.panelRows * sl.panelH;
      for (let k = 0; k + 1 < edges.length; k++) {
        const e0 = edges[k];
        const e1 = edges[k + 1];
        let p0 = { x: e0.x, y: baseY, z: e0.z };
        let a = { x: e1.x - e0.x, y: 0, z: e1.z - e0.z };
        let b = { x: 0, y: h, z: 0 };
        if (m) {
          p0 = transformPoint(m, p0);
          a = transformVector(m, a);
          b = transformVector(m, b);
        }
        const cx = a.y * b.z - a.z * b.y;
        const cy = a.z * b.x - a.x * b.z;
        const cz = a.x * b.y - a.y * b.x;
        const len = Math.hypot(cx, cy, cz);
        if (!(len > 0) || !Number.isFinite(len)) continue;
        quads.push(Object.freeze({
          p0: Object.freeze(p0), a: Object.freeze(a), b: Object.freeze(b),
          n: Object.freeze({ x: cx / len, y: cy / len, z: cz / len }),
          aa: a.x * a.x + a.y * a.y + a.z * a.z, bb: b.x * b.x + b.y * b.y + b.z * b.z,
          sectionIndex: sl.sectionIndex, column: k,
        }));
      }
    }
    this.#columnQuads = Object.freeze(quads);
    return this.#columnQuads;
  }

  /**
   * Every grid corner of the wall (08 6.10, P2-11a; memoised per layout instance): per section, in wall order, the
   * points row = 0..panelRows (outer), col = 0..panelCols (inner), x/z from edges[col], y = baseY === 0 ? row · panelH
   * : baseY + row · panelH (the generative order and expressions of generativeBounds() and WallMeshBuilder), after the
   * section's postTransform. Read by the framing (once per rebuild: up to about 214,000 points at the 07 limits).
   * Side effects: memoises the frozen array on the instance.
   * @returns {ReadonlyArray<Float64Array>} one xyz-interleaved array per section (index = position in the wall); frozen
   */
  worldVertices() {
    if (this.#worldVertices) return this.#worldVertices;
    const lists = this.sections.map((sl) => {
      const { section, edges, baseY, postTransform: m } = sl;
      const out = [];
      for (let row = 0; row <= section.panelRows; row++) {
        const y = baseY === 0 ? row * sl.panelH : baseY + row * sl.panelH;
        for (let col = 0; col <= section.panelCols; col++) {
          const edge = edges[col];
          if (!edge) continue;
          const p = m ? transformPoint(m, { x: edge.x, y, z: edge.z }) : { x: edge.x, y, z: edge.z };
          out.push(p.x, p.y, p.z);
        }
      }
      return Float64Array.from(out);
    });
    this.#worldVertices = Object.freeze(lists);
    return this.#worldVertices;
  }

  /**
   * The wall's width as seen face-on (08 6.10): max(v·chord) - min(v·chord) over worldVertices() of the included
   * sections, with the horizontal chord axis chord = (facing.z, 0, -facing.x). It is invariant under a rotation of the
   * wall about the vertical axis (with the facing turned alike): a flat wall gives its length along X, along Z and at any
   * angle (the axis-aligned max.x - min.x is 0 along Z and loses about 30 % at 45 degrees). 0 when nothing is included.
   * Side effects: none (reads the memoised worldVertices()).
   * @param {{x: number, z: number}} facing  a horizontal unit vector (chordFacing())
   * @param {(sectionIndex: number) => boolean} [include]  which sections count (FramingPolicy's stageExtent filter)
   * @returns {number} metres
   */
  extentAcross(facing, include = null) {
    const cx = facing.z;
    const cz = -facing.x;
    let lo = Infinity;
    let hi = -Infinity;
    this.worldVertices().forEach((list, i) => {
      if (include && !include(i)) return;
      for (let k = 0; k < list.length; k += 3) {
        const s = list[k] * cx + list[k + 2] * cz;
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
    });
    return hi >= lo ? hi - lo : 0;
  }

  /**
   * The direction the wall faces as a whole (08 6.10): the horizontal normal of its chord, normalize(-(last.z -
   * first.z), 0, last.x - first.x), from the first edge of the walk to the last (each through its section's
   * postTransform). For a flat wall along +X it is (-0, 0, 1); it turns with the wall. (0, 0, 1) when the chord is
   * shorter than 1e-9 m (a closed ring, an empty wall).
   * Side effects: none.
   * @returns {{x: number, y: number, z: number}} y is 0
   */
  chordFacing() {
    const first = this.firstEdge;
    const last = this.lastEdge;
    if (!first) return { x: 0, y: 0, z: 1 };
    const f = worldPoint(this.sections[0], first);
    const l = worldPoint(this.sections[this.sections.length - 1], last);
    const dx = l.x - f.x;
    const dz = l.z - f.z;
    const len = Math.hypot(dx, dz);
    if (!(len >= 1e-9)) return { x: 0, y: 0, z: 1 };
    return { x: -dz / len, y: 0, z: dx / len };
  }
}

/**
 * A column-major 4x4 matrix applied to a point (w = 1). Module-private helper of the layout geometry (spec 02's
 * postTransform seam).
 * @param {number[]} m
 * @param {{x: number, y: number, z: number}} p
 * @returns {{x: number, y: number, z: number}}
 */
function transformPoint(m, p) {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  };
}

/**
 * A column-major 4x4 matrix applied to a direction (w = 0). Module-private.
 * @param {number[]} m
 * @param {{x: number, y: number, z: number}} v
 * @returns {{x: number, y: number, z: number}}
 */
function transformVector(m, v) {
  return {
    x: m[0] * v.x + m[4] * v.y + m[8] * v.z,
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z,
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z,
  };
}

/**
 * The floor point of a walk edge in the layout's frame: (e.x, baseY, e.z) through the section's postTransform.
 * Module-private helper of chordFacing.
 * @param {SectionLayout} sl
 * @param {LayoutEdge} e
 * @returns {{x: number, y: number, z: number}}
 */
function worldPoint(sl, e) {
  const p = { x: e.x, y: sl.baseY, z: e.z };
  return sl.postTransform ? transformPoint(sl.postTransform, p) : p;
}

/**
 * Grows the box {min, max} to contain (x, y, z). Module-private helper of WallLayout.bounds().
 * @param {{x: number, y: number, z: number}} min
 * @param {{x: number, y: number, z: number}} max
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function includePoint(min, max, x, y, z) {
  if (x < min.x) min.x = x;
  if (y < min.y) min.y = y;
  if (z < min.z) min.z = z;
  if (x > max.x) max.x = x;
  if (y > max.y) max.y = y;
  if (z > max.z) max.z = z;
}

/**
 * Walks the sections once, carrying the cursor (x, z, facing angle) across section joins, and returns every edge
 * position and panel centre. Section fields are read raw and never coerced (B-L8): `col < section.panelCols`
 * with a string compares numerically, `section.curveIntensity === 0` is false for the string '0', and fractional
 * imported counts walk ceil(cols) columns (B-L8; the card rules round the counts since 08 P2-8a, B-L15).
 * Arithmetic, verbatim 1483-1549 (identical in all three legacy copies):
 *   panelW = section.panelWidth * MM_TO_M; panelH = section.panelHeight * MM_TO_M;
 *   curveAngleRad = (section.curveIntensity * Math.PI) / 180; isFlat = section.curveIntensity === 0;
 *   currentAngle += ((section.angleOffset || 0) * Math.PI) / 180;
 *   edges = [{x: currentX, z: currentZ, angle: currentAngle}];
 *   per column: if (!isFlat) currentAngle += curveAngleRad;   (curve BEFORE the move)
 *     currentX += panelW * Math.cos(currentAngle); currentZ += panelW * Math.sin(currentAngle); push the edge;
 *   panels (rows outer, cols inner): y = row * panelH; {x: (l.x + r.x) / 2, y: y + panelH / 2, z: (l.z + r.z) / 2,
 *     rotY: -Math.atan2(r.z - l.z, r.x - l.x), col, row, sectionIndex}.
 * Ports: index.html@cd3fd3f lines 1483-1549 (== 2615-2647 and 5014-5038, 5051-5066).
 * Side effects: none (pure; allocates plain objects only).
 * @param {import('../domain/WallSection.js').WallSection[]} sections  read raw, never coerced
 * @param {{postTransforms?: (number[]|null)[]|null}} [options]  Feature 2 seam; Phase 1 callers never pass it. Each
 *   entry is stored as that section's postTransform and never read here.
 * @returns {WallLayout}
 * @throws {Error} unsupportedStrategy if Strategies.curveBeforeFirstPanel is not the Phase-1 value
 */
export function computeWallLayout(sections, { postTransforms = null } = {}) {
  switch (Strategies.curveBeforeFirstPanel) {
    case true:
      break;
    default:
      throw unsupportedStrategy('curveBeforeFirstPanel', Strategies.curveBeforeFirstPanel);
  }

  const sectionLayouts = [];

  // Track cumulative position and angle across sections
  let currentX = 0;
  let currentZ = 0;
  let currentAngle = 0; // the direction the wall is "facing" (perpendicular to the panel surface)

  sections.forEach((section, sectionIndex) => {
    const panelW = section.panelWidth * MM_TO_M;
    const panelH = section.panelHeight * MM_TO_M;
    // Curve angle is signed: positive = concave (curves toward viewer), negative = convex (curves away)
    const curveAngleRad = (section.curveIntensity * Math.PI) / 180;
    const isFlat = section.curveIntensity === 0;

    // Apply section angle offset before building this section
    const angleOffsetRad = ((section.angleOffset || 0) * Math.PI) / 180;
    currentAngle += angleOffsetRad;

    const edges = [];
    // First edge starts at current position with current angle
    edges.push({ x: currentX, z: currentZ, angle: currentAngle });

    for (let col = 0; col < section.panelCols; col++) {
      // LEGACY(B-L1): the curve step is applied BEFORE the move, so even the first panel of a curved section
      // is turned by one curve step (a global rotation by the curve angle at the start of each curved section).
      if (!isFlat) {
        currentAngle += curveAngleRad;
      }

      // Move along the panel edge, perpendicular to the facing direction (angle 0 faces +Z and moves along +X)
      currentX += panelW * Math.cos(currentAngle);
      currentZ += panelW * Math.sin(currentAngle);

      edges.push({ x: currentX, z: currentZ, angle: currentAngle });
    }

    const panels = panelCentres(section, sectionIndex, edges, panelH);

    sectionLayouts.push(new SectionLayout({
      section, sectionIndex, panelW, panelH, isFlat, edges, panels,
      postTransform: postTransforms === null ? null : (postTransforms[sectionIndex] ?? null),
    }));
  });

  return new WallLayout({ sections: sectionLayouts });
}

/**
 * The panel centres of one section (rows outer, columns inner), verbatim 1522-1543.
 * Module-private helper of computeWallLayout.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {number} sectionIndex
 * @param {LayoutEdge[]} edges
 * @param {number} panelH  metres
 * @returns {LayoutPanel[]}
 */
function panelCentres(section, sectionIndex, edges, panelH) {
  const panels = [];
  for (let row = 0; row < section.panelRows; row++) {
    const y = row * panelH;

    for (let col = 0; col < section.panelCols; col++) {
      const leftEdge = edges[col];
      const rightEdge = edges[col + 1];

      const centerX = (leftEdge.x + rightEdge.x) / 2;
      const centerZ = (leftEdge.z + rightEdge.z) / 2;
      const centerY = y + panelH / 2;

      const dx = rightEdge.x - leftEdge.x;
      const dz = rightEdge.z - leftEdge.z;
      const rotY = -Math.atan2(dz, dx);

      panels.push({
        x: centerX, y: centerY, z: centerZ,
        rotY, col, row, sectionIndex,
      });
    }
  }
  return panels;
}

/** The orientation of a pivot object without one (a plain {mode, offset} test double): 'none', no yaw offset. */
const NO_ORIENTATION = Object.freeze({ align: OrientationAlign.NONE, yawOffsetDeg: 0 });

/**
 * Resolves the wall pivot on the raw walk (03 6.2): the anchor of the mode (the layout origin for an empty wall), plus
 * the offset. Generative quantities only (03 5.10 #1): a section offset never moves the pivot. F3-O2 (03 12.2, 12.4):
 * the orientation too: alignYawDeg = alignmentYawDeg(layoutL) for 'center-neg-x' (the yaw that turns the LED normal at
 * the wall's centre point to +X; it depends on the sections only, never on the pivot point), else 0; yawDeg =
 * wrapDeg(alignYawDeg + yawOffsetDeg) ('none': wrapDeg(yawOffsetDeg); +0 at the identity).
 * Side effects: none.
 * @param {WallLayout} layoutL  the raw walk (layout frame)
 * @param {import('../domain/Wall.js').WallPivot} pivot
 * @returns {PivotResolution|null} null when P is not finite (a non-finite layout: the identity fallback, no turn)
 * @throws {RangeError} for an unknown mode (WallLayout.pivotPoint)
 */
export function resolvePivot(layoutL, pivot) {
  const a = layoutL.pivotPoint(pivot.mode) ?? { x: 0, y: 0, z: 0 };   // empty wall -> anchor at the layout origin
  const o = pivot.offset;
  const P = { x: a.x + o.x, y: a.y + o.y, z: a.z + o.z };
  if (!Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) return null;
  const { align, yawOffsetDeg } = pivot.orientation ?? NO_ORIENTATION;
  const alignYawDeg = align === OrientationAlign.CENTER_NEG_X ? alignmentYawDeg(layoutL) : 0;
  const yawDeg = wrapDeg(alignYawDeg + yawOffsetDeg);
  return {
    mode: pivot.mode, offset: { ...o }, anchor: a, point: P, stageOrigin: { x: P.x, y: 0, z: P.z },
    align, yawOffsetDeg, alignYawDeg, yawDeg,
  };
}

/**
 * The stage-origin change between two resolutions (03 6.2), layout frame; a null resolution counts as the origin.
 * Side effects: none.
 * @param {PivotResolution|null} a  before
 * @param {PivotResolution|null} b  after
 * @returns {{x: number, z: number}} so(b) - so(a)
 */
export function stageShift(a, b) {
  const sa = a ? a.stageOrigin : ZERO;
  const sb = b ? b.stageOrigin : ZERO;
  return { x: sb.x - sa.x, z: sb.z - sa.z };
}

/**
 * The change of the wall yaw between two resolutions (03 12.4, F3-O2): psi(b) - psi(a) in degrees, unwrapped; a null
 * resolution (and a resolution without a yaw) counts as 0.
 * Side effects: none.
 * @param {PivotResolution|null} a  before
 * @param {PivotResolution|null} b  after
 * @returns {number} degrees
 */
export function yawShift(a, b) {
  return (b ? b.yawDeg ?? 0 : 0) - (a ? a.yawDeg ?? 0 : 0);
}

/**
 * The rigid map that carries a stage point from the stage frame of resolution a into that of resolution b while it
 * keeps its place relative to the wall (03 12.6, F3-O2): s_b = R(dPsi) s_a + R(psi_b) (O_a - O_b), dPsi = psi_b - psi_a.
 * cos and sin are yawTrig(dPsi) (exact at quarter turns); (dx, dz) = R(psi_b) (O_a - O_b), which is exactly
 * -stageShift(a, b) when psi_b is 0 (the 03 6.5 re-expression, bit for bit).
 * Side effects: none.
 * @param {PivotResolution|null} a  before
 * @param {PivotResolution|null} b  after
 * @returns {{yawDeg: number, cos: number, sin: number, dx: number, dz: number}}
 */
export function stageChange(a, b) {
  const shift = stageShift(a, b);
  const yawB = b ? b.yawDeg ?? 0 : 0;
  const yawDeg = yawShift(a, b);
  const d = yawB === 0 ? { x: -shift.x, z: -shift.z } : turnXZ(-shift.x, -shift.z, yawTrig(yawB));
  const trig = yawTrig(yawDeg);
  return { yawDeg, cos: trig.cos, sin: trig.sin, dx: d.x, dz: d.z };
}

/**
 * Whether a resolution is the identity pivot (bottom-left with a zero offset and, since 03 12.4, a zero wall yaw): the
 * exports write pivot metadata only for a non-identity pivot (03 7.1, 7.2, Q10), so the identity keeps their Phase-1
 * bytes (03 T3).
 * Side effects: none.
 * @param {PivotResolution} r
 * @returns {boolean}
 */
export function isIdentityResolution(r) {
  return r.mode === PivotMode.BOTTOM_LEFT && r.offset.x === 0 && r.offset.y === 0 && r.offset.z === 0 &&
    (r.yawDeg ?? 0) === 0;
}

/**
 * THE single entry point used by every consumer (LEDWallView via WallController, SafeDistanceView via CameraHub,
 * exporters via ProjectIO, which pass {frame: 'export'}). Feature 3 (03 6.3, 5.1): the raw walk (every postTransform
 * null) is resolved against the wall pivot and translated once into the requested frame:
 *   'stage' (the default): t = -(P.x, 0, P.z), the stage origin is the pivot on the floor, the floor stays y = 0;
 *   'export': t = -P, the file origin is the pivot;
 *   'layout': t = 0, the legacy world.
 * A null resolution (a non-finite layout) translates nothing. A zero translation (the identity pivot; -0 included)
 * returns the walk itself, bit-identical. F3-O2 (03 12.3): the stage and export frames are then turned by the wall yaw
 * psi = resolution.yawDeg about the frame origin's vertical (the pivot): x_S = R_y(psi)(x_L - O), x_E = R_y(psi)(x_L - P);
 * the layout frame and a zero yaw are never turned. Spec 02 inserts applySectionOffsets(out) after the translation and
 * the turn (07 C32; its section frames are built from the turned geometry, 03 12.3).
 * Side effects: none (the returned layout is fresh; its `pivot` block is set here).
 * @param {import('../domain/Project.js').Project} project
 * @param {{frame?: 'stage'|'export'|'layout'}} [options]
 * @returns {WallLayout} with `pivot = {resolution, frame, translation, yawDeg}`
 * @throws {RangeError} `Unknown layout frame ${JSON.stringify(frame)}` for any other frame
 */
export function layoutProject(project, { frame = 'stage' } = {}) {
  if (!FRAMES.includes(frame)) throw new RangeError(`Unknown layout frame ${JSON.stringify(frame)}`);
  const raw = computeWallLayout(project.wall.sections);                 // verbatim walk (layout frame)
  const resolution = resolvePivot(raw, project.wall.pivot);             // generative quantities only (03 5.10 #1)
  const t = frame === 'layout' || !resolution ? ZERO
    : frame === 'export' ? { x: -resolution.point.x, y: -resolution.point.y, z: -resolution.point.z }
      : { x: -resolution.stageOrigin.x, y: 0, z: -resolution.stageOrigin.z };
  const yawDeg = frame === 'layout' || !resolution ? 0 : resolution.yawDeg;
  let out = (t.x === 0 && t.y === 0 && t.z === 0) ? raw : raw.translated(t.x, t.y, t.z);   // identity: the same object
  if (yawDeg !== 0) out = out.rotated(yawDeg);                                             // 03 12.3: about the pivot
  // spec 02 inserts applySectionOffsets(out) here: S_i is built from the TRANSLATED (and turned) section frame
  // (03 5.10 #2, 12.3; 07 C32)
  out.pivot = { resolution, frame, translation: t, yawDeg };
  return out;
}

/**
 * An axis-aligned box with its centre, (min + max) / 2 per axis. Frozen.
 * @typedef {Readonly<{min: Readonly<{x: number, y: number, z: number}>, max: Readonly<{x: number, y: number, z: number}>,
 *            center: Readonly<{x: number, y: number, z: number}>}>} FramingBox
 */

/**
 * The framing of a layout (08 6.10, P2-11c; FramingPolicy's three named boxes, 07 C34), in the layout's frame (the
 * stage frame for the stage layout). Each consumer names the box it reads:
 *   generativeBox: generativeBounds() (attached sections, pre-offset): the orbit target before 07 I4b;
 *   wallBox: bounds() (transformed, every section): the centre Reset looks at (07's F / open / new / restore from I4b);
 *   stageExtent: {width, height} of the sections whose LED normal has |n.y| <= 0.9 (overhead sections excluded, 09
 *     Q16): width = extentAcross(facing) (the wall seen face-on, invariant under a yaw of the wall), height = the y range
 *     of their vertices; read by the safe distance D and the coverage's fits test;
 *   facing: chordFacing(), the direction the wall faces as a whole: Reset stands on it, 5 m from wallBox.center;
 *   wallZ: the z of the walk's start in this frame (0 + the layout's translation z, turned by the layout's yaw since
 *     F3-O2; 0 for a bare walk): the posZ rule's context (03 4.1: a non-numeric Z entry puts the camera 5 m in front of
 *     the wall start plane).
 * On every harness wall (no offsets, no detached or horizontal sections) the boxes coincide with the box of
 * worldVertices(). Nothing here assumes the wall runs along +X or faces +Z.
 * The orientation additions (03 12.7): centre = wallCentre(layout) in this frame (null without one); aligned = the
 *   resolution's align is 'center-neg-x' (stage or export frame); viewYawDeg = wrapDeg(90 + yawOffsetDeg) when aligned
 *   with a centre (the azimuth of the turned centre normal), else the layout's yaw (0 at the identity): the view presets
 *   and the aligned Reset read it; frontZ = the posZ input's fallback for a non-numeric entry, 5 m in front of the LED
 *   face: wallZ + 5 at a zero yaw (the legacy rule), else the z of the Reset position.
 * @typedef {Readonly<{generativeBox: FramingBox, wallBox: FramingBox,
 *            stageExtent: Readonly<{width: number, height: number}>,
 *            facing: Readonly<{x: number, y: number, z: number}>, wallZ: number,
 *            centre: Readonly<{point: {x: number, y: number, z: number}, normal: {x: number, y: number, z: number}}>|null,
 *            aligned: boolean, viewYawDeg: number, frontZ: number}>} Framing
 */

/** The framing memo: one framing per layout instance (a layout is rebuilt once per WALL_REBUILT). */
const FRAMING_MEMO = new WeakMap();

/** The |n.y| above which a section faces up or down and leaves the stage extent (09 Q16, 07 C34). */
const STAGE_EXTENT_MAX_NY = 0.9;

/**
 * The box {min, max} with its centre, frozen; null when the box is null or not finite. Module-private.
 * @param {{min: {x: number, y: number, z: number}, max: {x: number, y: number, z: number}}|null} b
 * @returns {FramingBox|null}
 */
function framingBox(b) {
  if (!b) return null;
  const center = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
  if (![center.x, center.y, center.z].every(Number.isFinite)) return null;
  return Object.freeze({ min: Object.freeze({ ...b.min }), max: Object.freeze({ ...b.max }), center: Object.freeze(center) });
}

/**
 * FramingPolicy's stageExtent (07 C34): every section counts except one with a column whose LED normal has
 * |n.y| > 0.9 (it faces up or down: a ceiling or a floor); width = layout.extentAcross(facing) over them, height = their
 * y range. null when nothing counts or a value is not finite. Module-private.
 * @param {WallLayout} layout
 * @param {{x: number, z: number}} facing
 * @returns {Readonly<{width: number, height: number}>|null}
 */
function stageExtentOf(layout, facing) {
  const excluded = new Set();
  for (const q of layout.columnQuads()) {
    if (!(Math.abs(q.n.y) <= STAGE_EXTENT_MAX_NY)) excluded.add(q.sectionIndex);
  }
  const include = (i) => !excluded.has(layout.sections[i].sectionIndex);
  let lo = Infinity;
  let hi = -Infinity;
  layout.worldVertices().forEach((list, i) => {
    if (!include(i)) return;
    for (let k = 1; k < list.length; k += 3) {
      if (list[k] < lo) lo = list[k];
      if (list[k] > hi) hi = list[k];
    }
  });
  if (!(hi >= lo)) return null;
  const width = layout.extentAcross(facing, include);
  const height = hi - lo;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return Object.freeze({ width, height });
}

/**
 * The 'layout' framing of one layout (08 6.10, P2-11c), or the fallback for a wall without finite grid vertices (an
 * empty wall, or non-finite section values): a zero box at the walk's start in this frame, width = height = 0 and
 * facing (0, 0, 1), which is the 'flat-pivot' framing of an empty wall (03 6.6). Module-private.
 * @param {WallLayout} layout
 * @returns {Framing}
 */
function layoutFraming(layout) {
  const t = layout.pivot ? layout.pivot.translation : ZERO;
  const yawDeg = layout.pivot ? layout.pivot.yawDeg ?? 0 : 0;
  const start = yawDeg === 0 ? t : turnXZ(t.x, t.z, yawTrig(yawDeg));   // the walk start in this frame (03 12.5)
  const wallZ = 0 + start.z;
  const generativeBox = framingBox(layout.generativeBounds());
  const wallBox = framingBox(layout.bounds());
  const facing = layout.chordFacing();
  const stageExtent = generativeBox && wallBox ? stageExtentOf(layout, facing) : null;
  // 03 12.7: the orientation additions (the wall centre, whether 'center-neg-x' is on, the azimuth the views face from)
  const res = layout.pivot ? layout.pivot.resolution : null;
  const aligned = !!res && layout.pivot.frame !== 'layout' && res.align === OrientationAlign.CENTER_NEG_X;
  const c = wallCentre(layout);
  const centre = c ? Object.freeze({ point: Object.freeze(c.point), normal: Object.freeze(c.normal) }) : null;
  const viewYawDeg = aligned && centre ? wrapDeg(90 + res.yawOffsetDeg) : yawDeg;
  if (!generativeBox || !wallBox || !stageExtent) {
    const origin = { x: 0 + start.x, y: 0, z: wallZ };
    const box = framingBox({ min: origin, max: origin });
    return Object.freeze({
      generativeBox: box, wallBox: box, stageExtent: Object.freeze({ width: 0, height: 0 }),
      facing: Object.freeze({ x: 0, y: 0, z: 1 }), wallZ, centre: null, aligned, viewYawDeg: yawDeg,
      frontZ: yawDeg === 0 ? wallZ + 5 : wallZ,
    });
  }
  const frontZ = yawDeg === 0 ? wallZ + 5
    : aligned && centre ? centre.point.z + 5 * yawTrig(viewYawDeg).cos
      : wallBox.center.z + 5 * facing.z;
  return Object.freeze({
    generativeBox, wallBox, stageExtent, facing: Object.freeze(facing), wallZ, centre, aligned, viewYawDeg, frontZ,
  });
}

/**
 * The single switch of the framing (FramingPolicy's three named boxes, 07 C34; 08 6.10, P2-11c: B-L2 fixed): the
 * orbit target, Reset, the safe distance D and the coverage's fits test all read the framing of the stage layout,
 * injected as `frameBounds` (App: framingBounds(wallController.currentLayout)), each from its named box. Memoised per
 * layout instance, so the per-frame and per-pose callers (orbit drags, gizmo drags, pilot frames) never re-derive it.
 *   'layout': layoutFraming(layout) (the Phase-1 'flat' case was deleted by 03 T2, the 'flat-pivot' case by P2-11c).
 * At the identity pivot a flat wall along +X gives the legacy values bit for bit: generativeBox.center =
 * (W / 2, H / 2, 0), facing (-0, 0, 1), stageExtent {W, H} (W the walk's last edge x, the legacy flat sum for widths
 * whose sums are exact).
 * Side effects: memoises the frozen framing on the layout (WeakMap).
 * @param {WallLayout} layout  the stage layout (layoutProject's default frame)
 * @returns {Framing}
 * @throws {Error} unsupportedStrategy if Strategies.framingBounds is not a supported value
 */
export function framingBounds(layout) {
  switch (Strategies.framingBounds) {
    case 'layout': {
      let framing = FRAMING_MEMO.get(layout);
      if (!framing) {
        framing = layoutFraming(layout);
        FRAMING_MEMO.set(layout, framing);
      }
      return framing;
    }
    default:
      throw unsupportedStrategy('framingBounds', Strategies.framingBounds);
  }
}
