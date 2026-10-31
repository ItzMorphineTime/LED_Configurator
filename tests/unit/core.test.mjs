// Unit tests for the WP3 foundation modules that are not domain entities:
// core/EventBus, legacy/LegacyCompat, theme/Theme and ui/dom, plus a layering/purity scan of every WP3 module.
// Run: node --test tests/unit/core.test.mjs   (zero dependencies; Node 22.7+, because js/ has no package.json "type" and Node must detect ESM syntax)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Events, EventBus } from '../../js/core/EventBus.js';
import { RENDER_ORDER } from '../../js/core/renderOrder.js';
import {
  Strategies, unsupportedStrategy, orDefault, LEGACY_SITES,
} from '../../js/legacy/LegacyCompat.js';
import * as LegacyCompat from '../../js/legacy/LegacyCompat.js';
import { SceneTheme, CanvasTheme, UiColors, Palette, Brand, Theme } from '../../js/theme/Theme.js';
import { byId, flipToggle, setDisplay, createDialogs, escapeHtml, setTitleWithWarning } from '../../js/ui/dom.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARCHITECTURE = readFileSync(join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');

/** Every value reachable from `value` (objects and arrays) is frozen. */
function assertDeepFrozen(value, path = 'root') {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), `${path} is not frozen`);
  for (const key of Object.keys(value)) assertDeepFrozen(value[key], `${path}.${key}`);
}

// ---------------------------------------------------------------------------------------------------------------
// core/EventBus
// ---------------------------------------------------------------------------------------------------------------

describe('Events catalogue', () => {
  test('is exactly the 19 Phase-1 entries plus the feature events of ARCHITECTURE.md 3.2, frozen', () => {
    assert.deepEqual({ ...Events }, {
      WALL_STATS_CHANGED:           'wall:statsChanged',
      WALL_SECTIONS_CHANGED:        'wall:sectionsChanged',
      WALL_SECTION_RENAMED:         'wall:sectionRenamed',
      WALL_MESH_MODE_CHANGED:       'wall:meshModeChanged',
      WALL_REBUILT:                 'wall:rebuilt',
      DISPLAY_CONTENT_CHANGED:      'display:contentChanged',
      CAMERA_PREVIEW_CHANGED:       'camera:previewChanged',
      CAMERA_FILMBACK_CHANGED:      'camera:filmbackChanged',
      CAMERA_LENS_CHANGED:          'camera:lensChanged',
      CAMERA_COVERAGE_CHANGED:      'camera:coverageChanged',
      CAMERA_POSE_CHANGED:          'camera:poseChanged',
      CAMERA_SAFE_DISTANCE_TOGGLED: 'camera:safeDistanceToggled',
      PROP_VISIBILITY_CHANGED:      'prop:visibilityChanged',
      PROP_POSE_CHANGED:            'prop:poseChanged',
      SELECTION_CHANGED:            'selection:changed',
      SELECTABLE_MOVED:             'selectable:moved',
      GIZMO_MODE_CHANGED:           'gizmo:modeChanged',
      GIZMO_SPACE_CHANGED:          'gizmo:spaceChanged',
      PILOT_CHANGED:                'pilot:changed',
      DEBUG_VIEW_CHANGED:           'debug:viewChanged',   // 01 F1-2
      WALL_PIVOT_CHANGED:           'wall:pivotChanged',   // 03 T4 (a visual event, 07 C47)
    });
    assert.equal(Object.keys(Events).length, 21);
    assert.ok(Object.isFrozen(Events));
  });

  test('every catalogue value appears in the event table of ARCHITECTURE.md 5.2', () => {
    for (const [key, value] of Object.entries(Events)) {
      assert.ok(ARCHITECTURE.includes(`| \`${value}\` (\`${key}\`) |`), `${key} missing from 5.2`);
    }
  });
});

