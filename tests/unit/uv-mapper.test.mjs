// Unit tests for spec 04's UV domain and maths (docs/improvements/04-uvs-uv-editor.md 4.1, 6.2-6.10, 8.1; UV-5a, UV-6):
// 1. domain/UvSettings: UvTransform rules, identity, summary and JSON shapes; UvSettings; WallSection.uvTransform;
//    Project.uv;
// 2. geometry/UvMapper: the identity short-circuit (bit-identical to col/cols), the inverse, the rectangle and no-shear
//    invariants, the direction convention, exact quarter turns and flips, the presets, pixel accuracy, the drags and
//    the plans of every mesh mode;
// 3. geometry/WallMeshBuilder with plans: identity plans equal 'unit' and the 'atlas-pixel-accurate' UVs bit for bit,
//    sectionUvs equals sectionGrid, panelUvs(…, plan) and the combined vertex ranges;
// 4. geometry/PixelMap: pixel centres, the hover description and the wall point of a base UV.
// Run: node --test tests/unit/uv-mapper.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { UvTransform, UvSettings, UvLayout, PanelUvMode } from '../../js/domain/UvSettings.js';
import { WallSection, SECTION_FIELDS } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { Wall } from '../../js/domain/Wall.js';
import {
  cosSinDeg, sourceSize, uvLinear, applyUv, invertUv, sectionUv, islandCorners, islandBounds, planSectionUvs,
  planSectionUv, presetFit, isFitResult, presetPixelAccurate, quarterTurn, pixelAccuracy, dragTranslate, dragScale,
  dragRotate, isLedMaskContent,
} from '../../js/geometry/UvMapper.js';
import {
  baseUvToPixel, pixelCenterToBaseUv, describeHit, wallPointFromBaseUv, pixelMapJson, panelBaseRect,
} from '../../js/geometry/PixelMap.js';
import { computeAtlas } from '../../js/geometry/TextureAtlas.js';
import { computeWallLayout } from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';

/** A deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sec = (over = {}) => new WallSection({
  id: 0, name: 'S', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
  curveIntensity: 0, angleOffset: 0, color: '#d9d9d6', ...over,
});

/** A random transform (rotation, scales, flips, offsets, source orientation). */
function randomTransform(r) {
  return new UvTransform({
    offsetU: r() * 2 - 1, offsetV: r() * 2 - 1, scaleU: 0.05 + r() * 4, scaleV: 0.05 + r() * 4,
    rotation: UvTransform.normalizeRotation(r() * 720 - 360), flipU: r() < 0.5, flipV: r() < 0.5, sourceRotated: r() < 0.5,
  });
}

