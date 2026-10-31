// Unit tests of app/ProjectSession (spec 07 5.5.2, D5): the apply order (AC 59), the wall scope, the view-only values
// of undo and redo, the re-selection rule (02 CR-07-d), the feature hook map (C41), the dirty and pristine-new flags and
// the import report. Collaborators are fakes that write the model as the real controllers do and record their calls.
// Run: node --test tests/unit/session.test.mjs   (zero dependencies)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus, Events } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { sectionsFromProject, stateFromProject } from '../../js/io/ProjectSchema.js';
import { ProjectSession, ImportAlerts } from '../../js/app/ProjectSession.js';
import { AssetStore } from '../../js/app/AssetStore.js';
import { Palette } from '../../js/theme/Theme.js';

const serializer = new ProjectSerializer({ palette: Palette });
const RESET_POSE = { posX: 9, posY: 9, posZ: 9, rotX: 0, rotY: 0, rotZ: 0 };

/** A session over a new project; every collaborator call is pushed to `calls`. */
function rig({ selected = null, pickable = () => true, features = {} } = {}) {
  const project = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
  const calls = [];
  const cine = project.camera;
  const lensAssign = cine.assign.bind(cine);
  cine.assign = (fields) => { if ('focalLength' in fields) calls.push('camera.assign(lens)'); lensAssign(fields); };
  const cameraController = {
    // turning the preview on resets the pose (ARCHITECTURE 6.5 P-PREVIEW), as the real controller does
    setPreviewEnabled: (on) => { calls.push(`setPreviewEnabled ${on}`); cine.enabled = on; if (on) lensAssign(RESET_POSE); },
    applyImportedPose: (pose) => { calls.push('applyImportedPose'); lensAssign(pose); },
    setSafeDistanceEnabled: (on) => { calls.push(`safeDistance ${on}`); project.display.showSafeDistance = on; },
  };
  const prop = (p) => ({ applyImportedPose: (pose) => p.assign(pose), setVisible: (on) => { calls.push(`${p.kind} ${on}`); p.visible = on; } });
  const selection = {
    selectedId: selected,
    deselect() { calls.push('deselect'); this.selectedId = null; },
    find: (id) => ({ id, isPickable: () => pickable(id) }),
    select(id) { calls.push(`select ${id}`); this.selectedId = id; },
  };
  const bus = new EventBus();
  bus.on(Events.PROJECT_REPLACED, (p) => calls.push(`PROJECT_REPLACED ${p.reason} ${p.scope}`));
  const alerts = [];
  const downloads = [];
  const session = new ProjectSession({
    project, serializer, assets: new AssetStore({ logoLoader: { load: async () => ({ ok: false }) } }),
    wallController: { applyPivot: () => calls.push('applyPivot'), rebuild: ({ cause }) => calls.push(`rebuild ${cause}`) },
    cameraController, personController: prop(project.person), carController: prop(project.car),
    pilot: { active: false, toggle: () => calls.push('pilot.toggle') }, selection,
    sceneManager: { toggleGrid: () => { calls.push('toggleGrid'); project.display.showGrid = !project.display.showGrid; } },
    ledTiles: { clearCache: () => {} }, bus, dialogs: { alert: (m) => alerts.push(m) },
    downloader: { saveText: (text, name) => downloads.push(name) }, brand: { files: { json: 'p.json' } },
    win: { FileReader: class { readAsText(file) { this.onload({ target: { result: file.text } }); } } },
    stateFromProject, sectionsFromProject,
    createProject: () => Project.createNew({ defaultSectionColor: Palette.defaultSectionColor }),
    features: { pivot: { hydrate: () => calls.push('pivot hook') }, ...features },
  });
  return { project, calls, session, alerts, downloads, selection };
}

/** A validated v2 object of a project changed by `edit`. */
function v2Of(edit) {
  const p = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
  edit(p);
  const r = serializer.read(JSON.parse(JSON.stringify(serializer.write(p))));
  assert.ok(r.ok);
  return r.project;
}

