// Unit tests of project file v2 (docs/improvements/08-bugfix-roadmap.md 4.6, 6.17, P2-13e; spec 07 4.2-4.7): the writer's
// key order and v1 superset, the validator's v2 path (hostile values clamped, defaulted or dropped; unknown keys
// dropped; idempotence; fidelity over fuzzed projects the app can produce), and the full round trip through
// ProjectIO.#applyV2 over model-level fakes: export -> import -> export gives the identical file, a v1 import stays
// wall-only, and the restore order of 08 6.17.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { EventBus, Events } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { logoAssetId } from '../../js/domain/LogoRules.js';
import { MAX_LOGO_BYTES } from '../../js/domain/rules.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { validateProject } from '../../js/io/ProjectValidator.js';
import { KNOWN_REVISION, REVISIONS, VERSION, sectionsFromProject, stateFromProject } from '../../js/io/ProjectSchema.js';
import { ProjectIO } from '../../js/app/ProjectIO.js';
import { Palette } from '../../js/theme/Theme.js';

const serializer = new ProjectSerializer({ palette: Palette });
const json2 = (v) => JSON.stringify(v, null, 2);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** A logo entry as LogoLoader stores it (08 P2-13a), over real bytes. */
function logoMeta(bytes, name, mime = 'image/png') {
  const s = sha(bytes);
  return { dataUri: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, mime, bytes: bytes.length, name, sha256: s, assetId: logoAssetId(s) };
}

/** A project with every Phase-2 key away from its default, two sections sharing one logo and a third with another. */
function busyProject() {
  const p = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
  p.wall.replaceAll([
    new WallSection({ id: 0, name: 'Left', panelCols: 4, panelRows: 2, panelWidth: 500, panelHeight: 500, ledX: 64, ledY: 64, curveIntensity: 5, angleOffset: -15, color: '#ff00aa' }),
    new WallSection({ id: 3, name: 'Centre', panelCols: 6, panelRows: 3, panelWidth: 600, panelHeight: 337.5, ledX: 96, ledY: 54, curveIntensity: 0, angleOffset: 0, color: '#00ff66' }),
    new WallSection({ id: 7, name: 'Right', panelCols: 2, panelRows: 1, panelWidth: 250, panelHeight: 250, ledX: 8, ledY: 8, curveIntensity: -2.5, angleOffset: 90, color: '#123456', extensions: { 'acme.note': { a: [1, 'x', null] } } }),
  ]);
  p.meshMode = 'combined';
  p.display.wireframe = true;
  p.display.showFrame = true;
  p.display.setPanelIds(true);
  p.display.ledLayout = 'rgb-stripe';
  p.display.showGrid = false;
  p.display.showSafeDistance = true;
  for (const [k, v] of [['borderThickness', '12'], ['fontSize', '40'], ['fontColor', '#ff0000'], ['sectionLabelEnabled', false],
    ['sectionLabelFontSize', '0'], ['sectionLabelColor', '#33ff99']]) p.panelIdStyle.set(k, v);
  p.camera.enabled = true;
  p.camera.applyPreset('custom');
  p.camera.setField('filmbackWidth', '30');
  p.camera.setField('filmbackHeight', '20');
  p.camera.setField('focalLength', '50');
  for (const [k, v] of [['posX', '2'], ['posY', '1.2'], ['posZ', '-4'], ['rotX', '5'], ['rotY', '-10'], ['rotZ', '2']]) p.camera.setField(k, v);
  p.camera.rotateBy('y', 400);   // the gizmo wraps the pan (08 P2-8c)
  p.person.visible = true;
  p.person.setField('posX', '1');
  p.person.setField('posZ', '3');
  p.person.setField('rotY', '45');
  p.person.setField('scale', '1.5');
  p.car.visible = true;
  p.car.rotateBy('y', -200);
  const a = logoMeta(Buffer.from('a png logo'), 'logo.png');
  const b = logoMeta(Buffer.from('<svg width="4" height="2"/>'), 'mark.svg', 'image/svg+xml');
  p.logos.setImage(0, { w: 1 }, a);
  p.logos.setImage(3, { w: 1 }, a);
  p.logos.setPosition(3, 'top-left');
  p.logos.setScale(3, 0.55);
  p.logos.setImage(7, { w: 1 }, b);
  p.setExtensions({ 'acme.stage': { v: 1 } });
  return p;
}

