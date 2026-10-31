// Unit tests for the per-vertex UV edits (the owner's request of 2026-10-31) and the fixed-size viewer: UvVertexEdits and
// WallSection.uvVertexEdits, the UvMapper vertex maths (sectionGridUv, vertexDeltaAt, warp / unwarp, uvDeltaToBase), the
// builder and PixelMap consumers, the selection helpers of UvViewModel and UVCanvas, UvController's vertex use cases
// (drag, fields, resets, undo, the grid-size change) and the readout / chip reserve of css/features/uv-viewer.css.
// Run: node --test tests/unit/uv-vertex-edits.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { EventBus } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { UvTransform, UvVertexEdits } from '../../js/domain/UvSettings.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { computeAtlas, sectionTextureScale } from '../../js/geometry/TextureAtlas.js';
import {
  planSectionUv, planSectionUvs, isLedMaskContent, sectionGridUv, applyUv, vertexDeltaAt, warpBaseUv, unwarpBaseUv,
  uvDeltaToBase,
} from '../../js/geometry/UvMapper.js';
import { describeHit } from '../../js/geometry/PixelMap.js';
import { WallMeshBuilder } from '../../js/geometry/WallMeshBuilder.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { UvController } from '../../js/app/UvController.js';
import { UvViewModel, mergeSelection, gridOutline } from '../../js/app/UvViewModel.js';
import { GltfExporter } from '../../js/io/GltfExporter.js';
import { Brand } from '../../js/theme/Theme.js';
import { UvFallbackHistory } from '../../js/app/UvFallbackHistory.js';
import { nearestPoint, pointsInBox } from '../../js/ui/UVCanvas.js';
import { readoutText } from '../../js/ui/UVViewer.js';

const section = (id, name, cols, rows) => new WallSection({
  id, name, panelCols: cols, panelRows: rows, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
  curveIntensity: 0, angleOffset: 0, color: '#d9d9d6',
});
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const closePair = (a, b, eps = 1e-12) => { close(a[0], b[0], eps); close(a[1], b[1], eps); };
/** A transform with every part non-trivial (rotated, scaled, flipped, offset, the source rotated). */
const ODD = new UvTransform({ offsetU: 0.1, offsetV: -0.05, scaleU: 0.8, scaleV: 1.25, rotation: 30, flipU: true, sourceRotated: true });

describe('UvVertexEdits and WallSection.uvVertexEdits', () => {
  test('sparse deltas: set, add, a zero delta removes, the rule clamps and drops round-off, keys sorted', () => {
    const e = new UvVertexEdits(4, 2);
    assert.equal(e.key(1, 1), 6);
    assert.deepEqual(e.colRow(6), [1, 1]);
    e.set(6, 0.05, -0.02);
    e.add(6, 0.01, 0);
    closePair(e.get(6), [0.06, -0.02], 1e-15);
    e.set(0, 99, 'x');
    assert.deepEqual([...e.get(0)], [8, 0]);
    e.add(0, -8, 1e-13);
    assert.equal(e.get(0), undefined, 'back to zero (round-off below 1e-12 included) removes the vertex');
    e.set(14, 0.1, 0);
    assert.deepEqual(e.keys(), [6, 14]);
    assert.throws(() => e.set(15, 1, 1), RangeError);
    assert.ok(Object.isFrozen(e.get(6)));
  });

  test('clone is independent; equals compares grid and deltas; null equals an empty map', () => {
    const e = new UvVertexEdits(2, 2);
    e.set(4, 0.1, 0.2);
    const c = e.clone();
    c.set(4, 0, 0);
    assert.deepEqual([...e.get(4)], [0.1, 0.2]);
    assert.ok(!e.equals(c));
    assert.ok(c.equals(null));
    assert.ok(e.equals(e.clone()));
    const other = new UvVertexEdits(3, 2);
    other.set(4, 0.1, 0.2);
    assert.ok(!e.equals(other), 'another grid size');
    assert.ok(e.matches(2, 2) && !e.matches(3, 2));
  });

  test('a section stores a copy (null for none or empty); a {...section} copy has no edits', () => {
    const s = section(1, 'Main', 4, 2);
    assert.equal(s.uvVertexEdits, null);
    const e = new UvVertexEdits(4, 2);
    e.set(6, 0.05, 0);
    s.setUvVertexEdits(e);
    assert.notEqual(s.uvVertexEdits, e);
    e.set(6, 0, 0);
    assert.deepEqual([...s.uvVertexEdits.get(6)], [0.05, 0]);
    assert.equal(new WallSection({ ...s }).uvVertexEdits, null);
    s.setUvVertexEdits(new UvVertexEdits(4, 2));
    assert.equal(s.uvVertexEdits, null);
  });
});

