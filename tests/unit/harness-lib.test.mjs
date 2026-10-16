// Unit tests for the pure parts of the harness tooling of docs/improvements/01-normals.md T2 (8.2, 8.4; 07 C53, C57):
// 1. tests/regression/measure-rects.mjs: the `measure` object rules, the rectangles from DOM boxes (translation to
//    the capture frame, padding, outward rounding, clipping, hidden and missing selectors) and the manifest formatting;
// 2. tests/regression/lib/palette.mjs: colour parsing and the palette resolution order (a --scene-* token, then the
//    served build's SceneTheme, then null; section colours from the cards).
// The browser halves (AppPage measurements, the page-side reads) run only inside the harness.
// Run: node --test tests/unit/harness-lib.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseMeasure, rectsFromBoxes, formatJson } from '../regression/measure-rects.mjs';
import { toRgb, resolvePalette, SCENE_COLOURS } from '../regression/lib/palette.mjs';
import { SceneTheme } from '../../js/theme/Theme.js';

describe('measure-rects: the measure object and the rectangles', () => {
  test('parseMeasure accepts the documented shape and defaults pad to 8', () => {
    assert.deepEqual(parseMeasure({ frame: 'canvas', window: [1600, 1000], selectors: ['.viewport-controls'] }, 'e'),
      { frame: 'canvas', window: [1600, 1000], selectors: ['.viewport-controls'], pad: 8 });
    assert.equal(parseMeasure({ frame: 'page', window: [800, 1000], selectors: ['.a'], pad: 0 }, 'e').pad, 0);
  });

  test('parseMeasure refuses unknown keys, frames, windows, empty selector lists and bad pads', () => {
    const bad = (m, re) => assert.throws(() => parseMeasure(m, 'expect[0]'), re);
    const ok = { frame: 'canvas', window: [1600, 1000], selectors: ['.a'] };
    bad({ ...ok, frame: 'viewport' }, /frame must be "canvas" or "page"/);
    bad({ ...ok, window: [1600] }, /window must be \[width, height\]/);
    bad({ ...ok, selectors: [] }, /selectors must be a non-empty list/);
    bad({ ...ok, pad: -1 }, /pad must be a non-negative integer/);
    bad({ ...ok, colour: 'x' }, /unknown measure key "colour"/);
    bad(null, /must be an object/);
  });

  test('rectsFromBoxes: canvas-relative, padded, rounded outwards and clipped to the frame', () => {
    const origin = { left: 400, top: 60 };
    const { rects, missing } = rectsFromBoxes([
      { selector: '.viewport-controls', found: true, visible: true, box: { left: 1540.2, top: 80, right: 1580.6, bottom: 425.5 } },
      { selector: '.viewport-info', found: true, visible: true, box: { left: 420, top: 975, right: 1070.4, bottom: 1003 } },
      { selector: '#gone', found: false, visible: false, box: null },
      { selector: '.hidden', found: true, visible: false, box: { left: 0, top: 0, right: 10, bottom: 10 } },
    ], origin, [1200, 940], 8);
    assert.deepEqual(rects, [
      { x: 1132, y: 12, w: 57, h: 362, label: '.viewport-controls' },   // x 1140.2-8 .. 1180.6+8 -> 1132..1189; y 12..374
      { x: 12, y: 907, w: 667, h: 33, label: '.viewport-info' },        // bottom 943+8 clipped to 940
    ]);
    assert.deepEqual(missing, ['#gone (not found)', '.hidden (hidden)']);
  });

  test('rectsFromBoxes: a box entirely outside the frame gives no rectangle', () => {
    const { rects, missing } = rectsFromBoxes([{ selector: '.far', found: true, visible: true, box: { left: 2000, top: 0, right: 2100, bottom: 50 } }],
      { left: 0, top: 0 }, [1600, 1000], 8);
    assert.deepEqual(rects, []);
    assert.deepEqual(missing, ['.far (outside the frame)']);
  });

  test('formatJson keeps short arrays and objects on one line and indents the rest by two spaces', () => {
    const doc = { commit: 'X', expect: [{ output: 'a/*.png', size: [1200, 940], rects: [{ x: 1, y: 2, w: 3, h: 4, label: '.a' }] }] };
    assert.equal(formatJson(doc), '{"commit":"X","expect":[{"output":"a/*.png","size":[1200,940],"rects":[{"x":1,"y":2,"w":3,"h":4,"label":".a"}]}]}');
    const long = { commit: 'X', expect: [{ output: 'a/*.png', reason: 'r'.repeat(120), size: [1, 2] }] };
    assert.equal(formatJson(long), `{\n  "commit": "X",\n  "expect": [\n    {\n      "output": "a/*.png",\n      "reason": "${'r'.repeat(120)}",\n      "size": [1,2]\n    }\n  ]\n}`);
    assert.deepEqual(JSON.parse(formatJson(long)), long);
  });
});

