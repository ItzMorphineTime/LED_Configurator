// Unit tests of project file v2 (docs/improvements/08-bugfix-roadmap.md 4.6, 6.17, P2-13e; spec 07 4.2-4.7): the writer's
// key order and v1 superset, the validator's v2 path (hostile values clamped, defaulted or dropped; unknown keys
// dropped; idempotence; fidelity over fuzzed projects the app can produce), and the full round trip through
// ProjectSession (07 D5, which absorbed 08's ProjectIO.#applyV2) over model-level fakes: export -> open -> export gives
// the identical file, a v1 import stays wall-only, and the apply order of 07 5.5.2.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { EventBus, Events } from '../../js/core/EventBus.js';
import { APP_VERSION } from '../../js/core/AppInfo.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { WallPivot, PIVOT_MODES, ORIENTATION_ALIGNS } from '../../js/domain/Wall.js';
import { UvSettings, UvTransform, UvVertexEdits } from '../../js/domain/UvSettings.js';
import { logoAssetId } from '../../js/domain/LogoRules.js';
import { MAX_LOGO_BYTES } from '../../js/domain/rules.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { validateProject } from '../../js/io/ProjectValidator.js';
import { KNOWN_REVISION, REVISIONS, VERSION, TOP_LEVEL_KEYS, sectionsFromProject, stateFromProject } from '../../js/io/ProjectSchema.js';
import { ProjectSession } from '../../js/app/ProjectSession.js';
import { PivotController } from '../../js/app/PivotController.js';
import { UvController } from '../../js/app/UvController.js';
import { AssetStore } from '../../js/app/AssetStore.js';
import { ProjectIO } from '../../js/app/ProjectIO.js';
import { Brand, Palette } from '../../js/theme/Theme.js';

// App's serializer: the theme palette and (06 T8) the JSON generator record
const GENERATOR = Object.freeze({ name: Brand.jsonGenerator.name, version: APP_VERSION });
const serializer = new ProjectSerializer({ palette: Palette, generator: GENERATOR });
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
  // revision 1 (M7a): the pivot and orientation, the marker, the UV settings, a transform and vertex edits
  const pv = p.wall.pivot;
  pv.setMode('mesh-center');
  pv.setOffset({ x: 0.5, y: 0.25, z: 2 });
  pv.setKeepStageLayout(false);
  pv.setAlign('center-neg-x');
  pv.setYawOffset(15);
  p.display.showPivotMarker = false;
  p.uv.assign({ combinedLayout: 'atlas', panelUvs: 'panel', gltfCanvasTexcoord1: false });
  const left = p.wall.sections[0];
  const t = new UvTransform();
  for (const [f, raw] of [['offsetU', '0.25'], ['scaleU', '0.5'], ['rotation', '90'], ['flipU', true], ['sourceRotated', true]]) t.setField(f, raw);
  left.setUvTransform(t);
  const edits = new UvVertexEdits(left.panelCols, left.panelRows);
  edits.set(edits.key(4, 2), 0.0125, -0.03);
  edits.set(edits.key(1, 0), -0.1, 0);
  left.setUvVertexEdits(edits);
  return p;
}

/**
 * The derived keys stripped (07 4.7 fidelity): totals, generator, atlas, pivot.resolved_m, texture_file, pixel_map,
 * pixel_pitch_mm, curvature.type.
 */