describe('UvMapper: base-space vertex deltas under the transform', () => {
  const s = section(1, 'Main', 4, 2);
  const W = 4 * 32;
  const H = 2 * 32;
  const layoutOf = (sec, meshMode = 'section') => {
    const p = Project.createDefault();
    p.wall.replaceAll([sec]);
    p.meshMode = meshMode;
    return { project: p, layout: layoutProject(p) };
  };

  test('uv = T(base + delta): the deltas survive any island transform (move, scale, rotate, flip)', () => {
    const e = new UvVertexEdits(4, 2);
    e.set(e.key(1, 1), 0.05, -0.02);
    s.setUvVertexEdits(e);
    for (const t of [UvTransform.identity(), new UvTransform({ offsetU: 0.25 }), ODD, new UvTransform({ rotation: 90, scaleU: 2 })]) {
      s.setUvTransform(t);
      const { layout } = layoutOf(s);
      const plan = planSectionUv(layout.sections[0], 0, { meshMode: 'section', applyTransforms: true });
      assert.equal(plan.deltas, s.uvVertexEdits);
      closePair(sectionGridUv(plan, 1, 1, 4, 2), applyUv(t, W, H, 0.25 + 0.05, 0.5 - 0.02));
      closePair(sectionGridUv(plan, 2, 1, 4, 2), applyUv(t, W, H, 0.5, 0.5), 0);
    }
    s.setUvTransform(UvTransform.identity());
    s.setUvVertexEdits(null);
  });

  test('every grid consumer: builder strips, the four panels sharing the vertex, OBJ-style plans; per-panel and LED-mask plans ignore the edits', () => {
    const sec = section(1, 'Main', 4, 2);
    sec.setUvTransform(ODD);
    const e = new UvVertexEdits(4, 2);
    const key = e.key(2, 1);
    e.set(key, -0.03, 0.04);
    sec.setUvVertexEdits(e);
    const expected = applyUv(ODD, W, H, 0.5 - 0.03, 0.5 + 0.04);
    const builder = new WallMeshBuilder(Strategies.mesh.gltf);
    const { layout } = layoutOf(sec);
    const sl = layout.sections[0];
    const plan = planSectionUv(sl, 0, { meshMode: 'section', applyTransforms: true });
    const uvs = builder.sectionUvs(sl, plan);
    closePair([uvs[2 * key], uvs[2 * key + 1]], expected);
    assert.deepEqual(builder.sectionGrid(sl, { uv: plan }).uvs, uvs);
    // panel mode: the corner of each of the four panels around vertex (2, 1)
    const panelLayout = layoutOf(sec, 'panel').layout.sections[0];
    const pplan = planSectionUv(panelLayout, 0, { meshMode: 'panel', applyTransforms: true });
    const corners = { '1,0': 2, '2,0': 3, '1,1': 1, '2,1': 0 };   // panel (col,row) -> corner index BL, BR, TR, TL
    for (const [pos, k] of Object.entries(corners)) {
      const [col, row] = pos.split(',').map(Number);
      const panel = panelLayout.panels.find((p) => p.col === col && p.row === row);
      closePair(builder.panelUvs(panel, panelLayout, pplan)[k], expected);
    }
    // per-panel UVs and LED-mask content: no deltas
    assert.equal(planSectionUv(panelLayout, 0, { meshMode: 'panel', settings: { panelUvs: 'panel' }, applyTransforms: true }).deltas, null);
    assert.equal(planSectionUv(sl, 0, { meshMode: 'section', applyTransforms: false }).deltas, null);
    // edits made for another grid size are ignored
    sec.setUvVertexEdits(new UvVertexEdits(3, 2));
    const stale = new UvVertexEdits(3, 2);
    stale.set(1, 0.1, 0.1);
    sec.setUvVertexEdits(stale);
    assert.equal(planSectionUv(sl, 0, { meshMode: 'section', applyTransforms: true }).deltas, null);
  });

  test('without edits every plan is bit-identical to the plain grid (the identity fast path included)', () => {
    const sec = section(1, 'Main', 3, 2);
    const { layout } = layoutOf(sec);
    const builder = new WallMeshBuilder(Strategies.mesh.gltf);
    const plan = planSectionUv(layout.sections[0], 0, { meshMode: 'section', applyTransforms: true });
    assert.equal(plan.deltas, null);
    assert.deepEqual(builder.sectionUvs(layout.sections[0], plan), builder.sectionUvs(layout.sections[0], null));
  });

  test('vertexDeltaAt equals the vertex deltas at the vertices and interpolates over the BL-TR triangles; unwarp inverts warp', () => {
    const e = new UvVertexEdits(2, 1);
    e.set(e.key(1, 0), 0.1, 0);
    e.set(e.key(1, 1), 0, 0.2);
    closePair(vertexDeltaAt(e, 0.5, 0), [0.1, 0]);
    closePair(vertexDeltaAt(e, 0.5, 1), [0, 0.2]);
    closePair(vertexDeltaAt(e, 0, 0), [0, 0]);
    // cell 0 lower-right triangle at (fu, fv) = (1, 0.5): BR 0.5, TR 0.5
    closePair(vertexDeltaAt(e, 0.5, 0.5), [0.05, 0.1]);
    for (const [u, v] of [[0.1, 0.2], [0.45, 0.9], [0.7, 0.3], [0.99, 0.01]]) {
      const w = warpBaseUv(e, u, v);
      closePair(unwarpBaseUv(e, w[0], w[1]), [u, v], 1e-9);
    }
    assert.equal(unwarpBaseUv(e, 5, 5), null);
    assert.deepEqual(unwarpBaseUv(null, 0.3, 0.4), [0.3, 0.4]);
  });

  test('uvDeltaToBase inverts the linear part: a canvas drag moves the vertex UV by exactly the drag', () => {
    for (const t of [ODD, new UvTransform({ rotation: -90, scaleV: 0.5, flipV: true, sourceRotated: true }), UvTransform.identity()]) {
      const [bu, bv] = uvDeltaToBase(t, W, H, 0.013, -0.027);
      const a = applyUv(t, W, H, 0.3, 0.6);
      const b = applyUv(t, W, H, 0.3 + bu, 0.6 + bv);
      closePair([b[0] - a[0], b[1] - a[1]], [0.013, -0.027], 1e-12);
    }
    assert.deepEqual(uvDeltaToBase(null, W, H, 0.5, 0.25), [0.5, 0.25]);
  });

  test('describeHit at an edited vertex reads the exported UV', () => {
    const sec = section(1, 'Main', 4, 2);
    sec.setUvTransform(ODD);
    const e = new UvVertexEdits(4, 2);
    e.set(e.key(1, 1), 0.05, -0.02);
    sec.setUvVertexEdits(e);
    const { layout } = layoutOf(sec);
    const atlas = computeAtlas([sec]);
    const plan = planSectionUv(layout.sections[0], 0, { atlas, meshMode: 'section', applyTransforms: true });
    const d = describeHit({ sl: layout.sections[0], startCol: 0, atlas, entry: atlas.entries[0], plan, baseU: 0.25, baseV: 0.5 });
    closePair([d.finalU, d.finalV], sectionGridUv(plan, 1, 1, 4, 2));
  });
});

