// U5 contrast (docs/improvements/06-morph-branding.md 3.12, 6.1 and 8.1): every pair of 3.12 at or above its threshold,
// resolved from the parsed tokens of css/02-tokens.css, so a token edit that breaks contrast fails here. This is spec
// 07's X2 file; 06 T4a creates it with the UI rows (X2 has not landed, so U5 satisfies it). The scene rows (adaptive
// frames, camera body, two-tone overlays against the final palette) join in 06 T7, the sibling overlay rows with their
// keys (06 5.12). The forbidden pairs are asserted below 3:1 as documentation of why the design avoids them.
// Run: node --test tests/unit/contrast.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Palette } from '../../js/theme/Theme.js';
import { readTokens } from './fixtures/css-tokens.mjs';
import { contrast, composite, hexRgb } from './fixtures/colour-math.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { token } = readTokens();
/** The opaque colour of a token ([r, g, b]); a translucent token is composited over `over` first. */
const rgb = (name, over = '#0A0A0A') => composite(token(name), over);
const ratio = (a, b) => contrast(a, b);
const fmt = (r) => r.toFixed(2);

/** Asserts ratio >= min for every [label, fg, bg] row. */
function atLeast(min, rows) {
  for (const [label, fg, bg] of rows) {
    const r = ratio(fg, bg);
    assert.ok(r >= min, `${label}: ${fmt(r)}:1 < ${min}:1`);
  }
}

const SURFACES = ['--color-bg-app', '--color-surface-1', '--color-surface-2', '--color-surface-hover'];
/** What the translucent overlay chip sits on over the live scene: Morph Black, the default wall, white (06 3.4). */
const SCENE_UNDERLAYS = ['#0A0A0A', '#D9D9D6', '#FFFFFF'];

