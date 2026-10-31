/**
 * @module geometry/WallMeshBuilder
 * The one owner of winding, normals and UVs: turns a WallLayout into plain vertex/normal/UV/index arrays for the
 * viewport (combined and section meshes), the OBJ writer and the glTF writer, and provides the panel-mode quad
 * corners, indices and facing normal. Each consumer gets its own instance built with its Strategies.mesh profile
 * (App passes Strategies.mesh.viewport / .obj / .gltf), so a later winding/normal/UV fix is a profile flip.
 * Every array is plain JS (float64); viewport callers wrap them in Float32BufferAttribute, the glTF writer builds
 * Float32Arrays but computes min/max from these float64 values, as legacy does (4766-4775).
 * Legacy source: index.html@cd3fd3f 1579-1644 (combined grid), 1710-1751 (section grids), 5040-5048 (export
 * vertices), 4591-4604 / 4637-4656 (OBJ indices), 4680-4706 (OBJ panel quads), 4836-4847 / 4855-4865 (glTF
 * indices), 4875-4887 (glTF panel quads).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { unsupportedStrategy } from '../legacy/LegacyCompat.js';
import { planSectionUvs, sectionUv } from './UvMapper.js';

/**
 * The 6 indices of one grid quad (two triangles).
 *   'ccw' (08 6.4; viewport 08 P2-2a, OBJ P2-2c, glTF P2-2d): [bl, br, tr, bl, tr, tl], counter-clockwise seen
 *     from the side the stored normals point to (+Z for a flat wall, the stage); panel quads with corners BL=0, BR=1,
 *     TR=2, TL=3 give [0, 1, 2, 0, 2, 3].
 *   'legacy-cw': [bl, tl, tr, bl, tr, br], the Phase-1 order, kept for the LegacyProfiles oracle tests. It reproduces
 *     all 8 legacy index sites: viewport 1638 / 1749, OBJ 4599-4600 / 4648-4649, glTF 4844 / 4863, and panel quads:
 *     quadIndices(0, 1, 3, 2) = [0, 3, 2, 0, 2, 1] (glTF 4887) and OBJ `v, v+3, v+2 / v, v+2, v+1` =
 *     quadIndices(v, v+1, v+3, v+2) (4705-4706).
 * Both split the quad along the bl-tr diagonal: 'ccw' triangle 0 is 'legacy-cw' triangle 1 with its last two vertices
 * swapped, and 'ccw' triangle 1 is 'legacy-cw' triangle 0 swapped the same way.
 * Side effects: none.
 * @param {number} bl  bottom-left vertex index
 * @param {number} br  bottom-right vertex index
 * @param {number} tl  top-left vertex index
 * @param {number} tr  top-right vertex index
 * @param {string} [winding='legacy-cw']  a profile's `winding`
 * @returns {number[]} a new 6-element array
 * @throws {Error} unsupportedStrategy('mesh.winding', winding) for any value other than 'ccw' and 'legacy-cw'
 */
export function quadIndices(bl, br, tl, tr, winding = 'legacy-cw') {
  switch (winding) {
    case 'ccw':
      // 08 6.4: (br - bl) x (tr - bl) points along the stored normals (+Z for a flat wall). Every production profile
      // since 08 P2-2d (viewport P2-2a, B-H1; OBJ P2-2c and glTF P2-2d, B-H2).
      return [bl, br, tr, bl, tr, tl];
    case 'legacy-cw':
      // legacy-cw: Phase-1 behaviour (B-H1, B-H2: clockwise seen from +Z, against the stored normals), kept for the
      // LegacyProfiles oracle tests. No production profile uses it since 08 P2-2d.
      return [bl, tl, tr, bl, tr, br];
    default:
      throw unsupportedStrategy('mesh.winding', winding);
  }
}

/**
 * The largest value of an index array, found with a loop (no spread: an index array can hold millions of entries).
 * NaN entries (B-L8 garbage) are skipped, as every comparison with NaN is false; an empty array gives -Infinity.
 * Side effects: none.
 * @param {ArrayLike<number>} indices
 * @returns {number}
 */