describe('selection helpers', () => {
  test('mergeSelection: replace, add, toggle, remove; sorted and unique; junk keys ignored', () => {
    assert.deepEqual(mergeSelection([1, 2], [5, 3, 3], 'replace'), [3, 5]);
    assert.deepEqual(mergeSelection([1, 2], [3, 1], 'add'), [1, 2, 3]);
    assert.deepEqual(mergeSelection([1, 2], [2, 4], 'toggle'), [1, 4]);
    assert.deepEqual(mergeSelection([1, 2, 3], [2, 9], 'remove'), [1, 3]);
    assert.deepEqual(mergeSelection([], [-1, 1.5, 'a', 0], 'add'), [0]);
  });

  test('nearestPoint picks the nearest within the radius; pointsInBox takes corners in any order, edges included', () => {
    const pts = [[0, 0], [10, 0], [6, 1], [100, 100]];
    assert.equal(nearestPoint(pts, 7, 0, 8), 2);
    assert.equal(nearestPoint(pts, 50, 50, 8), -1);
    assert.deepEqual(pointsInBox(pts, 10, 1, 0, 0), [0, 1, 2]);
    assert.deepEqual(pointsInBox(pts, 6, -5, 120, 120), [1, 2, 3]);
  });
});

/** A one-section wall, the controller with the real view model and history, a fake view and wall controller. */
function setup() {
  const project = Project.createDefault();
  project.wall.replaceAll([section(1, 'Main', 4, 2)]);
  project.meshMode = 'section';
  const bus = new EventBus();
  const data = [];
  bus.on('uv:dataChanged', (p) => data.push(p.data));
  const frames = [];
  const updates = [];
  const view = { updateSectionUvs: (id, plan) => { updates.push(plan); return true; }, resolveHit: (h) => h, panelCornersWorld: () => null };
  const history = new UvFallbackHistory({ now: () => 0 });
  const viewModel = new UvViewModel({
    project, bus, panelIds: { sectionCanvas: () => null, atlasCanvas: () => null }, ledTiles: { tileCanvas: () => null },
  });
  let uv = null;
  const runRebuild = (cause = 'edit') => {
    const layout = layoutProject(project);
    const sections = layout.sections.map((sl) => sl.section);
    const atlas = computeAtlas(sections);
    const plans = planSectionUvs({ layout, atlas, settings: project.uv, meshMode: project.meshMode,
      applyTransforms: !isLedMaskContent(project.display.content) });
    uv.onWallRebuilt({ layout, atlas, plans, sectionScale: sectionTextureScale(sections), cause });
  };
  const wallController = { rebuild: () => runRebuild(), setPanelIds: () => {} };
  uv = new UvController({ project, wallController, view, viewModel, history, bus, raf: (fn) => frames.push(fn), maxTextureSize: () => 16384 });
  runRebuild('init');
  uv.openViewer(1);
  uv.setEditMode('vertices');
  const flush = () => frames.splice(0).forEach((fn) => fn());
  return { project, uv, viewModel, history, updates, data, flush, runRebuild, main: () => project.wall.sections[0], last: () => data[data.length - 1] };
}