/** The derived keys stripped (07 4.7 fidelity): totals, generator, texture_file, pixel_pitch_mm, curvature.type. */
function strip(doc) {
  const d = JSON.parse(JSON.stringify(doc));
  delete d.totals;
  delete d.generator;
  for (const s of d.sections) {
    delete s.texture_file;
    delete s.led_resolution.pixel_pitch_mm;
    delete s.curvature.type;
  }
  return d;
}

const readV2 = (doc) => serializer.read(JSON.parse(json2(doc)));

describe('project file v2: the writer (07 4.2, 08 4.6)', () => {
  test('key order, version and format; one inline asset per distinct image in order of first use; v1 keys unchanged', () => {
    const p = busyProject();
    const doc = serializer.write(p);
    assert.equal(VERSION, '2.0');
    assert.equal(KNOWN_REVISION, 0);
    assert.deepEqual(REVISIONS[0], Object.keys(doc));
    assert.deepEqual(Object.keys(doc.display), ['content', 'led_layout', 'wireframe', 'show_frame', 'show_grid', 'show_safe_distance']);
    assert.deepEqual(Object.keys(doc.panel_id_style), ['border_thickness', 'font_size', 'font_color', 'section_label_enabled',
      'section_label_font_size', 'section_label_color']);
    assert.deepEqual(doc.camera, { enabled: true, filmback: 'custom', filmback_width_mm: 30, filmback_height_mm: 20, focal_length_mm: 50,
      position_m: { x: 2, y: 1.2, z: -4 }, rotation_deg: { x: 5, y: 30, z: 2 } });
    assert.deepEqual(doc.props.person, { visible: true, position_m: { x: 1, z: 3 }, rotation_y_deg: 45, scale: 1.5 });
    assert.deepEqual(doc.sections.map((s) => s.logo), [
      { asset_id: doc.assets[0].id, position: 'center', scale: 0.3 },
      { asset_id: doc.assets[0].id, position: 'top-left', scale: 0.55 },
      { asset_id: doc.assets[1].id, position: 'center', scale: 0.3 },
    ]);
    assert.deepEqual(Object.keys(doc.assets[0]), ['id', 'kind', 'name', 'mime', 'bytes', 'sha256', 'storage', 'data_uri']);
    assert.equal(doc.assets[0].id, `a_${doc.assets[0].sha256.slice(0, 16)}`);
    assert.deepEqual(doc.sections[2].extensions, { 'acme.note': { a: [1, 'x', null] } });
    assert.deepEqual(doc.extensions, { 'acme.stage': { v: 1 } });
    assert.ok(!json2(doc).includes('face_orientation') && !json2(doc).includes('show_pivot_marker') && !('pivot' in doc) && !('uv' in doc),
      'no feature-owned key before its landing commit (07 C39)');
  });
});

