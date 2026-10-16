// Unit tests for theme/ThemeBridge (docs/improvements/06-morph-branding.md 5.5, 6.2 and 8.1): U1 colour parsing,
// U2 the bridged theme's shape, freezing and the runtime override (AC 8), U3 missing and malformed tokens.
// Run: node --test tests/unit/theme.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Theme } from '../../js/theme/Theme.js';
import {
  COLOR_BINDINGS, FONT_BINDINGS, UNBRANDED, BIND_FONTS_DEFAULT, parseHexColor, parseCssColor, buildTheme,
} from '../../js/theme/ThemeBridge.js';

// ---- helpers -------------------------------------------------------------------------------------

/** The leaf at a dotted path ('scene.safeZone.wallColor'), or undefined. */
const at = (root, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), root);

/** Every leaf of a plain value as [path, value]; arrays are walked with their indices. */
function leaves(value, prefix = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${prefix}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [[prefix, value]];
}

/** The deep key structure (objects and arrays, with array lengths), without the leaf values. */
function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  return typeof value;
}

/** Every object and array of a value (the value itself included). */
function containers(value, out = []) {
  if (value !== null && typeof value === 'object') {
    out.push(value);
    for (const v of Object.values(value)) containers(v, out);
  }
  return out;
}

/** A token text for a bound Theme leaf: the inverse of the binding's kind. */
function tokenFor(kind, leaf) {
  const hex2 = (n) => n.toString(16).padStart(2, '0');
  if (kind === 'num') return `#${leaf.toString(16).padStart(6, '0')}`;
  if (kind === 'rgb01') return `#${leaf.map((c) => hex2(Math.round(c * 255))).join('')}`;
  return leaf;   // 'hex' and 'css' leaves are already token text
}

/**
 * A reader that returns the Theme fallbacks as tokens for every binding (and font families for the font tokens);
 * `overrides` replace single readings (null and undefined are returned as they are), and '' is returned for any
 * other name, like getPropertyValue for an undefined custom property.
 */
function fullReader(overrides = {}) {
  const tokens = { '--font-ui': "'Outfit', sans-serif", '--font-mono': "'JetBrains Mono', monospace" };
  for (const [path, name, kind] of COLOR_BINDINGS) tokens[name] ??= tokenFor(kind, at(Theme, path));
  Object.assign(tokens, overrides);
  return (name) => (Object.prototype.hasOwnProperty.call(tokens, name) ? tokens[name] : '');
}

const WARN_TEXT = (name, raw) => `ThemeBridge: ${name} is missing or invalid (${JSON.stringify(raw)}); using the Theme.js fallback`;

// ---- U1 ------------------------------------------------------------------------------------------

describe('U1 parseHexColor / parseCssColor', () => {
  test('parseHexColor accepts exactly #rrggbb after trimming, any case', () => {
    const expected = { hex: '#c51622', num: 0xc51622, rgb01: [197 / 255, 22 / 255, 34 / 255] };
    assert.deepEqual(parseHexColor('#C51622'), expected);
    assert.deepEqual(parseHexColor(' #c51622 '), expected);
    for (const bad of ['#abc', 'red', 'rgb(1,2,3)', '', '#C51622 !important', '#c5162', '#c516220', 'c51622', undefined, null, 0xc51622]) {
      assert.equal(parseHexColor(bad), null, String(bad));
    }
  });

  test('rgb01 uses parseInt(hh, 16) / 255, so the legacy safe-zone colours round-trip with Object.is (6.2)', () => {
    assert.deepEqual(parseHexColor('#33ff66').rgb01, [0.2, 1, 0.4]);
    assert.deepEqual(parseHexColor('#ff3333').rgb01, [1, 0.2, 0.2]);
    assert.ok(Object.is(parseHexColor('#33ff66').rgb01[2], Theme.scene.safeZone.wallColor[2]));
  });

  test('parseCssColor: hex as above, canonical rgba(), and null for everything else', () => {
    assert.equal(parseCssColor('#C51622'), '#c51622');
    assert.equal(parseCssColor(' #c51622 '), '#c51622');
    assert.equal(parseCssColor('rgba(247,247,245,.35)'), 'rgba(247, 247, 245, 0.35)');
    assert.equal(parseCssColor(' rgba(247,247,245,.35) '), 'rgba(247, 247, 245, 0.35)');
    assert.equal(parseCssColor('rgba(10, 10, 10, 0.6)'), 'rgba(10, 10, 10, 0.6)');
    assert.equal(parseCssColor('rgba(0, 0, 0, 1)'), 'rgba(0, 0, 0, 1)');
    assert.equal(parseCssColor('rgba(0, 0, 0, 0)'), 'rgba(0, 0, 0, 0)');
    for (const bad of ['rgba(256,0,0,1)', 'rgba(0,0,0,2)', 'hsl(0 0% 0%)', 'rgb(1,2,3)', 'rgba(1,2,3)', 'rgba(-1,0,0,1)', '#abc', 'red', '', undefined]) {
      assert.equal(parseCssColor(bad), null, String(bad));
    }
  });
});

