/**
 * @module geometry/SafeDistanceBand
 * The safe-distance floor band of one polyline (docs/improvements/08-bugfix-roadmap.md 6.9; B-M15 and B-L29 fixed in
 * 08 P2-5b): a shared-vertex strip from the wall points out to a mitred offset at distance D on the stage side, wound
 * so every triangle faces +Y. The offset is clamped near concave features (a concave turn shortens the offset edges of
 * its two segments; a concave curve's offset stops short of its centre of curvature), so the strip never folds over
 * itself; every offset vertex closer than D is marked 'clamped' and counted. Overlaps between non-adjacent segments
 * (U-shaped stages whose opening is narrower than 2 D) are not detected (08 6.9, Q18).
 * One call builds the band of one run. A WallLayout is wrapped as the single run of layout.flatEdges() (Phase 2);
 * Feature 2 passes each of its floorRuns() (02 6.12, CR-08-a).
 * Legacy source: replaces the per-column quads of index.html@cd3fd3f 2649-2708 (createSafeDistanceMesh).
 * Layer: geometry (may import domain, legacy; THREE-free and DOM-free). It imports nothing.
 */

/** The clamp margin in metres (08 6.9 `EPS`): offsets stop this far short of a collapse. */
export const SAFE_BAND_EPS = 0.001;

/** A turn with 1 + m[k-1]·m[k] below this (|θ| above about 166°) is a fold-back: the vertex splits, no mitre. */
const SPLIT_LIMIT = 0.03;

/** A triangle whose doubled area (the length of its cross product, m²) is below this is dropped. */
const MIN_DOUBLE_AREA = 1e-12;

/** Consecutive points closer than this (metres) are one point (a zero-length segment has no direction). */
const MIN_SEGMENT_M = 1e-12;

/**
 * What the concave-curve clamp needs of a section: its curve step (degrees, positive = concave toward the stage) and
 * its panel width in metres.
 * @typedef {{curveDeg: number, panelW: number}} BandSection
 */

/**
 * One run of the band (02 6.12, CR-08-a): the polyline on the floor, the facing σ = ±1 of each segment (absent: +1)
 * and the section(s) each vertex belongs to (a junction vertex belongs to both of its sections; absent: none).
 * @typedef {{points: {x: number, z: number}[], facing?: number[]|null, sectionOfVertex?: BandSection[][]|null}} BandRun
 */

/**
 * The band of one run. Per vertex, 'wall' (the polyline), 'threshold' (an offset vertex at distance D) or 'clamped'
 * (an offset vertex closer than D).
 * @typedef {{positions: number[], colors: ('wall'|'threshold'|'clamped')[], indices: number[],
 *            outline: {x: number, z: number}[], labelAnchor: {x: number, z: number}|null, clampedVertices: number,
 *            totalSafeVertices: number, distance: number, lift: number, lineLift: number}} SafeBand
 */

/**
 * The single run of a WallLayout (08 6.9, Phase 2): the points of layout.flatEdges(), every facing +1 (01's
 * flatEdgeFacing() supplies σ once Feature 1 adds it), and per vertex its sections: vertex 0 and each section's own
 * edges belong to that section, and the first edge of a later section (its join with the previous one) belongs to
 * both.
 * Side effects: none.
 * @param {import('./WallLayout.js').WallLayout} layout
 * @returns {BandRun}
 */
export function bandRunOfLayout(layout) {
  const points = layout.flatEdges();
  const sectionOfVertex = points.map(() => []);
  let start = 0;
  for (const sl of layout.sections) {
    const own = { curveDeg: sl.section.curveIntensity, panelW: sl.panelW };
    for (let k = 0; k < sl.edges.length; k++) sectionOfVertex[start + k]?.push(own);
    start += sl.edges.length - 1;
  }
  const facing = points.length > 1 ? new Array(points.length - 1).fill(1) : [];
  return { points, facing, sectionOfVertex };
}