describe('UvTransform and UvSettings (04 4.1, UV-5a)', () => {
  test('defaults, identity and isIdentityFor (sourceRotated is ignored only on square sections)', () => {
    const t = UvTransform.identity();
    assert.deepEqual({ ...t }, { offsetU: 0, offsetV: 0, scaleU: 1, scaleV: 1, rotation: 0, flipU: false, flipV: false, sourceRotated: false });
    assert.ok(t.isIdentity && t.isIdentityFor(160, 96));
    const src = new UvTransform({ sourceRotated: true });
    assert.equal(src.isIdentity, false);
    assert.equal(src.isIdentityFor(64, 64), true);
    assert.equal(src.isIdentityFor(160, 96), false);
    assert.equal(new UvTransform({ offsetU: 0.1 }).isIdentityFor(64, 64), false);
  });

  test('RULES and setField: 0 is legal, clamps, scale sign toggles the flip, rotation wraps, booleans coerce', () => {
    const t = UvTransform.identity();
    assert.equal(t.setField('offsetU', '0'), 0);
    assert.equal(t.setField('offsetU', '99'), 8);
    assert.equal(t.setField('offsetV', 'abc'), 0);
    assert.equal(t.setField('scaleU', '0'), 1);
    assert.equal(t.setField('scaleU', '-0.5'), 0.5);
    assert.equal(t.flipU, true, 'a negative scale toggles the flip');
    assert.equal(t.setField('scaleV', 100), 16);
    assert.equal(t.setField('scaleV', 0.001), 0.01);
    assert.equal(t.setField('rotation', '270'), -90);
    assert.equal(t.setField('rotation', -180), 180);
    assert.equal(t.setField('rotation', 180), 180);
    assert.ok(Object.is(t.setField('rotation', 0), 0));
    assert.equal(t.setField('flipV', 'true'), true);
    assert.equal(t.setField('flipV', 'yes'), false);
    assert.equal(t.setField('sourceRotated', 1), false);
    assert.throws(() => t.setField('mode', 1), RangeError);
  });

  test('summaryFor lists the non-default parts in order; JSON round trip; clone and equals', () => {
    const t = new UvTransform({ flipU: true, rotation: 90, sourceRotated: true, scaleU: 0.5, scaleV: 0.5, offsetU: 0.1 });
    assert.equal(t.summaryFor(160, 96), 'Flip U · 90° · Source rotated · 50 % × 50 % · Offset 0.1000, 0.0000');
    assert.equal(new UvTransform({ sourceRotated: true }).summaryFor(64, 64), 'Identity');
    assert.equal(UvTransform.identity().summaryFor(160, 96), 'Identity');
    assert.deepEqual(t.toJSON(), { offset_u: 0.1, offset_v: 0, scale_u: 0.5, scale_v: 0.5, rotation_degrees: 90, flip_u: true, flip_v: false, source_rotated: true });
    const back = UvTransform.fromJSON(t.toJSON());
    assert.ok(back.equals(t) && back !== t);
    const c = t.clone();
    c.offsetU = 0.3;
    assert.equal(t.offsetU, 0.1, 'a clone is independent');
  });

  test('UvSettings: defaults (per-section, section, the canvas TEXCOORD_1 on), RULES, assign in place, JSON shapes', () => {
    const s = new UvSettings();
    assert.equal(s.combinedLayout, UvLayout.PER_SECTION);
    assert.equal(s.panelUvs, PanelUvMode.SECTION);
    assert.equal(s.gltfCanvasTexcoord1, true);
    assert.ok(s.isDefault);
    assert.equal(UvSettings.RULES.gltfCanvasTexcoord1('yes'), false);
    assert.equal(UvSettings.RULES.combinedLayout('mode'), 'per-section');
    assert.equal(UvSettings.RULES.panelUvs('panel'), 'panel');
    assert.equal(s.assign({ combinedLayout: 'atlas' }), s);
    assert.equal(s.combinedLayout, 'atlas');
    assert.equal(s.panelUvs, 'section', 'undefined values are left unchanged');
    assert.deepEqual(s.toJSON(), { combined_layout: 'atlas', panel_uvs: 'section', gltf_canvas_texcoord1: true });
    assert.deepEqual(UvSettings.fromJSON(s.toJSON()), { combinedLayout: 'atlas', panelUvs: 'section', gltfCanvasTexcoord1: true });
  });

  test('WallSection.uvTransform: identity by default, never an own field, setUvTransform stores a clone; Project.uv', () => {
    const s = sec();
    assert.ok(s.uvTransform instanceof UvTransform && s.uvTransform.isIdentity);
    assert.deepEqual(Object.keys(s), [...SECTION_FIELDS]);
    const t = new UvTransform({ flipU: true });
    s.setUvTransform(t);
    assert.ok(s.uvTransform.equals(t) && s.uvTransform !== t);
    const given = new UvTransform({ rotation: 90 });
    assert.equal(sec({ uvTransform: given }).uvTransform, given, 'a constructor transform is stored as given');
    assert.notEqual(sec().uvTransform, sec().uvTransform, 'instances are never shared');
    const wall = new Wall({ sections: [s] });
    assert.ok(wall.appendLikeLast(['#000000']).uvTransform.isIdentity, 'a new section does not inherit the transform (Q8)');
    const p = Project.createNew();
    assert.ok(p.uv instanceof UvSettings && p.uv.isDefault);
    assert.ok(Project.createDefault().uv.isDefault);
  });
});