// ---- U2 ------------------------------------------------------------------------------------------

describe('U2 buildTheme: shape, leaf types, freezing, no mutation of Theme, the override (AC 8)', () => {
  const snapshot = () => JSON.stringify(Theme);
  const fontFns = () => FONT_BINDINGS.map(([path]) => at(Theme, path)).filter((f) => typeof f === 'function');

  test('every binding names an existing Theme leaf of its kind; the tables are frozen', () => {
    for (const table of [COLOR_BINDINGS, FONT_BINDINGS, UNBRANDED]) assert.ok(Object.isFrozen(table));
    for (const row of [...COLOR_BINDINGS, ...FONT_BINDINGS]) assert.ok(Object.isFrozen(row), row[0]);
    for (const [path, name, kind] of COLOR_BINDINGS) {
      const leaf = at(Theme, path);
      assert.match(name, /^--[a-z0-9-]+$/, path);
      if (kind === 'num') assert.equal(typeof leaf, 'number', path);
      else if (kind === 'hex' || kind === 'css') assert.equal(typeof leaf, 'string', path);
      else if (kind === 'rgb01') assert.ok(Array.isArray(leaf) && leaf.length === 3, path);
      else assert.fail(`${path}: unknown kind ${kind}`);
    }
    for (const [path, name, make] of FONT_BINDINGS) {
      const leaf = at(Theme, path);
      assert.ok(name === '--font-ui' || name === '--font-mono', path);
      assert.equal(typeof make("'X', serif"), typeof leaf, path);
    }
    for (const path of UNBRANDED) assert.notEqual(at(Theme, path), undefined, path);
    assert.equal(new Set(COLOR_BINDINGS.map(([p]) => p)).size, COLOR_BINDINGS.length, 'each path bound once');
    assert.equal(BIND_FONTS_DEFAULT, false, '06 T2-T4a: the canvas fonts are not bound yet');
  });

  for (const bindFonts of [false, true]) {
    test(`a full reader (bindFonts ${bindFonts}): Theme's exact shape and leaf types, everything frozen, Theme unchanged`, () => {
      const before = snapshot();
      const frozenFns = fontFns().map((f) => Object.isFrozen(f));
      const out = buildTheme(Theme, fullReader(), { bindFonts, warn: (m) => assert.fail(m) });
      assert.deepEqual(shape(out), shape(Theme));
      assert.deepEqual(Object.keys(out), Object.keys(Theme));
      for (const c of containers(out)) assert.ok(Object.isFrozen(c));
      for (const c of containers(out)) assert.ok(!containers(Theme).includes(c), 'objects and arrays are fresh copies');
      assert.equal(snapshot(), before, 'Theme is not mutated');
      assert.deepEqual(fontFns().map((f) => Object.isFrozen(f)), frozenFns, 'the font helpers keep their frozen state');
      assert.equal(Object.isFrozen(Theme.canvas.panelLabelFont), false);
      // A full reader of the fallbacks reproduces every colour and copied leaf (functions compared by their output);
      // with bindFonts the font leaves come from the font tokens instead (their types are checked by shape() above).
      const fontPaths = new Set(FONT_BINDINGS.map(([p]) => p));
      for (const [path, value] of leaves(Theme)) {
        if (bindFonts && fontPaths.has(path)) continue;
        const got = at(out, path.replace(/\[(\d+)\]/g, '.$1'));
        if (typeof value === 'function') assert.equal(got(40), value(40), path);
        else assert.ok(Object.is(got, value), `${path}: ${got} vs ${value}`);
      }
      for (const [path] of FONT_BINDINGS) {
        if (!bindFonts) assert.equal(at(out, path), at(Theme, path), `${path}: the base leaf itself when fonts are not bound`);
      }
    });
  }

  test('without options buildTheme uses BIND_FONTS_DEFAULT (false): font tokens are not read', () => {
    const read = [];
    const out = buildTheme(Theme, (name) => { read.push(name); return fullReader()(name); });
    assert.ok(!read.includes('--font-ui') && !read.includes('--font-mono'));
    assert.equal(out.canvas.panelLabelFont, Theme.canvas.panelLabelFont);
    assert.deepEqual(read, COLOR_BINDINGS.map(([, name]) => name), 'every colour token read once per row, in table order');
  });

  test('bound font leaves: functions stay functions and strings stay strings', () => {
    const out = buildTheme(Theme, fullReader({ '--font-ui': "'Montserrat', system-ui, sans-serif", '--font-mono': "'JetBrains Mono', ui-monospace, monospace" }), { bindFonts: true });
    assert.equal(out.canvas.panelLabelFont(40), "bold 40px 'JetBrains Mono', ui-monospace, monospace");
    assert.equal(out.canvas.panelSectionNameFont(17.5), "17.5px 'JetBrains Mono', ui-monospace, monospace");
    assert.equal(out.canvas.sectionLabelFont(120), "bold 120px 'Montserrat', system-ui, sans-serif");
    assert.equal(out.scene.safeZone.labelFont, "600 32px 'Montserrat', system-ui, sans-serif");
  });

  test('override (AC 8): --scene-frame #123456 changes only the bridged scene.frame', () => {
    const out = buildTheme(Theme, fullReader({ '--scene-frame': '#123456' }), { warn: (m) => assert.fail(m) });
    assert.equal(out.scene.frame, 0x123456);
    assert.equal(Theme.scene.frame, 0x4a4a5a, 'Theme.js is untouched');
    assert.equal(out.scene.background, Theme.scene.background);
  });

  test('each kind writes its own leaf form', () => {
    const out = buildTheme(Theme, fullReader({
      '--scene-safe-wall': '#C51622', '--scene-safe-label': '#C51622', '--canvas-background': ' #0A0A0A ', '--scene-frustum': '#F7F7F5',
    }));
    assert.deepEqual(out.scene.safeZone.wallColor, [197 / 255, 22 / 255, 34 / 255]);
    assert.ok(Object.isFrozen(out.scene.safeZone.wallColor));
    assert.equal(out.scene.safeZone.labelColor, '#c51622');
    assert.equal(out.canvas.background, '#0a0a0a');
    assert.equal(out.scene.frustumLines.color, 0xf7f7f5, 'one token, two leaves');
    assert.equal(out.scene.frustumFill.color, 0xf7f7f5);
  });

  test('a binding path that is not in the base theme is a programming error and throws', () => {
    const base = { ...Theme, scene: { ...Theme.scene, frame: undefined } };
    delete base.scene.frame;
    assert.throws(() => buildTheme(base, fullReader()), /no scene\.frame in the base theme/);
  });
});