/**
 * The mitred, clamped safe-distance band of one run (08 6.9). With t[j] the unit direction and L[j] the length of
 * segment j, its stage normal is m[j] = σ[j]·(−t.z, 0, t.x). At an interior vertex k the signed turn
 * θ = atan2(t[k-1] × t[k], t[k-1]·t[k]) is concave when σ·θ > 0; a vertex with 1 + m[k-1]·m[k] < 0.03 (or a change
 * of σ) splits into two offset vertices and counts as two polyline ends. τ[k] = split ? 0 : max(0, tan(σ·θ/2)) is how
 * far the concave mitre pulls the offset edges in; lim[j] = max(0, L[j] − eps) / (τ[j] + τ[j+1]) (+∞ when the sum is
 * 0); d[k] = max(0, min(D, lim[k-1], lim[k], r_s − eps for every concave section s of vertex k)), with the inradius
 * r_s = panelW / (2·tan(c/2)). Offset vertices: the ends w + d·m, a split vertex w + d·m[k-1] and w + d·m[k], any
 * other w + d·(m[k-1] + m[k]) / (1 + m[k-1]·m[k]) (at distance d from both segment lines). Since every
 * d[k]·τ[k] + d[k+1]·τ[k+1] ≤ L, no offset edge reverses, so every triangle faces +Y.
 * Vertices: the N + 1 wall points first (y = lift), then the offset vertices in polyline order (y = lift). Triangles per
 * segment j with start and end offset vertices S and E: σ > 0: (w[j], E, w[j+1]), (w[j], S, E); σ < 0: (w[j+1], S, w[j]),
 * (w[j+1], E, S); a triangle whose doubled area is below 1e-12 m² is dropped. The outline is the offset vertices in
 * order (the true band edge) and the label anchor its middle point outline[floor(n / 2)], the legacy label index.
 * Side effects: none (pure; allocates plain arrays and objects only).
 * @param {BandRun|import('./WallLayout.js').WallLayout} input  one run, or a WallLayout (wrapped by bandRunOfLayout)
 * @param {number} D  the safe distance in metres (CineCamera.maxSafeDistance)
 * @param {{lift?: number, lineLift?: number, eps?: number}} [options]  lift: the band's y (above the grid, against
 *   z-fighting); lineLift: the outline's y (returned for the view); eps: the clamp margin
 * @returns {SafeBand} empty arrays, labelAnchor null, when the run has fewer than two distinct points
 */
