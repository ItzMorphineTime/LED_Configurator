// Unit tests for the import validator of 08 P2-3b (docs/improvements/08-bugfix-roadmap.md 4.3, 6.5, 8.4; spec 07 4.6,
// 4.7, 6.7-6.9): io/ProjectMigrations (detectVersion, migrateV1toV2), io/ProjectValidator (validateProject) and
// io/ProjectSchema (the rows, sectionsFromProject), through ProjectSerializer.read where the pipeline matters.
// Every row of 08 4.3 with the 07 issue shape (path, code, severity, message, from, to), the exact 08 3.3 messages,
// the dispatch, the ids of 07 6.8, idempotence, the harness configs (no correction) and the reachability of every value
// the card rules can produce.
// Run: node --test tests/unit/validator.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WallSection } from '../../js/domain/WallSection.js';
import { Wall } from '../../js/domain/Wall.js';
import { MAX_IMPORT_BYTES, MAX_LOGO_DATAURI_CHARS } from '../../js/domain/rules.js';
import { detectVersion, migrateV1toV2, ImportMessages } from '../../js/io/ProjectMigrations.js';
import { validateProject, formatValue } from '../../js/io/ProjectValidator.js';
import { LIMITS, MESH_MODES, SECTION_NUMBER_ROWS, sectionsFromProject } from '../../js/io/ProjectSchema.js';
import { ProjectSerializer } from '../../js/io/ProjectSerializer.js';
import { Palette } from '../../js/theme/Theme.js';
import { CONFIGS } from '../regression/configs.mjs';

const serializer = new ProjectSerializer({ palette: Palette });
const LEGACY_COLORS = { sectionColors: Palette.legacySectionColors };
/** A valid v2-shaped section with overrides. */
const section = (over = {}) => ({
  name: 'S', id: 0,
  panel: { columns: 5, rows: 3, width_mm: 500, height_mm: 500 },
  led_resolution: { x: 32, y: 32 },
  curvature: { angle_degrees: 0, angle_offset_degrees: 0 },
  color: '#00f0ff', logo: null,
  ...over,
});
const validate = (sections, extra = {}) => validateProject({ sections, ...extra }, { palette: LEGACY_COLORS });
const warnings = (r) => r.issues.filter((i) => i.severity === 'warning');
/** Deterministic PRNG (mulberry32). */
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

describe('limits and schema rows', () => {
  test('MAX_IMPORT_BYTES = 8 MiB + 64 logo data URIs at the cap (08 4.3, A1); the schema reads WallSection.LIMITS', () => {
    assert.equal(MAX_LOGO_DATAURI_CHARS, 2796236);
    assert.equal(MAX_IMPORT_BYTES, 187347712);
    assert.equal(Math.round(MAX_IMPORT_BYTES / 1048576), 179);
    assert.equal(LIMITS.sections, WallSection.LIMITS, 'the same table as the card rules (no copy)');
    assert.equal(LIMITS.maxSections, Wall.MAX_SECTIONS);
    assert.deepEqual(SECTION_NUMBER_ROWS.map((r) => r.field), Object.keys(WallSection.LIMITS));
    assert.deepEqual([...MESH_MODES], ['combined', 'section', 'panel']);
  });
});

describe('detectVersion (07 4.6, the dispatch)', () => {
  test('not a plain object, a foreign format, a newer version, no sections list; otherwise v1', () => {
    const err = (data) => detectVersion(data).error;
    for (const data of [null, undefined, [], [1], 5, 'x', true]) assert.equal(err(data).code, 'unsupported-format', String(data));
    assert.equal(err(null).message, ImportMessages.notAProject);
    assert.equal(err({ format: 'x', sections: [] }).code, 'unsupported-format');
    assert.equal(err({ format: 'x', sections: [] }).path, 'format');
    for (const v of ['3.0', '10.1']) {
      const e = err({ version: v, sections: [] });
      assert.deepEqual(e, { path: 'version', code: 'newer-version', severity: 'error', message: `Import failed: this project was saved by a newer version of the app (version ${v}).` });
    }
    // 08 P2-13e: major 2 is the v2 reader, with the minor as the revision (a newer one is the validator's warning)
    assert.deepEqual(detectVersion({ version: '2.0', sections: [] }), { kind: 'v2', revision: 0 });
    assert.deepEqual(detectVersion({ version: '2.7', format: 'morph-led-project' }), { kind: 'v2', revision: 7 });
    for (const version of [undefined, '1.0', 1, 2.5, '1', '1.0.0', 'abc', null]) {
      assert.deepEqual(detectVersion({ version, sections: [] }), { kind: 'v1' }, String(version));
    }
    assert.deepEqual(detectVersion({ format: 'morph-led-project', sections: [] }), { kind: 'v1' });
    for (const data of [{}, { foo: 1 }, { sections: {} }, { sections: 'abc' }, { sections: null }]) {
      assert.deepEqual(err(data), { path: 'sections', code: 'no-sections', severity: 'error', message: 'Import failed: the file does not contain a "sections" list.' });
    }
  });
});

