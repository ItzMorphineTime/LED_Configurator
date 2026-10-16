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

/**
 * The 6 indices of one grid quad (two triangles).
 * The same function reproduces all 8 legacy index sites: viewport 1638 / 1749, OBJ 4599-4600 / 4648-4649,
 * glTF 4844 / 4863, and panel quads with corners BL=0, BR=1, TR=2, TL=3: quadIndices(0, 1, 3, 2) = [0, 3, 2, 0, 2, 1]
 * (glTF 4887) and OBJ `v, v+3, v+2 / v, v+2, v+1` = quadIndices(v, v+1, v+3, v+2) (4705-4706).
 * Feature 1 adds 'ccw' -> [bl, br, tr, bl, tr, tl] (which gives panel [0, 1, 2, 0, 2, 3]).
 * Side effects: none.
 * @param {number} bl  bottom-left vertex index
 * @param {number} br  bottom-right vertex index
 * @param {number} tl  top-left vertex index
 * @param {number} tr  top-right vertex index
 * @param {string} [winding='legacy-cw']  a profile's `winding`
 * @returns {number[]} a new 6-element array
 * @throws {Error} unsupportedStrategy('mesh.winding', winding) for any value other than 'legacy-cw'
 */
export function quadIndices(bl, br, tl, tr, winding = 'legacy-cw') {
  switch (winding) {
    case 'legacy-cw':
      // LEGACY(B-H1, B-H2): (bl, tl, tr) / (bl, tr, br) is clockwise seen from +Z, against the +Z normals of the
      // viewport (hidden by DoubleSide) and of every export.
      return [bl, tl, tr, bl, tr, br];
    default:
      throw unsupportedStrategy('mesh.winding', winding);
  }
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
 * Resolves the sectionGrid `uv` option into a per-vertex UV writer, or null when no UVs are written.
 *   'unit'              -> (col / panelCols, row / panelRows)                          (1740)
 *   {offsetU, widthU}   -> (offsetU + (col / panelCols) * widthU, row / panelRows)     (1627; B-M5, tagged at combinedGrid)
 *   null / undefined    -> null
 * Module-private.
 * @param {'unit'|{offsetU: number, widthU: number}|null|undefined} uv
 * @returns {((uvs: number[], section: object, row: number, col: number) => void)|null}
 * @throws {TypeError} for any other value
 */
function uvWriter(uv) {
  if (uv === null || uv === undefined) return null;
  if (uv === 'unit') {
    return (uvs, section, row, col) => {
      uvs.push(col / section.panelCols, row / section.panelRows);
    };
  }
  if (typeof uv === 'object') {
    const uvOffsetX = uv.offsetU;
    const uvWidth = uv.widthU;
    return (uvs, section, row, col) => {
      uvs.push(uvOffsetX + (col / section.panelCols) * uvWidth, row / section.panelRows);
    };
  }
  throw new TypeError(`Unknown sectionGrid uv option ${JSON.stringify(uv)}`);
}

/**
 * Plain-array mesh data of one section grid (the `out` arrays, appended to).
 * @typedef {{positions: number[], normals: number[], uvs: number[], indices: number[], vertexAdvance: number}} SectionGrid
 */

/** Builds vertex grids, indices and panel quads for one consumer profile. */
export class WallMeshBuilder {
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
   * For row = 0..panelRows (<=), y = row * sl.panelH; for col = 0..panelCols (<=), edge = sl.edges[col]:
   *   positions.push(edge.x, y, edge.z);
   *   normals mode = opts.normals ?? this.profile.normals: 'right-panel' -> (nx, 0, nz) verbatim 1607-1625;
   *     'none' -> nothing pushed;
   *   uvs: 'unit' -> (col / panelCols, row / panelRows); {offsetU, widthU} -> (offsetU + (col / panelCols) * widthU,
   *     row / panelRows); null -> nothing pushed.
   * Indices: vertsPerRow = section.panelCols + 1 (raw); for row < panelRows, col < panelCols:
   *   bl = indexBase + row * vertsPerRow + col; br = bl + 1; tl = indexBase + (row + 1) * vertsPerRow + col;
   *   tr = tl + 1; indices.push(...quadIndices(bl, br, tl, tr, this.profile.winding)).
   * vertexAdvance = (section.panelCols + 1) * (section.panelRows + 1)  (the DECLARED count).
   * Ports: index.html@cd3fd3f lines 1598-1640 (combined), 1716-1751 (section), 5041-5048 (export vertices),
   * 4592-4603 / 4637-4653 (OBJ, indexBase = running offset from 1), 4837-4847 / 4856-4865 (glTF).
   * Side effects: appends to the `out` arrays.
   * @param {import('./WallLayout.js').SectionLayout} sl
   * @param {{indexBase?: number, uv?: 'unit'|{offsetU: number, widthU: number}|null,
   *          normals?: 'right-panel'|'none'}} [opts]  defaults: indexBase 0, uv null, normals this.profile.normals
   * @param {{positions: number[], normals: number[], uvs: number[], indices: number[]}} [out]  defaults to fresh arrays
   * @returns {SectionGrid} the out arrays plus vertexAdvance
   * @throws {Error} unsupportedStrategy('mesh.normals', ...) or ('mesh.winding', ...) for a foreign profile value;
   *   the legacy TypeError for panelCols = 0 with 'right-panel' normals
   */
  sectionGrid(sl, opts = {}, out = { positions: [], normals: [], uvs: [], indices: [] }) {
    const indexBase = opts.indexBase ?? 0;
    const normalsMode = opts.normals ?? this.profile.normals;
    let writeNormal;
    switch (normalsMode) {
      case 'right-panel':
        // LEGACY(B-L3): per-vertex normal of the panel to the right (the last column copies the previous one),
        // not averaged across the two adjacent panels of a curved section.
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

    // LEGACY(B-L8, B-L15): vertsPerRow is the raw `panelCols + 1` (an imported string '10' gives '101', 2.5 gives
    // 3.5), so imported strings and fractional counts produce the legacy (garbage) indices.
    const vertsPerRow = section.panelCols + 1;
    this.#pushIndices(section, indexBase, vertsPerRow, winding, out.indices);

    // LEGACY(B-L15): the DECLARED vertex count, which differs from the vertices actually pushed when the counts
    // are fractional; the next section's indexBase advances by it.
    const vertexAdvance = (section.panelCols + 1) * (section.panelRows + 1);
    return { positions: out.positions, normals: out.normals, uvs: out.uvs, indices: out.indices, vertexAdvance };
  }

  /**
   * The vertex loops of sectionGrid (positions, then the normal, then the UV of each vertex, in legacy order).
   * @param {import('./WallLayout.js').SectionLayout} sl
   * @param {Function|null} writeNormal
   * @param {Function|null} writeUv
   * @param {{positions: number[], normals: number[], uvs: number[]}} out
   */
  #pushVertices(sl, writeNormal, writeUv, out) {
    const { section, edges: edgePositions, panelH } = sl;
    const { positions, normals, uvs } = out;
    for (let row = 0; row <= section.panelRows; row++) {
      const y = row * panelH;
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
   * `indexBase + row * vertsPerRow + col` (B-L15, tagged at sectionGrid): with the OBJ base 1,
   * `(1 + row * vpr) + col` differs from `(row * vpr + col) + 1` in the last ulp for fractional counts.
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
   * vertexOffset (starts 0, += vertexAdvance) and the atlas UV option chosen by this.profile.combinedUV:
   * 'atlas-u-full-v' -> uv = {offsetU: atlas.entries[i].uvOffsetX, widthU: atlas.entries[i].uvWidth}.
   * Ports: index.html@cd3fd3f lines 1579-1644 (1592-1596 and 1643 come from the atlas).
   * Side effects: none.
   * @param {import('./WallLayout.js').WallLayout} layout
   * @param {{entries: {uvOffsetX: number, uvWidth: number}[]}} atlas  computeAtlas() of the same sections
   * @returns {{positions: number[], normals: number[], uvs: number[], indices: number[],
   *            sectionRanges: {sectionId: *, sectionIndex: number, indexStart: number, indexCount: number}[]}}
   *   (sectionRanges: the Feature 2 picking seam, ranges into `indices`)
   * @throws {Error} unsupportedStrategy('mesh.combinedUV', ...) for a foreign profile value
   */
  combinedGrid(layout, atlas) {
    let uvFor;
    switch (this.profile.combinedUV) {
      case 'atlas-u-full-v':
        // LEGACY(B-M5): U follows the atlas columns but V = row / panelRows spans the full texture height for
        // every section, so sections shorter than the atlas stretch its vertical content.
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
   * 'legacy-cw': [base, base + 3, base + 2, base, base + 2, base + 1] (glTF 4887 with base 0, OBJ 4705-4706).
   * Side effects: none.
   * @param {number} base
   * @returns {number[]} quadIndices(base, base + 1, base + 3, base + 2, this.profile.winding)
   */
  panelQuadIndices(base) {
    return quadIndices(base, base + 1, base + 3, base + 2, this.profile.winding);
  }

  /**
   * The facing normal of a panel-mode quad (only the OBJ profile defines panelNormal).
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
}