describe('project file v2: the validator (07 4.7, 08 6.16)', () => {
  test('fidelity and idempotence: the app\'s own files validate to themselves with no issue (busy project and 300 fuzzed ones)', () => {
    const rand = mulberry(0x2b13e);
    const projects = [busyProject(), Project.createNew(), Project.createDefault()];
    for (let k = 0; k < 300; k++) projects.push(fuzzProject(rand));
    for (const [k, p] of projects.entries()) {
      for (const variant of ['file', 'zip']) {
        const textureNames = variant === 'zip' ? p.wall.sections.map((s, i) => (i % 2 ? null : `S${i}.png`)) : null;
        const doc = JSON.parse(json2(serializer.write(p, { variant, textureNames })));
        const r = serializer.read(doc);
        assert.deepEqual(r.issues, [], `project #${k} ${variant}: no issue`);
        assert.equal(r.scope, 'full');
        assert.deepEqual(r.project, strip(doc), `project #${k} ${variant}: strip(validate(file)) equals strip(file)`);
        const again = validateProject(r.project, { palette: { sectionColors: Palette.sectionColors }, revision: KNOWN_REVISION });
        assert.deepEqual(again.issues, [], `project #${k}: idempotent`);
        assert.deepEqual(again.project, r.project);
      }
    }
  });

  test('hostile values are clamped, coerced, defaulted or dropped, each reported; the result is safe and idempotent', () => {
    const png = Buffer.from('png bytes');
    const asset = (over) => ({ id: 'a_1', kind: 'logo', name: 'x.png', mime: 'image/png', bytes: png.length, sha256: sha(png), storage: 'inline',
      data_uri: `data:image/png;base64,${png.toString('base64')}`, ...over });
    const doc = {
      version: '2.9', format: 'morph-led-project', generator: { name: 'x' }, pivot: { mode: 'x' }, hdri: {}, weird: 1,
      sections: [
        { name: 'A', id: 0, panel: { columns: 2, rows: 1, width_mm: 500, height_mm: 500 }, led_resolution: { x: 32, y: 32 },
          curvature: { angle_degrees: 0, angle_offset_degrees: 0 }, color: 'red;outline:3px solid lime',
          logo: { asset_id: 'a_1', position: 'nowhere', scale: 9 }, face_orientation: 'reversed', extensions: { 'bad key': 1, 'ok.k': { __proto__: null, deep: 1 } } },
        { name: 'B', logo: { asset_id: 'a_missing' } },
        { name: 'C', logo: { asset_id: 'h_1' } },
      ],
      mesh_mode: 'cubes',
      display: { content: 'hdri', led_layout: 'plaid', wireframe: 'true', show_frame: 1, show_pivot_marker: false },
      panel_id_style: { border_thickness: 99, font_size: 12.6, font_color: 'url(x)', section_label_color: '#ABC' },
      camera: { enabled: 'yes', filmback: 'imax', filmback_width_mm: 500, focal_length_mm: '1e400',
        position_m: { x: 1e9, y: -3, z: '2' }, rotation_deg: { x: 500, y: 1e6, z: -999 }, t_stop: 2.8 },
      props: { person: { visible: true, position_m: 7, scale: 10 }, car: 'x', tree: {} },
      assets: [
        asset({}),
        asset({ id: 'a_2', data_uri: 'https://logo.invalid/remote.png' }),
        asset({ id: 'a_3', data_uri: 'data:text/html;base64,PGI+eDwvYj4=' }),
        asset({ id: 'a_4', data_uri: 'data:image/png;base64,iVBORw0KGgo' }),
        asset({ id: 'a_5', data_uri: `data:image/png;base64,${Buffer.alloc(MAX_LOGO_BYTES + 3).toString('base64')}` }),
        asset({ id: 'a_6', mime: 'image/jpeg' }),
        asset({ id: 'a_1' }),
        { id: 'h_1', kind: 'hdri' },
        asset({ id: 'a_7', storage: 'zip' }),
        asset({ id: 'a_unused' }),
      ],
      extensions: { 'x.y': 1, __proto__: { polluted: true } },
    };
    const r = readV2(doc);
    assert.equal(r.ok, true);
    const w = r.issues.filter((i) => i.severity === 'warning').map((i) => i.message);
    assert.deepEqual(w, [
      'Some settings were saved by a newer version and were ignored.',
      `Section 1 "A": Panel Colour "red;outline:3px solid lime" → "${Palette.sectionColors[0]}"`,
      'Section 1 "A": Logo position "nowhere" → "center"',
      'Section 1 "A": Logo scale 9 → 1',
      'Section 2 "B": Logo "a_missing" → no logo (the image is missing)',
      'Section 3 "C": Logo "h_1" → no logo (not a logo image)',
      'Mesh mode: "cubes" → "combined"',
      'Display content: "hdri" → "color"',
      'LED Pixel Layout: "plaid" → "single-dot"',
      'Wireframe: "true" → true',
      'Show Panel Frames: 1 → false',
      'Border Thickness (px): 99 → 32',
      'Label Font Size (0=auto): 12.6 → 13',
      'Label Font Colour: "url(x)" → "#ffffff"',
      'Section Label Colour: "#ABC" → "#aabbcc"',
      'Enable Camera Preview: "yes" → false',
      'Filmback / Sensor: "imax" → "custom"',
      'Sensor Width (mm): 500 → 100',
      'Focal Length (mm): "1e400" → 35',
      'Camera X Position (m): 1000000000 → 100000',
      'Camera Y Height (m): -3 → 0',
      'Camera Z Position (m): "2" → 2',
      'Camera Tilt (°): 500 → 90',
      'Camera Roll (°): -999 → -180',
      'Person position: 7 → defaults',
      'Person Scale: 10 → 2',
      'Car: "x" → defaults',
      'Logo "x.png": dropped (not a PNG, JPEG, WebP or SVG data URL)',
      'Logo "x.png": dropped (not a PNG, JPEG, WebP or SVG data URL)',
      'Logo "x.png": dropped (not a PNG, JPEG, WebP or SVG data URL)',
      'Logo "x.png": dropped (not a PNG, JPEG, WebP or SVG data URL)',
      'Logo "x.png": dropped (not a PNG, JPEG, WebP or SVG data URL)',
      'Logo "x.png": dropped (invalid or repeated id)',
      'Logo "x.png": dropped (the image is not stored in this file)',
    ]);
    const p = r.project;
    assert.equal(p.sections[0].color, Palette.sectionColors[0]);
    assert.deepEqual(p.sections[0].logo, { asset_id: 'a_1', position: 'center', scale: 1 });
    assert.deepEqual([p.sections[1].logo, p.sections[2].logo], [null, null]);
    assert.deepEqual(p.sections[0].extensions, { 'ok.k': { deep: 1 } });
    assert.deepEqual(p.assets.map((a) => a.id), ['a_1'], 'only the valid, referenced logo');
    assert.equal(p.mesh_mode, 'combined');
    assert.deepEqual(p.camera, { enabled: false, filmback: 'custom', filmback_width_mm: 100, filmback_height_mm: 24, focal_length_mm: 35,
      position_m: { x: 100000, y: 0, z: 2 }, rotation_deg: { x: 90, y: 1e6, z: -180 } });
    assert.deepEqual(p.props.person, { visible: true, position_m: { x: 2, z: 2 }, rotation_y_deg: 0, scale: 2 });
    assert.deepEqual(p.props.car, { visible: false, position_m: { x: 4, z: 3 }, rotation_y_deg: 0, scale: 1 });
    assert.deepEqual(p.extensions, { 'x.y': 1 });
    assert.equal(Object.getPrototypeOf(p.extensions), Object.prototype);
    assert.equal(({}).polluted, undefined, 'no prototype pollution');
    const dropped = r.issues.filter((i) => i.code === 'dropped-unknown').map((i) => i.path);
    for (const path of ['pivot', 'hdri', 'weird', 'sections[0].face_orientation', 'sections[0].extensions.bad key', 'display.show_pivot_marker',
      'camera.t_stop', 'props.tree', 'assets']) assert.ok(dropped.includes(path), `${path} dropped (${dropped.join(', ')})`);
    assert.ok(!dropped.includes('generator'), 'generator is derived: ignored silently');
    const again = validateProject(p, { palette: { sectionColors: Palette.sectionColors }, revision: KNOWN_REVISION });
    assert.deepEqual(again.issues, []);
    assert.deepEqual(again.project, p);
  });

  test('a preset filmback takes the preset size; absent blocks and keys take their defaults silently', () => {
    const r = readV2({ version: '2.0', sections: [{}], camera: { filmback: 'super35', filmback_width_mm: 30 } });
    assert.deepEqual(r.issues.filter((i) => i.severity !== 'info'), []);
    assert.deepEqual([r.project.camera.filmback_width_mm, r.project.camera.filmback_height_mm], [24.89, 18.66]);
    assert.equal(r.project.mesh_mode, 'combined', 'absent means the 07 default');
    assert.deepEqual(r.project.display, { content: 'color', led_layout: 'single-dot', wireframe: false, show_frame: false, show_grid: true, show_safe_distance: false });
    assert.equal(r.project.sections[0].color, Palette.sectionColors[0], 'a v2 section without a colour takes the v2 palette');
    assert.deepEqual(sectionsFromProject(r.project)[0].extensions, {});
  });
});