/** The card's swatch colours as rendered by the SectionListPanel template (literals until 06 T7 derives them from the palette). */
function cardSwatches() {
  const src = readFileSync(join(ROOT, 'js', 'ui', 'SectionListPanel.js'), 'utf8');
  return [...new Set([...src.matchAll(/data-color="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase()))];
}

describe('U5 contrast: the WCAG formula (06 6.1)', () => {
  test('reproduces the brand file\'s verified ratios', () => {
    const near = (a, b, want) => assert.ok(Math.abs(ratio(a, b) - want) < 0.005, `${a}/${b}: ${ratio(a, b)} vs ${want}`);
    near('#0A0A0A', '#FFFFFF', 19.80);
    near('#0A0A0A', '#F2B705', 10.89);
    near('#FFFFFF', '#C51622', 5.98);
    near('#C51622', '#0A0A0A', 3.31);
  });

  test('composites a translucent colour per channel with rounding', () => {
    assert.deepEqual(composite('rgba(17, 17, 17, 0.92)', '#FFFFFF'), [36, 36, 36]);
    assert.deepEqual(composite('rgba(17, 17, 17, 0.92)', '#D9D9D6'), [33, 33, 33]);
    assert.deepEqual(composite('#C51622', '#FFFFFF'), hexRgb('#C51622'));
  });
});

describe('U5 contrast: UI rows of 06 3.12 (06 T4a)', () => {
  test('text on every surface: primary and secondary >= 4.5', () => {
    for (const s of SURFACES) {
      atLeast(4.5, [
        [`--color-text-primary on ${s}`, rgb('--color-text-primary'), rgb(s)],
        [`--color-text-secondary on ${s}`, rgb('--color-text-secondary'), rgb(s)],
      ]);
    }
  });

  test('small red text (accent text, danger) >= 4.5 on every surface', () => {
    for (const s of SURFACES) {
      atLeast(4.5, [
        [`--color-accent-text on ${s}`, rgb('--color-accent-text'), rgb(s)],
        [`--color-danger on ${s}`, rgb('--color-danger'), rgb(s)],
      ]);
    }
  });

  test('the danger icon on its hover chip >= 3 (icons) over the card and the hover surface', () => {
    for (const s of ['--color-surface-2', '--color-surface-hover']) {
      atLeast(3, [[`--color-danger on --color-danger-bg over ${s}`, rgb('--color-danger'), composite(token('--color-danger-bg'), rgb(s))]]);
    }
  });

  test('status colours >= 4.5 on the read-outs and the card; warning text on its chip', () => {
    for (const s of ['--color-surface-1', '--color-surface-2']) {
      atLeast(4.5, [
        [`--color-success on ${s}`, rgb('--color-success'), rgb(s)],
        [`--color-warning on ${s}`, rgb('--color-warning'), rgb(s)],
      ]);
    }
    atLeast(4.5, [['--color-warning on --color-warning-bg over --color-surface-2', rgb('--color-warning'),
      composite(token('--color-warning-bg'), rgb('--color-surface-2'))]]);
  });

  test('text on the coloured controls: on-accent, on-cta (Export All), on-control-active >= 4.5', () => {
    atLeast(4.5, [
      ['--color-on-accent on --color-accent (pilot banner, active pilot icon)', rgb('--color-on-accent'), rgb('--color-accent')],
      ['--color-on-cta on --cta-background (Export All)', rgb('--color-on-cta'), rgb('--cta-background')],
      ['--color-on-control-active on --color-control-active-bg (active tool icon)', rgb('--color-on-control-active'), rgb('--color-control-active-bg')],
    ]);
  });

  test('Signal Red graphics >= 3 on the opaque surfaces up to #161616 (toggle track, radio dot, focus and selected borders)', () => {
    for (const s of ['--color-bg-app', '--color-surface-1', '--color-surface-2']) {
      atLeast(3, [[`--color-accent on ${s}`, rgb('--color-accent'), rgb(s)]]);
    }
  });

  test('forbidden pairing (documentation): Signal Red on the hover surface is below 3', () => {
    assert.ok(ratio(rgb('--color-accent'), rgb('--color-surface-hover')) < 3);
  });

  test('the focus ring >= 3 on every surface', () => {
    for (const s of SURFACES) atLeast(3, [[`--color-focus-ring on ${s}`, rgb('--color-focus-ring'), rgb(s)]]);
  });

  test('red indicators over the scene keep a Morph Black neighbour: badge bar on its opaque chip and outer ring, preview border, pilot banner and button on their ring', () => {
    atLeast(3, [
      ['selection-badge bar on the opaque chip (--color-surface-1)', rgb('--color-accent'), rgb('--color-surface-1')],
      ['selection-badge bar on its outer ring (--color-bg-app)', rgb('--color-accent'), rgb('--color-bg-app')],
      ['preview-window border, pilot banner, active pilot button on the outer ring (--color-bg-app)', rgb('--color-accent'), rgb('--color-bg-app')],
    ]);
  });

  test('forbidden pairing (documentation): Signal Red on the translucent overlay chip over a light scene is below 3', () => {
    for (const under of ['#D9D9D6', '#FFFFFF']) {
      const chip = composite(token('--color-surface-overlay'), under);
      assert.ok(ratio(rgb('--color-accent'), chip) < 3, `red on the chip over ${under}: ${fmt(ratio(rgb('--color-accent'), chip))}`);
    }
  });

  test('chip text (view buttons, info badge) >= 4.5 on the overlay chip over any scene, the worst being white', () => {
    for (const under of SCENE_UNDERLAYS) {
      const chip = composite(token('--color-surface-overlay'), under);
      atLeast(4.5, [
        [`--color-text-primary on the chip over ${under}`, rgb('--color-text-primary'), chip],
        [`--color-text-secondary on the chip over ${under}`, rgb('--color-text-secondary'), chip],
      ]);
    }
  });

  test('the active swatch ring: the light border >= 3 on the card, and the better of the light and dark rings >= 3 on each palette and card colour', () => {
    const light = rgb('--color-text-primary');
    const dark = rgb('--color-bg-app');
    atLeast(3, [['active swatch light border on --color-surface-2', light, rgb('--color-surface-2')]]);
    const fills = [...new Set([...Palette.sectionColors.map((c) => c.toLowerCase()), ...cardSwatches()])];
    assert.ok(fills.length >= 6, `only ${fills.length} swatch colours found`);
    for (const fill of fills) {
      const best = Math.max(ratio(light, fill), ratio(dark, fill));
      assert.ok(best >= 3, `active swatch ring on ${fill}: ${fmt(best)}:1 < 3:1`);
    }
  });
});