export function maxIndexOf(indices) {
  let max = -Infinity;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] > max) max = indices[i];
  }
  return max;
}

/**
 * The index component width an index buffer needs (08 6.2, B-L5 fixed in 08 P2-1b). glTF 2.0 forbids an index equal
 * to the maximum of its component type (65,535 for UNSIGNED_SHORT 5123), because it is the primitive-restart value,
 * which WebGL2 always applies; so 32-bit indices are needed AT or above 65,535, not only above it.
 * Used by the glTF writer (profile indexType 'auto') and the viewport index attribute (08 P2-1e).
 * Side effects: none.
 * @param {number} maxIndex  the largest index (maxIndexOf)
 * @returns {'uint16'|'uint32'} 'uint32' when maxIndex >= 65535, else 'uint16'
 */
export function indexWidth(maxIndex) {
  return maxIndex >= 65535 ? 'uint32' : 'uint16';
}

/**
 * Appends the 'right-panel' vertex normal (nx, 0, nz) of grid column `col`: the normal of the panel to the right
 * of the edge; the last column uses the previous edge pair. Verbatim 1607-1625 (== 1723-1739). For panelCols = 0
 * the else-branch reads edges[-1] and throws the legacy TypeError. Module-private.
 * @param {number[]} normals  output array
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {import('./WallLayout.js').LayoutEdge[]} edgePositions
 * @param {number} col
 * @param {import('./WallLayout.js').LayoutEdge} edge  edgePositions[col]
 */
function pushRightPanelNormal(normals, section, edgePositions, col, edge) {
  let nx, nz;
  if (col < section.panelCols) {
    const nextEdge = edgePositions[col + 1];
    const dx = nextEdge.x - edge.x;
    const dz = nextEdge.z - edge.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    // Normal is perpendicular to edge direction, pointing outward
    nx = -dz / len;
    nz = dx / len;
  } else {
    // Last edge - use previous edge's direction
    const prevEdge = edgePositions[col - 1];
    const dx = edge.x - prevEdge.x;
    const dz = edge.z - prevEdge.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    nx = -dz / len;
    nz = dx / len;
  }
  normals.push(nx, 0, nz);
}

/**
 * The panel normal (nx, nz) of the edge pair j -> j + 1: the edge direction rotated -90 deg about +Y, with the
 * arithmetic of legacy 1610-1615. edgePositions[j + 1] is read first, so a missing pair throws the same TypeError as
 * pushRightPanelNormal. Module-private.
 * @param {import('./WallLayout.js').LayoutEdge[]} edgePositions
 * @param {number} j
 * @returns {{x: number, z: number}}
 */
function panelNormalAt(edgePositions, j) {
  const dx = edgePositions[j + 1].x - edgePositions[j].x;
  const dz = edgePositions[j + 1].z - edgePositions[j].z;
  const len = Math.sqrt(dx * dx + dz * dz);
  return { x: -dz / len, z: dx / len };
}

/**
 * Appends the 'averaged' vertex normal (nx, 0, nz) of grid column `col` of a CURVED section (08 6.4 with 01 CR-1;
 * a flat section uses pushRightPanelNormal verbatim). With C = edgePositions.length - 1 and n[j] = panelNormalAt(j):
 * column 0 -> n[0]; column C -> n[C - 1]; any other column -> the unit bisector normalize(n[col - 1] + n[col]),
 * exactly half the curve step from each adjacent panel normal. Every row of a column gets the same normal; the
 * normals are never negated. A section without a column pair (panelCols 0, or '' / '0' imported raw, B-L8) throws
 * the same TypeError as 'right-panel'. Module-private.
 * @param {number[]} normals  output array
 * @param {import('../domain/WallSection.js').WallSection} section  unused (the writer signature)
 * @param {import('./WallLayout.js').LayoutEdge[]} edgePositions
 * @param {number} col
 */