describe('UvMapper (04 6.3-6.8, UV-6)', () => {
  test('identity short-circuit: Object.is equal to col / cols over fuzzed counts', () => {
    const r = rng(1);
    for (let k = 0; k < 200; k++) {
      const cols = 1 + Math.floor(r() * 50);
      const rows = 1 + Math.floor(r() * 20);
      const t = k % 2 ? UvTransform.identity() : new UvTransform({ sourceRotated: true });
      const W = cols * 32;
      const H = k % 2 ? rows * 16 : W;   // sourceRotated is don't-care on the square ones
      for (let c = 0; c <= cols; c++) {
        const [u, v] = applyUv(t, W, H, c / cols, (c % (rows + 1)) / rows);
        assert.ok(Object.is(u, c / cols) && Object.is(v, (c % (rows + 1)) / rows));
      }
    }
  });

  test('applyUv / invertUv round trip over random transforms and sizes', () => {
    const r = rng(2);
    for (let k = 0; k < 10000; k++) {
      const t = randomTransform(r);
      const W = 1 + Math.floor(r() * 2000);
      const H = 1 + Math.floor(r() * 2000);
      const u = r(); const v = r();
      const [u1, v1] = applyUv(t, W, H, u, v);
      const [u2, v2] = invertUv(t, W, H, u1, v1);
      assert.ok(Math.abs(u2 - u) <= 1e-9 && Math.abs(v2 - v) <= 1e-9, `${k}: ${u2 - u}, ${v2 - v}`);
    }
  });

  test('rectangle invariant and no shear with a uniform scale (source-pixel edges orthogonal, equal column norms)', () => {
    const r = rng(3);
    for (let k = 0; k < 2000; k++) {
      const t = randomTransform(r);
      if (k % 2) t.scaleV = t.scaleU;
      const W = 1 + Math.floor(r() * 500);
      const H = 1 + Math.floor(r() * 500);
      const [Ws, Hs] = sourceSize(t, W, H);
      const [bl, br, , tl] = islandCorners(t, W, H).map(([u, v]) => [u * Ws, v * Hs]);
      const e1 = [br[0] - bl[0], br[1] - bl[1]];
      const e2 = [tl[0] - bl[0], tl[1] - bl[1]];
      const n1 = Math.hypot(...e1);
      const n2 = Math.hypot(...e2);
      assert.ok(Math.abs(e1[0] * e2[0] + e1[1] * e2[1]) <= 1e-9 * n1 * n2, `${k}: edges not orthogonal`);
      // per wall pixel: |e1| / W = su and |e2| / H = sv (source px per LED, 6.7)
      assert.ok(Math.abs(n1 / W - t.scaleU) <= 1e-9 * t.scaleU && Math.abs(n2 / H - t.scaleV) <= 1e-9 * t.scaleV);
    }
    // 6.3's example: 160 x 96 at 45 degrees is a rectangle in source pixels
    const t45 = new UvTransform({ rotation: 45 });
    const [bl, br, , tl] = islandCorners(t45, 160, 96).map(([u, v]) => [u * 160, v * 96]);
    assert.ok(Math.abs((br[0] - bl[0]) * (tl[0] - bl[0]) + (br[1] - bl[1]) * (tl[1] - bl[1])) < 1e-9);
  });

  test('direction: +90 turns a source up-vector into a wall right-vector; ou = +0.25 makes u = 0 sample u\' = 0.25', () => {
    const t = new UvTransform({ rotation: 90, sourceRotated: true });
    const a = invertUv(t, 160, 96, 0.5, 0.5);
    const b = invertUv(t, 160, 96, 0.5, 0.6);
    assert.ok((b[0] - a[0]) * 160 > 0 && Math.abs((b[1] - a[1]) * 96) < 1e-12);
    assert.deepEqual(applyUv(new UvTransform({ offsetU: 0.25 }), 160, 96, 0, 0.5), [0.25, 0.5]);
  });

  test('cosSinDeg is exact at the multiples of 90; matching quarter turns are R(θ)·S·F exactly; flips give exact 0 and 1', () => {
    assert.deepEqual(cosSinDeg(90), [0, 1]);
    assert.deepEqual(cosSinDeg(-90), [0, -1]);
    assert.deepEqual(cosSinDeg(270), [0, -1]);
    assert.deepEqual(cosSinDeg(180), [-1, 0]);
    assert.deepEqual(cosSinDeg(-180), [-1, 0]);
    assert.deepEqual(cosSinDeg(360), [1, 0]);
    const L = uvLinear(new UvTransform({ rotation: 90, sourceRotated: true }), 160, 96);
    assert.ok(Object.is(L.a, 0) && Object.is(L.b, -1) && Object.is(L.cc, 1) && Object.is(L.d, 0), JSON.stringify(L));
    const L180 = uvLinear(new UvTransform({ rotation: 180 }), 160, 96);
    assert.ok(Object.is(L180.a, -1) && Object.is(L180.d, -1));
    const f = new UvTransform({ flipU: true });
    assert.deepEqual(applyUv(f, 160, 96, 0, 0.25), [1, 0.25]);
    assert.deepEqual(applyUv(f, 160, 96, 1, 0.25), [0, 0.25]);
    assert.equal(uvLinear(null, 160, 96), null);
    assert.equal(uvLinear(new UvTransform({ sourceRotated: true }), 64, 64), null);
  });

  test('quarterTurn: from identity it fills [0,1]² exactly; two turns give R180; on W = H the Source is unchanged', () => {
    const t1 = quarterTurn(UvTransform.identity(), 1, 160, 96);
    assert.equal(t1.rotation, 90);
    assert.equal(t1.sourceRotated, true);
    assert.deepEqual(islandBounds(t1, 160, 96), { minU: 0, minV: 0, maxU: 1, maxV: 1 });
    assert.deepEqual(islandCorners(t1, 160, 96), [[1, 0], [1, 1], [0, 1], [0, 0]]);
    const t2 = quarterTurn(t1, 1, 160, 96);
    assert.equal(t2.rotation, 180);
    assert.equal(t2.sourceRotated, false);
    assert.deepEqual(applyUv(t2, 160, 96, 0.25, 0.75), [0.75, 0.25]);
    assert.equal(quarterTurn(UvTransform.identity(), -1, 64, 64).sourceRotated, false);
    assert.equal(quarterTurn(UvTransform.identity(), -1, 64, 64).rotation, -90);
    assert.equal(pixelAccuracy(t1, 160, 96).kind, 'exact');
    assert.ok(pixelAccuracy(t1, 160, 96).fills);
  });

  test('presetFit: inside [0,1]² and touching for every angle; exact at matching quarter turns; 45° on 160x96 is 0.600 x 1.000', () => {
    for (let theta = -180; theta <= 180; theta += 15) {
      for (const sourceRotated of [false, true]) {
        const t = presetFit(new UvTransform({ rotation: theta, sourceRotated, offsetU: 0.3, scaleU: 2 }), 160, 96);
        const b = islandBounds(t, 160, 96);
        assert.ok(b.minU >= -1e-9 && b.minV >= -1e-9 && b.maxU <= 1 + 1e-9 && b.maxV <= 1 + 1e-9, `${theta}`);
        const touchesU = Math.abs(b.minU) <= 1e-9 && Math.abs(b.maxU - 1) <= 1e-9;
        const touchesV = Math.abs(b.minV) <= 1e-9 && Math.abs(b.maxV - 1) <= 1e-9;
        assert.ok(touchesU || touchesV, `${theta}: touches one axis`);
        assert.ok(isFitResult(t, 160, 96));
      }
    }
    const q = presetFit(new UvTransform({ rotation: 90, sourceRotated: true }), 160, 96);
    assert.equal(q.scaleU, 1);
    assert.deepEqual(islandBounds(q, 160, 96), { minU: 0, minV: 0, maxU: 1, maxV: 1 });
    const t45 = presetFit(new UvTransform({ rotation: 45 }), 160, 96);
    const b = islandBounds(t45, 160, 96);
    assert.equal((b.maxU - b.minU).toFixed(3), '0.600');
    assert.equal((b.maxV - b.minV).toFixed(3), '1.000');
    assert.equal(t45.scaleU.toFixed(4), '0.5303');
    assert.equal(isFitResult(new UvTransform({ scaleU: 0.5, scaleV: 0.5 }), 160, 96), false);
  });

  test('presetPixelAccurate and pixelAccuracy', () => {
    const t = presetPixelAccurate(new UvTransform({ rotation: 80, scaleU: 0.7, scaleV: 2, offsetU: 0.1234 }), 160, 96);
    assert.equal(t.rotation, 90);
    assert.equal(t.sourceRotated, true);
    assert.equal(t.scaleU, 1);
    assert.equal(t.offsetU, Math.round(0.1234 * 96) / 96);
    assert.equal(pixelAccuracy(t, 160, 96).kind, 'exact');
    const square = presetPixelAccurate(new UvTransform({ rotation: 100, sourceRotated: true }), 64, 64);
    assert.equal(square.sourceRotated, true, 'kept on a square section');
    const res = pixelAccuracy(new UvTransform({ scaleU: 0.5, scaleV: 0.5 }), 160, 96);
    assert.equal(res.kind, 'resampled');
    assert.equal(res.ratioU, 0.5);
    assert.equal(res.fills, false);
    assert.equal(pixelAccuracy(new UvTransform({ rotation: 30 }), 160, 96).rotatedGrid, true);
    const mismatched = pixelAccuracy(new UvTransform({ rotation: 90 }), 160, 96);
    assert.equal(mismatched.fills, false, 'a quarter turn without the matching Source overhangs');
  });

  test('dragScale keeps the anchor fixed for every handle; dragRotate keeps the centre and is isotropic; dragTranslate snaps and clamps', () => {
    const r = rng(4);
    const opposite = { bl: [1, 1], br: [0, 1], tr: [0, 0], tl: [1, 0], l: [1, 0.5], r: [0, 0.5], b: [0.5, 1], t: [0.5, 0] };
    for (let k = 0; k < 400; k++) {
      const t0 = randomTransform(r);
      t0.scaleU = 0.5 + r(); t0.scaleV = 0.5 + r();
      const W = 10 + Math.floor(r() * 300);
      const H = 10 + Math.floor(r() * 300);
      for (const handle of Object.keys(opposite)) {
        const [ju, jv] = opposite[handle];
        const A0 = applyUv(t0, W, H, ju, jv);
        const t1 = dragScale(t0, W, H, handle, [r(), r()], { uniform: k % 3 === 0, snapPercent: k % 2 === 0 });
        if (t1.scaleU <= 0.01 || t1.scaleU >= 16 || t1.scaleV <= 0.01 || t1.scaleV >= 16) continue;
        const A1 = applyUv(t1, W, H, ju, jv);
        assert.ok(Math.abs(A1[0] - A0[0]) <= 1e-9 && Math.abs(A1[1] - A0[1]) <= 1e-9, `${k} ${handle}`);
      }
    }
    // isotropic on a 50:1 section: a quarter circle around the centre in source pixels is 90 degrees
    const t = UvTransform.identity();
    const rot = dragRotate(t, 5000, 100, [0.5 + 10 / 5000, 0.5], [0.5, 0.5 + 10 / 100], { snapDeg: null });
    assert.ok(Math.abs(rot.rotation - 90) < 1e-9);
    assert.equal(rot.offsetU, 0);
    assert.equal(dragRotate(t, 160, 96, [0.6, 0.5], [0.6, 0.52], { snapDeg: 15 }).rotation % 15, 0);
    const moved = dragTranslate(t, 160, 96, [0, 0], [0.1234, 20], { snap: true });
    assert.equal(moved.offsetU, Math.round(0.1234 * 160) / 160);
    assert.equal(moved.offsetV, 8);
    assert.equal(dragTranslate(t, 160, 96, [0, 0], [0.2, 0.3], { axisLock: 'u' }).offsetV, 0);
  });

  test('plans of every mode and setting (6.4); LED-mask content has no transform; planSectionUv equals planSectionUvs', () => {
    const t = new UvTransform({ flipU: true });
    const sections = [sec({ id: 1, uvTransform: t }), sec({ id: 2, panelCols: 2, panelRows: 4, ledX: 64 })];
    const layout = computeWallLayout(sections);
    const atlas = computeAtlas(sections);
    const settings = new UvSettings();
    const plans = (meshMode, applyTransforms = true) => planSectionUvs({ layout, atlas, settings, meshMode, applyTransforms });
    for (const meshMode of ['section', 'combined', 'panel']) {
      const [p0, p1] = plans(meshMode);
      assert.equal(p0.transform, t);
      assert.equal(p0.rect, null);
      assert.equal(p1.transform, null, 'identity');
      assert.equal(p0.W, 160);
      assert.equal(p1.H, 128);
      assert.equal(plans(meshMode, false)[0].transform, null, 'LED-mask content: base UVs');
      assert.deepEqual(planSectionUv(layout.sections[1], 1, { atlas, settings, meshMode, applyTransforms: true }), p1);
    }
    settings.combinedLayout = 'atlas';
    const [a0, a1] = plans('combined');
    assert.deepEqual(a1.rect, { offsetU: atlas.entries[1].uvOffsetX, widthU: atlas.entries[1].uvWidth, heightV: atlas.entries[1].uvHeight });
    assert.equal(a0.transform, t);
    assert.equal(plans('section')[0].rect, null, 'the layout setting only affects combined mode');
    settings.panelUvs = 'panel';
    assert.equal(plans('panel')[0].transform, null, 'per-panel UVs never take the transform');
    assert.equal(plans('panel')[0].panelUvs, 'panel');
    assert.equal(isLedMaskContent('ledSim'), true);
    assert.equal(isLedMaskContent('panelIds'), false);
  });
});

