// Unit tests for spec 04's UV use cases (docs/improvements/04-uvs-uv-editor.md 3.3, 3.4, 5.3, 6.12, 8.1; UV-11, UV-13):
// js/app/UvController.js with the real UvViewModel and UvFallbackHistory (path B), a real EventBus, the real layout of a
// two-section wall, and fakes for the view (records updateSectionUvs), the wall controller (records rebuilds; its
// rebuild runs the P1 observer step) and requestAnimationFrame (a queue flushed by hand).
// Run: node --test tests/unit/uv-controller.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus, Events } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { UvTransform } from '../../js/domain/UvSettings.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { computeAtlas, sectionTextureScale } from '../../js/geometry/TextureAtlas.js';
import { planSectionUvs, isLedMaskContent } from '../../js/geometry/UvMapper.js';
import { UvController } from '../../js/app/UvController.js';
import { UvViewModel } from '../../js/app/UvViewModel.js';
import { UvFallbackHistory } from '../../js/app/UvFallbackHistory.js';

const section = (id, name, cols, rows) => new WallSection({
  id, name, panelCols: cols, panelRows: rows, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
  curveIntensity: 0, angleOffset: 0, color: '#d9d9d6',
});

/** A two-section wall (160 x 96 and 64 x 64 px), the controller and its recorders. */
function setup({ meshMode = 'section' } = {}) {
  const project = Project.createDefault();
  project.wall.replaceAll([section(1, 'Main', 5, 3), section(2, 'Side', 2, 2)]);
  project.meshMode = meshMode;
  const bus = new EventBus();
  const events = [];
  for (const key of ['UV_VIEWER_CHANGED', 'UV_DATA_CHANGED', 'UV_TRANSFORM_CHANGED', 'UV_HOVER_CHANGED', 'UV_SETTINGS_CHANGED']) {
    bus.on(Events[key], (p) => events.push([key, p]));
  }
  const frames = [];
  const raf = (fn) => frames.push(fn);
  const flush = () => frames.splice(0).forEach((fn) => fn());
  const updates = [];
  const view = {
    updateSectionUvs: (id, plan) => { updates.push([id, plan]); return true; },
    resolveHit: (hit) => hit,
    panelCornersWorld: () => null,
  };
  let maxReads = 0;
  const history = new UvFallbackHistory({ now: () => 0 });
  const viewModel = new UvViewModel({
    project, bus,
    panelIds: { sectionCanvas: () => ({ kind: 'canvas' }), atlasCanvas: () => ({ kind: 'atlas' }) },
    ledTiles: { tileCanvas: () => ({ kind: 'tile' }) },
  });
  const rebuilds = [];
  let uv = null;
  const wallController = {
    rebuild: (opts = {}) => { rebuilds.push(opts.cause ?? 'edit'); runRebuild(opts.cause ?? 'edit'); },
    setPanelIds: (on) => { project.display.setPanelIds(on); rebuilds.push('panelIds'); },
  };
  const runRebuild = (cause) => {
    const layout = layoutProject(project);
    const sections = layout.sections.map((sl) => sl.section);
    const atlas = computeAtlas(sections);
    const plans = planSectionUvs({ layout, atlas, settings: project.uv, meshMode: project.meshMode,
      applyTransforms: !isLedMaskContent(project.display.content) });
    uv.onWallRebuilt({ layout, atlas, plans, sectionScale: sectionTextureScale(sections), cause });
  };
  uv = new UvController({
    project, wallController, view, viewModel, history, bus, raf,
    maxTextureSize: () => { maxReads++; return 16384; },
  });
  const count = (key) => events.filter(([k]) => k === key).length;
  return {
    project, bus, events, frames, flush, updates, uv, viewModel, history, rebuilds, runRebuild, count,
    maxReads: () => maxReads, main: () => project.wall.sections[0],
  };
}