describe('UvController: the Vertices mode', () => {
  test('a vertex drag moves the selection in base space, snaps to source pixels, is one undo step and live', () => {
    const s = setup();
    const sec = s.main();
    sec.setUvTransform(new UvTransform({ rotation: 90, sourceRotated: true }));   // a pure quarter turn (128 x 64 -> 64 x 128 source)
    s.uv.selectVertices([6, 7], 'replace');
    assert.deepEqual(s.viewModel.selection, [6, 7]);
    assert.ok(s.uv.beginVertexDrag(1, 6, [0.5, 0.5]));
    s.uv.updateVertexDrag([0.5 + 3.4 / 64, 0.5]);   // 3.4 source px along u: snaps to 3
    assert.ok(s.uv.dragging);
    s.uv.endVertexDrag();
    const e = sec.uvVertexEdits;
    assert.deepEqual(e.keys(), [6, 7]);
    const W = 128;
    const H = 64;
    const moved = applyUv(sec.uvTransform, W, H, 0.25 + e.get(6)[0], 0.5 + e.get(6)[1]);
    const start = applyUv(sec.uvTransform, W, H, 0.25, 0.5);
    closePair([moved[0] - start[0], moved[1] - start[1]], [3 / 64, 0], 1e-12);
    assert.ok(s.updates.at(-1).deltas, 'the live plan carries the edits');
    assert.equal(s.history.undoLabel, 'UV vertex drag (Main)');
    // the island transform changes and the edits stay in base space
    s.uv.applyPreset(1, 'fit');
    assert.deepEqual(sec.uvVertexEdits.keys(), [6, 7]);
    s.uv.undo();
    s.uv.undo();
    assert.equal(sec.uvVertexEdits, null);
    s.uv.redo();
    assert.deepEqual(sec.uvVertexEdits.keys(), [6, 7]);
  });

  test('Shift drags a tenth of the pointer travel without snapping; Escape (cancelVertexDrag) restores; Alt is free', () => {
    const s = setup();
    s.uv.selectVertices([6], 'replace');
    s.uv.beginVertexDrag(1, 6, [0.25, 0.5]);
    s.uv.updateVertexDrag([0.35, 0.5], { shift: true });
    close(s.main().uvVertexEdits.get(6)[0], 0.01);
    assert.ok(s.uv.cancelVertexDrag());
    assert.equal(s.main().uvVertexEdits, null);
    assert.equal(s.history.canUndo, false);
    s.uv.beginVertexDrag(1, 6, [0.25, 0.5]);
    s.uv.updateVertexDrag([0.25 + 0.3 / 128, 0.5], { alt: true });
    s.uv.endVertexDrag();
    close(s.main().uvVertexEdits.get(6)[0], 0.3 / 128);
  });

  test('the vertex fields: one vertex moves to the value, several by the centroid difference; resets; one entry each', () => {
    const s = setup();
    s.uv.selectVertices([6], 'replace');
    s.uv.setVertexUv(1, 'u', 0.3);
    s.flush();
    closePair(s.last().vertices.selectionUv, [0.3, 0.5]);
    s.uv.selectVertices([6, 7], 'replace');   // vertices (1, 1) and (2, 1): centroid u = (0.3 + 0.5) / 2
    s.uv.setVertexUv(1, 'v', 0.6);
    s.flush();
    const d = s.last();
    closePair(d.vertices.selectionUv, [0.4, 0.6]);
    assert.deepEqual(d.vertices.edited, [6, 7]);
    assert.ok(d.notices.some((n) => n.text === '▲ Resampled · 2 edited vertices'));
    s.uv.selectVertices([7], 'replace');
    s.uv.resetSelectedVertices(1);
    assert.deepEqual(s.main().uvVertexEdits.keys(), [6]);
    s.uv.resetAllVertexEdits(1);
    assert.equal(s.main().uvVertexEdits, null);
    assert.equal(s.history.undoLabel, 'UV reset vertex edits (Main)');
    s.uv.selectAllVertices();
    assert.equal(s.viewModel.selection.length, 15);
    assert.ok(s.uv.clearVertexSelection());
    assert.ok(!s.uv.clearVertexSelection());
  });

  test('a grid-size change clears the edits with a notice and drops their history states', () => {
    const s = setup();
    s.uv.selectVertices([6], 'replace');
    s.uv.setVertexUv(1, 'u', 0.3);
    assert.ok(s.history.canUndo);
    s.main().panelCols = 5;
    s.runRebuild();
    assert.equal(s.main().uvVertexEdits, null);
    assert.equal(s.history.canUndo, false, 'the 4 x 2 vertex entry is gone');
    s.flush();
    assert.ok(s.last().notices.some((n) => n.text === 'ⓘ Vertex edits cleared: the grid changed from 4×2 to 5×2 panels'));
    assert.deepEqual(s.last().vertices.selection, []);
    // the next vertex edit drops the notice
    s.uv.selectVertices([1], 'replace');
    s.uv.setVertexUv(1, 'v', 0.1);
    s.flush();
    assert.ok(!s.last().notices.some((n) => n.text.startsWith('ⓘ Vertex edits cleared')));
  });

  test('the canvas hover reads through the edited grid (probeUv inverts the edits)', () => {
    const s = setup();
    const hovers = [];
    s.viewModel.publishHover = (source, hit) => hovers.push(hit);
    s.uv.selectVertices([6], 'replace');
    s.uv.setVertexUv(1, 'u', 0.35);   // vertex (1, 1) moved from u 0.25 to 0.35
    s.uv.probeUv(1, 0.35, 0.5);
    const h = hovers.at(-1);
    close(h.baseU, 0.25, 1e-9);
    close(h.baseV, 0.5, 1e-9);
    close(h.viewU, 0.35, 1e-9);
  });
});

