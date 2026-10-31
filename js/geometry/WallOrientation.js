/**
 * @module geometry/WallOrientation
 * The whole-wall orientation's geometry (docs/improvements/03-pivot.md section 12, the owner's request of 2026-10-17;
 * F3-O2): the exact yaw trigonometry, the turn of a point about the vertical axis, the wall's centre point (the
 * arc-length midpoint of the bottom edge chain) with its LED normal, and the alignment yaw that turns that normal to +X
 * ('center-neg-x') or −X ('center-pos-x', 03 12.16). WallLayout's resolvePivot, rotated() and framing read them; so do
 * the re-expression and the marker.
 * Rotation convention (03 12.1): R_y(psi)(x, y, z) = (x cos psi + z sin psi, y, -x sin psi + z cos psi), the matrix of
 * three.js `rotation.y = psi` (positive = counter-clockwise seen from above; R_y(90 deg) maps +Z to +X).
 * Legacy source: none (new feature).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free).
 */

import { wrapDeg } from '../domain/rules.js';

/** The exact (cos, sin) of the multiples of 90 degrees, by quarter turn (0, 90, 180, 270). Frozen. */
const QUARTER_TURNS = Object.freeze([
  Object.freeze({ cos: 1, sin: 0 }), Object.freeze({ cos: 0, sin: 1 }),
  Object.freeze({ cos: -1, sin: 0 }), Object.freeze({ cos: 0, sin: -1 }),
]);

/**
 * The cosine and sine of a yaw in degrees (03 12.2): exact for every multiple of 90 degrees (so the default flat wall,
 * turned by 90, lands exactly on x = 0 with normals exactly +X), Math.cos / Math.sin of deg * PI / 180 otherwise.
 * Side effects: none.
 * @param {number} deg
 * @returns {{cos: number, sin: number}}
 */
export function yawTrig(deg) {
  const q = deg / 90;
  if (Number.isInteger(q)) return QUARTER_TURNS[((q % 4) + 4) % 4];
  const r = (deg * Math.PI) / 180;
  return { cos: Math.cos(r), sin: Math.sin(r) };
}

/**
 * Turns a horizontal position or direction about the vertical axis through the origin: R_y(psi)(x, z).
 * Side effects: none.
 * @param {number} x
 * @param {number} z
 * @param {{cos: number, sin: number}} trig  yawTrig(psi)
 * @returns {{x: number, z: number}} a new object
 */
export function turnXZ(x, z, trig) {
  return { x: x * trig.cos + z * trig.sin, z: -x * trig.sin + z * trig.cos };
}

/**
 * The azimuth of a horizontal direction in degrees: atan2(v.x, v.z) (03 12.1), so azimuthDeg(R_y(psi) v) = azimuthDeg(v)
 * + psi (mod 360). +Z has azimuth 0, +X 90.
 * Side effects: none.
 * @param {{x: number, z: number}} v
 * @returns {number} degrees in (-180, 180]
 */
export function azimuthDeg(v) {
  return (Math.atan2(v.x, v.z) * 180) / Math.PI;
}

/** The tolerance of "the centre falls on a column edge", relative to the chain length (03 12.2). */
const ON_EDGE_RELATIVE = 1e-9;

/**
 * The wall's centre point and its LED normal (03 12.2), in the layout's own frame: the arc-length midpoint of the
 * bottom edge chain (layout.flatEdges(), section joins counted once). Each segment j (v_j -> v_j+1) has length
 * l_j = hypot(dx, dz) and the stored LED normal n_j = (-dz / l_j, 0, dx / l_j) (WallMeshBuilder's right-panel normal:
 * +Z for a flat wall along +X). Lt = the sum of the positive lengths; the centre is at Lt / 2:
 *   inside a segment: C = v_j + u (v_j+1 - v_j), u = (Lt / 2 - acc_j) / l_j, normal n_j;
 *   within eps = 1e-9 * max(1, Lt) of a segment end: C = v_j+1, normal = normalise(n_j + n_k), k the next segment of
 *     positive length (n_j alone when there is none or the sum vanishes);
 *   y = sections[0].baseY (the floor of the frame).
 * Segments of zero length are skipped. Equivariant: the centre of a translated or turned layout is the centre carried
 * along.
 * Side effects: none.
 * @param {import('./WallLayout.js').WallLayout} layout
 * @returns {{point: {x: number, y: number, z: number}, normal: {x: number, y: number, z: number}}|null}
 *   null for an empty wall, a wall without positive-length columns or a non-finite chain length
 */
export function wallCentre(layout) {
  if (layout.sections.length === 0) return null;
  const pts = layout.flatEdges();
  const segs = [];
  let total = 0;
  for (let j = 0; j + 1 < pts.length; j++) {
    const a = pts[j];
    const b = pts[j + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len)) return null;
    if (len > 0) {
      segs.push({ a, b, len, n: { x: -dz / len, z: dx / len } });
      total += len;
    }
  }
  if (!(total > 0) || !Number.isFinite(total)) return null;
  const y = layout.sections[0].baseY;
  const half = total / 2;
  const eps = ON_EDGE_RELATIVE * Math.max(1, total);
  let acc = 0;
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j];
    const end = acc + s.len;
    if (Math.abs(end - half) <= eps) {
      const next = segs[j + 1];
      let nx = s.n.x;
      let nz = s.n.z;
      if (next) {
        const sx = s.n.x + next.n.x;
        const sz = s.n.z + next.n.z;
        const m = Math.hypot(sx, sz);
        if (m > 1e-12) {
          nx = sx / m;
          nz = sz / m;
        }
      }
      return { point: { x: s.b.x, y, z: s.b.z }, normal: { x: nx, y: 0, z: nz } };
    }
    if (end > half) {
      const u = (half - acc) / s.len;
      return {
        point: { x: s.a.x + u * (s.b.x - s.a.x), y, z: s.a.z + u * (s.b.z - s.a.z) },
        normal: { x: s.n.x, y: 0, z: s.n.z },
      };
    }
    acc = end;
  }
  // Unreachable for a positive total (the last segment ends at Lt > Lt / 2); kept so the function always returns.
  const last = segs[segs.length - 1];
  return { point: { x: last.b.x, y, z: last.b.z }, normal: { x: last.n.x, y: 0, z: last.n.z } };
}

/**
 * The alignment yaw (03 12.2, 12.16): psi_a = wrapDeg(target - azimuth(n_c)), so that R_y(psi_a) maps the centre normal
 * n_c to the azimuth `targetDeg` (Wall.ALIGN_NORMAL_AZIMUTH_DEG): 90 for 'center-neg-x' (n_c -> +X, the default
 * argument), -90 for 'center-pos-x' (n_c -> -X). A flat wall along +X (n_c = (-0, 0, 1)) gives exactly 90 and -90.
 * 0 without a centre.
 * Side effects: none.
 * @param {import('./WallLayout.js').WallLayout} layout  the raw walk (layout frame)
 * @param {number} [targetDeg]  the azimuth the centre normal is turned to, degrees (default 90: +X)
 * @returns {number} degrees in (-180, 180]
 */
export function alignmentYawDeg(layout, targetDeg = 90) {
  const c = wallCentre(layout);
  if (!c) return 0;
  return wrapDeg(targetDeg - azimuthDeg(c.normal));
}