describe('UvController: construction and the rebuild observer', () => {
  test('construction reads no renderer: maxTextureSize is read in onWallRebuilt only', () => {
    const s = setup();
    assert.equal(s.maxReads(), 0);
    s.runRebuild('init');
    assert.equal(s.maxReads(), 1);
    assert.equal(s.count('UV_SETTINGS_CHANGED'), 1);
    const settings = s.events.find(([k]) => k === 'UV_SETTINGS_CHANGED')[1];
    assert.deepEqual([settings.atlas.widthLed, settings.atlas.heightLed], [224, 96]);
    assert.equal(s.count('UV_DATA_CHANGED'), 0, 'closed: no data');
  });

  test('openViewer shows the first section; onWallRebuilt moves it to the nearest section after a delete', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.openViewer(2);
    assert.equal(s.viewModel.sectionId, 2);
    assert.equal(s.count('UV_DATA_CHANGED'), 1);
    s.project.wall.removeById(2);
    s.runRebuild('edit');
    assert.equal(s.viewModel.sectionId, 1, 'nearest remaining section by index');
  });

  test('onSectionRenamed refreshes without re-rendering the background; a rebuild drops the cached canvas', () => {
    const s = setup();
    let drawn = 0;
    s.viewModel.refresh(null);
    const vm = new UvViewModel({
      project: s.project, bus: s.bus, ledTiles: { tileCanvas: () => ({}) },
      panelIds: { sectionCanvas: () => { drawn++; return {}; }, atlasCanvas: () => ({}) },
    });
    const layout = layoutProject(s.project);
    const atlas = computeAtlas(layout.sections.map((sl) => sl.section));
    vm.setSection(1);
    vm.setOpen(true);
    vm.refresh({ layout, atlas });
    vm.refresh({ layout, atlas }, { backgroundDirty: false });
    assert.equal(drawn, 1, 'cached between refreshes without backgroundDirty');
    vm.refresh({ layout, atlas }, { backgroundDirty: true });
    assert.equal(drawn, 2, 'a rebuild re-renders it');
  });
});

