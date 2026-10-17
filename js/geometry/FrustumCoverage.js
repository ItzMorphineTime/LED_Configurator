/**
 * @module geometry/FrustumCoverage
 * The rotation-aware coverage analyser of the film camera (08 P2-11a, B-M10; docs/improvements/08-bugfix-roadmap.md
 * 6.10). Five rays (the optical axis and the four frame corners) are cast against the wall's column quads
 * (WallLayout.columnQuads(), memoised per layout, so a pose change allocates nothing layout-sized); they give the frame
 * distance D0, the frame size at the wall, the status (offWall, within, offCenter, exceeds) and the camera-space depth of
 * each frustum corner (the frustum ends at the wall: 08 P2-11b, B-L33). A frame that crosses the wall without any of the
 * five rays hitting it is found by a separating-axis test of each projected column quad against the frame rectangle.
 * Every direction comes from the pose and the wall geometry in the layout's frame (the stage frame): nothing assumes that
 * the wall runs along +X or faces +Z, so a wall turned about the vertical axis is analysed like any other.
 * Only front-facing quads count (the camera on the LED side of the quad's plane): a camera behind the wall, or one that
 * looks away from it, is `offWall`.
 * Legacy source: replaces index.html@cd3fd3f 2471-2534 (calculateFrustumIntersection, the flat-rectangle test of posZ).
 * Layer: geometry (THREE-free and DOM-free; imports nothing).
 */

/** The depth of a frustum corner that hits nothing while no wall plane lies ahead (the legacy fixed depth, B-L33). */
export const MAX_FRUSTUM_DEPTH_M = 15;

/** Tolerance of the quad parameters s and v: a ray through the joint of two columns hits at least one of them. */
const HIT_EPS = 1e-9;

/** A quad faces the ray only when d·n < -FACING_EPS (08 6.10: `den >= -1e-9` is skipped). */
const FACING_EPS = 1e-9;

/** The near clip of the projected-quad test, in camera-space metres along the optical axis. */
const NEAR_Z = 1e-6;

/** The frame corners in the order of `cornerDepths`: TL, TR, BR, BL as (sx, sy). Frozen. */
export const FRAME_CORNERS = Object.freeze([
  Object.freeze({ sx: -1, sy: 1 }),
  Object.freeze({ sx: 1, sy: 1 }),
  Object.freeze({ sx: 1, sy: -1 }),
  Object.freeze({ sx: -1, sy: -1 }),
]);

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * The camera's world basis for the Euler angles (degrees, order 'YXZ': pan, then tilt, then roll), exactly the columns of
 * three.js r128 `Matrix4.makeRotationFromEuler` for that order, as `CameraRigView.updateTransform` applies it:
 * right = R·(1, 0, 0), up = R·(0, 1, 0), forward = R·(0, 0, -1) = (-sin pan·cos tilt, sin tilt, -cos pan·cos tilt).
 * With zero angles forward is (-0, 0, -1), right (1, 0, 0) and up (0, 1, 0), exactly.
 * Side effects: none.
 * @param {number} rotXDeg  tilt
 * @param {number} rotYDeg  pan
 * @param {number} rotZDeg  roll
 * @returns {{forward: Vec3, right: Vec3, up: Vec3}}
 */
export function cameraBasis(rotXDeg, rotYDeg, rotZDeg) {
  const tilt = rotXDeg * Math.PI / 180;
  const pan = rotYDeg * Math.PI / 180;
  const roll = rotZDeg * Math.PI / 180;
  const a = Math.cos(tilt), b = Math.sin(tilt);
  const c = Math.cos(pan), d = Math.sin(pan);
  const e = Math.cos(roll), f = Math.sin(roll);
  const ce = c * e, cf = c * f, de = d * e, df = d * f;
  return {
    right: { x: ce + df * b, y: a * f, z: cf * b - de },
    up: { x: de * b - cf, y: a * e, z: df + ce * b },
    forward: { x: -(a * d), y: b, z: -(a * c) },
  };
}

