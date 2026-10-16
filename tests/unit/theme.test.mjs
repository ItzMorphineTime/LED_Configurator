// Unit tests for theme/ThemeBridge (docs/improvements/06-morph-branding.md 5.5, 6.2 and 8.1): U1 colour parsing,
// U2 the bridged theme's shape, freezing and the runtime override (AC 8), U3 missing and malformed tokens (06 T2);
// U4 token parity of css/02-tokens.css with the Theme.js fallbacks, U10 the Theme walk (every leaf bound, UNBRANDED, a
// function or non-colour), U11 the UNBRANDED conventions against tests/unit/fixtures/legacy-theme.mjs (06 T3); U6 gold
// exclusivity and legacy identity of the :root tokens, layers 1-3 (06 T4a), layer 4 and the Theme colour leaves (06 T5;
// the palette joins in 06 T7). Since 06 T5 BIND_FONTS_DEFAULT is true, so U4 also compares the font leaves.
// Run: node --test tests/unit/theme.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Theme } from '../../js/theme/Theme.js';
import { LEGACY_UNBRANDED, FACE_ORIENTATION } from './fixtures/legacy-theme.mjs';
import { rootDeclarations, resolveVar, readTokens } from './fixtures/css-tokens.mjs';
import { parseColour, composite, deltaE00 } from './fixtures/colour-math.mjs';
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
  const tokens = { '--font-ui': "'Montserrat', system-ui, sans-serif", '--font-mono': "'JetBrains Mono', ui-monospace, monospace" };
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

  test('rgb01 uses parseInt(hh, 16) / 255, so the safe-zone colours round-trip with Object.is (6.2)', () => {
    assert.deepEqual(parseHexColor('#33ff66').rgb01, [0.2, 1, 0.4]);
    assert.deepEqual(parseHexColor('#ff3333').rgb01, [1, 0.2, 0.2]);
    parseHexColor('#3dd68c').rgb01.forEach((c, i) => assert.ok(Object.is(c, Theme.scene.safeZone.wallColor[i]), 'wallColor ' + i));
    parseHexColor('#c51622').rgb01.forEach((c, i) => assert.ok(Object.is(c, Theme.scene.safeZone.thresholdColor[i]), 'thresholdColor ' + i));
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
    assert.equal(BIND_FONTS_DEFAULT, true, 'since 06 T5 the canvas fonts are bound');
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

  test('without options buildTheme uses BIND_FONTS_DEFAULT (true since 06 T5): the font tokens are read after the colours', () => {
    const read = [];
    const out = buildTheme(Theme, (name) => { read.push(name); return fullReader()(name); });
    assert.deepEqual(read, [...COLOR_BINDINGS, ...FONT_BINDINGS].map(([, name]) => name),
      'every colour token, then every font token, read once per row, in table order');
    assert.notEqual(out.canvas.panelLabelFont, Theme.canvas.panelLabelFont, 'a bound function, not the base one');
    assert.equal(out.canvas.panelLabelFont(40), Theme.canvas.panelLabelFont(40), 'with the tokens the fallbacks hold');
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
    assert.equal(Theme.scene.frame, 0xd4d4d4, 'Theme.js is untouched');
    assert.equal(out.scene.frameOnLight, Theme.scene.frameOnLight, 'the dark frame has its own token');
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
    const halo = buildTheme(Theme, fullReader({ '--scene-overlay-halo': '#123456' }));
    assert.equal(halo.scene.cameraBody.outlineColor, 0x123456, '--scene-overlay-halo: the edge outline (06 T5)');
    assert.equal(halo.scene.frustumLines.haloColor, 0x123456, '--scene-overlay-halo: the frustum halo (06 T5)');
  });

  test('a binding path that is not in the base theme is a programming error and throws', () => {
    const base = { ...Theme, scene: { ...Theme.scene, frame: undefined } };
    delete base.scene.frame;
    assert.throws(() => buildTheme(base, fullReader()), /no scene\.frame in the base theme/);
  });

  test('a table error throws whatever the tokens read, before any token is read, font rows included', () => {
    const noFrame = { ...Theme, scene: { ...Theme.scene } };
    delete noFrame.scene.frame;
    const read = [];
    const warnings = [];
    const reader = (name) => { read.push(name); return ''; };
    assert.throws(() => buildTheme(noFrame, reader, { warn: (m) => warnings.push(m) }), /no scene\.frame in the base theme/);
    assert.throws(() => buildTheme(noFrame, fullReader({ '--scene-frame': 'not a colour' })), /no scene\.frame in the base theme/);
    assert.deepEqual(read, [], 'no token is read before the table is checked');
    assert.deepEqual(warnings, []);
    const noFont = { ...Theme, canvas: { ...Theme.canvas } };
    delete noFont.canvas.panelLabelFont;
    for (const bindFonts of [false, true]) {
      assert.throws(() => buildTheme(noFont, fullReader(), { bindFonts }), /no canvas\.panelLabelFont in the base theme/, `bindFonts ${bindFonts}`);
    }
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
    const names = [...new Set([...COLOR_BINDINGS, ...FONT_BINDINGS].map(([, name]) => name))];
    assert.deepEqual(warnings, names.map((name) => WARN_TEXT(name, '')), 'the font tokens too (BIND_FONTS_DEFAULT true)');
    assert.equal(warnings.filter((m) => m.includes('--scene-frustum ')).length, 1, '--scene-frustum binds two leaves and warns once');
    assert.equal(warnings.filter((m) => m.includes('--scene-overlay-halo ')).length, 1, '--scene-overlay-halo binds two leaves and warns once');
    assert.equal(warnings.filter((m) => m.includes('--font-mono ')).length, 1, '--font-mono binds two leaves and warns once');
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
    assert.ok(Object.is(out.scene.safeZone.thresholdColor[0], 0xc5 / 255), 'the other leaves are still bridged');
  });

  test('the default warn is a no-op: buildTheme never throws for bad tokens', () => {
    assert.doesNotThrow(() => buildTheme(Theme, () => ''));
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

// ---- U4 (06 T3): token parity ---------------------------------------------------------------------

describe('U4 token parity: css/02-tokens.css and the Theme.js fallbacks agree (06 T3 onwards)', () => {
  test('the :root parser and the var() resolver: chains, depth and cycles', () => {
    const decls = rootDeclarations(':root {\n  /* c */ --a: var(--b);\n  --b: var( --c );\n  --c: #0A0A0A;\n  --x: var(--y); --y: var(--x);\n}\n.other { --z: 1; }');
    assert.deepEqual([...decls.keys()], ['--a', '--b', '--c', '--x', '--y']);
    assert.equal(resolveVar(decls, '--a'), '#0A0A0A');
    assert.throws(() => resolveVar(decls, '--x'), /cycle/);
    const deep = new Map(Array.from({ length: 11 }, (_, i) => [`--d${i}`, i === 10 ? '#000000' : `var(--d${i + 1})`]));
    assert.equal(resolveVar(deep, '--d2'), '#000000');
    assert.throws(() => resolveVar(deep, '--d0'), /deeper than 8/);
    assert.throws(() => resolveVar(decls, '--nope'), /not declared/);
  });

  test('every COLOR_BINDINGS variable is declared and parses for its kind', () => {
    const { decls, read } = readTokens();
    for (const [path, name, kind] of COLOR_BINDINGS) {
      assert.ok(decls.has(name), `${name} (${path}) is not declared in css/02-tokens.css`);
      const raw = read(name);
      assert.notEqual(kind === 'css' ? parseCssColor(raw) : parseHexColor(raw), null, `${name}: "${raw}" is not a valid ${kind} value`);
    }
  });

  test('buildTheme(Theme, the tokens) without options, as App calls it: every bridged leaf equals its fallback', () => {
    const warnings = [];
    const out = buildTheme(Theme, readTokens().read, { warn: (m) => warnings.push(m) });
    assert.deepEqual(warnings, []);
    for (const [path] of COLOR_BINDINGS) {
      const got = at(out, path);
      const want = at(Theme, path);
      if (Array.isArray(want)) {
        assert.equal(got.length, want.length, path);
        want.forEach((v, i) => assert.ok(Object.is(got[i], v), `${path}[${i}]: token ${got[i]} vs Theme.js ${v}`));
      } else {
        assert.ok(Object.is(got, want), `${path}: token ${String(got)} vs Theme.js ${String(want)}`);
      }
    }
    if (BIND_FONTS_DEFAULT) {
      const { decls } = readTokens();
      for (const [path, name] of FONT_BINDINGS) {
        assert.ok(decls.has(name), `${name} is not declared`);
        const got = at(out, path);
        const want = at(Theme, path);
        assert.equal(typeof got === 'function' ? got(40) : got, typeof want === 'function' ? want(40) : want, path);
      }
    } else {
      for (const [path] of FONT_BINDINGS) assert.equal(at(out, path), at(Theme, path), `${path}: unbound (BIND_FONTS_DEFAULT false)`);
    }
  });
});

// ---- U10 (06 T3): every Theme colour leaf is bound or UNBRANDED ----------------------------------

const NON_COLOUR_KEY = /(opacity|size|radius|factor|alpha|px|divisions|position|intensity|dash|gap|font|fonts|order)$/i;

/**
 * Classifies every leaf under the theme keys other than palette and brand: 'bound' (a COLOR_BINDINGS or FONT_BINDINGS
 * path), 'unbranded' (UNBRANDED), 'function', 'non-colour' (the last non-index key matches NON_COLOUR_KEY) or null.
 * A bound or UNBRANDED path is classified whole (an rgb01 array, the panel border colours); arrays are otherwise
 * walked with the key that holds them.
 * @returns {{path: string, kind: string|null}[]}
 */
function classifyTheme(theme) {
  const bound = new Set([...COLOR_BINDINGS, ...FONT_BINDINGS].map(([p]) => p));
  const unbranded = new Set(UNBRANDED);
  const out = [];
  const walk = (value, path, key) => {
    if (bound.has(path)) { out.push({ path, kind: 'bound' }); return; }
    if (unbranded.has(path)) { out.push({ path, kind: 'unbranded' }); return; }
    if (typeof value === 'function') { out.push({ path, kind: 'function' }); return; }
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`, key)); return; }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, k);
      return;
    }
    out.push({ path, kind: NON_COLOUR_KEY.test(key) ? 'non-colour' : null });
  };
  for (const [top, value] of Object.entries(theme)) if (top !== 'palette' && top !== 'brand') walk(value, top, top);
  return out;
}

describe('U10 Theme walk: every leaf is bound, UNBRANDED, a function or non-colour (06 T3)', () => {
  test('no unclassified leaf, in Theme and in the bridged theme', () => {
    for (const theme of [Theme, buildTheme(Theme, readTokens().read)]) {
      const unclassified = classifyTheme(theme).filter((l) => l.kind === null).map((l) => l.path);
      assert.deepEqual(unclassified, [], `add a COLOR_BINDINGS row or an UNBRANDED entry for: ${unclassified.join(', ')}`);
    }
  });

  test('the tables do not overlap, and no colour binding sits on a non-colour key', () => {
    const colour = COLOR_BINDINGS.map(([p]) => p);
    for (const p of colour) assert.ok(!UNBRANDED.includes(p), `${p} is both bound and UNBRANDED`);
    for (const p of colour) assert.ok(!NON_COLOUR_KEY.test(p.split('.').pop()), `${p}: a colour binding on a non-colour key`);
    assert.equal(new Set(UNBRANDED).size, UNBRANDED.length);
  });

  test('the rule classifies by the last non-index key: grid.position[0] and axesSize are non-colour, a colour key is not', () => {
    const kinds = Object.fromEntries(classifyTheme(Theme).map((l) => [l.path, l.kind]));
    assert.equal(kinds['scene.grid.position[0]'], 'non-colour');
    assert.equal(kinds['scene.axesSize'], 'non-colour');
    assert.equal(kinds['scene.debug.lineBaseFactor'], 'non-colour');
    assert.equal(kinds['scene.safeZone.wallColor'], 'bound');
    assert.equal(kinds['canvas.panelBorderColors'], 'unbranded');
    assert.equal(kinds['canvas.panelLabelFont'], 'bound');
    const probe = classifyTheme({ scene: { selection: { primary: 0xffffff, selectedDash: [0.12, 0.06] } } });
    assert.deepEqual(probe, [
      { path: 'scene.selection.primary', kind: null },
      { path: 'scene.selection.selectedDash[0]', kind: 'non-colour' },
      { path: 'scene.selection.selectedDash[1]', kind: 'non-colour' },
    ]);
  });
});

// ---- U11 (06 T3): conventions unchanged (AC 10) ----------------------------------------------------

describe('U11 conventions unchanged: UNBRANDED leaves equal their Phase-1 values (AC 10)', () => {
  test('UNBRANDED lists exactly the leaves of the legacy-theme fixture, and each equals its Phase-1 value', () => {
    assert.deepEqual([...UNBRANDED].sort(), Object.keys(LEGACY_UNBRANDED).sort());
    for (const theme of [Theme, buildTheme(Theme, readTokens().read)]) {
      for (const [path, legacy] of Object.entries(LEGACY_UNBRANDED)) {
        const leaf = at(theme, path);
        if (Array.isArray(legacy)) {
          assert.equal(leaf.length, legacy.length, path);
          legacy.forEach((v, i) => assert.ok(Object.is(leaf[i], v), `${path}[${i}]`));
        } else {
          assert.ok(Object.is(leaf, legacy), `${path}: ${leaf} vs Phase-1 ${legacy}`);
        }
      }
    }
  });

  test('the face-orientation leaves keep spec 01\'s values (bound, never re-coloured)', () => {
    for (const theme of [Theme, buildTheme(Theme, readTokens().read)]) {
      for (const [path, value] of Object.entries(FACE_ORIENTATION)) {
        const leaf = at(theme, path);
        if (leaf !== undefined) assert.equal(leaf, value, path);
      }
    }
    assert.equal(Theme.scene.debug.faceFront, 0x2f6bff);
    assert.equal(Theme.scene.debug.faceBack, 0xff3344);
  });
});

// ---- U6 (06 T4a, T5): gold exclusivity and legacy identity --------------------------------------------

const PIVOT_GOLD = '#F2B705';
const LEGACY_IDENTITY = ['#00F0FF', '#FF00AA'];
/** The token layers U6 checks, by prefix (06 8.1 U6): layers 1-3 since 06 T4a, layer 4 (--scene-*, --canvas-*,
 *  --status-*, --uv-* once spec 04 adds it) since 06 T5, together with the Theme colour leaves; 06 T7 adds the palette. */
const U6_PREFIXES = ['--morph-', '--ui-', '--color-', '--cta-', '--shadow-', '--font-', '--scene-', '--canvas-', '--status-', '--uv-'];
/** Exempt by name: the gold primitive and its one role, which must stay Pivot Gold. */
const GOLD_EXEMPT = new Set(['--morph-gold-500', '--cta-background']);
/** Debug exemption (06 5.12 rule 2): spec 01's debug-view tokens and the scene.debug.* leaves skip the legacy-identity
 *  check only (they show only in the opt-in debug view); they must still be >= 20 from gold. */
const DEBUG_TOKENS = new Set(['--scene-normals', '--scene-normals-face', '--scene-face-front', '--scene-face-back']);
const isDebugLeaf = (path) => path.startsWith('scene.debug.');

/**
 * Asserts the U6 distances of one opaque colour: >= 20 from Pivot Gold, and (unless debugExempt) >= 15 from the legacy
 * cyan and magenta.
 */
function assertOffBrandColours(label, rgb, { debugExempt = false } = {}) {
  const gold = deltaE00(rgb, PIVOT_GOLD);
  assert.ok(gold >= 20, `${label} is ${gold.toFixed(1)} from Pivot Gold (< 20)`);
  if (debugExempt) return;
  for (const id of LEGACY_IDENTITY) {
    const d = deltaE00(rgb, id);
    assert.ok(d >= 15, `${label} is ${d.toFixed(1)} from the legacy ${id} (< 15)`);
  }
}

/** A Theme colour leaf as [r, g, b]: a 0xrrggbb number, a '#rrggbb' / 'rgba()' string (over Morph Black) or rgb01. */
function leafRgb(value) {
  if (typeof value === 'number') return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  if (Array.isArray(value)) return value.map((c) => Math.round(c * 255));
  return composite(value, '#0a0a0a');
}

/** Every colour leaf of a theme under scene, canvas and ui (06 U10's walk): bound rows and the leaves that are neither
 *  UNBRANDED, functions nor non-colour, as [path, value]. */
function themeColourLeaves(theme) {
  return classifyTheme(theme)
    .filter(({ kind, path }) => kind !== 'unbranded' && kind !== 'function' && kind !== 'non-colour'
      && !FONT_BINDINGS.some(([p]) => p === path))
    .map(({ path }) => [path, at(theme, path.replace(/\[(\d+)\]/g, '.$1'))]);
}

describe('U6 gold exclusivity and legacy identity: every css/02-tokens.css layer and the Theme colour leaves (06 T4a, T5)', () => {
  const { decls, token } = readTokens();
  const checked = [...decls.keys()].filter((name) => U6_PREFIXES.some((p) => name.startsWith(p)));

  test('the CIEDE2000 helper reproduces the reference distances of 06 3.9 and 5.12', () => {
    const near = (a, b, want) => assert.ok(Math.abs(deltaE00(a, b) - want) < 0.05, `${a} vs ${b}: ${deltaE00(a, b)} vs ${want}`);
    near('#d9d9d6', PIVOT_GOLD, 28.6);
    near('#e2803c', PIVOT_GOLD, 22.7);
    near('#ffaa00', PIVOT_GOLD, 7.2);
    near('#ffdd00', PIVOT_GOLD, 10.9);
    near('#e68ac0', '#FF00AA', 15.7);
    near('#FF4FD8', '#FF00AA', 8.7);
  });

  test('--cta-background and --morph-gold-500 resolve to Pivot Gold', () => {
    assert.equal(token('--cta-background').toUpperCase(), PIVOT_GOLD);
    assert.equal(token('--morph-gold-500').toUpperCase(), PIVOT_GOLD);
  });

  test('the legacy token names are gone and every colour token of every layer is >= 20 from gold and >= 15 from cyan and magenta', () => {
    for (const legacy of ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--accent-cyan', '--accent-magenta', '--accent-orange',
      '--accent-green', '--text-primary', '--text-secondary', '--text-dim', '--border-color', '--glow-cyan']) {
      assert.ok(!decls.has(legacy), `${legacy} is still declared`);
    }
    assert.deepEqual([...decls.keys()].filter((name) => !checked.includes(name)), [], 'every :root token belongs to a checked layer');
    let colours = 0;
    let layer4 = 0;
    for (const name of checked) {
      const value = token(name);
      if (!parseColour(value)) continue;          // shadows and fonts are not colours
      colours++;
      if (/^--(scene|canvas|status|uv)-/.test(name)) layer4++;
      if (GOLD_EXEMPT.has(name)) continue;
      assertOffBrandColours(`${name} (${value})`, composite(value, '#0a0a0a'), { debugExempt: DEBUG_TOKENS.has(name) });   // rgba() over Morph Black first
    }
    assert.ok(colours >= 60, `only ${colours} colour tokens found`);
    assert.ok(layer4 >= 20, `only ${layer4} layer-4 colour tokens found`);
  });

  test('every bound Theme leaf as buildTheme returns it, and every Theme colour leaf not UNBRANDED, keeps the same distances (06 T5)', () => {
    const bridged = buildTheme(Theme, readTokens().read);
    for (const theme of [Theme, bridged]) {
      const leavesFound = themeColourLeaves(theme);
      assert.ok(leavesFound.length >= COLOR_BINDINGS.length, `only ${leavesFound.length} colour leaves found`);
      for (const [path, value] of leavesFound) {
        assertOffBrandColours(`${path} (${JSON.stringify(value)})`, leafRgb(value), { debugExempt: isDebugLeaf(path) });
      }
    }
    for (const [path] of COLOR_BINDINGS) {
      assertOffBrandColours(`bridged ${path}`, leafRgb(at(bridged, path)), { debugExempt: isDebugLeaf(path) });
    }
  });

  test('a gold-like or legacy-cyan token would fail (the check is live), and the debug exemption skips only the identity check', () => {
    assert.ok(deltaE00(composite('#ffaa00', '#0a0a0a'), PIVOT_GOLD) < 20);
    assert.ok(deltaE00(composite('rgba(0, 240, 255, 0.9)', '#0a0a0a'), '#00F0FF') < 15);
    assert.throws(() => assertOffBrandColours('legacy frustum', leafRgb(0xffaa00), { debugExempt: true }), /Pivot Gold/);
    assert.doesNotThrow(() => assertOffBrandColours('face normal', leafRgb(0xff4fd8), { debugExempt: true }));
    assert.throws(() => assertOffBrandColours('face normal', leafRgb(0xff4fd8)), /legacy #FF00AA/);
  });
});
