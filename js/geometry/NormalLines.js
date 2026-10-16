/**
 * @module geometry/NormalLines
 * The arithmetic of the normals debug view (docs/improvements/01-normals.md 6.6, 6.7): the auto line length, the
 * line cap and its decimation stride, the line counts, the two allocation-free line writers (vertex normals, which
 * lighting uses, and face normals derived from the triangle winding, which culling uses), the upload size and the
 * stats text. render/NormalsDebugView.js feeds it the attribute arrays and matrices of the LED meshes.
 * Legacy source: none (Feature 1; legacy had no normals view).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free). It imports nothing: matrices arrive as plain
 * column-major arrays (Matrix4.elements, Matrix3.elements), so it is Node-tested with plain objects.
 */

/** The line cap (6.7.3): reachable by the largest importable wall (200 sections x 50x20) with both line kinds on. */
export const MAX_NORMAL_LINES = 150000;

/** The auto length clamp in metres (6.7.4). */
const MIN_LENGTH_M = 0.005;
const MAX_LENGTH_M = 5;

/**
 * The auto normal-line length (6.7.4): half the smallest panel side, kept within 1 % to 4 % of the diagonal of the
 * wall's vertex box, times `scale`, clamped to [0.005, 5] m.
 *   p_min = min over sections of min(panelW, panelH);  d = |bounds.max - bounds.min|
 *   L0 = min(max(0.5 * p_min, 0.01 * d), 0.04 * d);  L = clamp(L0 * scale, 0.005, 5)
 * Side effects: none.
 * @param {{sections: {panelW: number, panelH: number}[], bounds(): ({min: {x: number, y: number, z: number},
 *   max: {x: number, y: number, z: number}}|null)}|null} layout  a WallLayout
 * @param {number} [scale]  settings.normals.lengthScale
 * @returns {number} metres; 0 for an empty (or missing) layout
 */
export function autoNormalLength(layout, scale = 1) {
  if (!layout || !layout.sections || layout.sections.length === 0) return 0;
  let pMin = Infinity;
  for (const sl of layout.sections) pMin = Math.min(pMin, sl.panelW, sl.panelH);
  const b = layout.bounds();
  let d = b ? Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) : 0;
  if (!Number.isFinite(d)) d = 0;
  if (!Number.isFinite(pMin)) pMin = 0;
  const l0 = Math.min(Math.max(0.5 * pMin, 0.01 * d), 0.04 * d);
  return Math.min(MAX_LENGTH_M, Math.max(MIN_LENGTH_M, l0 * scale));
}

/**
 * The decimation stride (6.7.3): keep one sample in `stride` so that at most `cap` lines are drawn.
 * Side effects: none.
 * @param {number} total  the number of candidate lines
 * @param {number} [cap]
 * @returns {number} Math.max(1, Math.ceil(total / cap))
 */
export function decimationStride(total, cap = MAX_NORMAL_LINES) {
  return Math.max(1, Math.ceil(total / cap));
}

/**
 * The face lines of one mesh: one per quad (6 indices) when the index count is a multiple of 6, else one per
 * triangle (3 indices; a trailing partial triangle is ignored).
 * @param {number} indexCount
 * @returns {number}
 */
function faceLineCount(indexCount) {
  return indexCount % 6 === 0 ? indexCount / 6 : Math.floor(indexCount / 3);
}

/**
 * The candidate line counts of a list of meshes (before decimation). A non-indexed mesh passes its vertex count as
 * `indexCount` (its triangles are consecutive vertex triples).
 * Side effects: none.
 * @param {{vertexCount: number, indexCount: number}[]} meshes
 * @param {{vertex: boolean, face: boolean}} kinds  a kind that is off counts 0
 * @returns {{vertexLines: number, faceLines: number}}
 */
export function countNormalLines(meshes, { vertex, face }) {
  let vertexLines = 0;
  let faceLines = 0;
  for (const m of meshes) {
    if (vertex) vertexLines += m.vertexCount;
    if (face) faceLines += faceLineCount(m.indexCount);
  }
  return { vertexLines, faceLines };
}

/**
 * Appends one line (2 vertices) at out.count: from (px, py, pz) in the base colour to (px, py, pz) + L * (nx, ny, nz)
 * in the tip colour. The caller guarantees the capacity.
 */