function strip(doc) {
  const d = JSON.parse(JSON.stringify(doc));
  delete d.totals;
  delete d.generator;
  delete d.atlas;
  if (d.pivot) delete d.pivot.resolved_m;
  for (const s of d.sections) {
    delete s.texture_file;
    delete s.pixel_map;
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
    assert.equal(VERSION, '2.1');
    assert.equal(KNOWN_REVISION, 1);
    assert.deepEqual(REVISIONS[1], ['pivot', 'uv', 'display.show_pivot_marker', 'sections[].uv_transform', 'sections[].uv_vertex_edits']);
    // 07 D1: `project` is written only for a named (or annotated) project
    assert.deepEqual(Object.keys(doc), TOP_LEVEL_KEYS.filter((k) => k !== 'project'));
    p.meta.assign({ name: 'Stage A', notes: '' });
    assert.deepEqual(Object.keys(serializer.write(p)), TOP_LEVEL_KEYS);
    assert.deepEqual(serializer.write(p).project, { name: 'Stage A', notes: '' });
    // 06 T8 (07 C10): the generator record is the second key; without one the writer omits it
    assert.deepEqual(doc.generator, { name: 'Morph LED Configurator', version: APP_VERSION });
    assert.equal('generator' in new ProjectSerializer({ palette: Palette }).write(p), false);
    assert.deepEqual(Object.keys(doc.display), ['content', 'led_layout', 'wireframe', 'show_frame', 'show_grid', 'show_safe_distance',
      'show_pivot_marker']);
    assert.equal(doc.display.show_pivot_marker, false);
    // 03 T7, 12.11: the pivot block with its derived resolution (layout frame, the total yaw)
    assert.deepEqual(Object.keys(doc.pivot), ['mode', 'offset_m', 'keep_stage_layout', 'orientation', 'resolved_m']);
    assert.deepEqual({ ...doc.pivot, resolved_m: undefined }, { mode: 'mesh-center', offset_m: { x: 0.5, y: 0.25, z: 2 },
      keep_stage_layout: false, orientation: { align: 'center-neg-x', yaw_offset_deg: 15 }, resolved_m: undefined });
    assert.deepEqual(Object.keys(doc.pivot.resolved_m), ['anchor', 'point', 'stage_origin', 'yaw_deg']);
    assert.equal(doc.pivot.resolved_m.point.z, doc.pivot.resolved_m.anchor.z + 2);
    assert.equal(doc.pivot.resolved_m.stage_origin.y, 0);
    assert.deepEqual(WallPivot.fromJSON(doc.pivot).toJSON(), p.wall.pivot.toJSON());
    // 04 4.2 (UV-5c): the UV settings, the full transform object, the sparse vertex edits, the derived pixel maps
    assert.deepEqual(doc.uv, { combined_layout: 'atlas', panel_uvs: 'panel', gltf_canvas_texcoord1: false });
    assert.deepEqual(doc.sections[0].uv_transform, { offset_u: 0.25, offset_v: 0, scale_u: 0.5, scale_v: 1, rotation_degrees: 90,
      flip_u: true, flip_v: false, source_rotated: true });
    assert.deepEqual(doc.sections[0].uv_vertex_edits, [{ row: 0, col: 1, du: -0.1, dv: 0 }, { row: 2, col: 4, du: 0.0125, dv: -0.03 }]);
    assert.deepEqual(doc.sections[1].uv_vertex_edits, []);
    assert.deepEqual(doc.sections[1].uv_transform, new UvTransform().toJSON());
    assert.deepEqual(doc.sections.map((s) => s.pixel_map.width_led), [256, 576, 16]);
    assert.deepEqual(doc.atlas, { width_led: 848, height_led: 162, png_px_per_led: 4, png_width_px: 3392, png_height_px: 648 });
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
    assert.ok(!json2(doc).includes('face_orientation') && !('hdri' in doc), 'no feature-owned key before its landing commit (07 C39)');
  });
});

describe('07 D4: the history and autosave variants (07 4.2)', () => {
  test('history: no derived key, no view-only key, assets by id; one writer, the same values as the file', () => {
    const p = busyProject();
    const file = serializer.write(p);
    const h = serializer.write(p, { variant: 'history' });
    assert.deepEqual(Object.keys(h), Object.keys(file).filter((k) => !['generator', 'atlas', 'totals'].includes(k)));
    assert.deepEqual(Object.keys(h.sections[0].led_resolution), ['x', 'y']);
    assert.deepEqual(Object.keys(h.sections[0].curvature), ['angle_degrees', 'angle_offset_degrees']);
    assert.equal('show_grid' in h.display, false);
    assert.equal('show_pivot_marker' in h.display, false, 'view-only');
    assert.equal('pixel_map' in h.sections[0], false);
    assert.deepEqual(h.pivot, p.wall.pivot.toJSON(), 'the model pivot, no resolved_m');
    assert.deepEqual(h.uv, file.uv);
    assert.deepEqual(h.sections.map((s) => [s.uv_transform, s.uv_vertex_edits]), file.sections.map((s) => [s.uv_transform, s.uv_vertex_edits]));
    assert.deepEqual(h.assets, file.assets.map((a) => ({ id: a.id })));
    assert.deepEqual(h.sections.map((s) => s.logo), file.sections.map((s) => s.logo));
    assert.deepEqual(h.camera, file.camera);
    assert.equal(json2(serializer.write(p, { variant: 'history' })), json2(h), 'no clock: byte-stable');
    assert.throws(() => serializer.write(p, { variant: 'share' }), RangeError);
  });

  test('autosave: the file document, its assets inline up to maxInlineAssetBytes, otherwise all of them missing (metadata only)', () => {
    const p = busyProject();
    const file = serializer.write(p);
    assert.deepEqual(serializer.write(p, { variant: 'autosave' }), file);
    const total = file.assets.reduce((n, a) => n + a.data_uri.length, 0);
    assert.deepEqual(serializer.write(p, { variant: 'autosave', maxInlineAssetBytes: total }), file, 'at the limit: inline');
    const over = serializer.write(p, { variant: 'autosave', maxInlineAssetBytes: total - 1 });
    assert.deepEqual(over.assets, file.assets.map(({ data_uri: _, ...meta }) => ({ ...meta, storage: 'missing' })));
    const r = serializer.read(JSON.parse(json2(over)));
    assert.deepEqual(r.project.assets, [], 'a missing asset is not restored; its logos are dropped with a warning');
    assert.ok(r.issues.some((i) => i.code === 'missing-asset'));
  });
});