// ---- ProjectIO over model-level fakes ---------------------------------------------------------------------------

/** A ProjectIO whose collaborators write the model the way the real controllers do (no views), recording the calls. */
function modelIO(project, calls) {
  const display = project.display;
  const wallController = {
    applyImport: ({ sections, meshMode, logos }) => {
      calls.push(`applyImport(${logos === null ? 'null' : logos.length})`);
      project.logos.clear();
      if (logos) for (const [id, e] of logos) project.logos.set(id, e);
      project.wall.replaceAll(sections);
      if (meshMode) project.meshMode = meshMode;
    },
    setPanelIdStyle: (k, v) => { calls.push(`style ${k}`); return project.panelIdStyle.set(k, v); },
    setLedLayout: (v) => { calls.push('ledLayout'); display.ledLayout = v; },
    setWireframe: (v) => { calls.push('wireframe'); display.wireframe = v; },
    setShowFrame: (v) => { calls.push('frame'); display.showFrame = v; },
    setLedSim: (on) => { calls.push(`ledSim ${on}`); display.setLedSim(on); },
    setPanelIds: (on) => { calls.push(`panelIds ${on}`); display.setPanelIds(on); },
    rebuildIfPanelIds: () => calls.push('rebuildIfPanelIds'),
  };
  const cine = project.camera;
  const cameraController = {
    setFilmback: (k) => { calls.push(`filmback ${k}`); cine.applyPreset(k); },
    setCameraField: (f, raw) => { calls.push(`camera ${f}`); return cine.setField(f, raw); },
    setPreviewEnabled: (on) => { calls.push(`preview ${on}`); cine.enabled = on; if (on) cine.resetTo({ wallBox: { center: { x: 9, y: 9, z: 9 } }, facing: { x: 0, z: 1 } }); },
    applyImportedPose: (pose) => { calls.push('cameraPose'); cine.assign(pose); },
    setSafeDistanceEnabled: (on) => { calls.push(`safeDistance ${on}`); display.showSafeDistance = on; },
  };
  const propController = (prop) => ({
    applyImportedPose: (pose) => { calls.push(`${prop.kind}Pose`); prop.assign(pose); },
    setVisible: (on) => { calls.push(`${prop.kind} ${on}`); prop.visible = on; },
  });
  const logoLoader = {
    load: async ({ dataUri, name }) => {
      calls.push(`load ${name}`);
      const bytes = Buffer.from(dataUri.split(',')[1], 'base64');
      const s = sha(bytes);
      return { ok: true, image: { w: 1 }, meta: { dataUri, mime: dataUri.slice(5, dataUri.indexOf(';')), bytes: bytes.length, name, sha256: s, assetId: logoAssetId(s) } };
    },
  };
  const bus = new EventBus();
  bus.on(Events.PROJECT_REPLACED, (payload) => calls.push(`PROJECT_REPLACED ${JSON.stringify(payload)}`));
  const alerts = [];
  const io = new ProjectIO({
    project, wallController, serializer, objExporter: null, gltfExporter: null, panelIds: null, safeDistance: null,
    downloader: { saveText: () => {} }, JSZip: null, dialogs: { alert: (m) => { alerts.push(m); calls.push('alert'); } },
    brand: { files: { json: 'x.json' } }, win: {}, sectionsFromProject, stateFromProject, cameraController,
    personController: propController(project.person), carController: propController(project.car),
    pilot: { active: true, toggle: () => calls.push('pilot.toggle') }, selection: { deselect: () => calls.push('deselect') },
    logoLoader, sceneManager: { toggleGrid: () => { calls.push('grid'); display.showGrid = !display.showGrid; } }, bus,
  });
  return { io, alerts };
}

