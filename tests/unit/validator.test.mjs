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
    for (const v of ['2.0', '2.1', '3.0']) {
      const e = err({ version: v, sections: [] });
      assert.deepEqual(e, { path: 'version', code: 'newer-version', severity: 'error', message: `Import failed: this project was saved by a newer version of the app (version ${v}).` });
    }
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
      assert.deepEqual(again.issues, [], `doc #${k}`);
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
      assert.deepEqual(r.issues, [], `raw ${raw}`);
      assert.deepEqual(r.project.sections[0], doc, `raw ${raw}`);
    }
  });
});