describe('migrateV1toV2 (07 6.9)', () => {
  test('the legacy || defaults, silently; a non-object section is replaced by {} with a warning; mesh_mode kept iff truthy', () => {
    const m = migrateV1toV2({
      sections: [{ name: '', panel: { columns: 0, rows: null, width_mm: '', height_mm: false }, led_resolution: { x: 0 },
        curvature: { angle_degrees: 0 }, color: '' }, 5, { id: 7, name: 'N', panel: 'x', led_resolution: null }],
      mesh_mode: '',
    }, { palette: Palette });
    assert.equal(m.scope, 'wall');
    assert.equal(m.wall.mesh_mode, null);
    assert.deepEqual(m.wall.sections[0], {
      name: 'Wall 1', id: 0, panel: { columns: 5, rows: 3, width_mm: 500, height_mm: 500 }, led_resolution: { x: 32, y: 32 },
      curvature: { angle_degrees: 0, angle_offset_degrees: 0 }, color: Palette.legacySectionColors[0], logo: null,
    });
    assert.equal(m.wall.sections[1].name, 'Wall 2');
    assert.equal(m.wall.sections[1].id, 1);
    assert.deepEqual([m.wall.sections[2].id, m.wall.sections[2].panel.columns], [7, 5]);
    assert.deepEqual(m.issues.map((i) => [i.path, i.code, i.severity]), [['', 'migrated', 'info'], ['sections[1]', 'defaulted', 'warning']]);
    assert.equal(m.issues[1].message, 'Section 2 "Wall 2": not a section, replaced by a default section');
    assert.equal(migrateV1toV2({ sections: [], mesh_mode: 'panel' }, { palette: Palette }).wall.mesh_mode, 'panel');
  });
});