const POSE = { posX: 2, posY: 1.2, posZ: 4, rotX: 5, rotY: -10, rotZ: 2 };
const posed = (enabled) => v2Of((p) => { p.camera.enabled = enabled; p.camera.assign(POSE); });
const poseOf = (cine) => ({ posX: cine.posX, posY: cine.posY, posZ: cine.posZ, rotX: cine.rotX, rotY: cine.rotY, rotZ: cine.rotZ });

describe('ProjectSession.apply (07 5.5.2)', () => {
  test('AC 59: the lens, then the preview (its reset), then the saved pose, then one rebuild and PROJECT_REPLACED', () => {
    for (const reason of ['open', 'undo', 'restore']) {
      const r = rig();
      r.session.apply(posed(true), { reason });
      assert.deepEqual(poseOf(r.project.camera), POSE, `${reason}: the saved pose survives the preview reset`);
      const order = r.calls.filter((c) => /^(camera\.assign|setPreviewEnabled|applyImportedPose|rebuild|PROJECT_REPLACED)/.test(c));
      assert.deepEqual(order, ['camera.assign(lens)', 'setPreviewEnabled true', 'applyImportedPose', 'rebuild import', `PROJECT_REPLACED ${reason} full`]);
      // saved with the preview off: no preview call, the pose is stored (the controller keeps it for the next enable)
      const off = rig();
      off.session.apply(posed(false), { reason });
      assert.ok(!off.calls.some((c) => c.startsWith('setPreviewEnabled')));
      assert.deepEqual(poseOf(off.project.camera), POSE);
    }
  });

  test('the hook map (C41): hooks run in registration order in step 3, after the wall and before the display, with the context', () => {
    const seen = [];
    const r = rig({ features: { uv: { hydrate: (v, ctx) => seen.push(['uv', v.sections.length, ctx.reason, ctx.scope, ctx.project.display.wireframe]) } } });
    r.session.registerFeature('late', { hydrate: () => seen.push(['late', r.session.applying]) });
    assert.deepEqual(r.session.features, ['pivot', 'uv', 'late']);
    const v = v2Of((p) => { p.display.wireframe = true; p.wall.appendLikeLast(Palette.sectionColors); });
    r.session.apply(v, { reason: 'open' });
    assert.deepEqual(seen, [['uv', 2, 'open', 'full', false], ['late', true]], 'the wall is in place, the display not yet');
    assert.equal(r.project.display.wireframe, true);
    assert.equal(r.calls.indexOf('pivot hook') < r.calls.indexOf('rebuild import'), true);
    assert.throws(() => r.session.registerFeature('bad', {}), TypeError);
    const nested = rig();
    nested.session.registerFeature('again', { hydrate: () => nested.session.apply(v, { reason: 'open' }) });
    assert.throws(() => nested.session.apply(v, { reason: 'open' }), /not re-entrant/);
    assert.equal(nested.session.applying, false, 'reset by the finally');
  });

  test('view-only values: kept live for undo and redo and for the wall scope; a full open applies them', () => {
    const hidden = v2Of((p) => { p.display.showGrid = false; });
    for (const reason of ['undo', 'redo']) {
      const r = rig();
      r.session.apply(hidden, { reason });
      assert.equal(r.project.display.showGrid, true, reason);
      assert.ok(!r.calls.includes('toggleGrid'));
    }
    const open = rig();
    open.session.apply(hidden, { reason: 'open' });
    assert.equal(open.project.display.showGrid, false);
    // the wall scope: only the wall (and the logos, the mesh mode, the hooks), never the display, camera or props
    const wall = rig();
    wall.project.display.showGrid = false;
    wall.project.logos.ensure(0).scale = 0.5;
    wall.session.apply({ sections: [{ name: 'W', id: 4, panel: { columns: 2, rows: 1, width_mm: 500, height_mm: 500 },
      led_resolution: { x: 32, y: 32 }, curvature: { angle_degrees: 0, angle_offset_degrees: 0 }, color: '#00ff66', logo: null }],
    mesh_mode: null }, { reason: 'import', scope: 'wall' });
    assert.deepEqual(wall.calls, ['pivot hook', 'rebuild import', 'PROJECT_REPLACED import wall']);
    assert.equal(wall.project.display.showGrid, false);
    assert.equal(wall.project.logos.get(0), undefined, 'B-L21');
    assert.deepEqual(wall.project.wall.sections.map((s) => s.id), [4]);
    assert.equal(wall.project.meshMode, 'section', 'mesh_mode null keeps the mode');
  });

  test('re-selection (02 CR-07-d): a section id only after undo and redo; static ids after every reason, when pickable', () => {
    const v = v2Of(() => {});
    for (const [reason, kept] of [['undo', true], ['redo', true], ['open', false], ['import', false]]) {
      const r = rig({ selected: 'section:0' });
      r.session.apply(v, { reason });
      assert.equal(r.selection.selectedId, kept ? 'section:0' : null, reason);
      const cam = rig({ selected: 'camera' });
      cam.session.apply(v, { reason });
      assert.equal(cam.selection.selectedId, 'camera', `${reason}: camera`);
    }
    const gone = rig({ selected: 'camera', pickable: () => false });
    gone.session.apply(v, { reason: 'open' });
    assert.equal(gone.selection.selectedId, null, 'a camera that is no longer pickable stays deselected');
  });
});

