/**
 * @module geometry/WallLayout
 * The single cursor walk over the wall sections. It replaces the three arithmetically identical legacy walks
 * (viewport 1482-1549, safe distance 2614-2647, exports 5012-5080) and is the single source of every edge
 * position and panel transform; every consumer reaches it through layoutProject(). Also hosts the single
 * flat-bounds switch (framingBounds) and the Feature 3 seams (firstEdge, lastEdge, bounds, pivotPoint).
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
   * Side effects: none.
   * @param {{section: import('../domain/WallSection.js').WallSection, sectionIndex: number, panelW: number,
   *          panelH: number, isFlat: boolean, edges: LayoutEdge[], panels: LayoutPanel[],
   *          postTransform?: number[]|null}} parts
   */
  constructor({ section, sectionIndex, panelW, panelH, isFlat, edges, panels, postTransform = null }) {
    this.section = section;
    this.sectionIndex = sectionIndex;
    this.sectionId = section.id;
    this.panelW = panelW;
    this.panelH = panelH;
    this.isFlat = isFlat;
    this.edges = edges;
    this.panels = panels;
    this.postTransform = postTransform;
  }
}

/** The walk result for the whole wall. Built only by computeWallLayout; treat it (and its edges) as read-only. */
export class WallLayout {
  /** @type {SectionLayout[]} in wall order */
  sections;

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
   * empty group and do not throw.
   * Ports: index.html@cd3fd3f lines 2619-2647 (the `allEdges.length === 0` first-edge rule and the per-column pushes).
   * Side effects: none.
   * @returns {LayoutEdge[]} a new array
   */
  flatEdges() {
    // LEGACY(B-M15): one flattened edge list across section joins; the safe-distance band builds un-mitred
    // per-column quads from it (overlaps on concave joins, wedge gaps on convex ones).
    const allEdges = [];
    if (this.sections.length === 0) return allEdges;
    allEdges.push(this.sections[0].edges[0]);
    for (const sl of this.sections) {
      for (let k = 1; k < sl.edges.length; k++) allEdges.push(sl.edges[k]);
    }
    return allEdges;
  }

  /**
   * Feature 3 seam: the walk origin. Unused in Phase 1.
   * Side effects: none.
   * @returns {LayoutEdge|null} sections[0].edges[0], or null for an empty wall
   */
  get firstEdge() {
    return this.sections.length === 0 ? null : this.sections[0].edges[0];
  }

  /**
   * Feature 3 seam: the end of the walk. Unused in Phase 1.
   * Side effects: none.
   * @returns {LayoutEdge|null} the last section's last edge, or null for an empty wall
   */
  get lastEdge() {
    if (this.sections.length === 0) return null;
    const { edges } = this.sections[this.sections.length - 1];
    return edges[edges.length - 1];
  }

  /**
   * Feature 3 seam: the true axis-aligned box of every grid vertex, i.e. of the positions WallMeshBuilder emits
   * (row = 0..panelRows, col = 0..panelCols, y = row * panelH, x/z from edges[col]). Computed on demand; unused in
   * Phase 1. A wall whose sections have no grid vertices (negative, NaN or non-numeric counts; a count of 0 still
   * has the row-0 / column-0 vertex) yields the empty box {min: +Infinity, max: -Infinity}. NaN coordinates are
   * skipped (plain < / > comparisons), and 0 and -0 are not distinguished.
   * Side effects: none.
   * @returns {{min: {x: number, y: number, z: number}, max: {x: number, y: number, z: number}}|null}
   *   a new object, or null for an empty wall
   */
  bounds() {
    if (this.sections.length === 0) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const sl of this.sections) {
      const { section, edges } = sl;
      for (let row = 0; row <= section.panelRows; row++) {
        const y = row * sl.panelH;
        for (let col = 0; col <= section.panelCols; col++) {
          const edge = edges[col];
          includePoint(min, max, edge.x, y, edge.z);
        }
      }
    }
    return { min, max };
  }

  /**
   * Feature 3 seam: the wall pivot point on the floor. Unused in Phase 1.
   *   'bottom-left' (PivotMode.BOTTOM_LEFT): {x: firstEdge.x, y: 0, z: firstEdge.z} (the implicit legacy origin);
   *   'wall-center' (PivotMode.WALL_CENTER): midpoint of firstEdge and lastEdge, y 0 (the owner's "middle of
   *     entire wall");
   *   'mesh-center' (PivotMode.MESH_CENTER): centre of bounds() (its y is provisional: Feature 3 decides the policy).
   * Side effects: none.
   * @param {string} mode  a PivotMode value
   * @returns {{x: number, y: number, z: number}|null} null for an empty wall
   * @throws {RangeError} for an unknown mode
   */
  pivotPoint(mode) {
    if (this.sections.length === 0) return null;
    switch (mode) {
      case PivotMode.BOTTOM_LEFT: {
        const first = this.firstEdge;
        return { x: first.x, y: 0, z: first.z };
      }
      case PivotMode.WALL_CENTER: {
        const first = this.firstEdge;
        const last = this.lastEdge;
        return { x: (first.x + last.x) / 2, y: 0, z: (first.z + last.z) / 2 };
      }
      case PivotMode.MESH_CENTER: {
        const { min, max } = this.bounds();
        return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
      }
      default:
        throw new RangeError(`Unknown pivot mode ${JSON.stringify(mode)}`);
    }
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
 * counts walk ceil(cols) columns (B-L15).
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
 * THE single entry point used by every consumer (LEDWallView via WallController, SafeDistanceView via CameraHub,
 * exporters via ProjectIO). Features 2 and 3 add options here only.
 * Side effects: none.
 * @param {import('../domain/Project.js').Project} project
 * @returns {WallLayout} computeWallLayout(project.wall.sections)
 */
export function layoutProject(project) {
  return computeWallLayout(project.wall.sections);
}

/**
 * The single switch for the four flat-bounds consumers (orbit target, camera reset, coverage status, safe-distance
 * D); they receive it injected as `frameBounds`.
 * Ports: index.html@cd3fd3f lines 2489-2493, 2553-2557, 2598-2603, 3758-3762 (via Wall.flatBounds).
 * Side effects: none.
 * @param {import('../domain/Project.js').Project} project
 * @returns {{totalWidth: number, maxHeight: number}} metres
 * @throws {Error} unsupportedStrategy if Strategies.framingBounds is not the Phase-1 value
 */
export function framingBounds(project) {
  switch (Strategies.framingBounds) {
    case 'flat':
      // LEGACY(B-L2, B-M10): the framing consumers use the flat width sum and the tallest section, ignoring
      // curvature, angle offsets and camera rotation.
      return project.wall.flatBounds();
    default:
      throw unsupportedStrategy('framingBounds', Strategies.framingBounds);
  }
}