describe('validateProject (07 4.7, 6.7; 08 4.3)', () => {
  test('a valid wall: no issue, values kept, fresh objects (never the input)', () => {
    const input = { sections: [section(), section({ id: 4, name: 'B', color: '#ABCDEF' })], mesh_mode: 'section' };
    const frozen = JSON.parse(JSON.stringify(input));
    const r = validateProject(input, { palette: LEGACY_COLORS });
    assert.ok(r.ok);
    assert.deepEqual(r.issues, []);
    assert.deepEqual(r.project, { sections: [section(), section({ id: 4, name: 'B', color: '#abcdef' })], mesh_mode: 'section' });
    assert.notEqual(r.project.sections[0], input.sections[0]);
    assert.notEqual(r.project.sections[0].panel, input.sections[0].panel);
    assert.deepEqual(input, frozen, 'the input is never written');
  });

  test('errors: no sections list, an empty list, more than 200 sections, not an object (exact 08 3.3 messages, project null)', () => {
    const cases = [
      [{ sections: 'x' }, 'sections', 'no-sections', 'Import failed: the file does not contain a "sections" list.'],
      [{ sections: [] }, 'sections', 'no-sections', 'Import failed: the file contains no wall sections.'],
      [{ sections: Array.from({ length: 201 }, () => section()) }, 'sections', 'limit-exceeded', 'Import failed: 201 sections is more than the maximum of 200.'],
      [null, '', 'unsupported-format', 'Import failed: this is not an LED wall project file.'],
      [[section()], '', 'unsupported-format', 'Import failed: this is not an LED wall project file.'],
    ];
    for (const [input, path, code, message] of cases) {
      const r = validateProject(input);
      assert.deepEqual(r, { ok: false, project: null, issues: [{ path, code, severity: 'error', message }] });
    }
    assert.ok(validateProject({ sections: Array.from({ length: 200 }, (_, i) => section({ id: i })) }).ok, '200 sections are accepted');
  });

  test('numbers: coerced, rounded, clamped at both bounds, defaulted; each step one warning with from / to', () => {
    const r = validate([section({
      panel: { columns: '10', rows: 2.5, width_mm: 10, height_mm: 1e9 },
      led_resolution: { x: '7.6', y: [] },
      curvature: { angle_degrees: -400, angle_offset_degrees: {} },
    })]);
    assert.ok(r.ok);
    assert.deepEqual(r.project.sections[0].panel, { columns: 10, rows: 3, width_mm: 50, height_mm: 100000 });
    assert.deepEqual(r.project.sections[0].led_resolution, { x: 8, y: 32 });
    assert.deepEqual(r.project.sections[0].curvature, { angle_degrees: -180, angle_offset_degrees: 0 });
    assert.deepEqual(warnings(r).map((i) => [i.path, i.code, i.from, i.to, i.message]), [
      ['sections[0].panel.columns', 'coerced', '10', 10, 'Section 1 "S": Columns "10" → 10'],
      ['sections[0].panel.rows', 'rounded', 2.5, 3, 'Section 1 "S": Rows 2.5 → 3'],
      ['sections[0].panel.width_mm', 'clamped', 10, 50, 'Section 1 "S": Width (mm) 10 → 50'],
      ['sections[0].panel.height_mm', 'clamped', 1e9, 100000, 'Section 1 "S": Height (mm) 1000000000 → 100000'],
      ['sections[0].led_resolution.x', 'coerced', '7.6', 7.6, 'Section 1 "S": Pixels X "7.6" → 7.6'],
      ['sections[0].led_resolution.x', 'rounded', 7.6, 8, 'Section 1 "S": Pixels X 7.6 → 8'],
      ['sections[0].led_resolution.y', 'defaulted', [], 32, 'Section 1 "S": Pixels Y (invalid) → 32'],
      ['sections[0].curvature.angle_degrees', 'clamped', -400, -180, 'Section 1 "S": Panel Angle (°) -400 → -180'],
      ['sections[0].curvature.angle_offset_degrees', 'defaulted', {}, 0, 'Section 1 "S": Section Offset (°) (invalid) → 0'],
    ]);
    for (const i of r.issues) assert.deepEqual(Object.keys(i), ['path', 'code', 'severity', 'message', 'from', 'to']);
  });

  test("07 6.7 num: only plain numeric text is a number ('1e400' and ' 7 ' and '0x10')", () => {
    const one = (v) => validate([section({ panel: { columns: v, rows: 3, width_mm: 500, height_mm: 500 } })]);
    assert.equal(one(' 7 ').project.sections[0].panel.columns, 7);
    assert.equal(one('.5e1').project.sections[0].panel.columns, 5);
    for (const v of ['1e400', '0x10', 'abc', '', '7 7', true, null, NaN, Infinity]) {
      const r = one(v);
      assert.equal(r.project.sections[0].panel.columns, 5, String(v));
      assert.equal(warnings(r)[0].code, 'defaulted', String(v));
    }
    const missing = validate([section({ panel: { rows: 3 } })]);
    assert.deepEqual(warnings(missing), [], 'a missing field takes its default silently');
    assert.equal(missing.project.sections[0].panel.columns, 5);
  });

  test('names (07 6.7, 08 A3): numbers coerced, controls and bidi stripped, 32 units without splitting a pair, never trimmed, empty -> default', () => {
    const name = (v) => validate([section({ name: v })]);
    assert.deepEqual([name(42).project.sections[0].name, warnings(name(42))[0].code], ['42', 'coerced']);
    assert.equal(name('  spaced  ').project.sections[0].name, '  spaced  ');
    assert.deepEqual(warnings(name('  spaced  ')), []);
    const r = name('A\u0000B\u0085C‪D⁩E');
    assert.equal(r.project.sections[0].name, 'ABCDE');
    assert.deepEqual(warnings(r).map((i) => i.code), ['sanitized']);
    const long = name('x'.repeat(33));
    assert.equal(long.project.sections[0].name, 'x'.repeat(32));
    assert.deepEqual(warnings(long).map((i) => i.code), ['truncated']);
    const pair = name(`${'x'.repeat(31)}\u{1F600}y`);
    assert.equal(pair.project.sections[0].name, 'x'.repeat(31), 'the pair at units 32-33 is dropped whole');
    const empty = name('\u0001\u0002');
    assert.equal(empty.project.sections[0].name, 'Wall 1');
    assert.deepEqual(warnings(empty).map((i) => i.code), ['sanitized', 'defaulted']);
    assert.equal(warnings(empty)[1].message, 'Section 1 "Wall 1": Section Name "" → "Wall 1"');
    assert.deepEqual(warnings(name(true)).map((i) => [i.code, i.message]), [['defaulted', 'Section 1 "Wall 1": Section Name (invalid) → "Wall 1"']]);
    assert.deepEqual(warnings(name(undefined)), [], 'a missing name takes the default silently');
  });

  test('colours (07 6.7 hex): #rrggbb lower-cased silently, #rgb expanded (coerced), anything else -> the default (sanitized)', () => {
    const color = (v, i = 0) => validate([...Array.from({ length: i }, (_, k) => section({ id: k + 10 })), section({ color: v })]);
    assert.deepEqual([color('#AABBCC').project.sections[0].color, warnings(color('#AABBCC'))], ['#aabbcc', []]);
    assert.equal(color('#AbC').project.sections[0].color, '#aabbcc');
    assert.deepEqual(warnings(color('#AbC')).map((i) => i.code), ['coerced']);
    for (const v of ['red', 'red;outline:3px solid lime', '#12345', '#1234567', 0, null, {}, '']) {
      const r = color(v, 2);
      assert.equal(r.project.sections[2].color, Palette.legacySectionColors[2], String(v));
      assert.deepEqual(warnings(r).map((i) => i.code), ['sanitized'], String(v));
    }
    assert.equal(warnings(color('url(javascript:x)'))[0].message, 'Section 1 "S": Panel Colour "url(javascript:x)" → "#00f0ff"');
  });

  test('ids (07 6.8): the first occurrence keeps its id; duplicates, strings, fractions and negatives are renumbered from max + 1', () => {
    const ids = (list) => validate(list.map((id, i) => section({ id, name: `S${i}` })));
    const r = ids([1, 1, 2, 3]);
    assert.deepEqual(r.project.sections.map((s) => s.id), [1, 4, 2, 3]);
    assert.deepEqual(warnings(r).map((i) => [i.path, i.code, i.from, i.to, i.message]),
      [['sections[1].id', 'reassigned-id', 1, 4, 'Section 2 "S1": id 1 → 4']]);
    assert.deepEqual(ids(['abc']).project.sections.map((s) => s.id), [0]);
    assert.equal(warnings(ids(['abc']))[0].message, 'Section 1 "S0": id "abc" → 0');
    assert.deepEqual(ids([5, '5', 2.5, -1, 5]).project.sections.map((s) => s.id), [5, 6, 7, 8, 9]);
    assert.deepEqual(ids([3, 7, 2]).issues, [], 'concave_offsets: 3, 7 and the index id 2 keep their ids');
    // the top of the range: the smallest unused id, so re-validation never renumbers again
    const top = ids([2147483647, 2147483647, 0]);
    assert.deepEqual(top.project.sections.map((s) => s.id), [2147483647, 1, 0]);
    assert.deepEqual(validateProject(top.project, { palette: LEGACY_COLORS }).issues, []);
    // nextSectionId is recomputed on apply (Wall.replaceAll), never stored
    const wall = new Wall();
    wall.replaceAll(sectionsFromProject(ids([1, 1, 2, 3]).project));
    assert.equal(wall.nextSectionId, 5);
  });

  test("mesh_mode: null / absent keeps the current mode (no issue), a known mode applies, anything else -> 'combined' with a warning", () => {
    for (const m of [null, undefined]) {
      const r = validate([section()], m === undefined ? {} : { mesh_mode: m });
      assert.equal(r.project.mesh_mode, null);
      assert.deepEqual(r.issues, []);
    }
    for (const m of MESH_MODES) assert.equal(validate([section()], { mesh_mode: m }).project.mesh_mode, m);
    for (const [m, text] of [['weird', '"weird"'], ['Panel', '"Panel"'], [5, '5'], [{}, '(invalid)']]) {
      const r = validate([section()], { mesh_mode: m });
      assert.equal(r.project.mesh_mode, 'combined');
      assert.deepEqual(r.issues, [{ path: 'mesh_mode', code: 'defaulted', severity: 'warning', message: `Mesh mode: ${text} → "combined"`, from: m, to: 'combined' }]);
    }
  });

  test('a group that is not an object takes its defaults with one warning; a section that is not an object is a default section', () => {
    const r = validate([section({ panel: 7 }), 'x']);
    assert.deepEqual(r.project.sections[0].panel, { columns: 5, rows: 3, width_mm: 500, height_mm: 500 });
    assert.deepEqual(warnings(r).map((i) => [i.path, i.message]), [
      ['sections[0].panel', 'Section 1 "S": Panel 7 → defaults'],
      ['sections[1]', 'Section 2 "Wall 2": not a section, replaced by a default section'],
    ]);
  });

  test('__proto__, constructor and prototype keys are never read or copied (no prototype pollution)', () => {
    const doc = JSON.parse('{"sections": [{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"polluted": 2}}, "name": "P", "panel": {"__proto__": {"columns": 9}}}], "__proto__": {"polluted": 3}}');
    const r = serializer.read(doc);
    assert.ok(r.ok);
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(r.project.sections[0].panel.columns, 5, 'an own __proto__ key is not a field');
    assert.deepEqual(Object.keys(r.project.sections[0]), ['name', 'id', 'panel', 'led_resolution', 'curvature', 'color', 'logo']);
  });

  test('formatValue (08 3.3): strings JSON.stringify-ed, numbers as they are, anything else (invalid); 40 characters at most', () => {
    assert.equal(formatValue('a"b'), '"a\\"b"');
    assert.equal(formatValue(-0.5), '-0.5');
    assert.equal(formatValue(null), '(invalid)');
    assert.equal(formatValue('x'.repeat(60)).length, 40);
  });
});