/** Imports `text` through importFromInputEvent with a synchronous FileReader, then lets the async restore finish. */
async function importText(io, text) {
  const saved = globalThis.FileReader;
  globalThis.FileReader = class { readAsText() { this.onload({ target: { result: text } }); } };
  try {
    io.importFromInputEvent({ target: { files: [{ name: 'p.json', size: text.length }], value: 'x' } });
  } finally {
    globalThis.FileReader = saved;
  }
  for (let k = 0; k < 20; k++) await new Promise((resolve) => setImmediate(resolve));
}

describe('ProjectIO v2 import (08 6.17)', () => {
  test('export -> import on a new project -> export gives the identical file, in the 6.17 restore order', async () => {
    const text = json2(serializer.write(busyProject()));
    const fresh = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
    const calls = [];
    const { io, alerts } = modelIO(fresh, calls);
    await importText(io, text);
    assert.deepEqual(alerts, []);
    assert.equal(json2(serializer.write(fresh)), text, 'the second export is byte-identical');
    assert.deepEqual(calls, ['load logo.png', 'load mark.svg', 'pilot.toggle', 'deselect', 'applyImport(3)',
      'style borderThickness', 'style fontSize', 'style fontColor', 'style sectionLabelEnabled', 'style sectionLabelColor',
      'ledLayout', 'wireframe', 'frame', 'panelIds true', 'grid',
      'filmback custom', 'camera filmbackWidth', 'camera filmbackHeight', 'camera focalLength', 'preview true', 'cameraPose',
      'safeDistance true', 'personPose', 'person true', 'carPose', 'car true',
      'PROJECT_REPLACED {"reason":"import","scope":"full"}']);
    assert.deepEqual(Object.keys(fresh.logos.get(3)).sort(), ['assetId', 'bytes', 'dataUri', 'image', 'mime', 'name', 'position', 'scale', 'sha256']);
  });

  test('a pose saved with the preview off is assigned while the preview stays off; corrections are alerted after the restore', async () => {
    const saved = busyProject();
    saved.camera.enabled = false;
    const doc = JSON.parse(json2(serializer.write(saved)));
    doc.camera.position_m.y = -2;   // corrected to the floor
    const fresh = Project.createNew();
    const calls = [];
    const { io, alerts } = modelIO(fresh, calls);
    await importText(io, json2(doc));
    assert.ok(!calls.includes('preview true') && !calls.includes('preview false'), 'the preview state already matches');
    assert.deepEqual([fresh.camera.posX, fresh.camera.posY, fresh.camera.posZ], [2, 0, -4]);
    assert.deepEqual(alerts, ['Imported with 1 correction(s):\n• Camera Y Height (m): -2 → 0']);
    assert.equal(calls.at(-1), 'alert');
  });

  test('a v1 file stays a wall-only import: no restore step, the camera, props, display and logos untouched', async () => {
    const fresh = busyProject();
    const before = serializer.write(fresh);
    const calls = [];
    const { io } = modelIO(fresh, calls);
    await importText(io, json2({ version: '1.0', sections: [{ name: 'Only', panel: { columns: 3, rows: 2 } }], mesh_mode: 'panel' }));
    assert.deepEqual(calls, ['applyImport(null)']);
    const after = serializer.write(fresh);
    for (const key of ['display', 'panel_id_style', 'camera', 'props', 'extensions']) assert.deepEqual(after[key], before[key], key);
    assert.deepEqual(after.sections.map((s) => [s.name, s.panel.columns, s.color, s.logo]), [['Only', 3, '#00f0ff', null]]);
    assert.equal(after.mesh_mode, 'panel');
  });
});