function pushLine(out, px, py, pz, nx, ny, nz, opts) {
  const { length, tip, baseFactor } = opts;
  const p = out.positions;
  const c = out.colors;
  const o = out.count * 6;
  p[o] = px; p[o + 1] = py; p[o + 2] = pz;
  p[o + 3] = px + nx * length; p[o + 4] = py + ny * length; p[o + 5] = pz + nz * length;
  c[o] = tip[0] * baseFactor; c[o + 1] = tip[1] * baseFactor; c[o + 2] = tip[2] * baseFactor;
  c[o + 3] = tip[0]; c[o + 4] = tip[1]; c[o + 5] = tip[2];
  out.count++;
}

/**
 * Appends the vertex-normal lines of one mesh (6.7.2): for every vertex kept by the running sample counter
 * (kept iff out.seen++ % stride === 0), p = M * (x, y, z, 1), n = normalize(N * (nx, ny, nz)), segment p -> p + L n.
 * A zero-length normal is counted as a sample but draws nothing. A mesh without normals advances the counter only.
 * Allocates nothing.
 * Side effects: writes out.positions / out.colors from out.count on; advances out.count and out.seen.
 * @param {{positions: Float32Array, colors: Float32Array, count: number, seen: number}} out  count is in lines
 * @param {{positions: ArrayLike<number>, normals: ArrayLike<number>|null|undefined, matrix: ArrayLike<number>,
 *          normalMatrix: ArrayLike<number>}} src  matrix: column-major 4x4 (world); normalMatrix: column-major 3x3
 * @param {{length: number, stride: number, tip: number[], baseFactor: number}} opts
 * @returns {number} lines written
 */
export function writeVertexNormalLines(out, src, opts) {
  const pos = src.positions;
  const nor = src.normals;
  const vertexCount = Math.floor(pos.length / 3);
  if (!nor) {
    out.seen += vertexCount;
    return 0;
  }
  const m = src.matrix;
  const n = src.normalMatrix;
  const stride = opts.stride;
  const start = out.count;
  for (let v = 0; v < vertexCount; v++) {
    if (out.seen++ % stride !== 0) continue;
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    const a = nor[3 * v], b = nor[3 * v + 1], c = nor[3 * v + 2];
    let nx = n[0] * a + n[3] * b + n[6] * c;
    let ny = n[1] * a + n[4] * b + n[7] * c;
    let nz = n[2] * a + n[5] * b + n[8] * c;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(len > 0)) continue;
    nx /= len; ny /= len; nz /= len;
    pushLine(out,
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
      nx, ny, nz, opts);
  }
  return out.count - start;
}

/**
 * Appends the face-normal lines of one mesh (6.7.2): one per quad (index groups of 6, every wall geometry), or one
 * per triangle when the index count is not a multiple of 6. The local face normal is the area-weighted sum of the
 * cross products (b - a) x (c - a) of the group's triangles, so it follows the winding (what culling sees); it is
 * transformed by N and normalised. The line starts at the centroid of the group's distinct vertices (4 for a quad),
 * transformed by M. A degenerate group (zero normal) is counted as a sample but draws nothing. A null index means a
 * non-indexed mesh (consecutive vertex triples). Allocates nothing.
 * Side effects: writes out.positions / out.colors from out.count on; advances out.count and out.seen.
 * @param {{positions: Float32Array, colors: Float32Array, count: number, seen: number}} out
 * @param {{positions: ArrayLike<number>, index: ArrayLike<number>|null, matrix: ArrayLike<number>,
 *          normalMatrix: ArrayLike<number>}} src
 * @param {{length: number, stride: number, tip: number[], baseFactor: number}} opts
 * @returns {number} lines written
 */
