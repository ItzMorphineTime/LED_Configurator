// U5 contrast (docs/improvements/06-morph-branding.md 3.12, 6.1 and 8.1): every pair of 3.12 at or above its threshold,
// resolved from the parsed tokens of css/02-tokens.css, so a token edit that breaks contrast fails here. This is spec
// 07's X2 file; 06 T4a creates it with the UI rows (X2 has not landed, so U5 satisfies it). 06 T7 adds the scene rows
// (adaptive frames, the outlined camera body, the two-tone frustum against the background and every palette colour);
// the sibling overlay rows (selection, pivot, UV wire, HDRI marker) join with their keys (06 5.12; the pivot rows since
// 03 T1). The forbidden pairs and the rejected designs are asserted below 3:1 as documentation of why the design
// avoids them.
// Run: node --test tests/unit/contrast.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Palette } from '../../js/theme/Theme.js';
import { readTokens } from './fixtures/css-tokens.mjs';
import { contrast, composite, hexRgb, luminance } from './fixtures/colour-math.mjs';

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
    // Since 06 T7 the card renders its swatches from the palette (cardSwatches is sectionColors).
    const fills = [...new Set([...Palette.sectionColors, ...Palette.cardSwatches].map((c) => c.toLowerCase()))];
    assert.equal(fills.length, 8);
    for (const fill of fills) {
      const best = Math.max(ratio(light, fill), ratio(dark, fill));
      assert.ok(best >= 3, `active swatch ring on ${fill}: ${fmt(best)}:1 < 3:1`);
    }
  });
});

// ---- U5 scene rows (06 T7, 3.12, 6.6, 6.7): the overlays against the background and every palette colour ----------

describe('U5 contrast: scene rows of 06 3.12 (06 T7, D15)', () => {
  /** The opaque surfaces a scene overlay can lie on: the scene background and every section palette colour. */
  const surfaces = () => [['--scene-background', rgb('--scene-background')], ...Palette.sectionColors.map((c) => [c, hexRgb(c)])];
  /** Asserts that the better of two colours reaches `min` on every surface; returns the worst ratio. */
  const betterOfTwo = (label, a, b, min = 3) => {
    let worst = Infinity;
    for (const [name, x] of surfaces()) {
      const best = Math.max(ratio(a, x), ratio(b, x));
      worst = Math.min(worst, best);
      assert.ok(best >= min, `${label} on ${name}: ${fmt(best)}:1 < ${min}:1`);
    }
    return worst;
  };

  test('adaptive panel frames: the better of the light and the dark frame >= 3 on the background and each palette colour; >= 3.65 for any colour (6.7)', () => {
    const light = rgb('--scene-frame');
    const dark = rgb('--scene-frame-on-light');
    const worst = betterOfTwo('adaptive frame', light, dark);
    assert.ok(Math.abs(worst - 3.77) < 0.01, `palette minimum ${fmt(worst)} (Steel)`);
    const analytic = Math.sqrt((luminance(light) + 0.05) / (luminance(dark) + 0.05));
    assert.ok(analytic >= 3.65, `the minimum over every colour, where both ratios are equal: ${fmt(analytic)}`);
    assert.ok(ratio(light, rgb('--canvas-background')) >= 13.36 - 0.005, 'the light frame on the near-black textures');
  });

  test('the camera body: the better of the Signal Red fill and its Morph Black edge outline >= 3 everywhere; the fill alone on the background and the default wall', () => {
    const fill = rgb('--scene-camera-body');
    const outline = rgb('--scene-overlay-halo');
    const worst = betterOfTwo('camera body (fill, outline)', fill, outline);
    assert.ok(Math.abs(worst - 3.31) < 0.01, `worst ${fmt(worst)} (Signal Red, via the outline)`);
    atLeast(3, [['camera body on --scene-background', fill, rgb('--scene-background')],
      ['camera body on the default wall', fill, hexRgb(Palette.defaultSectionColor)]]);
  });

  test('the two-tone frustum: the better of the light core and the Morph Black halo >= 3 everywhere (worst 4.37, Iris)', () => {
    const worst = betterOfTwo('frustum (core, halo)', rgb('--scene-frustum'), rgb('--scene-overlay-halo'));
    assert.ok(Math.abs(worst - 4.37) < 0.01, `worst ${fmt(worst)}`);
  });

  test('the two-tone pivot marker (03 T1, 06 5.12): the idle, selected and anchor cores, each with the Morph Black halo, >= 3 everywhere', () => {
    const halo = rgb('--scene-overlay-halo');
    const idle = betterOfTwo('pivot (core, halo)', rgb('--scene-pivot'), halo);
    assert.ok(Math.abs(idle - 4.37) < 0.01, `idle worst ${fmt(idle)} (Iris)`);
    const selected = betterOfTwo('pivot selected (core, halo)', rgb('--scene-pivot-selected'), halo);
    assert.ok(Math.abs(selected - 3.31) < 0.01, `selected worst ${fmt(selected)} (on the background, via the core)`);
    const anchor = betterOfTwo('pivot anchor (core, halo)', rgb('--scene-pivot-anchor'), halo);
    assert.ok(Math.abs(anchor - 3.31) < 0.01, `anchor worst ${fmt(anchor)} (Signal Red, via the halo)`);
    assert.ok(ratio(rgb('--scene-pivot-selected'), hexRgb(Palette.defaultSectionColor)) >= 4.23 - 0.005,
      'the selected core on the default wall (06 5.12: 4.23:1)');
  });

  test('rejected designs (documentation): a single #F7F7F5 line at 0.6 over the default wall, a single #616161 frame on Signal Red, Steel and Iris', () => {
    const wall = hexRgb(Palette.defaultSectionColor);
    assert.ok(ratio(composite('rgba(247, 247, 245, 0.6)', wall), wall) < 3, 'the prototype frustum vanishes on the default wall (1.18:1)');
    for (const c of ['#c51622', '#6c6c6c', '#7462d8']) {
      assert.ok(ratio('#616161', c) < 3, `#616161 on ${c}: ${fmt(ratio('#616161', c))}`);
    }
  });
});