describe('lib/palette.mjs: the live palette hook (07 C53)', () => {
  test('toRgb parses #rgb, #rrggbb, rgb()/rgba() and 0xRRGGBB numbers, and nothing else', () => {
    assert.deepEqual(toRgb('#00F0FF'), [0, 240, 255]);
    assert.deepEqual(toRgb(' #0f0 '), [0, 255, 0]);
    assert.deepEqual(toRgb('rgb(64, 60, 55)'), [64, 60, 55]);
    assert.deepEqual(toRgb('rgba(1,2,3,0.5)'), [1, 2, 3]);
    assert.deepEqual(toRgb(0x403c37), [64, 60, 55]);
    for (const v of ['red', 'hsl(0, 0%, 0%)', '', null, undefined, -1, 0x1000000, 1.5]) assert.equal(toRgb(v), null, String(v));
  });

  test('sections come from the cards; the wall colour is section 0', () => {
    const p = resolvePalette({ sections: [{ name: 'Back', color: '#00f0ff' }, { name: 'Front', color: '#ff00aa' }] });
    assert.deepEqual(p.sections, [{ index: 0, name: 'Back', color: '#00f0ff', rgb: [0, 240, 255] },
      { index: 1, name: 'Front', color: '#ff00aa', rgb: [255, 0, 170] }]);
    assert.deepEqual(p.wall, [0, 240, 255]);
    assert.equal(resolvePalette({ sections: [] }).wall, null);
  });

  test('scene colours: the token wins over the SceneTheme; a missing source gives null', () => {
    const theme = { background: 0x0a0a0f, frame: 0x4a4a5a, grid: { centerColor: 0x2a2a3a, color: 0x1a1a24 },
      wallBack: 0x403c37, debug: { faceFront: 0x2f6bff, faceBack: 0xff3344, vertexNormal: 0xb8f03c, faceNormal: 0xff4fd8 } };
    const fromTheme = resolvePalette({ sceneTheme: theme });
    assert.deepEqual(fromTheme.cabinet, [64, 60, 55]);
    assert.deepEqual(fromTheme.faceFront, [47, 107, 255]);
    assert.equal(fromTheme.sources.cabinet, 'theme');
    const withToken = resolvePalette({ sceneTheme: theme, tokens: { '--scene-wall-back': '#101010' } });
    assert.deepEqual(withToken.cabinet, [16, 16, 16]);
    assert.equal(withToken.sources.cabinet, 'token');
    const none = resolvePalette({});
    for (const key of Object.keys(SCENE_COLOURS)) {
      assert.equal(none[key], null, key);
      assert.equal(none.sources[key], null, key);
    }
    assert.equal(none.themeLoaded, false);
  });

  test('the current SceneTheme resolves its legacy colours (background, frame, grid)', () => {
    const p = resolvePalette({ sceneTheme: JSON.parse(JSON.stringify(SceneTheme)) });
    assert.deepEqual(p.background, [10, 10, 15]);
    assert.deepEqual(p.frame, [74, 74, 90]);
    assert.deepEqual(p.gridCenter, [42, 42, 58]);
    assert.deepEqual(p.gridLine, [26, 26, 36]);
  });
});