describe('UvController: live path, fields and drags (6.12, 3.3, 3.4)', () => {
  test('a drag never rebuilds, updates the view once per move and records one entry at its end', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.openViewer(1);
    const before = s.rebuilds.length;
    assert.ok(s.uv.beginDrag(1, 'island', [0.5, 0.5]));
    s.uv.updateDrag([0.6, 0.5]);
    s.uv.updateDrag([0.7, 0.5]);
    s.uv.updateDrag([0.75, 0.5]);
    assert.equal(s.updates.length, 3);
    assert.equal(s.rebuilds.length, before, 'no rebuild during a drag');
    assert.equal(s.history.canUndo, false, 'no entry before the end');
    s.uv.endDrag();
    assert.equal(s.history.undoLabel, 'UV drag (Main)');
    assert.equal(s.main().uvTransform.offsetU, Math.round(0.25 * 160) / 160);
    s.uv.undo();
    assert.ok(s.main().uvTransform.isIdentity);
  });

  test('cancelDrag restores the start transform and records nothing', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.beginDrag(1, 'br', [1, 0]);
    s.uv.updateDrag([0.8, 0.2]);
    assert.ok(!s.main().uvTransform.isIdentity);
    assert.equal(s.uv.cancelDrag(), true);
    assert.ok(s.main().uvTransform.isIdentity);
    assert.equal(s.history.canUndo, false);
  });

  test('five previews then a commit give one entry with the field coalesce key; cancelField records nothing', () => {
    const s = setup();
    s.runRebuild('init');
    for (const raw of ['0', '0.', '0.1', '0.12', '0.125']) s.uv.previewField(1, 'offsetU', raw);
    assert.equal(s.history.canUndo, false, 'previews record nothing');
    assert.equal(s.main().uvTransform.offsetU, 0.125);
    const stored = s.uv.commitField(1, 'offsetU', '0.125');
    assert.equal(stored.offsetU, 0.125);
    assert.equal(s.history.undoLabel, 'UV Offset U (Main)');
    s.uv.undo();
    assert.equal(s.main().uvTransform.offsetU, 0);
    assert.equal(s.history.canUndo, false, 'exactly one entry');
    s.uv.previewField(1, 'rotation', '45');
    s.uv.cancelField(1);
    assert.ok(s.main().uvTransform.isIdentity);
    assert.equal(s.history.canUndo, false);
  });

  test('a negative scale preview toggles the flip once, however often it is previewed (derived from the before-state)', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.previewField(1, 'scale', -0.5);
    s.uv.previewField(1, 'scale', -0.5);
    assert.deepEqual([s.main().uvTransform.flipU, s.main().uvTransform.flipV, s.main().uvTransform.scaleU], [true, true, 0.5]);
  });

  test('repeated spinner commits within 750 ms coalesce into one entry', () => {
    let now = 0;
    const history = new UvFallbackHistory({ now: () => now });
    history.record('UV Rotate (Main)', { kind: 'transforms', before: [{ id: 1, t: new UvTransform() }], after: [{ id: 1, t: new UvTransform({ rotation: 1 }) }] }, { coalesceKey: 'uv:1:rotation' });
    now = 500;
    history.record('UV Rotate (Main)', { kind: 'transforms', before: [{ id: 1, t: new UvTransform({ rotation: 1 }) }], after: [{ id: 1, t: new UvTransform({ rotation: 2 }) }] }, { coalesceKey: 'uv:1:rotation' });
    now = 2000;
    history.record('UV Rotate (Main)', { kind: 'transforms', before: [{ id: 1, t: new UvTransform({ rotation: 2 }) }], after: [{ id: 1, t: new UvTransform({ rotation: 3 }) }] }, { coalesceKey: 'uv:1:rotation' });
    const last = history.undo();
    assert.equal(last.after[0].t.rotation, 3);
    const first = history.undo();
    assert.deepEqual([first.before[0].t.rotation, first.after[0].t.rotation], [0, 2], 'coalesced: first before, last after');
    assert.equal(history.canUndo, false);
  });

  test('N live updates within one animation frame give one viewer refresh', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.openViewer(1);
    const data0 = s.count('UV_DATA_CHANGED');
    s.uv.beginDrag(1, 'rotate', [0.5, 1.2]);
    for (let k = 1; k <= 6; k++) s.uv.updateDrag([0.5 - 0.05 * k, 1.2]);
    assert.equal(s.count('UV_DATA_CHANGED'), data0, 'nothing before the frame');
    s.flush();
    assert.equal(s.count('UV_DATA_CHANGED'), data0 + 1);
    assert.equal(s.count('UV_TRANSFORM_CHANGED'), 6, 'one transform event per move');
  });

  test('the buttons record exactly one entry each, Copy to all included', () => {
    const s = setup();
    s.runRebuild('init');
    const labels = [];
    const step = (fn) => { fn(); labels.push(s.history.undoLabel); };
    step(() => s.uv.toggleFlip(1, 'u'));
    step(() => s.uv.turnFeed(1, 1));
    step(() => s.uv.setSourceRotated(1, false));
    step(() => s.uv.applyPreset(1, 'fit'));
    step(() => s.uv.applyPreset(1, 'pixel'));
    step(() => s.uv.copyToAll(1));
    step(() => s.uv.applyPreset(1, 'reset'));
    assert.deepEqual(labels, ['UV flip U (Main)', 'UV turn feed (Main)', 'UV source (Main)', 'UV Fit 0–1 (Main)',
      'UV Pixel-accurate (Main)', 'UV copy to all', 'UV Reset (Main)']);
    let n = 0;
    while (s.history.canUndo) { s.history.undo(); n++; }
    assert.equal(n, 7);
  });

  test('Copy to all re-fits a Fit result per section and copies other transforms verbatim', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.applyPreset(1, 'fit');
    s.uv.turnFeed(1, 1);
    s.uv.applyPreset(1, 'fit');
    s.uv.copyToAll(1);
    const side = s.project.wall.sections[1].uvTransform;
    assert.equal(side.rotation, 90);
    assert.equal(side.scaleU, 1, 'a square section fits 0..1 exactly at a quarter turn');
    s.uv.commitField(1, 'offsetU', '0.2');
    s.uv.copyToAll(1);
    assert.equal(s.project.wall.sections[1].uvTransform.offsetU, 0.2);
  });

  test('undo and redo cancel an open drag or field session first', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.toggleFlip(1, 'v');
    s.uv.beginDrag(1, 'island', [0.5, 0.5]);
    s.uv.updateDrag([0.9, 0.5]);
    s.uv.undo();
    assert.equal(s.uv.dragging, false);
    assert.ok(s.main().uvTransform.isIdentity, 'the drag was cancelled and the flip undone');
    s.uv.redo();
    s.uv.previewField(1, 'offsetV', '0.3');
    s.uv.undo();
    assert.ok(s.main().uvTransform.isIdentity, 'the preview was cancelled and the flip undone again');
  });
});