function pushAveragedNormal(normals, section, edgePositions, col) {
  const last = edgePositions.length - 1;
  if (col === 0 || col === last) {
    const n = panelNormalAt(edgePositions, col === 0 ? 0 : last - 1);
    normals.push(n.x, 0, n.z);
    return;
  }
  const a = panelNormalAt(edgePositions, col - 1);
  const b = panelNormalAt(edgePositions, col);
  const sx = a.x + b.x;
  const sz = a.z + b.z;
  const len = Math.sqrt(sx * sx + sz * sz);
  normals.push(sx / len, 0, sz / len);
}

/**
 * Resolves the sectionGrid `uv` option into a per-vertex UV writer, or null when no UVs are written.
 *   'unit'                     -> (col / panelCols, row / panelRows)                          (1740)
 *   {offsetU, widthU}          -> (offsetU + (col / panelCols) * widthU, row / panelRows)     (1627, the Phase-1 atlas
 *                                 rect of 'atlas-u-full-v', B-M5)
 *   {offsetU, widthU, heightV} -> (offsetU + (col / panelCols) * widthU, (row / panelRows) * heightV)
 *                                 (08 P2-7a, 08 6.7: the pixel-accurate atlas rect; heightV = 1 reproduces row / panelRows
 *                                 bit for bit)
 *   SectionUvPlan (04 UV-6)    -> UvMapper.sectionUv(plan, col / panelCols, row / panelRows): the plan's transform
 *                                 (iff plan.transform), then its atlas rect (iff plan.rect); a plan with neither is
 *                                 the 'unit' writer itself, so identity plans are bit-identical to 'unit' and to the
 *                                 atlas rect (04 R5)
 *   null / undefined           -> null
 * Module-private.
 * @param {'unit'|{offsetU: number, widthU: number, heightV?: number}|import('./UvMapper.js').SectionUvPlan|null|undefined} uv
 * @returns {((uvs: number[], section: object, row: number, col: number) => void)|null}
 * @throws {TypeError} for any other value
 */
function uvWriter(uv) {
  if (uv === null || uv === undefined) return null;
  if (uv === 'unit' || (isUvPlan(uv) && uv.transform === null && uv.rect === null)) {
    return (uvs, section, row, col) => {
      uvs.push(col / section.panelCols, row / section.panelRows);
    };
  }
  if (isUvPlan(uv)) {
    const pair = [0, 0];
    return (uvs, section, row, col) => {
      sectionUv(uv, col / section.panelCols, row / section.panelRows, pair);
      uvs.push(pair[0], pair[1]);
    };
  }
  if (typeof uv === 'object') {
    const uvOffsetX = uv.offsetU;
    const uvWidth = uv.widthU;
    if (uv.heightV === undefined) {
      return (uvs, section, row, col) => {
        uvs.push(uvOffsetX + (col / section.panelCols) * uvWidth, row / section.panelRows);
      };
    }
    const uvHeight = uv.heightV;
    return (uvs, section, row, col) => {
      uvs.push(uvOffsetX + (col / section.panelCols) * uvWidth, (row / section.panelRows) * uvHeight);
    };
  }
  throw new TypeError(`Unknown sectionGrid uv option ${JSON.stringify(uv)}`);
}

/**
 * Whether a sectionGrid uv option is a SectionUvPlan of UvMapper (it carries `transform` and `rect`; an atlas rect does
 * not). Module-private.
 * @param {*} uv
 * @returns {boolean}
 */
function isUvPlan(uv) {
  return typeof uv === 'object' && uv !== null && 'transform' in uv && 'rect' in uv;
}

/**
 * The pixel-accurate atlas rect of one section, the sectionGrid uv option of 08 6.7 (B-M5, B-M6, B-M7):
 * {offsetU: entry.uvOffsetX, widthU: entry.uvWidth, heightV: entry.uvHeight}. Shared by the viewport combined grid
 * (08 P2-7a), the combined OBJ (P2-7b) and the combined glTF TEXCOORD_0 (P2-7c).
 * Side effects: none.
 * @param {{uvOffsetX: number, uvWidth: number, uvHeight: number}} entry  a computeAtlas entry
 * @returns {{offsetU: number, widthU: number, heightV: number}}
 */
export function atlasUvRect(entry) {
  return { offsetU: entry.uvOffsetX, widthU: entry.uvWidth, heightV: entry.uvHeight };
}