export function buildSafeDistanceBand(input, D, { lift = 0.005, lineLift = 0.02, eps = SAFE_BAND_EPS } = {}) {
  const run = typeof input.flatEdges === 'function' ? bandRunOfLayout(input) : input;
  const { points, sigma, sectionsAt } = distinctPoints(run);
  const band = { positions: [], colors: [], indices: [], outline: [], labelAnchor: null, clampedVertices: 0,
    totalSafeVertices: 0, distance: D, lift, lineLift };
  const n = points.length - 1;   // segments
  if (n < 1) return band;

  // Segments: unit direction t, length L, stage normal m (times σ).
  const tx = [], tz = [], len = [], mx = [], mz = [];
  for (let j = 0; j < n; j++) {
    const dx = points[j + 1].x - points[j].x;
    const dz = points[j + 1].z - points[j].z;
    const l = Math.hypot(dx, dz);
    len.push(l);
    tx.push(dx / l);
    tz.push(dz / l);
    mx.push(-sigma[j] * (dz / l));
    mz.push(sigma[j] * (dx / l));
  }

  // Turns: split and the concave shortening τ at every vertex (0 at both ends).
  const split = new Array(n + 1).fill(false);
  const tau = new Array(n + 1).fill(0);
  for (let k = 1; k < n; k++) {
    const dotM = mx[k - 1] * mx[k] + mz[k - 1] * mz[k];
    split[k] = sigma[k - 1] !== sigma[k] || 1 + dotM < SPLIT_LIMIT;
    if (split[k]) continue;
    const theta = Math.atan2(tx[k - 1] * tz[k] - tz[k - 1] * tx[k], tx[k - 1] * tx[k] + tz[k - 1] * tz[k]);
    tau[k] = Math.max(0, Math.tan((sigma[k] * theta) / 2));
  }
  const lim = [];
  for (let j = 0; j < n; j++) {
    const sum = tau[j] + tau[j + 1];
    lim.push(sum > 0 ? Math.max(0, len[j] - eps) / sum : Infinity);
  }

  // Distance at every vertex: D, the two segment limits and the inradius of every concave section of the vertex.
  const dist = [];
  for (let k = 0; k <= n; k++) {
    let d = D;
    if (k >= 1) d = Math.min(d, lim[k - 1]);
    if (k <= n - 1) d = Math.min(d, lim[k]);
    const sides = [];
    if (k >= 1) sides.push(sigma[k - 1]);
    if (k <= n - 1) sides.push(sigma[k]);
    for (const s of sectionsAt[k]) {
      const c = (s.curveDeg * Math.PI) / 180;
      if (!sides.some((sg) => sg * c > 0)) continue;   // not concave toward the offset side
      d = Math.min(d, s.panelW / (2 * Math.tan(Math.abs(c) / 2)) - eps);
    }
    dist.push(Math.max(0, d));
  }

  // Vertices: the wall points, then the offset vertices; S[j] / E[j] = the offset vertex starting / ending segment j.
  const { positions, colors, outline } = band;
  for (const p of points) {
    positions.push(p.x, lift, p.z);
    colors.push('wall');
  }
  const startOf = new Array(n);
  const endOf = new Array(n);
  let next = n + 1;
  const pushSafe = (x, z, k) => {
    positions.push(x, lift, z);
    const clamped = dist[k] !== D;
    colors.push(clamped ? 'clamped' : 'threshold');
    if (clamped) band.clampedVertices++;
    band.totalSafeVertices++;
    outline.push({ x, z });
    return next++;
  };
  for (let k = 0; k <= n; k++) {
    const w = points[k];
    const d = dist[k];
    if (k === 0) {
      startOf[0] = pushSafe(w.x + d * mx[0], w.z + d * mz[0], k);
    } else if (k === n) {
      endOf[n - 1] = pushSafe(w.x + d * mx[n - 1], w.z + d * mz[n - 1], k);
    } else if (split[k]) {
      endOf[k - 1] = pushSafe(w.x + d * mx[k - 1], w.z + d * mz[k - 1], k);
      startOf[k] = pushSafe(w.x + d * mx[k], w.z + d * mz[k], k);
    } else {
      const denom = 1 + mx[k - 1] * mx[k] + mz[k - 1] * mz[k];
      const v = pushSafe(w.x + (d * (mx[k - 1] + mx[k])) / denom, w.z + (d * (mz[k - 1] + mz[k])) / denom, k);
      endOf[k - 1] = v;
      startOf[k] = v;
    }
  }

  // Triangles, wound so the face normal is +Y (B-L29); degenerate ones dropped.
  const tri = (a, b, c) => {
    const ax = positions[3 * a], az = positions[3 * a + 2];
    const cy = (positions[3 * b + 2] - az) * (positions[3 * c] - ax) - (positions[3 * b] - ax) * (positions[3 * c + 2] - az);
    if (Math.abs(cy) >= MIN_DOUBLE_AREA) band.indices.push(a, b, c);
  };
  for (let j = 0; j < n; j++) {
    const s = startOf[j];
    const e = endOf[j];
    if (sigma[j] > 0) {
      tri(j, e, j + 1);
      tri(j, s, e);
    } else {
      tri(j + 1, s, j);
      tri(j + 1, e, s);
    }
  }

  band.labelAnchor = outline[Math.floor(outline.length / 2)];
  return band;
}

/**
 * The run's points with consecutive coincident points merged (their sections joined, the zero-length segment's σ
 * dropped), σ normalised to ±1 per remaining segment and the section list of each remaining point.
 * Module-private helper of buildSafeDistanceBand.
 * @param {BandRun} run
 * @returns {{points: {x: number, z: number}[], sigma: number[], sectionsAt: BandSection[][]}}
 */
function distinctPoints(run) {
  const src = run.points || [];
  const points = [];
  const sigma = [];
  const sectionsAt = [];
  for (let k = 0; k < src.length; k++) {
    const p = src[k];
    const own = run.sectionOfVertex?.[k] ?? [];
    const last = points[points.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < MIN_SEGMENT_M) {
      for (const s of own) if (!sectionsAt[points.length - 1].includes(s)) sectionsAt[points.length - 1].push(s);
      continue;
    }
    if (last) sigma.push((run.facing?.[k - 1] ?? 1) < 0 ? -1 : 1);
    points.push({ x: p.x, z: p.z });
    sectionsAt.push([...own]);
  }
  return { points, sigma, sectionsAt };
}