/** a·b (left to right). Module-private. */
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * The ray parameter at which the ray o + t·d meets the plane of quad q from its front side, or null (08 6.10):
 * den = d·n must be below -1e-9 (the ray looks at the LED face) and t = ((p0 - o)·n) / den must be positive.
 * Side effects: none.
 * @param {Vec3} o
 * @param {Vec3} d
 * @param {import('./WallLayout.js').ColumnQuad} q
 * @returns {number|null}
 */
function planeHit(o, d, q) {
  const den = dot(d, q.n);
  if (!(den < -FACING_EPS)) return null;
  const n = q.n;
  const t = ((q.p0.x - o.x) * n.x + (q.p0.y - o.y) * n.y + (q.p0.z - o.z) * n.z) / den;
  return t > 0 ? t : null;
}

/**
 * The quad parameters (s along the column, v up it) of the point o + t·d.
 * Side effects: none.
 * @param {Vec3} o
 * @param {Vec3} d
 * @param {number} t
 * @param {import('./WallLayout.js').ColumnQuad} q
 * @returns {{s: number, v: number}}
 */
function quadParams(o, d, t, q) {
  const qx = o.x + t * d.x - q.p0.x;
  const qy = o.y + t * d.y - q.p0.y;
  const qz = o.z + t * d.z - q.p0.z;
  return {
    s: (qx * q.a.x + qy * q.a.y + qz * q.a.z) / q.aa,
    v: (qx * q.b.x + qy * q.b.y + qz * q.b.z) / q.bb,
  };
}

/** Is p within [0, 1] (with the joint tolerance)? Module-private. */
const unit = (p) => p >= -HIT_EPS && p <= 1 + HIT_EPS;

/**
 * The nearest true hit of a ray on the wall: the smallest front-facing t whose point lies inside its quad.
 * Side effects: none.
 * @param {Vec3} o
 * @param {Vec3} d
 * @param {ReadonlyArray<import('./WallLayout.js').ColumnQuad>} quads
 * @returns {number|null}
 */
export function nearestHit(o, d, quads) {
  let best = null;
  for (const q of quads) {
    const t = planeHit(o, d, q);
    if (t === null || (best !== null && t >= best)) continue;
    const { s, v } = quadParams(o, d, t, q);
    if (unit(s) && unit(v)) best = t;
  }
  return best;
}

/**
 * The frame distance D0 of the optical axis (08 6.10): the ray parameter t at which the axis meets the plane of the
 * column it passes closest to. Over every front-facing column plane hit at t > 0, the hit's distance outside the
 * column's horizontal extent is gap = 0 for 0 <= s <= 1 (any height), else (-s or s - 1)·|a| metres; D0 is the t of
 * the smallest gap, the smallest t among equal gaps; null when no wall plane lies ahead. So a hit inside a column wins
 * (the smallest such t, 6.10's rule 1); when the axis misses every column, the column it passes closest to gives the
 * plane (as built: 6.10's rule 2 took the nearest plane of any column, which on a curved wall can be the plane of a far
 * column passing just in front of the camera). For a flat wall in the plane z = c and an unrotated camera every column
 * gives t = posZ - c, bit for bit.
 * Side effects: none.
 * @param {Vec3} o
 * @param {Vec3} f  the forward axis
 * @param {ReadonlyArray<import('./WallLayout.js').ColumnQuad>} quads
 * @returns {number|null}
 */