describe('the pipeline (ProjectSerializer.read) on the harness documents and the app\'s own files', () => {
  test('every config of tests/regression/configs.mjs imports with zero warnings (only the migrated info), 08 criterion 16', () => {
    for (const [key, config] of Object.entries(CONFIGS)) {
      const r = serializer.read(JSON.parse(JSON.stringify(config)));
      assert.ok(r.ok, key);
      assert.deepEqual(r.issues.map((i) => i.code), ['migrated'], key);
      assert.equal(r.sourceVersion, 1);
    }
  });

  test('idempotence (07 4.7): validating a validated project raises no issue, over 2,000 seeded random documents', () => {
    const rand = rng(1234);
    const POOL = [0, -0, 1, 2.5, -3, 7, 50, 51, 1e9, '10', ' 4 ', 'abc', '', null, true, [], {}, '1e400', NaN, 65536.5, -181, 180];
    const pick = (a) => a[Math.floor(rand() * a.length)];
    let accepted = 0;
    for (let k = 0; k < 2000; k++) {
      const n = Math.floor(rand() * 5);
      const sections = Array.from({ length: n }, () => (rand() < 0.05 ? pick(POOL) : {
        name: rand() < 0.5 ? `N${Math.floor(rand() * 9)}\u0001` : pick(POOL), id: pick([0, 1, 1, 2, 'x', 2.5, -1, 2147483647]),
        panel: rand() < 0.1 ? pick(POOL) : { columns: pick(POOL), rows: pick(POOL), width_mm: pick(POOL), height_mm: pick(POOL) },
        led_resolution: { x: pick(POOL), y: pick(POOL) }, curvature: { angle_degrees: pick(POOL), angle_offset_degrees: pick(POOL) },
        color: pick(['#ABCDEF', '#abc', 'red', '', 0, '#00ff66']),
      }));
      const r = serializer.read({ sections, mesh_mode: pick(['combined', 'weird', '', 0, 'panel', null]) });
      if (!r.ok) continue;
      accepted++;
      const again = validateProject(r.project, { palette: LEGACY_COLORS });
      assert.deepEqual(again.issues, r.issues.filter((i) => i.code === 'budget'), `doc #${k} (07 D2: only the same budget notes)`);
      assert.deepEqual(again.project, r.project, `doc #${k}`);
      for (const s of r.project.sections) {
        for (const row of SECTION_NUMBER_ROWS) {
          const v = s[row.group][row.key];
          const { min, max, int } = WallSection.LIMITS[row.field];
          assert.ok(Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v)), `doc #${k} ${row.field} ${v}`);
        }
      }
      assert.equal(new Set(r.project.sections.map((s) => s.id)).size, r.project.sections.length, 'unique ids');
    }
    assert.ok(accepted > 1000);
  });

  test('reachability (08 criterion 16): every value the card rules produce passes the validator unchanged', () => {
    const rand = rng(77);
    const raws = ['', '0', '1', '2.5', '49.6', '50', '51', '1e9', '-1e9', '0.4', '65536.4', '70000', '100000.5', '-200', '180.0001', 'abc'];
    for (let k = 0; k < 3000; k++) raws.push(String((rand() - 0.4) * 10 ** Math.floor(rand() * 8)));
    const groups = { panelCols: ['panel', 'columns'], panelRows: ['panel', 'rows'], panelWidth: ['panel', 'width_mm'],
      panelHeight: ['panel', 'height_mm'], ledX: ['led_resolution', 'x'], ledY: ['led_resolution', 'y'],
      curveIntensity: ['curvature', 'angle_degrees'], angleOffset: ['curvature', 'angle_offset_degrees'] };
    for (const raw of raws) {
      const s = WallSection.createDefault({ color: '#d9d9d6' });
      for (const field of Object.keys(groups)) s.setField(field, raw);
      s.rename(raw, 0);
      const doc = section({ name: s.name, color: s.color });
      for (const [field, [g, key]] of Object.entries(groups)) doc[g] = { ...doc[g], [key]: s[field] };
      const r = validate([doc]);
      assert.deepEqual(r.issues.filter((i) => i.code !== 'budget'), [], `raw ${raw}`);
      assert.deepEqual(r.project.sections[0], doc, `raw ${raw}`);
    }
  });
});