describe('EventBus', () => {
  test('emit is synchronous and calls handlers in subscription order with the payload', () => {
    const bus = new EventBus();
    const calls = [];
    bus.on(Events.WALL_STATS_CHANGED, (p) => calls.push(['a', p]));
    bus.on(Events.WALL_STATS_CHANGED, (p) => calls.push(['b', p]));
    bus.on(Events.WALL_REBUILT, (p) => calls.push(['other', p]));
    const payload = { totalPixels: 1 };
    const result = bus.emit(Events.WALL_STATS_CHANGED, payload);
    assert.equal(result, undefined);
    assert.deepEqual(calls, [['a', payload], ['b', payload]]);
    assert.equal(calls[0][1], payload, 'the payload object is passed through, not copied');
  });

  test('emit without subscribers is a no-op', () => {
    const bus = new EventBus();
    assert.doesNotThrow(() => bus.emit(Events.PILOT_CHANGED, { active: true }));
  });

  test('a duplicate subscription runs once per subscription (no de-duplication)', () => {
    const bus = new EventBus();
    let n = 0;
    const h = () => { n++; };
    bus.on(Events.PILOT_CHANGED, h);
    bus.on(Events.PILOT_CHANGED, h);
    bus.emit(Events.PILOT_CHANGED, {});
    assert.equal(n, 2);
    bus.off(Events.PILOT_CHANGED, h);
    bus.emit(Events.PILOT_CHANGED, {});
    assert.equal(n, 3, 'off removes one subscription');
  });

  test('iterates a snapshot: a handler added during emit is not called in that emit', () => {
    const bus = new EventBus();
    const calls = [];
    const late = () => calls.push('late');
    bus.on(Events.SELECTION_CHANGED, () => {
      calls.push('first');
      bus.on(Events.SELECTION_CHANGED, late);
    });
    bus.on(Events.SELECTION_CHANGED, () => calls.push('second'));
    bus.emit(Events.SELECTION_CHANGED, {});
    assert.deepEqual(calls, ['first', 'second']);
    calls.length = 0;
    bus.off(Events.SELECTION_CHANGED, late);   // the first handler re-adds it below
    bus.emit(Events.SELECTION_CHANGED, {});
    assert.deepEqual(calls, ['first', 'second']);
  });

  test('iterates a snapshot: a handler removed during emit still runs in that emit', () => {
    const bus = new EventBus();
    const calls = [];
    const second = () => calls.push('second');
    bus.on(Events.GIZMO_MODE_CHANGED, () => {
      calls.push('first');
      bus.off(Events.GIZMO_MODE_CHANGED, second);
    });
    bus.on(Events.GIZMO_MODE_CHANGED, second);
    bus.emit(Events.GIZMO_MODE_CHANGED, {});
    assert.deepEqual(calls, ['first', 'second']);
    calls.length = 0;
    bus.emit(Events.GIZMO_MODE_CHANGED, {});
    assert.deepEqual(calls, ['first']);
  });

  test('never catches: a handler exception propagates and aborts the later handlers', () => {
    const bus = new EventBus();
    const calls = [];
    const boom = new TypeError('boom');
    bus.on(Events.WALL_SECTIONS_CHANGED, () => calls.push('before'));
    bus.on(Events.WALL_SECTIONS_CHANGED, () => { throw boom; });
    bus.on(Events.WALL_SECTIONS_CHANGED, () => calls.push('after'));
    assert.throws(() => bus.emit(Events.WALL_SECTIONS_CHANGED, { reason: 'add' }), (err) => err === boom);
    assert.deepEqual(calls, ['before']);
  });

  test('unknown event names throw in on, off and emit', () => {
    const bus = new EventBus();
    const message = { message: 'Unknown event: wall:nope' };
    assert.throws(() => bus.on('wall:nope', () => {}), message);
    assert.throws(() => bus.off('wall:nope', () => {}), message);
    assert.throws(() => bus.emit('wall:nope', {}), message);
    assert.throws(() => bus.on('WALL_STATS_CHANGED', () => {}), { message: 'Unknown event: WALL_STATS_CHANGED' },
      'the constant name is not a wire name');
    assert.throws(() => bus.emit(undefined), { message: 'Unknown event: undefined' });
  });

  test('on returns an unsubscribe function; off of an absent handler is a no-op', () => {
    const bus = new EventBus();
    const calls = [];
    const unsubscribe = bus.on(Events.PILOT_CHANGED, (p) => calls.push(p.active));
    assert.equal(typeof unsubscribe, 'function');
    bus.emit(Events.PILOT_CHANGED, { active: true });
    unsubscribe();
    bus.emit(Events.PILOT_CHANGED, { active: false });
    assert.deepEqual(calls, [true]);
    assert.doesNotThrow(() => unsubscribe(), 'unsubscribe is idempotent');
    assert.doesNotThrow(() => bus.off(Events.PILOT_CHANGED, () => {}));
    assert.doesNotThrow(() => bus.off(Events.WALL_REBUILT, () => {}), 'type never subscribed');
  });

  test('a second unsubscribe call does not remove another subscription of the same handler', () => {
    const bus = new EventBus();
    let n = 0;
    const h = () => { n++; };
    const unsubscribeA = bus.on(Events.PILOT_CHANGED, h);
    bus.on(Events.PILOT_CHANGED, h);
    unsubscribeA();
    unsubscribeA();
    bus.emit(Events.PILOT_CHANGED, {});
    assert.equal(n, 1);
  });

  test('buses are independent', () => {
    const a = new EventBus();
    const b = new EventBus();
    let n = 0;
    a.on(Events.PILOT_CHANGED, () => { n++; });
    b.emit(Events.PILOT_CHANGED, {});
    assert.equal(n, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// legacy/LegacyCompat
// ---------------------------------------------------------------------------------------------------------------

describe('Strategies', () => {
  test('has exactly the keys and values of ARCHITECTURE.md 3.3 (Phase-1 values except the Phase-2 flips)', () => {
    assert.deepEqual(Strategies, {
      mesh: {
        viewport: { winding: 'ccw', normals: 'averaged', combinedUV: 'plan', side: 'double' },
        obj: { winding: 'ccw', normals: 'averaged', stripNormals: 'per-vertex',
               combinedUV: 'plan', panelNormal: 'facing' },
        gltf: { winding: 'ccw', normals: 'averaged', panelNormal: 'facing', attributes: ['POSITION', 'NORMAL', 'TEXCOORD_0'],
                combinedUV: 'plan', indexType: 'auto', doubleSided: 'omit' },
      },
      framingBounds: 'layout',   // 08 P2-11c (Phase-1 'flat', 03 T2 'flat-pivot')
      curveBeforeFirstPanel: true,
      gizmoRotateSign: -1,
      pilotForwardYSign: -1,
    });
    assert.equal(Strategies.dispose, undefined, 'dispose.* retired by 08 P2-12a (always dispose)');
    assert.equal(Strategies.frustumDepthM, undefined, 'retired by 08 P2-11b (the frustum ends at the wall)');
  });

  test('is deep-frozen (nested profiles and arrays included)', () => {
    assertDeepFrozen(Strategies, 'Strategies');
    assert.throws(() => { Strategies.gizmoRotateSign = 1; }, TypeError);
    assert.throws(() => { Strategies.mesh.viewport.winding = 'legacy-cw'; }, TypeError);
    assert.throws(() => { Strategies.mesh.gltf.attributes.push('TEXCOORD_0'); }, TypeError);
    assert.throws(() => { Strategies.framingBounds = 'flat-pivot'; }, TypeError);
    assert.equal(Strategies.gizmoRotateSign, -1);
  });

  test('mesh.gltf.doubleSided is the string "omit" (the material object gets no doubleSided key)', () => {
    assert.equal(Strategies.mesh.gltf.doubleSided, 'omit');
  });
});

describe('unsupportedStrategy', () => {
  test('returns (does not throw) an Error with the documented message', () => {
    const err = unsupportedStrategy('mesh.viewport.side', 'front');
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'Unsupported strategy mesh.viewport.side="front"');
    assert.equal(unsupportedStrategy('curveBeforeFirstPanel', false).message,
      'Unsupported strategy curveBeforeFirstPanel=false');
    assert.equal(unsupportedStrategy('mesh.gltf.attributes', ['POSITION', 'NORMAL']).message,
      'Unsupported strategy mesh.gltf.attributes=["POSITION","NORMAL"]');
  });
});

describe('orDefault', () => {
  test('equals the legacy `v || d` for every falsy and truthy kind', () => {
    const marker = { default: true };
    const obj = {};
    const table = [0, -0, '', NaN, null, undefined, false, 0n, 1, -1, 0.5, Infinity, -Infinity, '0', ' ', 'abc', true, obj, []];
    for (const v of table) {
      assert.ok(Object.is(orDefault(v, marker), v || marker), `orDefault(${String(v)})`);
    }
  });

  test('spot values (B-L9: 0, empty and NaN fall back to the default)', () => {
    assert.equal(orDefault(0, 1.5), 1.5);
    assert.equal(orDefault(-0, 7), 7);
    assert.equal(orDefault(NaN, 36), 36);
    assert.equal(orDefault('', 'Wall 1'), 'Wall 1');
    assert.equal(orDefault('0', 5), '0');
    assert.equal(orDefault(2.5, 1), 2.5);
  });
});

describe('retired legacy helpers', () => {
  test('legacyMissingDownloadBlob is gone (B-M1 landed in 08 P2-5a: the safe-distance OBJ uses downloader.saveBlob)', () => {
    assert.equal('legacyMissingDownloadBlob' in LegacyCompat, false);
    assert.equal(typeof globalThis.downloadBlob, 'undefined');
  });

  test('legacySpreadBase64 and Strategies.gltfBase64 are gone (B-H3 landed in 08 P2-1a: GltfExporter.chunkedBase64)', () => {
    assert.equal('legacySpreadBase64' in LegacyCompat, false);
    assert.equal('gltfBase64' in Strategies, false);
  });

  test('legacyHtml is gone (B-M4 landed in 08 P2-3a: ui/dom.js escapeHtml)', () => {
    assert.equal('legacyHtml' in LegacyCompat, false);
  });

  test('Strategies.importValidation is gone (B-L8 landed in 08 P2-3b: ProjectSerializer.read always validates)', () => {
    assert.equal('importValidation' in Strategies, false);
  });
});

/** Splits a markdown table row into cells, honouring `\|` escapes. */
function tableCells(line) {
  return line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** The lines of ARCHITECTURE.md between two headings. */
function architectureSection(startHeading, endHeading) {
  const lines = ARCHITECTURE.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(startHeading));
  const end = lines.findIndex((l, i) => i > start && l.startsWith(endHeading));
  assert.ok(start >= 0 && end > start, `section ${startHeading} not found`);
  return lines.slice(start, end);
}

describe('LEGACY_SITES', () => {
  const expectedPairs = [];
  for (const line of architectureSection('### 8.3', '### 8.4')) {
    if (!line.startsWith('| `')) continue;
    const [siteCell, idsCell] = tableCells(line);
    const site = siteCell.match(/`([^`]+)`/)[1];
    for (const id of idsCell.split(',').map((s) => s.trim())) expectedPairs.push({ id, site });
  }
  const register = new Map();
  for (const line of architectureSection('### 8.2', '### 8.3')) {
    if (!/^\| B-[HML]\d+ \|/.test(line)) continue;
    const [id, behaviour, , fix] = tableCells(line);
    register.set(id, { behaviour, fix });
  }

  test('is a frozen array of frozen { id, site, behaviour, fix } entries with string values', () => {
    assert.ok(Array.isArray(LEGACY_SITES));
    assert.ok(Object.isFrozen(LEGACY_SITES));
    for (const entry of LEGACY_SITES) {
      assert.ok(Object.isFrozen(entry));
      assert.deepEqual(Object.keys(entry), ['id', 'site', 'behaviour', 'fix']);
      assert.match(entry.id, /^B-[HML]\d+$/);
      for (const key of ['site', 'behaviour', 'fix']) {
        assert.equal(typeof entry[key], 'string');
        assert.ok(entry[key].length > 0, `${entry.id} ${key} is empty`);
      }
    }
  });

  test('the contract tables parse (57 register rows; at least one 8.3 pair per open bug id)', () => {
    assert.equal(register.size, 57, '5 high + 16 medium + 36 low');
    // A landed fix has no 8.3 pair (below); 08 P2-5b took the count of pairs below 57.
    assert.ok(expectedPairs.length >= 57 - landed.length, `only ${expectedPairs.length} pairs parsed from 8.3`);
  });

  test('(id, site) pairs equal the ARCHITECTURE.md 8.3 table exactly, in table order', () => {
    assert.deepEqual(LEGACY_SITES.map(({ id, site }) => ({ id, site })), expectedPairs);
  });

  test('no (id, site) pair is duplicated', () => {
    const keys = LEGACY_SITES.map(({ id, site }) => `${id} @ ${site}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  // Quirks fixed since Phase 1 keep their 8.2 row, with a fix cell starting with 'Landed', but have no 8.3 site.
  const landed = [...register].filter(([, row]) => /^Landed\b/.test(row.fix)).map(([id]) => id);
  // The Phase 2 fixes landed so far (docs/improvements/08-bugfix-roadmap.md section 10, merge order), each with the
  // 08 commit its 8.2 fix cell names. Every landing commit adds its id here.
  const PHASE2_LANDED = { 'B-M1': 'P2-5a', 'B-H3': 'P2-1a', 'B-L5': 'P2-1b', 'B-L4': 'P2-1c', 'B-H1': 'P2-2a', 'B-L3': 'P2-2b', 'B-H2': 'P2-2c',
    'B-L11': 'P2-9b', 'B-L15': 'P2-8a', 'B-M4': 'P2-3a', 'B-L8': 'P2-3b', 'B-L16': 'P2-3c', 'B-L21': 'P2-3d', 'B-H4': 'P2-4a', 'B-M8': 'P2-4b',
    'B-M15': 'P2-5b', 'B-L29': 'P2-5b', 'B-M3': 'P2-6a', 'B-L14': 'P2-6b', 'B-L7': 'P2-6c', 'B-M2': 'P2-6d', 'B-M16': 'P2-12d', 'B-M5': 'P2-7a', 'B-M6': 'P2-7b', 'B-M7': 'P2-7c', 'B-L6': 'P2-7d', 'B-L18': 'P2-7e',
    'B-M11': 'P2-10a', 'B-L33': 'P2-11b', 'B-M10': 'P2-11a', 'B-L2': 'P2-11c' };
  // The Phase 1C clean-ups (memory only; their Strategies.dispose.* switches were retired by 08 P2-12a), with the step
  // their 8.2 fix cell names.
  const PHASE1C_LANDED = { 'B-H5': 'Phase 1C H1', 'B-L12': 'Phase 1C H2' };
  // The quirks a Phase 3 feature step fixed (its spec and step, as its 8.2 fix cell names them): B-L24's badge overlap in
  // 06 T4a (its .view-btn.active half had landed in 01 F1-2; its two CSS documentation entries are gone); B-M9 and B-L32 in
  // 07 R2 (the scissor preview of the single renderer took over 08 P2-10b, 07 C31).
  const PHASE3_LANDED = { 'B-L24': '06 T4a', 'B-M9': '07 R2', 'B-L32': '07 R2' };

  test('ids cover every bug id B-H1..B-H5, B-M1..B-M16, B-L1..B-L36 except the landed fixes, and nothing else', () => {
    const expected = new Set();
    for (let i = 1; i <= 5; i++) expected.add(`B-H${i}`);
    for (let i = 1; i <= 16; i++) expected.add(`B-M${i}`);
    for (let i = 1; i <= 36; i++) expected.add(`B-L${i}`);
    for (const id of landed) expected.delete(id);
    assert.deepEqual(new Set(LEGACY_SITES.map((e) => e.id)), expected);
  });

  test('landed fixes (8.2 "Landed ...") are exactly the Phase 1C clean-ups and the Phase 2 and 3 fixes', () => {
    assert.deepEqual(landed.slice().sort(),
      [...Object.keys(PHASE1C_LANDED), ...Object.keys(PHASE2_LANDED), ...Object.keys(PHASE3_LANDED)].sort());
    for (const [id, step] of Object.entries(PHASE1C_LANDED)) {
      assert.match(register.get(id).fix, new RegExp(`^Landed in ${step}\\b`), `${id}: 8.2 names ${step}`);
    }
    for (const id of landed) assert.ok(!LEGACY_SITES.some((e) => e.id === id), `${id} still has a LEGACY_SITES entry`);
    for (const [id, commit] of Object.entries(PHASE2_LANDED)) {
      assert.match(register.get(id).fix, new RegExp(`^Landed in 08 ${commit}\\b`), `${id}: 8.2 names ${commit}`);
    }
    for (const [id, step] of Object.entries(PHASE3_LANDED)) {
      assert.match(register.get(id).fix, new RegExp(`^Landed in ${step}\\b`), `${id}: 8.2 names ${step}`);
    }
  });

  test('behaviour and fix are taken from the ARCHITECTURE.md 8.2 register', () => {
    for (const entry of LEGACY_SITES) {
      const row = register.get(entry.id);
      assert.ok(row, `${entry.id} missing from 8.2`);
      assert.equal(entry.behaviour, row.behaviour, `${entry.id} behaviour`);
      assert.equal(entry.fix, row.fix, `${entry.id} fix`);
    }
  });

  test('documentation-only entries: B-L36 in index.html (the two B-L24 stylesheet entries left with 06 T4a)', () => {
    const docOnly = LEGACY_SITES.filter((e) => !e.site.startsWith('js/'));
    assert.deepEqual(docOnly.map(({ id, site }) => ({ id, site })), [
      { id: 'B-L36', site: 'index.html' },
    ]);
    for (const entry of LEGACY_SITES.filter((e) => e.site.startsWith('js/'))) {
      assert.match(entry.site, /^js\/[A-Za-z0-9/]+\.js#[A-Za-z0-9_.]+$/, `${entry.site} has the form js/<path>.js#<member>`);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// theme/Theme
// ---------------------------------------------------------------------------------------------------------------

describe('Theme', () => {
  test('is deep-frozen and composed of the five parts', () => {
    assertDeepFrozen(Theme, 'Theme');
    assert.deepEqual(Object.keys(Theme), ['scene', 'canvas', 'ui', 'palette', 'brand']);
    assert.equal(Theme.scene, SceneTheme);
    assert.equal(Theme.canvas, CanvasTheme);
    assert.equal(Theme.ui, UiColors);
    assert.equal(Theme.palette, Palette);
    assert.equal(Theme.brand, Brand);
  });

  test('scene values keep their numeric type; the Morph scene values since 06 T5 (06 3.8, 5.4)', () => {
    assert.deepEqual(SceneTheme, {
      background: 0x0a0a0a,
      grid: { size: 100, divisions: 100, centerColor: 0x333333, color: 0x1c1c1c, position: [0, 0, 0] },   // 03 T10 (Q8)
      axesSize: 0.5,
      lights: { ambient: { color: 0xffffff, intensity: 0.3 },
                point: { color: 0xffffff, intensity: 0.8, position: [5, 5, 10] } },
      frame: 0xd4d4d4,
      frameOnLight: 0x0a0a0a,
      cameraBody: { color: 0xc51622, opacity: 1.0, outlineColor: 0x0a0a0a },
      frustumLines: { color: 0xf7f7f5, haloColor: 0x0a0a0a, opacity: 1.0, dashSize: 0.15, gapSize: 0.10 },
      frustumFill: { color: 0xf7f7f5, opacity: 0.05 },
      safeZone: { wallColor: [61 / 255, 214 / 255, 140 / 255], thresholdColor: [197 / 255, 22 / 255, 34 / 255],
                  clampedColor: [255 / 255, 134 / 255, 64 / 255], floorOpacity: 0.5,   // clampedColor: 08 P2-5b
                  lineColor: 0xf2555a, lineOpacity: 0.9, labelColor: '#f2555a', labelFont: "600 32px 'Montserrat', system-ui, sans-serif" },
      person: { body: 0x4488ff, dark: 0x2244aa, opacity: 0.85 },
      car: { body: { color: 0xff4444, opacity: 0.85 }, dark: { color: 0x222222, opacity: 0.9 },
             glass: { color: 0x88ccff, opacity: 0.5 }, lights: 0xffffaa },
      gizmo: { x: 0xff4444, y: 0x44ff44, z: 0x4444ff, idleOpacity: 0.35, hoverOpacity: 1.0, dimmedOpacity: 0.15 },
      debug: { faceFront: 0x2f6bff, faceBack: 0xff3344, vertexNormal: 0xb8f03c, faceNormal: 0xff4fd8, lineBaseFactor: 0.35 },   // 01 F1-1 (4.6)
      pivot: { color: 0xf7f7f5, selectedColor: 0xc51622, anchorColor: 0xa3a3a3, haloColor: 0x0a0a0a, opacity: 0.9,   // 03 T1 (4.1; 06 5.12)
               glyphHalfSize: 0.25, coreRadius: 0.06, pickRadius: 0.15, dash: 0.05, minScreenHalfSizePx: 24 },
    });
    assert.equal(typeof SceneTheme.background, 'number');
    assert.equal(typeof SceneTheme.safeZone.labelColor, 'string');
  });

  test('canvas values and font helpers return the exact strings (06 T5: JetBrains Mono and Montserrat)', () => {
    assert.equal(CanvasTheme.background, '#0a0a0a');
    assert.deepEqual(CanvasTheme.panelBorderColors, ['#ff0000', '#00ff00', '#0000ff']);
    assert.equal(CanvasTheme.panelLabelFont(42), "bold 42px 'JetBrains Mono', ui-monospace, monospace");
    assert.equal(CanvasTheme.panelSectionNameFont(17.5), "17.5px 'JetBrains Mono', ui-monospace, monospace");
    assert.equal(CanvasTheme.sectionLabelFont(120), "bold 120px 'Montserrat', system-ui, sans-serif");
    assert.equal(CanvasTheme.sectionLabelAlpha, 0.6);
    assert.equal(CanvasTheme.logoAlpha, 0.8);
    assert.deepEqual(CanvasTheme.preloadFonts,
      ["bold 32px 'JetBrains Mono'", "32px 'JetBrains Mono'", "bold 32px 'Montserrat'", "600 32px 'Montserrat'"]);
  });

  test('status colours, palette and brand strings', () => {
    assert.deepEqual(UiColors, { status: { within: '#3dd68c', offCenter: '#ff8640', exceeds: '#f2555a' } });
    assert.deepEqual(Palette.sectionColors,   // 06 T7 (3.9)
      ['#d9d9d6', '#c51622', '#58a6e8', '#e2803c', '#14a37f', '#e68ac0', '#7462d8', '#6c6c6c']);
    assert.equal(Palette.cardSwatches, Palette.sectionColors, 'the same array');
    assert.equal(Palette.defaultSectionColor, '#d9d9d6');
    assert.deepEqual(Palette.legacySectionColors,   // 1379-1382: the v1 import fill
      ['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffdd00', '#aa66ff', '#66ffaa', '#ff6666']);
    assert.deepEqual(Brand, {   // 06 T6a: the Morph strings; 06 T6b: the file names from filePrefix (06 5.4)
      productName: 'Morph LED Configurator',
      jsonGenerator: { name: 'Morph LED Configurator' },
      shortName: 'LED Configurator',
      company: 'Morph',
      homepage: 'https://itzmorphinetime.github.io/LED_Configurator/',
      filePrefix: 'morph-led-wall',
      objHeader: '# Morph LED Configurator - LED wall OBJ export\n',
      objGeneratorLine: '# Generated by Morph LED Configurator\n\n',
      mtlHeader: '# Morph LED Configurator - LED wall materials\n\n',
      gltfGenerator: 'Morph LED Configurator',
      safeDistanceObjHeader: '# Safe Distance Floor Mesh\n# Exported from Morph LED Configurator\n\n',
      files: { json: 'morph-led-wall.json', obj: 'morph-led-wall.obj', mtl: 'morph-led-wall.mtl',
               gltf: 'morph-led-wall.gltf', zip: 'morph-led-wall-export.zip', panelIdsPng: 'morph-led-wall-panel-ids.png',
               objZip: 'morph-led-wall-obj.zip',   // 08 P2-6e
               safeDistanceObj: 'morph-led-wall-safe-distance.obj', hdriPixelMap: 'morph-led-wall-hdri-pixel-map.png' },
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// ui/dom
// ---------------------------------------------------------------------------------------------------------------

/** A minimal element with a classList and a style object. */
function fakeElement(classes = []) {
  const set = new Set(classes);
  return {
    style: {},
    classList: {
      toggle: (c) => { if (set.has(c)) { set.delete(c); return false; } set.add(c); return true; },
      contains: (c) => set.has(c),
    },
  };
}

describe('ui/dom', () => {
  test('byId delegates to doc.getElementById', () => {
    const el = {};
    const seen = [];
    const doc = { getElementById: (id) => { seen.push(id); return id === 'x' ? el : null; } };
    assert.equal(byId(doc, 'x'), el);
    assert.equal(byId(doc, 'y'), null);
    assert.deepEqual(seen, ['x', 'y']);
  });

  test('escapeHtml escapes & < > " \' (08 6.5) and converts non-strings like a template literal', () => {
    assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
    assert.equal(escapeHtml('<b id="xss-probe">B</b>'), '&lt;b id=&quot;xss-probe&quot;&gt;B&lt;/b&gt;');
    assert.equal(escapeHtml('Say "hi"'), 'Say &quot;hi&quot;');
    assert.equal(escapeHtml('a &amp; b'), 'a &amp;amp; b', 'escapes an existing entity again (no double-decoding)');
    assert.equal(escapeHtml('red;outline:3px solid lime'), 'red;outline:3px solid lime', 'CSS needs the colour rule (P2-3b), not escaping');
    for (const v of [0, -0, 5, 2.5, NaN, Infinity, null, undefined, true, { toString: () => 'x<' }, 'plain']) {
      assert.equal(escapeHtml(v), `${v}`.replace(/</g, '&lt;'), `escapeHtml(${String(v)})`);
    }
  });

  test('setTitleWithWarning writes the title from the model: text, then " " and the warning span when warn (08 6.5, B-L16)', () => {
    const made = [];
    const doc = {
      createTextNode: (t) => ({ kind: 'text', text: t }),
      createElement: (tag) => { const el = { kind: 'element', tag, className: '', textContent: '' }; made.push(el); return el; },
    };
    const title = {
      ownerDocument: doc, children: [], text: null,
      set textContent(v) { this.text = v; this.children = []; },
      appendChild(c) { this.children.push(c); return c; },
    };
    setTitleWithWarning(title, 'Stage <Left> "1"', true);
    assert.equal(title.text, 'Stage <Left> "1"', 'set as text, never parsed');
    assert.deepEqual(title.children, [{ kind: 'text', text: ' ' }, { kind: 'element', tag: 'span', className: 'warning-indicator', textContent: '⚠' }]);
    setTitleWithWarning(title, 'Foo', false);
    assert.equal(title.text, 'Foo');
    assert.deepEqual(title.children, [], 'no warning: the text only (the old children are replaced)');
    assert.equal(made.length, 1);
  });

  test('flipToggle toggles `active` and reads the new state back', () => {
    const el = fakeElement();
    assert.equal(flipToggle(el), true);
    assert.equal(el.classList.contains('active'), true);
    assert.equal(flipToggle(el), false);
    const on = fakeElement(['toggle', 'active']);
    assert.equal(flipToggle(on), false);
  });

  test('setDisplay writes block / none', () => {
    const el = fakeElement();
    setDisplay(el, true);
    assert.equal(el.style.display, 'block');
    setDisplay(el, false);
    assert.equal(el.style.display, 'none');
    setDisplay(el, 1);
    assert.equal(el.style.display, 'block');
  });

  test('createDialogs looks win.alert up at call time', () => {
    const messages = [];
    const win = { alert: () => { throw new Error('the original alert must not be cached'); } };
    const dialogs = createDialogs(win);
    win.alert = (msg) => messages.push(msg);   // e.g. the harness hook installed later
    const { alert } = dialogs;                   // also works detached
    assert.equal(dialogs.alert('Enable Safe Distance 3D visualization first'), undefined);
    alert('second');
    assert.deepEqual(messages, ['Enable Safe Distance 3D visualization first', 'second']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Layering and purity of the WP3 modules (ARCHITECTURE.md 1.3, R10). tests/static/check.mjs is the full gate;
// this is the WP3-local evidence.
// ---------------------------------------------------------------------------------------------------------------

const WP3_FILES = [
  'js/vendor/three.js', 'js/vendor/jszip.js', 'js/core/EventBus.js', 'js/legacy/LegacyCompat.js', 'js/theme/Theme.js',
  'js/domain/WallSection.js', 'js/domain/Wall.js', 'js/domain/Project.js', 'js/domain/LogoLibrary.js',
  'js/domain/CineCamera.js', 'js/domain/Prop.js', 'js/ui/dom.js',
];
const MAY_IMPORT = {
  vendor: [],
  core: ['core'],
  legacy: ['legacy'],
  theme: ['theme'],
  domain: ['domain', 'legacy'],
  ui: ['ui', 'core', 'legacy', 'domain'],
};

/** Replaces comments and string/template text by blanks, keeping the code inside `${...}`. */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const braceDepth = [];   // one counter per open `${`
  const scanTemplate = (j) => {
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '`') return j + 1;
      if (src[j] === '$' && src[j + 1] === '{') { braceDepth.push(0); return j + 2; }
      j++;
    }
    return j;
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 2; out += ' '; continue; }
    if (c === "'" || c === '"') {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
      i++;
      out += '""';
      continue;
    }
    if (c === '`') { i = scanTemplate(i + 1); out += '""'; continue; }
    if (braceDepth.length && c === '{') braceDepth[braceDepth.length - 1]++;
    if (braceDepth.length && c === '}') {
      if (braceDepth[braceDepth.length - 1] === 0) { braceDepth.pop(); i = scanTemplate(i + 1); out += '""'; continue; }
      braceDepth[braceDepth.length - 1]--;
    }
    out += c;
    i++;
  }
  return out;
}

describe('WP3 module layering and purity', () => {
  for (const file of WP3_FILES) {
    test(`${file}: imports stay inside its layer row; specifiers are relative, .js and case-exact`, () => {
      const abs = join(ROOT, file);
      const layer = file.split('/')[1];
      const code = stripCommentsAndStrings(readFileSync(abs, 'utf8'));
      const source = readFileSync(abs, 'utf8');
      const specifiers = [...source.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      assert.equal(specifiers.length, (code.match(/^\s*import\b/gm) || []).length, 'every import statement parsed');
      for (const spec of specifiers) {
        assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${spec} is relative`);
        assert.ok(spec.endsWith('.js'), `${spec} ends with .js`);
        const target = resolve(dirname(abs), spec);
        assert.ok(existsSync(target), `${spec} exists`);
        const name = target.split(sep).pop();
        assert.ok(readdirSync(dirname(target)).includes(name), `${spec} matches the on-disk case`);
        const targetLayer = relative(join(ROOT, 'js'), target).split(sep)[0];
        assert.ok(MAY_IMPORT[layer].includes(targetLayer), `${file} (${layer}) may not import ${targetLayer}/`);
      }
    });
  }

  test('core, legacy, theme and domain modules use no THREE, document or window identifier', () => {
    for (const file of WP3_FILES.filter((f) => /^js\/(core|legacy|theme|domain)\//.test(f))) {
      const code = stripCommentsAndStrings(readFileSync(join(ROOT, file), 'utf8'));
      const hits = [...code.matchAll(/(?<![.\w$])(THREE|document|window)(?![\w$])/g)].map((m) => m[1]);
      assert.deepEqual(hits, [], `${file} uses ${hits.join(', ')}`);
    }
  });

  test('self-check: the scan sees code identifiers and ignores comments and strings', () => {
    const vendor = stripCommentsAndStrings(readFileSync(join(ROOT, 'js/vendor/three.js'), 'utf8'));
    assert.match(vendor, /window\.THREE/);
    const sample = stripCommentsAndStrings("a = 'window'; // THREE\n/* document */ b = `x${window.c + `${THREE}`}y`;");
    assert.deepEqual([...sample.matchAll(/(?<![.\w$])(THREE|document|window)(?![\w$])/g)].map((m) => m[1]),
      ['window', 'THREE']);
  });

  test('no module-level let or var', () => {
    for (const file of WP3_FILES) {
      const code = stripCommentsAndStrings(readFileSync(join(ROOT, file), 'utf8'));
      assert.doesNotMatch(code, /^(let|var)\s/m, `${file} has module-level state`);
    }
  });

  test('every LEGACY tag in a WP3 file names exactly the ids of that file\'s 8.3 rows', () => {
    for (const file of WP3_FILES) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      const comments = source.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || [];
      const tagIds = new Set();
      for (const comment of comments) {
        for (const m of comment.matchAll(/LEGACY\((B-[HML]\d+(?:\s*,\s*B-[HML]\d+)*)\)/g)) {
          for (const id of m[1].split(',')) tagIds.add(id.trim());
        }
      }
      const siteIds = new Set(LEGACY_SITES.filter((e) => e.site.startsWith(`${file}#`)).map((e) => e.id));
      assert.deepEqual(tagIds, siteIds, file);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// core/renderOrder (docs/improvements/01-normals.md 5.5, CR-10; 01 F1-1)
// ---------------------------------------------------------------------------------------------------------------

describe('RENDER_ORDER', () => {
  test('is the frozen registry of every overlay slot of every spec, with unique values', () => {
    assert.ok(Object.isFrozen(RENDER_ORDER));
    assert.deepEqual(RENDER_ORDER, {
      HDRI_BACKDROP: -1e6, DEFAULT: 0, RIG_CORE: 1, INNER_FRUSTUM_OVERLAY: 990, MEASURE: 992, HDRI_MARKER: 993,
      UV_HOVER_OUTLINE: 994, NORMAL_LINES_ON_TOP: 995, PIVOT_MARKER: 996, HIGHLIGHT_HALO: 997, SECTION_HIGHLIGHT: 998,
      GIZMO: 999,
    });
    const values = Object.values(RENDER_ORDER);
    assert.equal(new Set(values).size, values.length, 'no two slots share a value');
  });

  test('the gizmo keeps the legacy 999 and the lines on top sit below every selection overlay', () => {
    assert.equal(RENDER_ORDER.GIZMO, 999);
    for (const k of ['PIVOT_MARKER', 'HIGHLIGHT_HALO', 'SECTION_HIGHLIGHT', 'GIZMO']) assert.ok(RENDER_ORDER.NORMAL_LINES_ON_TOP < RENDER_ORDER[k], k);
  });
});