describe('WallMeshBuilder with UV plans (04 5.3, UV-6)', () => {
  const sections = [
    sec({ id: 1, panelCols: 7, panelRows: 3 }),
    sec({ id: 2, panelCols: 3, panelRows: 5, ledY: 48, curveIntensity: 5 }),
    sec({ id: 3, panelCols: 49, panelRows: 1, ledX: 16 }),
  ];
  const layout = computeWallLayout(sections);
  const atlas = computeAtlas(sections);
  const plan = (profileCombinedUV, combinedLayout) => {
    const settings = new UvSettings().assign({ combinedLayout });
    const builder = new WallMeshBuilder({ ...Strategies.mesh.viewport, combinedUV: profileCombinedUV });
    return builder.combinedGrid(layout, atlas, planSectionUvs({ layout, atlas, settings, meshMode: 'combined', applyTransforms: true }));
  };
  const sameArray = (a, b, label) => {
    assert.equal(a.length, b.length, label);
    for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]), `${label}[${i}]: ${a[i]} vs ${b[i]}`);
  };

  test("'plan' with identity transforms: atlas layout == 'atlas-pixel-accurate', per-section layout == 'unit' per section (Object.is)", () => {
    const atlasPlan = plan('plan', 'atlas');
    const legacy = new WallMeshBuilder({ ...Strategies.mesh.viewport, combinedUV: 'atlas-pixel-accurate' }).combinedGrid(layout, atlas);
    sameArray(atlasPlan.uvs, legacy.uvs, 'atlas');
    sameArray(atlasPlan.positions, legacy.positions, 'positions');
    const perSection = plan('plan', 'per-section');
    const builder = new WallMeshBuilder(Strategies.mesh.viewport);
    const unit = layout.sections.flatMap((sl) => builder.sectionGrid(sl, { uv: 'unit' }).uvs);
    sameArray(perSection.uvs, unit, 'per-section');
    // each section's island fills exactly 0..1
    for (const r of perSection.sectionRanges) {
      const us = []; const vs = [];
      for (let k = r.vertexStart; k < r.vertexStart + r.vertexCount; k++) { us.push(perSection.uvs[2 * k]); vs.push(perSection.uvs[2 * k + 1]); }
      assert.deepEqual([Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)], [0, 1, 0, 1]);
    }
  });

  test('combined vertex ranges: contiguous, one per section, counts (cols + 1)(rows + 1)', () => {
    const g = plan('plan', 'per-section');
    let start = 0;
    g.sectionRanges.forEach((r, i) => {
      assert.equal(r.vertexStart, start);
      assert.equal(r.vertexCount, (sections[i].panelCols + 1) * (sections[i].panelRows + 1));
      start += r.vertexCount;
    });
    assert.equal(start * 2, g.uvs.length);
  });

  test('sectionUvs equals sectionGrid uvs; panelUvs(…, plan) matches the strip UVs at shared corners; the panel option', () => {
    const builder = new WallMeshBuilder(Strategies.mesh.viewport);
    const sl = layout.sections[1];
    const t = new UvTransform({ rotation: 90, sourceRotated: true, flipV: true, offsetU: 0.125 });
    sl.section.setUvTransform(t);
    const p = planSectionUv(sl, 1, { atlas, settings: new UvSettings(), meshMode: 'panel', applyTransforms: true });
    const uvs = builder.sectionUvs(sl, p);
    sameArray(uvs, builder.sectionGrid(sl, { uv: p }).uvs, 'sectionUvs');
    const cols = sl.section.panelCols;
    for (const panel of sl.panels) {
      const corners = builder.panelUvs(panel, sl, p);
      const vertex = (c, r) => [uvs[2 * (r * (cols + 1) + c)], uvs[2 * (r * (cols + 1) + c) + 1]];
      const expected = [vertex(panel.col, panel.row), vertex(panel.col + 1, panel.row), vertex(panel.col + 1, panel.row + 1), vertex(panel.col, panel.row + 1)];
      corners.forEach((c, k) => sameArray(c, expected[k], `panel ${panel.col},${panel.row} corner ${k}`));
    }
    const identityPlan = planSectionUv(layout.sections[0], 0, { atlas, settings: null, meshMode: 'panel', applyTransforms: true });
    const panel0 = layout.sections[0].panels[3];
    assert.deepEqual(builder.panelUvs(panel0, layout.sections[0], identityPlan), builder.panelUvs(panel0, layout.sections[0]));
    const perPanel = { ...p, panelUvs: 'panel', transform: null, linear: null };
    assert.deepEqual(builder.panelUvs(panel0, layout.sections[0], perPanel), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    sl.section.setUvTransform(UvTransform.identity());
  });
});