describe('UvController: observers and settings', () => {
  test('the selection observer follows kind "section" unless pinned and ignores the rest', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.openViewer(1);
    s.uv.onSelectionChanged({ kind: 'camera', primary: { id: 'camera' } });
    s.uv.onSelectionChanged({ kind: null, primary: null });
    assert.equal(s.viewModel.sectionId, 1);
    s.uv.onSelectionChanged({ kind: 'section', primary: { sectionId: 2 } });
    assert.equal(s.viewModel.sectionId, 2);
    s.uv.setPinned(true);
    s.uv.onSelectionChanged({ kind: 'section', primary: { sectionId: 1 } });
    assert.equal(s.viewModel.sectionId, 2);
  });

  test('settings rebuild iff the active mesh mode uses them, record one entry and undo', () => {
    const s = setup({ meshMode: 'section' });
    s.runRebuild('init');
    s.uv.setCombinedLayout('atlas');
    assert.deepEqual(s.rebuilds, [], 'Section mode does not use the combined layout');
    assert.equal(s.project.uv.combinedLayout, 'atlas');
    s.project.meshMode = 'combined';
    s.uv.setCombinedLayout('per-section');
    assert.deepEqual(s.rebuilds, ['edit']);
    s.uv.setGltfCanvasTexcoord1(false);
    assert.equal(s.project.uv.gltfCanvasTexcoord1, false);
    assert.deepEqual(s.rebuilds, ['edit'], 'export-only');
    s.uv.undo();
    assert.equal(s.project.uv.gltfCanvasTexcoord1, true);
    s.uv.undo();
    assert.equal(s.project.uv.combinedLayout, 'atlas');
    assert.deepEqual(s.rebuilds, ['edit', 'edit']);
  });

  test('an import clears the UV history; a delete prunes the deleted section from a Copy to all entry', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.toggleFlip(1, 'u');
    s.uv.copyToAll(1);
    s.project.wall.removeById(2);
    s.runRebuild('edit');
    assert.equal(s.history.undoLabel, 'UV flip U (Main)', 'the copy entry held only the deleted section');
    s.runRebuild('import');
    assert.equal(s.history.canUndo, false);
  });

  test('showPanelIds turns panel IDs on through the wall controller', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.showPanelIds();
    assert.equal(s.project.display.content, 'panelIds');
  });

  test('a wall double-click opens the viewer on the hit section', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.onWallDoubleClick({ sectionId: 2, sectionIndex: 1, col: 0, row: 0, baseU: 0.5, baseV: 0.5, panelCorners3D: null });
    assert.equal(s.viewModel.open, true);
    assert.equal(s.viewModel.sectionId, 2);
  });

  test('the hover readout describes the hit pixel (6.9): the default wall centre pixel (80, 48) is C2', () => {
    const s = setup();
    s.runRebuild('init');
    s.uv.openViewer(1);
    s.uv.onWallHover({ sectionId: 1, sectionIndex: 0, col: 2, row: 1, baseU: 80.5 / 160, baseV: 1 - 48.5 / 96, panelCorners3D: null });
    const hover = s.events.filter(([k]) => k === 'UV_HOVER_CHANGED').pop()[1];
    assert.equal(hover.source, 'wall');
    assert.deepEqual([hover.hit.label, hover.hit.px, hover.hit.pyTop, hover.hit.lx, hover.hit.lyTop], ['C2', 80, 48, 16, 16]);
    s.uv.closeViewer();
    assert.equal(s.events.filter(([k]) => k === 'UV_HOVER_CHANGED').pop()[1].hit, null);
  });
});