describe('project file v2: the validator (07 4.7, 08 6.16)', () => {
  test('fidelity and idempotence: the app\'s own files validate to themselves with no issue (busy project and 300 fuzzed ones)', () => {
    const rand = mulberry(0x2b13e);
    const projects = [busyProject(), Project.createNew(), Project.createDefault()];
    for (let k = 0; k < 300; k++) projects.push(fuzzProject(rand));
    for (const [k, p] of projects.entries()) {
      for (const variant of ['file', 'zip', 'autosave']) {
        const textureNames = variant === 'zip' ? p.wall.sections.map((s, i) => (i % 2 ? null : `S${i}.png`)) : null;
        const doc = JSON.parse(json2(serializer.write(p, { variant, textureNames })));
        const r = serializer.read(doc);
        assert.deepEqual(r.issues.filter((i) => i.code !== 'budget'), [], `project #${k} ${variant}: no issue (07 D2: a budget note is no correction)`);
        assert.equal(r.scope, 'full');
        assert.deepEqual(r.project, strip(doc), `project #${k} ${variant}: strip(validate(file)) equals strip(file)`);
        const again = validateProject(r.project, { palette: { sectionColors: Palette.sectionColors }, revision: KNOWN_REVISION });
        assert.deepEqual(again.issues, r.issues.filter((i) => i.code === 'budget'), `project #${k}: idempotent (the same budget notes)`);
        assert.deepEqual(again.project, r.project);
      }
    }
  });

  test('hostile values are clamped, coerced, defaulted or dropped, each reported; the result is safe and idempotent', () => {
    const png = Buffer.from('png bytes');
    const asset = (over) => ({ id: 'a_1', kind: 'logo', name: 'x.png', mime: 'image/png', bytes: png.length, sha256: sha(png), storage: 'inline',
      data_uri: `data:image/png;base64,${png.toString('base64')}`, ...over });
    const doc = {
      version: '2.9', format: 'morph-led-project', generator: { name: 'x' }, hdri: {}, weird: 1, atlas: 'derived',
      pivot: { mode: 'x', offset_m: { x: 'abc', y: 5000, z: -0.0004 }, keep_stage_layout: 'yes',
        orientation: { align: 'left', yaw_offset_deg: 12.34 }, resolved_m: 'derived' },
      uv: { combined_layout: 'atlas', panel_uvs: 'weird', gltf_canvas_texcoord1: 'false', mode: 'x' },
      sections: [
        { name: 'A', id: 0, panel: { columns: 2, rows: 1, width_mm: 500, height_mm: 500 }, led_resolution: { x: 32, y: 32 },
          curvature: { angle_degrees: 0, angle_offset_degrees: 0 }, color: 'red;outline:3px solid lime',
          uv_transform: { offset_u: 9, scale_u: -0.5, scale_v: 0, rotation_degrees: 540, flip_v: 'yes', source_rotated: 'true', skew: 1 },
          uv_vertex_edits: [{ row: 1, col: 2, du: 0.1, dv: 1e-13 }, { row: 0, col: 3, du: 1, dv: 1 }, { row: 1, col: 2, du: 0.2, dv: 0 },
            7, { row: 0, col: 0, du: '0.5', dv: 99, w: 1 }, { row: 1, col: 1, du: 0, dv: 0 }, { row: -1, col: 0.5, du: 1 }],
          pixel_map: { any: 'thing' },
          logo: { asset_id: 'a_1', position: 'nowhere', scale: 9 }, face_orientation: 'reversed', extensions: { 'bad key': 1, 'ok.k': { __proto__: null, deep: 1 } } },
        { name: 'B', logo: { asset_id: 'a_missing' }, uv_transform: null, uv_vertex_edits: 'x' },
        { name: 'C', logo: { asset_id: 'h_1' } },
      ],
      mesh_mode: 'cubes',
      display: { content: 'hdri', led_layout: 'plaid', wireframe: 'true', show_frame: 1, show_pivot_marker: 'false' },
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
      'Some settings were saved by a newer version and were ignored (file format 2.9, this app reads 2.1): '
        + 'sections[].uv_transform.skew, sections[].uv_vertex_edits[].w, sections[].face_orientation, uv.mode, '
        + 'camera.t_stop, props.tree, hdri, weird.',
      `Section 1 "A": Panel Colour "red;outline:3px solid lime" → "${Palette.sectionColors[0]}"`,
      'Section 1 "A": UV Flip V "yes" → false',
      'Section 1 "A": UV Source rotated "true" → true',
      'Section 1 "A": UV Offset U 9 → 8',
      'Section 1 "A": UV Scale U -0.5 → 0.5',
      'Section 1 "A": UV Scale V 0 → 1',
      'Section 1 "A": UV vertex (column 2, row 1) dv 1e-13 → 0',
      'Section 1 "A": UV vertex edit at column 3, row 0 → dropped (outside the 2 × 1 panel grid)',
      'Section 1 "A": UV vertex edit at column 2, row 1 → dropped (repeated)',
      'Section 1 "A": UV vertex edit 4: 7 → dropped',
      'Section 1 "A": UV vertex (column 0, row 0) du "0.5" → 0.5',
      'Section 1 "A": UV vertex (column 0, row 0) dv 99 → 8',
      'Section 1 "A": UV vertex edit at column 0.5, row -1 → dropped (outside the 2 × 1 panel grid)',
      'Section 1 "A": Logo position "nowhere" → "center"',
      'Section 1 "A": Logo scale 9 → 1',
      'Section 2 "B": UV transform (invalid) → identity',
      'Section 2 "B": UV vertex edits "x" → none',
      'Section 2 "B": Logo "a_missing" → no logo (the image is missing)',
      'Section 3 "C": Logo "h_1" → no logo (not a logo image)',
      'Mesh mode: "cubes" → "combined"',
      'Pivot mode: "x" → "bottom-left"',
      'Pivot Offset X (m): "abc" → 0',
      'Pivot Offset Y (m): 5000 → 1000',
      'Pivot Offset Z (m): -0.0004 → 0',
      'Keep stage layout on pivot change: "yes" → true',
      'Orientation alignment: "left" → "none"',
      'Orientation Yaw offset (°): 12.34 → 12.3',
      'Panel UVs: "weird" → "section"',
      'glTF second UV channel: "false" → false',
      'Display content: "hdri" → "color"',
      'LED Pixel Layout: "plaid" → "single-dot"',
      'Wireframe: "true" → true',
      'Show Panel Frames: 1 → false',
      'Show pivot marker: "false" → false',
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
      'Logo "x.png": dropped (not a PNG, JPEG, WebP or SVG entry of the archive)',   // 07 D6: storage zip without a valid path
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
    // revision 1 (M7a): the pivot, the UV settings, the transforms and the vertex edits, corrected by the domain's rules
    assert.deepEqual(p.pivot, { mode: 'bottom-left', offset_m: { x: 0, y: 1000, z: 0 }, keep_stage_layout: true,
      orientation: { align: 'none', yaw_offset_deg: 12.3 } });
    assert.equal(Object.getPrototypeOf(p.pivot), Object.prototype);
    assert.deepEqual(p.uv, { combined_layout: 'atlas', panel_uvs: 'section', gltf_canvas_texcoord1: false });
    assert.equal(p.display.show_pivot_marker, false);
    assert.deepEqual(p.sections[0].uv_transform, { offset_u: 8, offset_v: 0, scale_u: 0.5, scale_v: 1, rotation_degrees: 180,
      flip_u: true, flip_v: false, source_rotated: true });
    assert.deepEqual(p.sections[0].uv_vertex_edits, [{ row: 0, col: 0, du: 0.5, dv: 8 }, { row: 1, col: 2, du: 0.1, dv: 0 }]);
    assert.deepEqual([p.sections[1].uv_transform, p.sections[1].uv_vertex_edits], [new UvTransform().toJSON(), []]);
    assert.ok(r.issues.some((i) => i.code === 'wrapped' && i.severity === 'info' && i.message === 'Section 1 "A": UV Rotation (°) 540 → 180'));
    const restored = sectionsFromProject(p)[0];
    assert.deepEqual([restored.uvTransform.toJSON(), restored.uvVertexEdits.toJSON()], [p.sections[0].uv_transform, p.sections[0].uv_vertex_edits]);
    const dropped = r.issues.filter((i) => i.code === 'dropped-unknown').map((i) => i.path);
    for (const path of ['hdri', 'weird', 'sections[0].face_orientation', 'sections[0].extensions.bad key', 'uv.mode',
      'sections[0].uv_transform.skew', 'sections[0].uv_vertex_edits[4].w', 'camera.t_stop', 'props.tree', 'assets']) {
      assert.ok(dropped.includes(path), `${path} dropped (${dropped.join(', ')})`);
    }
    for (const path of ['generator', 'atlas', 'pivot.resolved_m', 'sections[0].pixel_map']) assert.ok(!dropped.includes(path), `${path} is derived: ignored silently`);
    const again = validateProject(p, { palette: { sectionColors: Palette.sectionColors }, revision: KNOWN_REVISION });
    assert.deepEqual(again.issues, []);
    assert.deepEqual(again.project, p);
  });

  test('a preset filmback takes the preset size; absent blocks and keys take their defaults silently', () => {
    const r = readV2({ version: '2.0', sections: [{}], camera: { filmback: 'super35', filmback_width_mm: 30 } });
    assert.deepEqual(r.issues.filter((i) => i.severity !== 'info'), []);
    assert.deepEqual([r.project.camera.filmback_width_mm, r.project.camera.filmback_height_mm], [24.89, 18.66]);
    assert.equal(r.project.mesh_mode, 'combined', 'absent means the 07 default');
    assert.deepEqual(r.project.display, { content: 'color', led_layout: 'single-dot', wireframe: false, show_frame: false, show_grid: true,
      show_safe_distance: false, show_pivot_marker: true });
    assert.equal('pivot' in r.project, false, 'a file without a pivot keeps the session\'s (03 12.11): absent stays absent');
    assert.deepEqual(r.project.uv, new UvSettings().toJSON(), 'absent means the defaults (04 4.2)');
    assert.deepEqual([r.project.sections[0].uv_transform, r.project.sections[0].uv_vertex_edits], [new UvTransform().toJSON(), []]);
    assert.equal(r.project.sections[0].color, Palette.sectionColors[0], 'a v2 section without a colour takes the v2 palette');
    assert.deepEqual(sectionsFromProject(r.project)[0].extensions, {});
  });
});

// ---- ProjectSession over model-level fakes (07 D5; 08 6.17's restore lives in ProjectSession.apply) ----------------

/** A ProjectSession whose collaborators write the model the way the real controllers do (no views), recording the calls. */
function modelSession(project, calls, { selected = null, JSZip = null } = {}) {
  const display = project.display;
  // applyPivot assigns as WallController's does (its WALL_PIVOT_CHANGED mirror event aside)
  const wallController = {
    applyPivot: (pivot) => { calls.push('pivot hook'); if (pivot) project.wall.pivot = pivot; },
    rebuild: ({ cause }) => calls.push(`rebuild ${cause}`),
  };
  const cine = project.camera;
  const cameraController = {
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
  const selection = {
    selectedId: selected,
    deselect() { calls.push('deselect'); this.selectedId = null; },
    find: (id) => ({ id, isPickable: () => true }),
    select(id) { calls.push(`select ${id}`); this.selectedId = id; },
  };
  const bus = new EventBus();
  bus.on(Events.PROJECT_REPLACED, (payload) => calls.push(`PROJECT_REPLACED ${JSON.stringify(payload)}`));
  const alerts = [];
  const session = new ProjectSession({
    project, serializer, assets: new AssetStore({ logoLoader }), wallController, cameraController,
    personController: propController(project.person), carController: propController(project.car),
    pilot: { active: true, toggle: () => calls.push('pilot.toggle') }, selection,
    sceneManager: { toggleGrid: () => { calls.push('grid'); display.showGrid = !display.showGrid; } },
    ledTiles: { clearCache: () => calls.push('clearCache') }, bus,
    dialogs: { alert: (m) => { alerts.push(m); calls.push('alert'); } }, downloader: { saveText: () => calls.push('saveText') },
    brand: { files: { json: 'x.json' } }, win: { FileReader: SyncFileReader }, JSZip, stateFromProject, sectionsFromProject,
    createProject: () => Project.createNew({ defaultSectionColor: Palette.defaultSectionColor }),
    // App's hooks, in App's order: PivotController.hydrate, then UvController.hydrate (each stores its collaborators only)
    features: {
      pivot: new PivotController({ project, wallController, markerView: null, stageAnchored: [], selection: null, gizmo: null, interaction: null, bus }),
      uv: new UvController({ project, wallController, view: null, viewModel: null, history: null, bus, maxTextureSize: () => 0, raf: () => {} }),
    },
  });
  return { session, alerts };
}

/** A FileReader that reads a fake file's `text` synchronously. */
class SyncFileReader {
  readAsText(file) { this.onload({ target: { result: file.text } }); }
  readAsArrayBuffer(file) { this.onload({ target: { result: file.blob } }); }
}

/** An in-memory JSZip (the 3.10 subset ProjectIO and ProjectSession use): entries by path as bytes. */
class MemZip {
  constructor() { this.entries = new Map(); }
  file(name, data, options = {}) {
    this.entries.set(name, options.base64 ? Buffer.from(data, 'base64') : Buffer.from(String(data), 'utf8'));
    return this;
  }
  folder(prefix) { return { file: (name, data, options) => this.file(`${prefix}/${name}`, data, options) }; }
  async generateAsync() { return { zipped: new Map(this.entries) }; }
  static async loadAsync(blob) {
    if (!blob || !blob.zipped) throw new Error('Corrupted zip: end of central directory not found');
    const z = new MemZip();
    z.entries = new Map(blob.zipped);
    return z;
  }
  forEach(cb) {
    for (const [path, bytes] of this.entries) {
      cb(path, { dir: false, _data: { uncompressedSize: bytes.length }, async: async (type) => (type === 'string' ? bytes.toString('utf8') : new Uint8Array(bytes)) });
    }
  }
}

/** Export All (ZIP) of `project` through ProjectIO with MemZip and stub exporters; resolves with the archive. */
async function exportAll(project) {
  let blob = null;
  const io = new ProjectIO({ project, wallController: { layout: () => null }, serializer,
    objExporter: { write: () => ({ objContent: 'o', mtlContent: 'm' }) }, gltfExporter: { write: () => ({}) },
    panelIds: { sectionSize: () => ({ width: 8, height: 8 }), atlasSize: () => ({ width: 8, height: 8 }),
      sectionCanvas: () => ({ toDataURL: () => 'data:image/png;base64,QUJD' }), atlasCanvas: () => ({ toDataURL: () => 'data:image/png;base64,QUJD' }) },
    safeDistance: null, downloader: { saveBlob: (b) => { blob = b; } }, JSZip: MemZip,
    dialogs: { alert: (m) => { throw new Error(m); } }, brand: Brand, win: { setTimeout() {}, console }, session: null });
  await io.exportZIP();
  return blob;
}

/** Opens `text` through ProjectSession.openFile. */
const openText = (session, text) => session.openFile({ name: 'p.json', size: text.length, text });

describe('ProjectSession.openFile and apply (07 D5; the 08 6.17 restore)', () => {
  test('export -> open on a new project -> export gives the identical file, in the 07 5.5.2 apply order', async () => {
    const text = json2(serializer.write(busyProject()));
    const fresh = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
    const calls = [];
    const { session, alerts } = modelSession(fresh, calls);
    assert.equal(await openText(session, text), true);
    assert.deepEqual(alerts, []);
    assert.equal(json2(serializer.write(fresh)), text, 'the second export is byte-identical');
    assert.deepEqual(calls, ['load logo.png', 'load mark.svg', 'pilot.toggle', 'pivot hook',
      'preview true', 'cameraPose', 'personPose', 'carPose', 'grid', 'safeDistance true', 'person true', 'car true',
      'clearCache', 'rebuild import', 'PROJECT_REPLACED {"reason":"open","scope":"full"}']);
    assert.deepEqual(Object.keys(fresh.logos.get(3)).sort(), ['assetId', 'bytes', 'dataUri', 'image', 'mime', 'name', 'position', 'scale', 'sha256']);
    assert.equal(session.dirty, false, 'an open is clean');
    // revision 1 (M7a): the pivot, orientation, marker, UV settings, transform and vertex edits are restored
    const busy = busyProject();
    assert.ok(fresh.wall.pivot.equals(busy.wall.pivot));
    assert.equal(fresh.display.showPivotMarker, false);
    assert.deepEqual(fresh.uv.toJSON(), busy.uv.toJSON());
    assert.ok(fresh.wall.sections[0].uvTransform.equals(busy.wall.sections[0].uvTransform));
    assert.ok(fresh.wall.sections[0].uvVertexEdits.equals(busy.wall.sections[0].uvVertexEdits));
    assert.equal(fresh.wall.sections[1].uvVertexEdits, null);
    // the poses are the saved stage-frame values, with the saved pivot: nothing re-expressed (07 C45)
    assert.deepEqual([fresh.camera.posX, fresh.camera.posZ, fresh.person.posX, fresh.car.rotY], [busy.camera.posX, busy.camera.posZ, busy.person.posX, busy.car.rotY]);
    // the autosave variant too (the zip variant: the D6 archive round trip below)
    const autosave = json2(serializer.write(busy, { variant: 'autosave' }));
    const again = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
    assert.equal(await openText(modelSession(again, []).session, autosave), true);
    assert.equal(json2(serializer.write(again, { variant: 'autosave' })), autosave, 'autosave: open -> write is byte-identical');
  });

  test('revision 1 (M7a): a file without pivot or uv (2.0) and a v1 file keep the session pivot; 2.0 takes the uv and marker defaults, v1 keeps them; undo keeps the marker', async () => {
    const session0 = () => {
      const p = busyProject();
      p.wall.replaceAll(p.wall.sections.map((s) => new WallSection({ ...s })));   // drop the UV state of the sections
      return p;
    };
    // a v2.0 file of the default wall, as the build before revision 1 wrote it
    const old = JSON.parse(json2(serializer.write(Project.createDefault())));
    for (const key of ['generator', 'pivot', 'uv', 'atlas']) delete old[key];
    old.version = '2.0';
    delete old.display.show_pivot_marker;
    for (const s of old.sections) for (const key of ['uv_transform', 'uv_vertex_edits', 'pixel_map']) delete s[key];
    const p = session0();
    const pivot = p.wall.pivot.clone();
    const { session, alerts } = modelSession(p, []);
    assert.equal(await openText(session, json2(old)), true);
    assert.deepEqual(alerts, []);
    assert.ok(p.wall.pivot.equals(pivot), 'the session pivot and orientation are kept');
    assert.equal(p.display.showPivotMarker, true, 'absent: the default marker');
    assert.ok(p.uv.isDefault, 'absent: the default UV settings');
    // a v1 file: wall scope, everything but the wall is kept
    const q = session0();
    const v1 = modelSession(q, []);
    assert.equal(await openText(v1.session, json2({ version: '1.0', sections: [{ name: 'Only' }] })), true);
    assert.ok(q.wall.pivot.equals(pivot));
    assert.equal(q.display.showPivotMarker, false);
    assert.deepEqual(q.uv.toJSON(), { combined_layout: 'atlas', panel_uvs: 'panel', gltf_canvas_texcoord1: false });
    assert.ok(q.wall.sections[0].uvTransform.isIdentity);
    // undo and redo restore the model pivot of a history capture and keep the live (view-only) marker
    const h = session0();
    h.display.showPivotMarker = true;
    const hs = modelSession(h, []);
    const snapshot = serializer.read(JSON.parse(json2(serializer.write(busyProject(), { variant: 'history' }))));
    assert.ok(snapshot.ok);
    hs.session.apply(snapshot.project, { reason: 'undo' });
    assert.equal(h.display.showPivotMarker, true, 'undo keeps the live marker');
    assert.ok(h.wall.pivot.equals(busyProject().wall.pivot));
  });

  test('a pose saved with the preview off is assigned while the preview stays off; corrections are alerted after the apply', async () => {
    const saved = busyProject();
    saved.camera.enabled = false;
    const doc = JSON.parse(json2(serializer.write(saved)));
    doc.camera.position_m.y = -2;   // corrected to the floor
    const fresh = Project.createNew();
    const calls = [];
    const { session, alerts } = modelSession(fresh, calls);
    await openText(session, json2(doc));
    assert.ok(!calls.includes('preview true') && !calls.includes('preview false'), 'the preview state already matches');
    assert.deepEqual([fresh.camera.posX, fresh.camera.posY, fresh.camera.posZ], [2, 0, -4]);
    assert.deepEqual(alerts, ['Imported with 1 correction(s):\n• Camera Y Height (m): -2 → 0']);
    assert.equal(calls.at(-1), 'alert');
  });

  test('a v1 file is a wall-scope apply: the wall, the mesh mode, logos cleared; camera, props, display and style untouched', async () => {
    const fresh = busyProject();
    const before = serializer.write(fresh);
    const calls = [];
    const { session } = modelSession(fresh, calls, { selected: 'person' });
    await openText(session, json2({ version: '1.0', sections: [{ name: 'Only', panel: { columns: 3, rows: 2 } }], mesh_mode: 'panel' }));
    assert.deepEqual(calls, ['pilot.toggle', 'deselect', 'pivot hook', 'rebuild import',
      'PROJECT_REPLACED {"reason":"import","scope":"wall"}', 'select person']);
    const after = serializer.write(fresh);
    for (const key of ['display', 'panel_id_style', 'camera', 'props', 'extensions']) assert.deepEqual(after[key], before[key], key);
    assert.deepEqual(after.sections.map((s) => [s.name, s.panel.columns, s.color, s.logo]), [['Only', 3, '#00f0ff', null]]);
    assert.equal(after.mesh_mode, 'panel');
    assert.deepEqual(after.assets, [], 'B-L21: the logos are cleared');
  });
});

describe('07 D6: logo assets as ZIP entries, and opening an Export All archive', () => {
  test('Export All (ZIP) -> open that ZIP -> Export All again: the identical JSON and asset entries; no data URI in the JSON', async () => {
    const first = await exportAll(busyProject());
    const doc = JSON.parse(first.zipped.get(Brand.files.json).toString('utf8'));
    assert.deepEqual(doc.assets.map((a) => [a.storage, a.path, 'data_uri' in a]), doc.assets.map((a) => ['zip', `assets/${a.id}.${a.mime === 'image/png' ? 'png' : 'svg'}`, false]));
    assert.equal(doc.assets.length, 2);
    assert.ok(!JSON.stringify(doc).includes('data:image'));
    assert.deepEqual(first.zipped.get(doc.assets[0].path), Buffer.from('a png logo'), 'the stored bytes');
    const fresh = Project.createNew({ defaultSectionColor: Palette.defaultSectionColor });
    const calls = [];
    const { session, alerts } = modelSession(fresh, calls, { JSZip: MemZip });
    assert.equal(await session.openFile({ name: 'morph-led-wall.zip', type: '', size: 99, blob: first }), true);
    assert.deepEqual(alerts, []);
    assert.deepEqual(calls.slice(0, 2), ['load logo.png', 'load mark.svg']);
    const second = await exportAll(fresh);
    assert.deepEqual([...second.zipped.keys()], [...first.zipped.keys()]);
    for (const [path, bytes] of first.zipped) assert.deepEqual(second.zipped.get(path), bytes, path);
    assert.equal(json2(serializer.write(fresh)), json2(serializer.write(busyProject())), 'the same project as its Export JSON');
  });

  test('the ZIP\'s JSON alone keeps the wall and drops its logos with a warning; a broken or JSON-less ZIP changes nothing', async () => {
    const archive = await exportAll(busyProject());
    const text = archive.zipped.get(Brand.files.json).toString('utf8');
    const p = Project.createNew();
    const { session, alerts } = modelSession(p, [], { JSZip: MemZip });
    assert.equal(await session.openFile({ name: 'x.json', size: text.length, text }), true);
    assert.equal(p.wall.count, 3);
    assert.equal(p.logos.get(0), undefined);
    assert.match(alerts[0], /Logo "logo\.png": dropped \(its image assets\/a_\w+\.png is not in this file; open the project's ZIP\)/);
    const q = Project.createNew();
    const before = json2(serializer.write(q));
    const z = modelSession(q, [], { JSZip: MemZip });
    assert.equal(await z.session.openFile({ name: 'bad.zip', size: 4, blob: 'not a zip' }), false);
    const empty = new MemZip().file('readme.txt', 'x');
    assert.equal(await z.session.openFile({ name: 'none.zip', size: 4, blob: await empty.generateAsync() }), false);
    assert.equal(await z.session.openFile({ name: 'huge.zip', size: 2 ** 31 + 1 }), false);
    assert.deepEqual(z.alerts, ['Import failed: the ZIP file could not be read (Corrupted zip: end of central directory not found).',
      'Import failed: the ZIP file contains no project file (.json).', 'Import failed: the ZIP file is larger than 2 GB.']);
    assert.equal(json2(serializer.write(q)), before, 'atomic');
  });

  test('the validator keeps a zip asset with a safe path and drops traversal or foreign paths', () => {
    const sec = (logo) => ({ name: 'S', id: 0, panel: { columns: 1, rows: 1, width_mm: 500, height_mm: 500 }, led_resolution: { x: 32, y: 32 },
      curvature: { angle_degrees: 0, angle_offset_degrees: 0 }, color: '#00ff66', logo });
    const zipAsset = (path) => ({ id: 'a_0123456789abcdef', kind: 'logo', name: 'l.png', mime: 'image/png', bytes: 10, sha256: 'ab'.repeat(32), storage: 'zip', path });
    for (const [path, kept] of [['assets/a_0123456789abcdef.png', true], ['assets/../x.png', false], ['textures/a.png', false], ['/etc/x.png', false], ['assets/a.exe', false]]) {
      const r = readV2({ version: '2.0', sections: [sec({ asset_id: 'a_0123456789abcdef', position: 'center', scale: 0.3 })], assets: [zipAsset(path)] });
      assert.equal(r.project.assets.length, kept ? 1 : 0, path);
      if (kept) assert.deepEqual(validateProject(r.project, { revision: 0, palette: { sectionColors: Palette.sectionColors } }).issues, [], 'idempotent');
    }
  });

  test('AssetStore: load stores a loaded image by its asset id and nothing on a refusal; addFromBytes builds the data URI', async () => {
    const loads = [];
    const store = new AssetStore({ logoLoader: { load: async (req) => {
      loads.push(req);
      if (req.file && req.file.name === 'big.png') return { ok: false, reason: 'tooLarge', message: 'M-LOGO-2' };
      const uri = req.dataUri ?? 'data:image/png;base64,QQ==';
      return { ok: true, image: { src: uri }, meta: { dataUri: uri, mime: 'image/png', bytes: 1, name: req.name ?? req.file.name, sha256: 'f'.repeat(64), assetId: `a_${loads.length}` } };
    } } });
    assert.equal((await store.load({ file: { name: 'big.png' }, sectionId: 0 })).message, 'M-LOGO-2');
    assert.deepEqual(store.list(), []);
    await store.load({ file: { name: 'ok.png' }, sectionId: 0 });
    assert.deepEqual(store.list(), ['a_2']);
    const res = await store.addFromBytes({ name: 'z.png', mime: 'image/png' }, new Uint8Array([65, 66, 67]));
    assert.equal(res.dataUri, 'data:image/png;base64,QUJD');
    assert.deepEqual(loads.at(-1), { dataUri: 'data:image/png;base64,QUJD', name: 'z.png' });
    assert.equal(store.get('a_3').meta.name, 'z.png');
    assert.equal(store.get('a_9'), null);
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
  // revision 1 (M7a): the pivot and orientation setters, the marker, the UV settings rules, transforms and vertex edits
  const pv = p.wall.pivot;
  pv.setMode(pick(PIVOT_MODES));
  for (const axis of ['x', 'y', 'z']) pv.setOffsetAxis(axis, num(-1500, 1500));
  pv.setKeepStageLayout(rand() < 0.5);
  pv.setAlign(pick(ORIENTATION_ALIGNS));
  pv.setYawOffset(num(-400, 400));
  p.display.showPivotMarker = rand() < 0.5;
  p.uv.assign({ combinedLayout: UvSettings.RULES.combinedLayout(pick(['atlas', 'per-section', 'x'])),
    panelUvs: UvSettings.RULES.panelUvs(pick(['panel', 'section'])), gltfCanvasTexcoord1: UvSettings.RULES.gltfCanvasTexcoord1(pick([true, 'false'])) });
  for (const s of p.wall.sections) {
    const t = new UvTransform();
    for (const [f, raw] of [['offsetU', num(-10, 10)], ['offsetV', num(-10, 10)], ['flipV', rand() < 0.5], ['scaleU', num(-20, 20)],
      ['scaleV', pick(['0', num(0, 20)])], ['rotation', num(-1000, 1000)], ['sourceRotated', pick(['true', false])]]) t.setField(f, raw);
    s.setUvTransform(t);
    const e = new UvVertexEdits(s.panelCols, s.panelRows);
    for (let k = 0, n = Math.floor(rand() * 4); k < n; k++) {
      e.add(Math.floor(rand() * (s.panelCols + 1) * (s.panelRows + 1)), (rand() - 0.5) * 20, pick([0, (rand() - 0.5) * 0.1]));
    }
    s.setUvVertexEdits(e);
  }
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
