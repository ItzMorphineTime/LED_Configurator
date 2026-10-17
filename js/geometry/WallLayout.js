/**
 * @module geometry/WallLayout
 * The single cursor walk over the wall sections. It replaces the three arithmetically identical legacy walks
 * (viewport 1482-1549, safe distance 2614-2647, exports 5012-5080) and is the single source of every edge
 * position and panel transform; every consumer reaches it through layoutProject(). Also hosts the single
 * flat-bounds switch (framingBounds) and Feature 3's pivot geometry (03 T2, docs/improvements/03-pivot.md 6.1-6.6):
 * the anchors (firstEdge, lastEdge, generativeBounds, pivotPoint), baseY, translated(), resolvePivot, stageShift and
 * the frames of layoutProject (layout, stage, export).
 * Legacy source: index.html@cd3fd3f 1479-1549 (walk + panel centres), 2614-2647 (flattened edges),
 * 5012-5038 + 5051-5066 (the export copy of the walk), 2489-2493 / 2553-2557 / 2598-2603 / 3758-3762 (flat bounds).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { MM_TO_M } from '../domain/WallSection.js';
import { PivotMode } from '../domain/Wall.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';

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
}

/** The origin (layout frame); also the translation of the identity frames. Frozen. */
const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

/** The frames layoutProject produces (03 5.1). */
const FRAMES = Object.freeze(['stage', 'export', 'layout']);

/**
 * The resolved pivot (03 6.2), layout frame: the mode and offset it was resolved from, the anchor of 6.1 (the layout
 * origin for an empty wall), the pivot point P = anchor + offset and the stage origin (P.x, 0, P.z).
 * @typedef {{mode: string, offset: {x: number, y: number, z: number}, anchor: {x: number, y: number, z: number},
 *            point: {x: number, y: number, z: number}, stageOrigin: {x: number, y: number, z: number}}} PivotResolution
 */

/**
 * What layoutProject records on its result (03 6.3): the resolution (null for a non-finite layout), the frame and the
 * translation that was applied (the identity frames translate by ZERO and return the walk itself).
 * @typedef {{resolution: PivotResolution|null, frame: 'stage'|'export'|'layout',
 *            translation: {x: number, y: number, z: number}}} LayoutPivot
 */

/**
 * The walk result for the whole wall. Built only by computeWallLayout and by translated(); treat it (and its edges) as
 * read-only.
 */