export function frameDistance(o, f, quads) {
  let best = null;
  let bestGap = Infinity;
  for (const q of quads) {
    const t = planeHit(o, f, q);
    if (t === null) continue;
    const { s } = quadParams(o, f, t, q);
    const gap = unit(s) ? 0 : (s < 0 ? -s : s - 1) * Math.sqrt(q.aa);
    if (gap < bestGap || (gap === bestGap && t < best)) {
      best = t;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Does the front-facing quad q overlap the frame rectangle [-tx, tx] x [-ty, ty] in image space (08 6.10)? Its corners
 * p0, p0 + a, p0 + a + b, p0 + b go to camera space (x = v·r, y = v·u, z = v·f for v = corner - o), the polygon is
 * clipped against z >= 1e-6 and projected to (x / z, y / z), and a separating-axis test runs against the rectangle (its
 * two axes, then each polygon edge's normal). This catches a frame that crosses a column without containing any of its
 * corners and without any of the five rays hitting it (a wide, short frame across a tall column). Touching counts.
 * Side effects: none.
 * @param {import('./WallLayout.js').ColumnQuad} q
 * @param {Vec3} o
 * @param {{forward: Vec3, right: Vec3, up: Vec3}} basis
 * @param {number} tx  tan(hFov / 2)
 * @param {number} ty  tan(vFov / 2)
 * @returns {boolean}
 */
export function quadOverlapsFrame(q, o, { forward: f, right: r, up: u }, tx, ty) {
  const { p0, a, b } = q;
  const corners = [
    p0,
    { x: p0.x + a.x, y: p0.y + a.y, z: p0.z + a.z },
    { x: p0.x + a.x + b.x, y: p0.y + a.y + b.y, z: p0.z + a.z + b.z },
    { x: p0.x + b.x, y: p0.y + b.y, z: p0.z + b.z },
  ].map((c) => {
    const v = { x: c.x - o.x, y: c.y - o.y, z: c.z - o.z };
    return { x: dot(v, r), y: dot(v, u), z: dot(v, f) };
  });
  // Sutherland-Hodgman against the near plane z >= NEAR_Z
  const clipped = [];
  for (let i = 0; i < 4; i++) {
    const P = corners[i];
    const Q = corners[(i + 1) % 4];
    const pIn = P.z >= NEAR_Z;
    if (pIn) clipped.push(P);
    if (pIn !== (Q.z >= NEAR_Z)) {
      const k = (NEAR_Z - P.z) / (Q.z - P.z);
      clipped.push({ x: P.x + k * (Q.x - P.x), y: P.y + k * (Q.y - P.y), z: NEAR_Z });
    }
  }
  if (clipped.length < 3) return false;
  const pts = clipped.map((p) => ({ x: p.x / p.z, y: p.y / p.z }));
  // The rectangle's axes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (maxX < -tx || minX > tx || maxY < -ty || minY > ty) return false;
  // The polygon's edge normals
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const nxt = pts[(i + 1) % pts.length];
    const nx = -(nxt.y - p.y);
    const ny = nxt.x - p.x;
    if (nx === 0 && ny === 0) continue;
    let lo = Infinity, hi = -Infinity;
    for (const w of pts) {
      const s = w.x * nx + w.y * ny;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    const half = Math.abs(nx) * tx + Math.abs(ny) * ty;
    if (hi < -half || lo > half) return false;
  }
  return true;
}

/**
 * The coverage of the film camera on the wall (08 6.10).
 *   D0 = frameDistance(o, forward); W = 2·tx·D0, H = 2·ty·D0 (null without D0), tx = tan(hFov / 2), ty = tan(vFov / 2);
 *   corner c (TL, TR, BR, BL) casts d_c = normalize(forward + sx·tx·right + sy·ty·up) and hits the nearest quad
 *   containing its point;
 *   status: 'offWall' when D0 is null or the frame does not touch the wall (no ray hits a quad and no front-facing quad
 *   overlaps the frame in image space); 'within' when all four corners hit; 'offCenter' when the frame fits the wall
 *   (W <= extent.width and H <= extent.height); 'exceeds' otherwise.
 *   cornerDepths (camera-space depth along the forward axis, 08 P2-11b): t_c / sqrt(1 + tx² + ty²) for a corner that
 *   hits (the far corner (sx·tx·z, sy·ty·z, -z) is then exactly the hit point), else D0, else MAX_FRUSTUM_DEPTH_M.
 * For an unrotated camera in front of a flat wall D0 is posZ minus the wall plane's z and W, H are the legacy values bit
 * for bit; the corners hit exactly when the legacy rectangle test held (with the joint tolerance); only a frame
 * entirely off the wall changes (legacy gave offCenter or exceeds, the analyser offWall).
 * Side effects: none (reads layout.columnQuads(), which memoises on the layout).
 * @param {{columnQuads(): ReadonlyArray<import('./WallLayout.js').ColumnQuad>}} layout  in the camera's frame (stage)
 * @param {{posX: number, posY: number, posZ: number, rotX: number, rotY: number, rotZ: number}} pose  metres, degrees
 * @param {{hFov: number, vFov: number}} lens  radians
 * @param {{width: number, height: number}} extent  the wall size that `fits` compares the frame with (metres)
 * @returns {{status: 'offWall'|'within'|'offCenter'|'exceeds', frameWidth: number|null, frameHeight: number|null,
 *            distance: number|null, cornerDepths: number[], centreDepth: number, cornerHits: boolean[]}}
 *   distance is D0; centreDepth is D0, else MAX_FRUSTUM_DEPTH_M
 */
export function analyzeCoverage(layout, pose, lens, extent) {
  const quads = layout.columnQuads();
  const basis = cameraBasis(pose.rotX, pose.rotY, pose.rotZ);
  const { forward: f, right: r, up: u } = basis;
  const o = { x: pose.posX, y: pose.posY, z: pose.posZ };
  const tx = Math.tan(lens.hFov / 2);
  const ty = Math.tan(lens.vFov / 2);

  const distance = frameDistance(o, f, quads);
  const frameWidth = distance === null ? null : 2 * tx * distance;
  const frameHeight = distance === null ? null : 2 * ty * distance;

  const norm = Math.sqrt(1 + tx * tx + ty * ty);
  const cornerHits = [];
  const cornerDepths = [];
  for (const { sx, sy } of FRAME_CORNERS) {
    const dx = f.x + sx * tx * r.x + sy * ty * u.x;
    const dy = f.y + sx * tx * r.y + sy * ty * u.y;
    const dz = f.z + sx * tx * r.z + sy * ty * u.z;
    const len = Math.hypot(dx, dy, dz);
    const t = nearestHit(o, { x: dx / len, y: dy / len, z: dz / len }, quads);
    cornerHits.push(t !== null);
    cornerDepths.push(t !== null ? t / norm : (distance ?? MAX_FRUSTUM_DEPTH_M));
  }

  let status;
  if (distance === null) {
    status = 'offWall';
  } else {
    const within = cornerHits.every(Boolean);
    const touches = within || cornerHits.some(Boolean) || nearestHit(o, f, quads) !== null ||
      quads.some((q) => frontFacing(q, o) && quadOverlapsFrame(q, o, basis, tx, ty));
    if (!touches) status = 'offWall';
    else if (within) status = 'within';
    else if (frameWidth <= extent.width && frameHeight <= extent.height) status = 'offCenter';
    else status = 'exceeds';
  }

  return {
    status, frameWidth, frameHeight, distance, cornerDepths,
    centreDepth: distance ?? MAX_FRUSTUM_DEPTH_M, cornerHits,
  };
}

/**
 * Is the camera on the LED side of the quad's plane ((o - p0)·n > 0)? Module-private.
 * @param {import('./WallLayout.js').ColumnQuad} q
 * @param {Vec3} o
 * @returns {boolean}
 */
function frontFacing(q, o) {
  return (o.x - q.p0.x) * q.n.x + (o.y - q.p0.y) * q.n.y + (o.z - q.p0.z) * q.n.z > 0;
}