// ---- 07 D2: the v2 path completed (budget, newer revision, the project block, ids at the top of the range) ----------

const v2doc = (over = {}) => ({ version: '2.0', format: 'morph-led-project', sections: [section()], ...over });
const readDoc = (doc) => serializer.read(JSON.parse(JSON.stringify(doc)));
const panelOf = (columns, rows) => ({ columns, rows, width_mm: 500, height_mm: 500 });

describe('07 D2: budget notes, newer revisions, the project block (D1), the id fallback', () => {
  test('budget (07 4.7, 6.7): an atlas beyond the canvas limits, or more than 20,000 panels, is a warning; the file opens', () => {
    const wide = readDoc(v2doc({ sections: [section({ panel: panelOf(50, 1), led_resolution: { x: 1000, y: 64 } })] }));
    assert.ok(wide.ok);
    assert.deepEqual(wide.issues.map((i) => [i.code, i.severity, i.path]), [['budget', 'warning', 'sections']]);
    assert.equal(wide.issues[0].message, "The wall's panel-ID image needs at least 50000×64 px, more than a browser can create "
      + '(32767 px per side, 268 MP): Export Panel IDs will refuse it and the ZIPs will leave such textures out.');
    const many = readDoc(v2doc({ sections: Array.from({ length: 200 }, (_, i) => section({ id: i, panel: panelOf(20, 20), led_resolution: { x: 8, y: 8 } })) }));
    assert.deepEqual(many.issues.map((i) => i.message), ['The wall has 80000 panels, more than 20000: the 3D view and the exports may be very slow.']);
    // the v1 path raises it too, after the migrated info; exportLimits is injected (the validator never probes)
    const v1 = serializer.read({ sections: [{ panel: { columns: 50, rows: 1 }, led_resolution: { x: 1000, y: 64 } }] });
    assert.deepEqual(v1.issues.map((i) => i.code), ['migrated', 'budget']);
    const small = validateProject(v2doc(), { revision: 0, exportLimits: { maxSide: 100, maxArea: 1e9 } });
    assert.deepEqual(small.issues.map((i) => i.code), ['budget'], 'the default 5 x 32 LED columns exceed 100 px');
    assert.deepEqual(validateProject(v2doc(), { revision: 0 }).issues, [], 'the default wall fits');
  });

  test('newer revision (07 4.4 rule 4): one warning first, naming the format and the ignored keys; extensions kept verbatim', () => {
    const r = readDoc(v2doc({
      version: '2.4', pivot: { mode: 'x' },
      sections: [section({ uv_transform: {}, extensions: { 'acme.x': { deep: [1, 2] } } }), section({ id: 1, uv_transform: {} })],
      display: { show_pivot_marker: false }, extensions: { 'acme.y': 'kept' },
    }));
    assert.ok(r.ok);
    assert.equal(r.issues[0].code, 'newer-revision');
    assert.equal(r.issues[0].message, 'Some settings were saved by a newer version and were ignored (file format 2.4, this app '
      + 'reads 2.0): sections[].uv_transform, display.show_pivot_marker, pivot.');
    assert.deepEqual(r.issues.slice(1).map((i) => [i.code, i.severity]), Array(4).fill(['dropped-unknown', 'info']));
    assert.deepEqual(r.project.sections[0].extensions, { 'acme.x': { deep: [1, 2] } });
    assert.deepEqual(r.project.extensions, { 'acme.y': 'kept' });
    assert.equal(r.project.version, '2.0');
    assert.deepEqual(readDoc(v2doc({ pivot: {} })).issues.map((i) => i.code), ['dropped-unknown'], 'the same key in a 2.0 file: info only');
    assert.equal(readDoc(v2doc({ version: '2.1' })).issues[0].message,
      'Some settings were saved by a newer version and were ignored (file format 2.1, this app reads 2.0).');
    const keys = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`k${k}`, 1]));
    assert.match(readDoc(v2doc({ version: '2.1', ...keys })).issues[0].message, /: k0, k1, k2, k3, k4, k5, k6, k7, …and 2 more\.$/);
  });

  test('the project block (07 D1): name stripped, cut to 64 units, trimmed, empty -> the default; notes untrimmed; absent stays absent', () => {
    const r = readDoc(v2doc({ project: { name: `  A\u0000B ${'x'.repeat(80)}`, notes: ' n‮ ', client: 'X' } }));
    assert.deepEqual(r.project.project, { name: `AB ${'x'.repeat(59)}`, notes: ' n ' }, 'stripped, cut to 64 (with the leading spaces), then trimmed');
    assert.deepEqual(r.issues.map((i) => [i.path, i.code]), [['project.name', 'sanitized'], ['project.name', 'truncated'],
      ['project.name', 'sanitized'], ['project.notes', 'sanitized'], ['project.client', 'dropped-unknown']]);
    assert.deepEqual(validateProject(r.project, { revision: 0, palette: { sectionColors: Palette.sectionColors } }).issues, [], 'idempotent');
    assert.deepEqual(readDoc(v2doc({ project: { name: ' ' } })).project.project, { name: 'Untitled stage', notes: '' });
    assert.equal(readDoc(v2doc({ project: { name: 7 } })).project.project.name, '7');
    assert.equal('project' in readDoc(v2doc()).project, false);
    assert.deepEqual(Object.keys(readDoc(v2doc({ project: {} })).project).slice(0, 4), ['version', 'format', 'project', 'sections']);
  });

  test('ids at the top of the range on the v2 path (07 6.8): 2147483647 and a duplicate re-validate with no issue', () => {
    const r = readDoc(v2doc({ sections: [section({ id: 2147483647 }), section({ id: 2147483647 }), section({ id: 0 })] }));
    assert.deepEqual(r.project.sections.map((s) => s.id), [2147483647, 1, 0]);
    assert.deepEqual(r.issues.map((i) => i.code), ['reassigned-id']);
    assert.deepEqual(validateProject(r.project, { revision: 0, palette: { sectionColors: Palette.sectionColors } }).issues, []);
  });

  test('201 sections are refused (limit-exceeded); logo assets after the 64th are dropped (sanitized)', () => {
    const over = readDoc(v2doc({ sections: Array.from({ length: 201 }, (_, i) => section({ id: i })) }));
    assert.deepEqual([over.ok, over.issues[0].code], [false, 'limit-exceeded']);
    const png = (k) => `data:image/png;base64,${Buffer.from(`png-${k}`).toString('base64')}`;
    const assets = Array.from({ length: 65 }, (_, k) => ({ id: `a_${k}`, kind: 'logo', name: `l${k}.png`, mime: 'image/png', storage: 'inline', data_uri: png(k) }));
    const sections = assets.map((a, i) => section({ id: i, logo: { asset_id: a.id, position: 'center', scale: 0.3 } }));
    const r = readDoc(v2doc({ sections, assets }));
    assert.equal(r.project.assets.length, 64);
    assert.deepEqual(r.issues.filter((i) => i.path === 'assets[64]').map((i) => i.code), ['sanitized']);
    assert.equal(r.project.sections[64].logo, null, 'its section loses the logo (missing-asset)');
  });
});