// ---- fuzzed projects the app can produce (07 4.3 reachability) --------------------------------------------------

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A project built only through the app's own writers (input rules, gizmo and pilot arithmetic, setters). */
function fuzzProject(rand) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const num = (lo, hi) => String(lo + (hi - lo) * rand());
  const p = Project.createNew();
  const sections = [];
  for (let i = 0, n = 1 + Math.floor(rand() * 4); i < n; i++) {
    const s = WallSection.createDefault({ color: pick(['#d9d9d6', '#00ff66', '#abcdef']) });
    for (const [f, raw] of [['panelCols', num(-5, 60)], ['panelRows', num(0, 25)], ['panelWidth', num(0, 6000)], ['panelHeight', pick(['0', '250', num(40, 2000)])],
      ['ledX', num(0, 300)], ['ledY', pick(['', '64'])], ['curveIntensity', num(-200, 200)], ['angleOffset', num(-200, 200)]]) s.setField(f, raw);
    s.setName(pick([`W${i}`, '', '<b>x</b>', 'a\u0000b']));
    sections.push(new WallSection({ ...s, id: i * 3 }));
  }
  p.wall.replaceAll(sections);
  p.meshMode = pick(['combined', 'section', 'panel']);
  p.display.wireframe = rand() < 0.5;
  p.display.showFrame = rand() < 0.5;
  pick([() => {}, () => p.display.setLedSim(true), () => p.display.setPanelIds(true)])();
  p.display.ledLayout = pick(['single-dot', 'rgb-triangle', 'rgb-stripe', 'rgb-horizontal', 'square']);
  p.display.showGrid = rand() < 0.5;
  p.display.showSafeDistance = rand() < 0.5;
  for (const [k, raw] of [['borderThickness', num(-5, 40)], ['fontSize', num(-5, 250)], ['sectionLabelFontSize', num(-5, 500)]]) p.panelIdStyle.set(k, raw);
  p.panelIdStyle.set('sectionLabelEnabled', rand() < 0.5);
  p.panelIdStyle.set('fontColor', pick(['#ffffff', '#00ff00']));
  const cam = p.camera;
  cam.enabled = rand() < 0.5;
  cam.applyPreset(pick(['full-frame', 'super35', 'custom', 'mft']));
  for (const f of ['filmbackWidth', 'filmbackHeight']) if (cam.filmback === 'custom') cam.setField(f, num(-10, 150));
  cam.setField('focalLength', num(0, 1000));
  for (const f of ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ']) cam.setField(f, num(-400, 400));
  cam.translateBy((rand() - 0.5) * 3e5, (rand() - 0.5) * 10, (rand() - 0.5) * 3e5);
  cam.rotateBy(pick(['x', 'y', 'z']), (rand() - 0.5) * 900);
  cam.pilotLook(rand() * 500, rand() * 500);
  cam.pilotFly({ forward: true, back: false, left: rand() < 0.5, right: false, down: true, up: false }, { x: 0.3, y: -0.9, z: 0.3 }, { x: 1, y: 0, z: 0 }, 2);
  for (const prop of [p.person, p.car]) {
    prop.visible = rand() < 0.5;
    for (const [f, raw] of [['posX', num(-50, 50)], ['posZ', num(-50, 50)], ['rotY', num(-300, 300)], ['scale', num(0, 3)]]) prop.setField(f, raw);
    prop.translateBy((rand() - 0.5) * 3e5, 0, (rand() - 0.5) * 3e5);
    prop.rotateBy('y', (rand() - 0.5) * 900);
  }
  return p;
}