describe('ProjectSession dirty, isPristineNew, save, new and the report (07 5.5.2)', () => {
  test('setOnSaved runs after a save, once the project is clean (autosave records the saved state)', () => {
    const r = rig();
    const seen = [];
    r.session.setOnSaved(() => seen.push(r.session.dirty));
    r.project.wall.sections[0].setField('panelCols', '7');
    r.session.saveFile();
    assert.deepEqual(seen, [false]);
    r.session.setOnSaved(null);
    r.session.saveFile();
    assert.deepEqual(seen, [false], 'cleared: not called again');
  });

  test('dirty toggles on an edit and clears on save, open and new; isPristineNew until the first edit or an open', async () => {
    const r = rig();
    r.session.newProject();
    assert.deepEqual([r.session.dirty, r.session.isPristineNew], [false, true]);
    r.project.wall.sections[0].setField('panelCols', '7');
    assert.deepEqual([r.session.dirty, r.session.isPristineNew], [true, false]);
    r.session.saveFile();
    assert.deepEqual(r.downloads, ['p.json']);
    assert.equal(r.session.dirty, false);
    r.project.display.wireframe = true;
    assert.equal(r.session.dirty, true);
    r.session.newProject();
    assert.deepEqual([r.session.dirty, r.session.isPristineNew, r.project.display.wireframe], [false, true, false]);
    const text = JSON.stringify(serializer.write(Project.createDefault()));
    assert.equal(await r.session.openFile({ name: 'a.json', size: text.length, text }), true);
    assert.deepEqual([r.session.dirty, r.session.isPristineNew], [false, false]);
    r.project.display.showGrid = false;
    assert.equal(r.session.dirty, false, 'a view-only change is not an edit (the history variant omits it)');
  });

  test('the report: one alert only when there are warnings; budget warnings are notes after the corrections', async () => {
    const r = rig();
    const clean = JSON.stringify(serializer.write(Project.createDefault()));
    await r.session.openFile({ name: 'a.json', size: clean.length, text: clean });
    assert.deepEqual(r.alerts, []);
    const fixed = JSON.stringify({ version: '1.0', sections: [{ name: 'Big', panel: { columns: 50, rows: 1 }, led_resolution: { x: 1000 }, color: 'red' }] });
    await r.session.openFile({ name: 'b.json', size: fixed.length, text: fixed });
    assert.equal(r.alerts.length, 1);
    assert.match(r.alerts[0], /^Imported with 1 correction\(s\):\n• Section 1 "Big": Panel Colour "red" → "#\w{6}"\n\nNote: The wall's panel-ID image needs at least 50000×32 px/);
    assert.equal(ImportAlerts.report([{ severity: 'info', code: 'migrated', message: 'x' }]), null);
  });
});