describe('PixelMap (04 6.9, 6.10, 4.2)', () => {
  test('pixel-centre round trip and the hover description at (80, 48) of the default wall: C2, LED (16, 16)', () => {
    const s = sec();
    for (const [px, py] of [[0, 0], [159, 95], [80, 48], [31, 64]]) {
      const [u, v] = pixelCenterToBaseUv(s, px, py);
      const back = baseUvToPixel(s, u, v);
      assert.deepEqual([back.px, back.pyTop], [px, py]);
    }
    const layout = computeWallLayout([s]);
    const atlas = computeAtlas([s]);
    const [u, v] = pixelCenterToBaseUv(s, 80, 48);
    const d = describeHit({ sl: layout.sections[0], startCol: 0, atlas, entry: atlas.entries[0], plan: null, baseU: u, baseV: v });
    assert.equal(d.label, 'C2');
    assert.deepEqual([d.lx, d.lyTop, d.px, d.pyTop], [16, 16, 80, 48]);
    assert.deepEqual(d.sourcePx, { x: 80, y: 48 });
    assert.deepEqual(panelBaseRect(s, 2, 1), { u0: 2 / 5, v0: 1 / 3, u1: 3 / 5, v1: 2 / 3 });
  });

  test('wallPointFromBaseUv at u = k/cols equals edges[k] within 1e-12 for cols 1..50', () => {
    for (let cols = 1; cols <= 50; cols++) {
      const layout = computeWallLayout([sec({ panelCols: cols, curveIntensity: cols % 7 })]);
      const sl = layout.sections[0];
      for (let k = 0; k <= cols; k++) {
        const p = wallPointFromBaseUv(sl, k / cols, 1);
        assert.ok(Math.abs(p.x - sl.edges[k].x) <= 1e-12 && Math.abs(p.z - sl.edges[k].z) <= 1e-12, `${cols}/${k}`);
        assert.ok(Math.abs(p.y - 3 * sl.panelH) <= 1e-12);
      }
    }
  });

  test('pixelMapJson: per-section pixel maps and the atlas block', () => {
    const sections = [sec(), sec({ id: 1, panelRows: 2, ledX: 64 })];
    const atlas = computeAtlas(sections);
    const json = pixelMapJson(computeWallLayout(sections), atlas, { atlasFile: 'textures/a.png' });
    assert.deepEqual(json.sections[1], { width_led: 320, height_led: 64, atlas_x_led: 160, atlas_y_led: 32, texture_px_per_led: 4, texture_width_px: 1280, texture_height_px: 256 });
    assert.deepEqual(json.atlas, { width_led: 480, height_led: 96, png_px_per_led: 4, png_width_px: 1920, png_height_px: 384, texture_file: 'textures/a.png' });
  });
});