export function writeFaceNormalLines(out, src, opts) {
  const pos = src.positions;
  const index = src.index;
  const indexCount = index ? index.length : Math.floor(pos.length / 3);
  const group = indexCount % 6 === 0 ? 6 : 3;
  const groups = group === 6 ? indexCount / 6 : Math.floor(indexCount / 3);
  const at = (k) => (index ? index[k] : k);
  const m = src.matrix;
  const n = src.normalMatrix;
  const stride = opts.stride;
  const start = out.count;
  for (let g = 0; g < groups; g++) {
    if (out.seen++ % stride !== 0) continue;
    const base = g * group;
    let sx = 0, sy = 0, sz = 0;                  // local face normal (sum over the group's triangles)
    for (let t = 0; t < group; t += 3) {
      const ia = 3 * at(base + t), ib = 3 * at(base + t + 1), ic = 3 * at(base + t + 2);
      const ux = pos[ib] - pos[ia], uy = pos[ib + 1] - pos[ia + 1], uz = pos[ib + 2] - pos[ia + 2];
      const vx = pos[ic] - pos[ia], vy = pos[ic + 1] - pos[ia + 1], vz = pos[ic + 2] - pos[ia + 2];
      sx += uy * vz - uz * vy;
      sy += uz * vx - ux * vz;
      sz += ux * vy - uy * vx;
    }
    if (sx === 0 && sy === 0 && sz === 0) continue;
    let cx = 0, cy = 0, cz = 0, unique = 0;      // centroid of the distinct vertices of the group
    for (let k = 0; k < group; k++) {
      const vi = at(base + k);
      let seenBefore = false;
      for (let j = 0; j < k; j++) if (at(base + j) === vi) { seenBefore = true; break; }
      if (seenBefore) continue;
      cx += pos[3 * vi]; cy += pos[3 * vi + 1]; cz += pos[3 * vi + 2];
      unique++;
    }
    cx /= unique; cy /= unique; cz /= unique;
    let nx = n[0] * sx + n[3] * sy + n[6] * sz;
    let ny = n[1] * sx + n[4] * sy + n[7] * sz;
    let nz = n[2] * sx + n[5] * sy + n[8] * sz;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(len > 0)) continue;
    nx /= len; ny /= len; nz /= len;
    pushLine(out,
      m[0] * cx + m[4] * cy + m[8] * cz + m[12],
      m[1] * cx + m[5] * cy + m[9] * cz + m[13],
      m[2] * cx + m[6] * cy + m[10] * cz + m[14],
      nx, ny, nz, opts);
  }
  return out.count - start;
}

/**
 * The floats to upload per attribute for `written` lines (6.7.5): 2 vertices x 3 components. NormalsDebugView
 * assigns it to updateRange.count of both attributes, so only the written prefix is sent to the GPU.
 * Side effects: none.
 * @param {number} written
 * @returns {number} 6 * written
 */
export function uploadCount(written) {
  return 6 * written;
}

/**
 * en-US digit grouping with a fixed regex (no Intl, no locale), so the stats text is the same on every machine:
 * 3444 -> '3,444', 150000 -> '150,000'. The value is rounded to an integer first.
 * Side effects: none.
 * @param {number} n
 * @returns {string}
 */
export function formatCount(n) {
  const s = String(Math.round(Math.abs(n)));
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The #debug-normals-stats text and its warning flag (01 3.5):
 *   empty layout                 -> 'No wall geometry'
 *   both line kinds off          -> 'No line type selected' (warning)
 *   decimated (stride > 1)       -> 'Showing 1 of every <stride> normals (<total> total, cap 150,000)' (warning)
 *   otherwise                    -> '<v> vertex lines · <L> m', '<f> face lines · <L> m' or
 *                                   '<v> vertex + <f> face lines · <L> m', with L = lengthM.toFixed(3)
 * Side effects: none.
 * @param {{vertexLines: number, faceLines: number, total: number, stride: number, lengthM: number,
 *          vertex: boolean, face: boolean, empty?: boolean}} stats
 * @returns {{text: string, warning: boolean}}
 */
export function formatNormalStats({ vertexLines, faceLines, total, stride, lengthM, vertex, face, empty = false }) {
  if (empty) return { text: 'No wall geometry', warning: false };
  if (!vertex && !face) return { text: 'No line type selected', warning: true };
  if (stride > 1) {
    return { text: `Showing 1 of every ${formatCount(stride)} normals (${formatCount(total)} total, cap ${formatCount(MAX_NORMAL_LINES)})`, warning: true };
  }
  const length = `${lengthM.toFixed(3)} m`;
  if (vertex && face) return { text: `${formatCount(vertexLines)} vertex + ${formatCount(faceLines)} face lines · ${length}`, warning: false };
  if (vertex) return { text: `${formatCount(vertexLines)} vertex lines · ${length}`, warning: false };
  return { text: `${formatCount(faceLines)} face lines · ${length}`, warning: false };
}