describe('07 D2: fuzz of the v2 path (2,000 seeded hostile documents)', () => {
  test('never throws; output re-validates to itself; Object.prototype untouched; every number finite; ids unique in range', () => {
    const rand = rng(0x07d2);
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const hostileObject = () => JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": 1}}, "prototype": 3}');
    let deep = 1;
    for (let d = 0; d < 12; d++) deep = { 'acme.d': deep };
    const POOL = [NaN, Infinity, -Infinity, '1e400', '-1e400', -0, -5, 2.5, 0.4, 1e12, -1e12, '10', ' 7 ', '', null, true, false,
      [], {}, [[1, [2]]], 'x'.repeat(300), '<img src=x onerror=alert(1)>', '#ABC', 'red', 2147483647, deep, hostileObject];
    // a fresh copy of every object value (a shared one could become a cycle under later mutations)
    const value = () => { const v = pick(POOL); return typeof v === 'function' ? v() : v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; };
    const png = `data:image/png;base64,${Buffer.from('fake png bytes').toString('base64')}`;
    const base = () => ({
      version: '2.0', format: 'morph-led-project', project: { name: 'P', notes: '' },
      sections: [0, 1, 2].map((i) => ({ ...section({ id: i, name: `S${i}` }), logo: i === 1 ? { asset_id: 'a_1', position: 'center', scale: 0.5 } : null, extensions: { 'acme.k': [i] } })),
      mesh_mode: 'section',
      display: { content: 'ledSim', led_layout: 'square', wireframe: true, show_frame: false, show_grid: true, show_safe_distance: false },
      panel_id_style: { border_thickness: 8, font_size: 0, font_color: '#ffffff', section_label_enabled: true, section_label_font_size: 0, section_label_color: '#888888' },
      camera: { enabled: true, filmback: 'custom', filmback_width_mm: 30, filmback_height_mm: 20, focal_length_mm: 50,
        position_m: { x: 1, y: 2, z: 3 }, rotation_deg: { x: 4, y: 500, z: 6 } },
      props: { person: { visible: true, position_m: { x: 1, z: 2 }, rotation_y_deg: 3, scale: 1 }, car: { visible: false, position_m: { x: 4, z: 3 }, rotation_y_deg: 0, scale: 2 } },
      assets: [{ id: 'a_1', kind: 'logo', name: 'l.png', mime: 'image/png', bytes: 14, sha256: 'ab'.repeat(32), storage: 'inline', data_uri: png }],
      extensions: { 'acme.top': { a: 1 } },
    });
    /** Every [container, key] of a JSON tree (objects and arrays), depth first. */
    const slots = (v, out = []) => {
      if (v !== null && typeof v === 'object') for (const k of Object.keys(v)) { out.push([v, k]); slots(v[k], out); }
      return out;
    };
    const finiteNumbers = (v, path) => {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path} = ${v}`);
      else if (v !== null && typeof v === 'object') for (const k of Object.keys(v)) finiteNumbers(v[k], `${path}.${k}`);
    };
    const opts = { palette: { sectionColors: Palette.sectionColors }, revision: 0 };
    let accepted = 0;
    for (let k = 0; k < 2000; k++) {
      const doc = base();
      for (let m = 0, n = 1 + Math.floor(rand() * 6); m < n; m++) {
        const [obj, key] = pick(slots(doc));
        const r = rand();
        if (r < 0.7) obj[key] = value();
        else if (r < 0.85 && !Array.isArray(obj)) obj[`x${m}`] = value();
        else if (Array.isArray(obj)) obj.push(value());
        else Object.defineProperty(obj, '__proto__', { value: { polluted: true }, enumerable: true, configurable: true, writable: true });
      }
      if (rand() < 0.02) doc.sections = Array.from({ length: 201 }, () => section());
      const r = validateProject(doc, opts);
      assert.equal(({}).polluted, undefined, `doc #${k}: no prototype pollution`);
      if (!r.ok) {
        assert.equal(r.project, null);
        continue;
      }
      accepted++;
      const again = validateProject(r.project, opts);
      assert.deepEqual(again.issues, r.issues.filter((i) => i.code === 'budget'), `doc #${k}: idempotent`);
      assert.deepEqual(again.project, r.project, `doc #${k}: the same project`);
      finiteNumbers(r.project, `doc #${k}`);
      const ids = r.project.sections.map((s) => s.id);
      assert.ok(ids.length >= 1 && ids.length <= 200 && new Set(ids).size === ids.length
        && ids.every((id) => Number.isInteger(id) && id >= 0 && id <= 2147483647), `doc #${k} ids`);
      assert.ok(r.project.assets.every((a) => r.project.sections.some((s) => s.logo && s.logo.asset_id === a.id)), `doc #${k}: only referenced assets`);
    }
    assert.ok(accepted > 1500, `accepted ${accepted}`);
  });
});