describe('the fixed-size viewer: readout and chip reserve', () => {
  const css = fs.readFileSync(new URL('../../css/features/uv-viewer.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const m = css.match(new RegExp(`\\n${sel.replace('.', '\\.')} \\{([^}]*)\\}`));
    assert.ok(m, sel);
    return m[1];
  };

  test('the readout reserves three fixed lines (no min-height, clipped, no wrapping) and readoutText has three lines', () => {
    const r = rule('.uv-readout');
    assert.match(r, /\bheight: 39px;/);
    assert.match(r, /line-height: 13px;/);
    assert.match(r, /overflow: hidden;/);
    assert.match(r, /white-space: pre;/);
    assert.match(r, /flex-shrink: 0;/);
    assert.doesNotMatch(r, /min-height/);
    const text = readoutText({ name: 'A very long section name', label: 'A1', col: 0, row: 0, lx: 1, lyTop: 2, ledX: 32, ledY: 32,
      px: 3, pyTop: 4, W: 160, H: 96, gx: 5, gy: 6, baseU: 0.5, baseV: 0.25, finalU: 0.5, finalV: 0.25 });
    assert.equal(text.split('\n').length, 3);
  });

  test('the status chips reserve a fixed height and scroll; the mode panes share one grid cell', () => {
    const r = rule('.uv-status');
    assert.match(r, /\bheight: 34px;/);
    assert.match(r, /overflow-y: auto;/);
    assert.match(rule('.uv-swap__pane'), /grid-area: 1 \/ 1;/);
    assert.match(css, /\.uv-swap__pane\[data-inactive\] \{\s*visibility: hidden;/);
  });
});

describe('UV2 · Combined canvas: the viewer shows exactly the exported TEXCOORD_1', () => {
  const hex = (c) => ({ r: parseInt(c.slice(1, 3), 16) / 255, g: parseInt(c.slice(3, 5), 16) / 255, b: parseInt(c.slice(5, 7), 16) / 255 });
  const floats = (doc, a) => {
    const accessor = doc.accessors[a];
    const view = doc.bufferViews[accessor.bufferView];
    const bytes = Buffer.from(doc.buffers[0].uri.split(',')[1], 'base64');
    const n = accessor.count * 2;
    return Array.from(new Float32Array(bytes.buffer.slice(bytes.byteOffset + view.byteOffset, bytes.byteOffset + view.byteOffset + 4 * n)));
  };

  test('islands in wall order at u1 = (x_i + u0 w_i) / W, v1 = v0 h_i / W, edits and transform included; the strip and the outline', () => {
    const project = Project.createDefault();
    project.wall.replaceAll([section(1, 'Left', 5, 3), section(2, 'Right', 2, 2)]);   // 160 x 96 and 64 x 64: W = 224
    project.meshMode = 'section';
    const right = project.wall.sections[1];
    right.setUvTransform(new UvTransform({ offsetU: 0.125, scaleU: 0.5, scaleV: 0.5 }));
    const e = new UvVertexEdits(2, 2);
    e.set(e.key(1, 1), 0.1, 0);
    right.setUvVertexEdits(e);
    const bus = new EventBus();
    const out = [];
    bus.on('uv:dataChanged', (pl) => out.push(pl.data));
    const vm = new UvViewModel({ project, bus, panelIds: { sectionCanvas: () => null, atlasCanvas: () => 'ATLAS' }, ledTiles: { tileCanvas: () => null } });
    const layout = layoutProject(project);
    const atlas = computeAtlas(project.wall.sections);
    vm.setOpen(true);
    vm.setSection(2);
    vm.setSpace('canvas');
    vm.refresh({ layout, atlas });
    const cv = out.at(-1).canvasView;
    assert.equal(cv.W, 224);
    close(cv.stripV, 96 / 224);
    assert.equal(cv.canvas, 'ATLAS');
    assert.deepEqual(cv.islands.map((i) => [i.name, i.current]), [['Left', false], ['Right', true]]);
    // the edited vertex (1, 1) of Right: T = 0.5 scale about the centre, offset 0.125 -> u0 = 0.5 + 0.5 * (0.6 - 0.5) + 0.125
    const u0 = 0.5 + 0.5 * 0.1 + 0.125;
    close(cv.uvs[2 * 4], (160 + u0 * 64) / 224);
    close(cv.uvs[2 * 4 + 1], (0.5 * 64) / 224);
    closePair(cv.islands[0].outline[0], [0, 0]);
    closePair(gridOutline([0, 0, 1, 0, 0, 1, 1, 1], 1, 1)[2], [1, 1], 0);
    assert.equal(cv.islands[0].outline.length, 2 * (5 + 3));
    assert.ok(out.at(-1).notices.some((n) => n.text.startsWith('ⓘ UV2 follows UV1 edits')));
    // the exporter writes exactly these values (float32, t = 1 - v), and TEXCOORD_0 carries the edit
    const gltf = new GltfExporter({ brand: Brand, colorToRgb: hex, builder: new WallMeshBuilder(Strategies.mesh.gltf) });
    const doc = gltf.write({ sections: project.wall.sections, meshMode: 'section', layout: layoutProject(project, { frame: 'export' }), uvSettings: project.uv });
    const prim = doc.meshes[1].primitives[0];
    const t1 = floats(doc, prim.attributes.TEXCOORD_1);
    cv.uvs.forEach((x, k) => close(t1[k], k % 2 ? 1 - x : x, 1e-6));
    const t0 = floats(doc, prim.attributes.TEXCOORD_0);
    close(t0[2 * 4], u0, 1e-6);
    // the setting off: UV2 is not exported, the viewer says so
    project.uv.assign({ gltfCanvasTexcoord1: false });
    vm.refresh({ layout, atlas }, { backgroundDirty: false });
    assert.ok(out.at(-1).notices.some((n) => n.text.startsWith('⚠ UV2 is not exported')));
    assert.equal(gltf.write({ sections: project.wall.sections, meshMode: 'section', layout: layoutProject(project, { frame: 'export' }), uvSettings: project.uv })
      .meshes[1].primitives[0].attributes.TEXCOORD_1, undefined);
  });
});