// ---- U3 ------------------------------------------------------------------------------------------

describe('U3 missing and malformed tokens: the fallback leaf, one warning per variable name', () => {
  test('a reader that knows nothing keeps every leaf and warns once per variable, with the exact message', () => {
    const warnings = [];
    const out = buildTheme(Theme, () => '', { warn: (m) => warnings.push(m) });
    for (const [path, value] of leaves(Theme)) {
      const got = at(out, path.replace(/\[(\d+)\]/g, '.$1'));
      if (typeof value === 'function') assert.equal(got, value, path);
      else assert.ok(Object.is(got, value), path);
    }
    const names = [...new Set(COLOR_BINDINGS.map(([, name]) => name))];
    assert.deepEqual(warnings, names.map((name) => WARN_TEXT(name, '')));
    assert.equal(warnings.filter((m) => m.includes('--scene-frustum ')).length, 1, '--scene-frustum binds two leaves and warns once');
  });

  test('undefined and null readings count as missing; malformed values are reported as read (trimmed)', () => {
    const warnings = [];
    const values = { '--scene-frame': 'rgb(1, 2, 3)', '--scene-background': '  #12345  ', '--status-within': '#00FF66 !important', '--scene-safe-wall': null, '--scene-safe-line': undefined };
    const out = buildTheme(Theme, fullReader(values), { warn: (m) => warnings.push(m) });
    assert.deepEqual(warnings, [
      WARN_TEXT('--scene-background', '#12345'),
      WARN_TEXT('--scene-frame', 'rgb(1, 2, 3)'),
      WARN_TEXT('--scene-safe-wall', ''),
      WARN_TEXT('--scene-safe-line', ''),
      WARN_TEXT('--status-within', '#00FF66 !important'),
    ]);
    assert.equal(out.scene.frame, Theme.scene.frame);
    assert.equal(out.scene.background, Theme.scene.background);
    assert.deepEqual(out.scene.safeZone.wallColor, Theme.scene.safeZone.wallColor);
    assert.equal(out.ui.status.within, Theme.ui.status.within);
    assert.equal(out.scene.safeZone.thresholdColor[0], 1, 'the other leaves are still bridged');
  });

  test('the default warn is a no-op: buildTheme never throws for bad tokens', () => {
    assert.doesNotThrow(() => buildTheme(Theme, () => 'garbage'));
    assert.doesNotThrow(() => buildTheme(Theme, () => undefined, { bindFonts: true }));
  });

  test('bindFonts true with the font tokens missing: the base functions and string stay, one warning per token', () => {
    const warnings = [];
    const out = buildTheme(Theme, fullReader({ '--font-ui': '', '--font-mono': '   ' }), { bindFonts: true, warn: (m) => warnings.push(m) });
    assert.deepEqual(warnings, [WARN_TEXT('--font-mono', ''), WARN_TEXT('--font-ui', '')]);
    for (const [path] of FONT_BINDINGS) assert.equal(at(out, path), at(Theme, path), path);
  });

  test('bindFonts false: font tokens are never read and never warn', () => {
    const warnings = [];
    const read = new Set();
    buildTheme(Theme, (name) => { read.add(name); return ''; }, { bindFonts: false, warn: (m) => warnings.push(m) });
    assert.ok(!read.has('--font-ui') && !read.has('--font-mono'));
    assert.ok(warnings.every((m) => !m.includes('--font-')));
  });
});