describe('TextureAtlas.sectionTextureScale: the 16 MP viewport budget (04 6.4, UV-7, Q17)', async () => {
  const { sectionTextureScale } = await import('../../js/geometry/TextureAtlas.js');
  const { CONFIGS } = await import('../regression/configs.mjs');
  const fromConfig = (c) => c.sections.map((s) => ({ panelCols: s.panel.columns, panelRows: s.panel.rows, ledX: s.led_resolution.x, ledY: s.led_resolution.y }));

  test('unchanged for every harness wall but large_wall; large_wall drops from 3 to 2 px/LED (13,107,200 px)', () => {
    assert.deepEqual(sectionTextureScale([sec()]), { scales: [4], reduced: false, pxPerLed: null });
    for (const [key, config] of Object.entries(CONFIGS)) {
      const r = sectionTextureScale(fromConfig(config));
      if (key === 'large_wall') {
        assert.deepEqual(r, { scales: [2, 2, 2, 2], reduced: true, pxPerLed: 2 });
        assert.equal(4 * 1280 * 640 * 2 * 2, 13107200);
      } else {
        assert.equal(r.reduced, false, key);
      }
    }
  });

  test('a 25,600 x 10,240 LED section gets a fractional scale within the budget', () => {
    const r = sectionTextureScale([{ panelCols: 200, panelRows: 80, ledX: 128, ledY: 128 }]);
    assert.equal(r.reduced, true);
    assert.ok(r.pxPerLed < 1 && r.pxPerLed > 0);
    assert.ok(25600 * 10240 * r.pxPerLed ** 2 <= 16777216 * (1 + 1e-12));
  });
});