export class WallLayout {
  /** @type {SectionLayout[]} in wall order */
  sections;
  /**
   * The pivot block (Feature 3, 03 6.3): set by layoutProject on the layout it returns, null on a bare walk or copy.
   * @type {LayoutPivot|null}
   */
  pivot = null;

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
   * The box of every grid vertex: generativeBounds() until spec 02 makes it the transformed box (after the section
   * offsets, all sections; FramingPolicy's `wallBox`, 07 C34).
   * Side effects: none.
   * @returns {{min: {x: number, y: number, z: number}, max: {x: number, y: number, z: number}}|null}
   */
  bounds() {
    return this.generativeBounds();
  }

  /**
   * The pivot anchor of a mode (03 6.1), in this layout's frame. With y0 = sections[0].baseY (0 in the layout frame,
   * so the floor modes return the Phase-1 values bit for bit):
   *   'bottom-left' (PivotMode.BOTTOM_LEFT): {x: firstEdge.x, y: y0, z: firstEdge.z} (the implicit legacy origin);
   *   'wall-center' (PivotMode.WALL_CENTER): the midpoint of firstEdge and lastEdge at y0 (the owner's "middle of
   *     entire wall");
   *   'mesh-center' (PivotMode.MESH_CENTER): the centre of generativeBounds(), y included: half the tallest section
   *     for a bottom-aligned wall (decision B5, Q2).
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
        return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
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

/**
 * Resolves the wall pivot on the raw walk (03 6.2): the anchor of the mode (the layout origin for an empty wall), plus
 * the offset. Generative quantities only (03 5.10 #1): a section offset never moves the pivot.
 * Side effects: none.
 * @param {WallLayout} layoutL  the raw walk (layout frame)
 * @param {import('../domain/Wall.js').WallPivot} pivot
 * @returns {PivotResolution|null} null when P is not finite (a non-finite layout: the identity fallback)
 * @throws {RangeError} for an unknown mode (WallLayout.pivotPoint)
 */
export function resolvePivot(layoutL, pivot) {
  const a = layoutL.pivotPoint(pivot.mode) ?? { x: 0, y: 0, z: 0 };   // empty wall -> anchor at the layout origin
  const o = pivot.offset;
  const P = { x: a.x + o.x, y: a.y + o.y, z: a.z + o.z };
  if (!Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) return null;
  return { mode: pivot.mode, offset: { ...o }, anchor: a, point: P, stageOrigin: { x: P.x, y: 0, z: P.z } };
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
 * THE single entry point used by every consumer (LEDWallView via WallController, SafeDistanceView via CameraHub,
 * exporters via ProjectIO, which pass {frame: 'export'}). Feature 3 (03 6.3, 5.1): the raw walk (every postTransform
 * null) is resolved against the wall pivot and translated once into the requested frame:
 *   'stage' (the default): t = -(P.x, 0, P.z), the stage origin is the pivot on the floor, the floor stays y = 0;
 *   'export': t = -P, the file origin is the pivot;
 *   'layout': t = 0, the legacy world.
 * A null resolution (a non-finite layout) translates nothing. A zero translation (the identity pivot; -0 included)
 * returns the walk itself, bit-identical. Spec 02 inserts applySectionOffsets(out) after the translation (07 C32).
 * Side effects: none (the returned layout is fresh; its `pivot` block is set here).
 * @param {import('../domain/Project.js').Project} project
 * @param {{frame?: 'stage'|'export'|'layout'}} [options]
 * @returns {WallLayout} with `pivot = {resolution, frame, translation}`
 * @throws {RangeError} `Unknown layout frame ${JSON.stringify(frame)}` for any other frame
 */
export function layoutProject(project, { frame = 'stage' } = {}) {
  if (!FRAMES.includes(frame)) throw new RangeError(`Unknown layout frame ${JSON.stringify(frame)}`);
  const raw = computeWallLayout(project.wall.sections);                 // verbatim walk (layout frame)
  const resolution = resolvePivot(raw, project.wall.pivot);             // generative quantities only (03 5.10 #1)
  const t = frame === 'layout' || !resolution ? ZERO
    : frame === 'export' ? { x: -resolution.point.x, y: -resolution.point.y, z: -resolution.point.z }
      : { x: -resolution.stageOrigin.x, y: 0, z: -resolution.stageOrigin.z };
  const out = (t.x === 0 && t.y === 0 && t.z === 0) ? raw : raw.translated(t.x, t.y, t.z);   // identity: the same object
  // spec 02 inserts applySectionOffsets(out) here: S_i is built from the TRANSLATED section frame (03 5.10 #2, 07 C32)
  out.pivot = { resolution, frame, translation: t };
  return out;
}

/**
 * The 'flat-pivot' framing bounds (03 6.6, step A): the legacy flat rectangle (the flat width sum x the tallest
 * section, at z = 0 from x = 0), translated into the stage frame. `0 - x` (not `-x`) gives +0 at the identity.
 * Module-private; the step-F 'layout' case (08 P2-11c) reuses it.
 * @param {import('../domain/Project.js').Project} project
 * @param {PivotResolution|null} resolution
 * @returns {{totalWidth: number, maxHeight: number, minX: number, wallZ: number}}
 */
function flatPivot(project, resolution) {
  const b = project.wall.flatBounds();
  const so = resolution ? resolution.stageOrigin : ZERO;
  return { totalWidth: b.totalWidth, maxHeight: b.maxHeight, minX: 0 - so.x, wallZ: 0 - so.z };
}

/**
 * The single switch for the four flat-bounds consumers (orbit target, camera reset, coverage status, safe-distance
 * D); they receive it injected as `frameBounds` (App passes WallController's cached resolution from 03 T3).
 * 'flat-pivot' (03 T2, step A; the Phase-1 'flat' case is deleted): {totalWidth, maxHeight} as legacy, plus the flat
 * wall's stage placement minX = 0 - stageOrigin.x and wallZ = 0 - stageOrigin.z (both +0 at the identity, so every
 * consumer is identity-exact, 03 6.6). Step F (08 P2-11c) adds the 'layout' case.
 * Ports: index.html@cd3fd3f lines 2489-2493, 2553-2557, 2598-2603, 3758-3762 (via Wall.flatBounds).
 * Side effects: none.
 * @param {import('../domain/Project.js').Project} project
 * @param {PivotResolution|null} [resolution]  defaults to the live resolution of the project's pivot
 * @returns {{totalWidth: number, maxHeight: number, minX: number, wallZ: number}} metres, stage frame
 * @throws {Error} unsupportedStrategy if Strategies.framingBounds is not a supported value
 */
export function framingBounds(project, resolution = resolvePivot(computeWallLayout(project.wall.sections), project.wall.pivot)) {
  switch (Strategies.framingBounds) {
    case 'flat-pivot':
      // LEGACY(B-L2, B-M10): flat bounds (the arc width sum x the tallest section), translated by the stage origin;
      // curvature, angle offsets and camera rotation are still ignored (step F, 08 P2-11c, fixes B-L2).
      return flatPivot(project, resolution);
    default:
      throw unsupportedStrategy('framingBounds', Strategies.framingBounds);
  }
}