/**
 * The combined-mesh section range that holds face `faceIndex` (r128 Mesh.raycast reports faceIndex = floor(i / 3) over
 * the whole index buffer of a single-material mesh): a binary search over sectionRanges (ordered, contiguous index
 * ranges), or null when the face lies beyond them. The one owner of this mapping (07 C52; spec 02 6.13 picks sections
 * with it, spec 04 6.9 resolves hover hits with it). 08 P2-7a.
 * Side effects: none.
 * @param {{indexStart: number, indexCount: number}[]} ranges  combinedGrid's sectionRanges
 * @param {number} faceIndex
 * @returns {object|null} the range object itself
 */
export function sectionRangeForFace(ranges, faceIndex) {
  const i = faceIndex * 3;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (i < r.indexStart) hi = mid - 1;
    else if (i >= r.indexStart + r.indexCount) lo = mid + 1;
    else return r;
  }
  return null;
}

/**
 * Plain-array mesh data of one section grid (the `out` arrays, appended to).
 * @typedef {{positions: number[], normals: number[], uvs: number[], indices: number[], vertexAdvance: number}} SectionGrid
 */

/** Builds vertex grids, indices and panel quads for one consumer profile. */
export class WallMeshBuilder {
  /**
   * The per-panel UVs of a panel-mode quad in the panelCorners order BL, BR, TR, TL (the OBJ panel lines
   * `vt 0 0 / 1 0 / 1 1 / 0 1` of 4696), frozen. For the glTF panel TEXCOORD_0 of 08 P2-7c (08 5.2) and the local
   * corners of panelUvs (08 P2-12d).
   * @type {readonly number[]}
   */
  static PANEL_UVS = Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]);

  /** @type {object} */
  #profile;

  /**
   * Every profile read in this class (and in the exporters, through builder.profile) is `profile.<leaf>`:
   * winding (passed to quadIndices, which switches), normals (sectionGrid), combinedUV (combinedGrid),
   * panelNormal (panelFacingNormal).
   * Side effects: none.
   * @param {object} profile  one of Strategies.mesh.viewport | .obj | .gltf (stored as given; App passes the
   *   frozen object; tests may pass a copy with a foreign value)
   */
  constructor(profile) {
    this.#profile = profile;
  }

  /**
   * Side effects: none.
   * @returns {object} the injected profile, unchanged
   */
  get profile() {
    return this.#profile;
  }

  /**
   * One section's vertex grid, pushed into `out` (appended with loops, never spread).
   * For row = 0..panelRows (<=), y = sl.baseY === 0 ? row * sl.panelH : sl.baseY + row * sl.panelH (03 6.4: the
   * identity branch is the verbatim legacy expression, so even -0 bytes are unchanged; baseY is -P.y in the export
   * frame); for col = 0..panelCols (<=), edge = sl.edges[col]:
   *   positions.push(edge.x, y, edge.z);
   *   normals mode = opts.normals ?? this.profile.normals: 'averaged' (08 6.4 with 01 CR-1) -> a flat section
   *     (sl.isFlat) pushes the 'right-panel' normals verbatim, a curved one the panel normal at its end columns and
   *     the unit bisector of the two adjacent panel normals elsewhere; 'right-panel' -> (nx, 0, nz) verbatim
   *     1607-1625; 'none' -> nothing pushed;
   *   uvs: 'unit' -> (col / panelCols, row / panelRows); {offsetU, widthU} -> (offsetU + (col / panelCols) * widthU,
   *     row / panelRows); {offsetU, widthU, heightV} (08 P2-7a) -> the same u and (row / panelRows) * heightV;
   *     a SectionUvPlan (04 UV-6) -> UvMapper.sectionUv(plan, col / panelCols, row / panelRows); null -> nothing pushed.
   * Indices: vertsPerRow = section.panelCols + 1 (raw); for row < panelRows, col < panelCols:
   *   bl = indexBase + row * vertsPerRow + col; br = bl + 1; tl = indexBase + (row + 1) * vertsPerRow + col;
   *   tr = tl + 1; indices.push(...quadIndices(bl, br, tl, tr, this.profile.winding)).
   * vertexAdvance = (section.panelCols + 1) * (section.panelRows + 1)  (the DECLARED count).
   * Ports: index.html@cd3fd3f lines 1598-1640 (combined), 1716-1751 (section), 5041-5048 (export vertices),
   * 4592-4603 / 4637-4653 (OBJ, indexBase = running offset from 1), 4837-4847 / 4856-4865 (glTF).
   * Side effects: appends to the `out` arrays.
   * @param {import('./WallLayout.js').SectionLayout} sl
   * @param {{indexBase?: number, uv?: 'unit'|{offsetU: number, widthU: number, heightV?: number}|
   *          import('./UvMapper.js').SectionUvPlan|null, normals?: 'averaged'|'right-panel'|'none'}} [opts]
   *   defaults: indexBase 0, uv null, normals
   *   this.profile.normals
   * @param {{positions: number[], normals: number[], uvs: number[], indices: number[]}} [out]  defaults to fresh arrays
   * @returns {SectionGrid} the out arrays plus vertexAdvance
   * @throws {Error} unsupportedStrategy('mesh.normals', ...) or ('mesh.winding', ...) for a foreign profile value;
   *   the legacy TypeError for panelCols = 0 with 'right-panel' or 'averaged' normals
   */
  sectionGrid(sl, opts = {}, out = { positions: [], normals: [], uvs: [], indices: [] }) {
    const indexBase = opts.indexBase ?? 0;
    const normalsMode = opts.normals ?? this.profile.normals;
    let writeNormal;
    switch (normalsMode) {
      case 'averaged':
        // 08 6.4 with 01 CR-1 (B-L3 fixed in 08 P2-2b for the viewport): the test is per SECTION. Edge positions are
        // accumulated, so neighbouring panel normals of a flat section at a non-axis heading can differ in the last
        // bit; a flat section therefore keeps the 'right-panel' normals verbatim (bit-identical by construction), and
        // a curved one gets the bisectors (pushAveragedNormal).
        writeNormal = sl.isFlat ? pushRightPanelNormal : pushAveragedNormal;
        break;
      case 'right-panel':
        // right-panel: Phase-1 behaviour (B-L3: the normal of the panel to the right, the last column copying the
        // previous one, not averaged on curves), kept for the LegacyProfiles oracle tests.
        writeNormal = pushRightPanelNormal;
        break;
      case 'none':
        writeNormal = null;
        break;
      default:
        throw unsupportedStrategy('mesh.normals', normalsMode);
    }
    const writeUv = uvWriter(opts.uv);
    const winding = this.profile.winding;
    const { section } = sl;

    this.#pushVertices(sl, writeNormal, writeUv, out);

    // vertsPerRow is the raw `panelCols + 1`. Since 08 P2-8a (the card rules) and 08 P2-3b (the import validator) every
    // count is an integer number (B-L15, B-L8 fixed); a string '10' (giving '101') or a fraction can no longer arrive,
    // and the arithmetic is kept verbatim for the LegacyProfiles oracle tests, which feed such values.
    const vertsPerRow = section.panelCols + 1;
    this.#pushIndices(section, indexBase, vertsPerRow, winding, out.indices);

    // The DECLARED vertex count; it equals the vertices pushed for integer counts (for the fractional counts of the
    // oracle tests it does not, and the next section's indexBase advances by it).
    const vertexAdvance = (section.panelCols + 1) * (section.panelRows + 1);
    return { positions: out.positions, normals: out.normals, uvs: out.uvs, indices: out.indices, vertexAdvance };
  }

  /**
   * The UVs of one section grid under a plan (04 5.3, UV-6), through the same per-vertex writer as sectionGrid (so they
   * equal sectionGrid(sl, {uv: plan}).uvs): (u, v) per vertex, rows 0..panelRows outer, columns 0..panelCols inner.
   * The live UV path of 04 6.12 writes them into an existing uv attribute.
   * Side effects: none.
   * @param {import('./WallLayout.js').SectionLayout} sl
   * @param {import('./UvMapper.js').SectionUvPlan|null} plan  null: the base UVs ('unit')
   * @returns {number[]} (u, v) * (panelCols + 1) * (panelRows + 1)
   */
  sectionUvs(sl, plan) {
    const write = uvWriter(plan ?? 'unit');
    const { section } = sl;
    const uvs = [];
    for (let row = 0; row <= section.panelRows; row++) {
      for (let col = 0; col <= section.panelCols; col++) write(uvs, section, row, col);
    }
    return uvs;
  }

  /**
   * The vertex loops of sectionGrid (positions, then the normal, then the UV of each vertex, in legacy order).
   * @param {import('./WallLayout.js').SectionLayout} sl
   * @param {Function|null} writeNormal
   * @param {Function|null} writeUv
   * @param {{positions: number[], normals: number[], uvs: number[]}} out
   */
  #pushVertices(sl, writeNormal, writeUv, out) {
    const { section, edges: edgePositions, panelH, baseY } = sl;
    const { positions, normals, uvs } = out;
    for (let row = 0; row <= section.panelRows; row++) {
      // 03 6.4: the bottom of the columns is baseY (0 in the layout and stage frames, -P.y in the export frame)
      const y = baseY === 0 ? row * panelH : baseY + row * panelH;
      for (let col = 0; col <= section.panelCols; col++) {
        const edge = edgePositions[col];
        positions.push(edge.x, y, edge.z);
        if (writeNormal !== null) writeNormal(normals, section, edgePositions, col, edge);
        if (writeUv !== null) writeUv(uvs, section, row, col);
      }
    }
  }

  /**
   * The index loops of sectionGrid. Every index keeps the exact left-to-right association
   * `indexBase + row * vertsPerRow + col`: with the OBJ base 1, `(1 + row * vpr) + col` differs from
   * `(row * vpr + col) + 1` in the last ulp for fractional counts (no longer reachable from the app, B-L8 and B-L15
   * fixed; kept for the oracle tests).
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {number} indexBase
   * @param {number|string} vertsPerRow  the raw `section.panelCols + 1`
   * @param {string} winding
   * @param {number[]} indices  output array
   */
  #pushIndices(section, indexBase, vertsPerRow, winding, indices) {
    for (let row = 0; row < section.panelRows; row++) {
      for (let col = 0; col < section.panelCols; col++) {
        const bl = indexBase + row * vertsPerRow + col;
        const br = bl + 1;
        const tl = indexBase + (row + 1) * vertsPerRow + col;
        const tr = tl + 1;
        indices.push(...quadIndices(bl, br, tl, tr, winding));
      }
    }
  }

  /**
   * The combined mesh: sectionGrid for each section in order into shared arrays, with indexBase = the running
   * vertexOffset (starts 0, += vertexAdvance) and the UV option chosen by this.profile.combinedUV:
   * 'plan' (04 UV-7, the production viewport case) -> uv = plans[i], the SectionUvPlan of UvMapper.planSectionUvs: each
   *   section filling 0..1 (the per-section layout) or atlas-placed (the atlas layout), with its UV transform; without
   *   plans, the default per-section plans without transforms;
   * 'atlas-pixel-accurate' (08 P2-7a, 08 6.7; B-M5 fixed; equal to 'plan' with the atlas layout and identity transforms,
   *   unit-tested) -> uv = atlasUvRect(atlas.entries[i]): u along the section's
   *   atlas columns and v = (row / panelRows) * uvHeight, so each bottom-aligned section samples exactly its own pixels
   *   of the atlas (with equal heights uvHeight = 1 and v is the legacy row / panelRows bit for bit);
   * 'atlas-u-full-v' (the Phase-1 case, kept for LegacyProfiles) -> uv = {offsetU: uvOffsetX, widthU: uvWidth}, v over
   *   the full height.
   * Ports: index.html@cd3fd3f lines 1579-1644 (1592-1596 and 1643 come from the atlas).
   * Side effects: none.
   * @param {import('./WallLayout.js').WallLayout} layout
   * @param {{entries: {uvOffsetX: number, uvWidth: number, uvHeight: number}[]}} atlas  computeAtlas() of the same sections
   * @param {import('./UvMapper.js').SectionUvPlan[]|null} [plans]  one plan per layout section ('plan' only)
   * @returns {{positions: number[], normals: number[], uvs: number[], indices: number[],
   *            sectionRanges: {sectionId: *, sectionIndex: number, indexStart: number, indexCount: number,
   *                            vertexStart: number, vertexCount: number}[]}}
   *   (sectionRanges: the picking seam of Features 2 and 4, ranges into `indices` (sectionRangeForFace) and, since
   *   08 P2-7a, into the vertex arrays: vertexStart is the section's running vertexOffset and vertexCount its declared
   *   vertexAdvance, which equal the pushed counts for every validated wall; 07 C52)
   * @throws {Error} unsupportedStrategy('mesh.combinedUV', ...) for a foreign profile value
   */
  combinedGrid(layout, atlas, plans = null) {
    let uvFor;
    switch (this.profile.combinedUV) {
      case 'plan': {
        // 04 UV-7: the UV plans of the project's layout setting and transforms (UvMapper.planSectionUvs).
        const p = plans ?? planSectionUvs({ layout, atlas, settings: null, meshMode: 'combined', applyTransforms: false });
        uvFor = (i) => p[i];
        break;
      }
      case 'atlas-pixel-accurate':
        // 08 P2-7a (B-M5 fixed, 08 6.7): v covers only the section's own share of the bottom-aligned atlas.
        uvFor = (i) => atlasUvRect(atlas.entries[i]);
        break;
      case 'atlas-u-full-v':
        // atlas-u-full-v: Phase-1 behaviour (B-M5: V = row / panelRows spans the full texture height for every section,
        // so sections shorter than the atlas stretch its vertical content), kept for the LegacyProfiles oracle tests.
        uvFor = (i) => ({ offsetU: atlas.entries[i].uvOffsetX, widthU: atlas.entries[i].uvWidth });
        break;
      default:
        throw unsupportedStrategy('mesh.combinedUV', this.profile.combinedUV);
    }
    const out = { positions: [], normals: [], uvs: [], indices: [] };
    const sectionRanges = [];
    let vertexOffset = 0;
    layout.sections.forEach((sl, i) => {
      const indexStart = out.indices.length;
      const { vertexAdvance } = this.sectionGrid(sl, { indexBase: vertexOffset, uv: uvFor(i) }, out);
      sectionRanges.push({
        sectionId: sl.sectionId,
        sectionIndex: sl.sectionIndex,
        indexStart,
        indexCount: out.indices.length - indexStart,
        vertexStart: vertexOffset,
        vertexCount: vertexAdvance,
      });
      vertexOffset += vertexAdvance;
    });
    return { positions: out.positions, normals: out.normals, uvs: out.uvs, indices: out.indices, sectionRanges };
  }

  /**
   * The four corners of one panel-mode quad, in the order BL, BR, TR, TL.
   * Ports: index.html@cd3fd3f lines 4680-4690 (== 4875-4885).
   * Side effects: none.
   * @param {import('./WallLayout.js').LayoutPanel} panel
   * @param {number} panelW  metres
   * @param {number} panelH  metres
   * @returns {{x: number, y: number, z: number}[]} 4 new corner objects
   */
  panelCorners(panel, panelW, panelH) {
    const hw = panelW / 2;
    const hh = panelH / 2;
    const cos = Math.cos(panel.rotY);
    const sin = Math.sin(panel.rotY);

    return [
      { x: panel.x + (-hw) * cos, y: panel.y - hh, z: panel.z - (-hw) * sin },
      { x: panel.x + (hw) * cos,  y: panel.y - hh, z: panel.z - (hw) * sin },
      { x: panel.x + (hw) * cos,  y: panel.y + hh, z: panel.z - (hw) * sin },
      { x: panel.x + (-hw) * cos, y: panel.y + hh, z: panel.z - (-hw) * sin },
    ];
  }

  /**
   * The 6 indices of a panel quad whose corners (panelCorners order BL, BR, TR, TL) start at `base`.
   * 'ccw': [base, base + 1, base + 2, base, base + 2, base + 3];
   * 'legacy-cw': [base, base + 3, base + 2, base, base + 2, base + 1] (glTF 4887 with base 0, OBJ 4705-4706).
   * Side effects: none.
   * @param {number} base
   * @returns {number[]} quadIndices(base, base + 1, base + 3, base + 2, this.profile.winding)
   */
  panelQuadIndices(base) {
    return quadIndices(base, base + 1, base + 3, base + 2, this.profile.winding);
  }

  /**
   * The facing normal of a panel-mode quad (the OBJ profile, and the glTF profile since 08 P2-2d, define
   * panelNormal). With rotY = -atan2(dz, dx) it is the 'ccw' face normal (BR - BL) x (TR - BL) of panelCorners,
   * normalised (08 6.4).
   * Ports: index.html@cd3fd3f lines 4698-4699.
   * Side effects: none.
   * @param {import('./WallLayout.js').LayoutPanel} panel
   * @returns {{x: number, y: number, z: number}} {x: Math.sin(panel.rotY), y: 0, z: Math.cos(panel.rotY)}
   * @throws {Error} unsupportedStrategy('mesh.panelNormal', ...) for any other profile value (including undefined)
   */
  panelFacingNormal(panel) {
    switch (this.profile.panelNormal) {
      case 'facing':
        return { x: Math.sin(panel.rotY), y: 0, z: Math.cos(panel.rotY) };
      default:
        throw unsupportedStrategy('mesh.panelNormal', this.profile.panelNormal);
    }
  }

  /**
   * The UVs of a panel-mode quad, in the panelCorners order BL, BR, TR, TL (08 P2-12d, 08 6.15; 04 5.3, UV-9):
   *   no plan, or a plan with panelUvs 'section' -> section space: for each corner (lu, lv) of PANEL_UVS, the base UV
   *     ((panel.col + lu) / panelCols, (panel.row + lv) / panelRows), then UvMapper.sectionUv(plan, ...) (the section's
   *     UV transform; an identity plan returns the base UV untouched). A corner shared with the neighbouring panel equals
   *     the section-mode strip UV (col / panelCols, row / panelRows) bit for bit, as (c + 1) + 0 and c + 1 are the same
   *     integer;
   *   a plan with panelUvs 'panel' (04's legacy option) -> the per-panel [0, 0], [1, 0], [1, 1], [0, 1].
   * Reads no profile key.
   * Side effects: none.
   * @param {import('./WallLayout.js').LayoutPanel} panel  panel.col and panel.row within its section
   * @param {import('./WallLayout.js').SectionLayout} sl  the panel's section (panelCols, panelRows)
   * @param {import('./UvMapper.js').SectionUvPlan|null} [plan]  the section's plan (04 UV-9)
   * @returns {number[][]} 4 new [u, v] pairs
   */
  panelUvs(panel, sl, plan = null) {
    const local = WallMeshBuilder.PANEL_UVS;
    const uvs = [];
    if (plan !== null && plan.panelUvs === 'panel') {
      for (let k = 0; k < 4; k++) uvs.push([local[2 * k], local[2 * k + 1]]);
      return uvs;
    }
    const { panelCols, panelRows } = sl.section;
    for (let k = 0; k < 4; k++) {
      const u = (panel.col + local[2 * k]) / panelCols;
      const v = (panel.row + local[2 * k + 1]) / panelRows;
      uvs.push(plan !== null ? sectionUv(plan, u, v) : [u, v]);
    }
    return uvs;
  }

  /**
   * The 12 normal components of a panel-mode quad: panelFacingNormal(panel) for each of its 4 corners (BL, BR, TR,
   * TL), flattened x, y, z. The glTF NORMAL of panel meshes (08 P2-2d).
   * Side effects: none.
   * @param {import('./WallLayout.js').LayoutPanel} panel
   * @returns {number[]} a new 12-element array
   * @throws {Error} unsupportedStrategy('mesh.panelNormal', ...) as panelFacingNormal
   */
  panelNormals(panel) {
    const n = this.panelFacingNormal(panel);
    return [n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z];
  }
}

