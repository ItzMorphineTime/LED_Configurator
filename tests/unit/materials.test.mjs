// Unit tests for the render layer's panel-ID canvases and wall materials (08 P2-1c, P2-1d):
// 1. PanelIdRenderer: panelSize / sectionSize / atlasSize equal the sizes of the canvases the drawing methods create,
//    and the drawing methods return null (creating no canvas) beyond CANVAS_HARD_LIMITS;
// 2. LEDMaterialFactory: a null panel-ID canvas falls back to the colour material of that mesh, with one console warning
//    per section (or atlas) and rebuild, checked by a win.console spy (the harness does not record warnings, 08 2.4).
// THREE is a recording fake installed as window.THREE before the render modules are imported, because
// js/vendor/three.js reads window.THREE when it is evaluated. The canvases come from a fake document whose 2D context
// accepts every call.
// Run: node --test tests/unit/materials.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WallSection } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { computeAtlas, canvasFits } from '../../js/geometry/TextureAtlas.js';
import { CanvasTheme } from '../../js/theme/Theme.js';

/** The THREE subset LEDMaterialFactory uses; every constructor records its arguments. */
class FakeMaterial { constructor(params) { this.params = params; } }
class FakeCanvasTexture { constructor(canvas) { this.image = canvas; } }
class FakeColor { constructor(css) { this.css = css; } }
const FakeTHREE = { MeshBasicMaterial: FakeMaterial, CanvasTexture: FakeCanvasTexture, Color: FakeColor, DoubleSide: 2 };
globalThis.window = { THREE: FakeTHREE };

const { PanelIdRenderer } = await import('../../js/render/textures/PanelIdRenderer.js');
const { LEDMaterialFactory } = await import('../../js/render/LEDMaterialFactory.js');

/** A 2D context that accepts every method call and property write. */
const fakeContext = () => new Proxy({}, {
  get: (target, key) => (key in target ? target[key] : () => {}),
  set: (target, key, value) => { target[key] = value; return true; },
});

/** A document whose createElement('canvas') records plain canvases. */
function fakeDoc() {
  const canvases = [];
  return {
    canvases,
    createElement(tag) {
      const canvas = { tag, width: 0, height: 0, getContext: () => fakeContext() };
      canvases.push(canvas);
      return canvas;
    },
  };
}

const section = (fields) => new WallSection({ id: 0, name: 'S', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500,
  ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#00f0ff', ...fields });
/** The p2_oversize_canvas section: 70 x 1000 by 2 x 64 LEDs, a 70,000 x 128 px texture at 1 px/LED. */
const OVERSIZE = () => section({ id: 7, name: 'Oversize', panelCols: 70, panelRows: 2, ledX: 1000, ledY: 64 });

function renderer() {
  const project = Project.createDefault();
  const doc = fakeDoc();
  return { doc, panelIds: new PanelIdRenderer({ doc, style: project.panelIdStyle, logos: project.logos, theme: { canvas: CanvasTheme } }) };
}

describe('PanelIdRenderer sizes and null canvases (B-L4, 08 6.3)', () => {
  const walls = [
    Project.createDefault().wall.sections,
    [section({ name: 'A' }), section({ name: 'B', panelCols: 3, panelRows: 5, ledX: 64, ledY: 48 }), section({ name: 'C', ledX: 128, ledY: 96 })],
    [section({ name: 'Tall', panelCols: 2, panelRows: 9, ledX: 176, ledY: 176 })],
  ];

  test('sectionSize / atlasSize / panelSize equal the canvases sectionCanvas / atlasCanvas / panelCanvas create', () => {
    for (const sections of walls) {
      const atlas = computeAtlas(sections);
      sections.forEach((s, i) => {
        for (const scale of [null, 2]) {
          const { doc, panelIds } = renderer();
          const canvas = panelIds.sectionCanvas(s, i, scale, atlas.entries[i].startCol);
          assert.equal(doc.canvases[0], canvas);
          assert.deepEqual(panelIds.sectionSize(s, scale), { width: canvas.width, height: canvas.height }, `${s.name} x${scale}`);
        }
        const { panelIds } = renderer();
        const panel = panelIds.panelCanvas(0, 0, s.ledX, s.ledY, s);
        assert.deepEqual(panelIds.panelSize(s), { width: panel.width, height: panel.height }, s.name);
      });
      const { doc, panelIds } = renderer();
      const canvas = panelIds.atlasCanvas(sections, atlas);
      assert.equal(doc.canvases[0], canvas, 'the atlas canvas is created first');
      assert.deepEqual(panelIds.atlasSize(sections, atlas), { width: canvas.width, height: canvas.height });
      assert.deepEqual(panelIds.atlasSize(sections), panelIds.atlasSize(sections, atlas), 'the atlas defaults to computeAtlas');
    }
  });

  test('beyond CANVAS_HARD_LIMITS the three canvas methods return null and create no canvas (08 P2-1d)', () => {
    const big = OVERSIZE();
    const { doc, panelIds } = renderer();
    assert.deepEqual(panelIds.sectionSize(big, null), { width: 70000, height: 128 });
    assert.equal(panelIds.sectionCanvas(big, 0, null, 0), null);
    assert.equal(panelIds.atlasCanvas([big]), null);
    assert.deepEqual(panelIds.atlasSize([big]), { width: 70000, height: 128 });
    // Panel mode: at least 4 px per LED, so ledX 8,192 gives 32,768 px; 8,191 gives 32,764 px, which fits.
    const wide = section({ name: 'Wide', ledX: 8192, ledY: 8 });
    assert.deepEqual(panelIds.panelSize(wide), { width: 32768, height: 32 });
    assert.equal(panelIds.panelCanvas(0, 0, wide.ledX, wide.ledY, wide), null);
    assert.equal(doc.canvases.length, 0, 'no canvas was created');
    const fits = section({ name: 'Fits', ledX: 8191, ledY: 8 });
    const canvas = panelIds.panelCanvas(0, 0, fits.ledX, fits.ledY, fits);
    assert.deepEqual([canvas.width, canvas.height], [32764, 32]);
    assert.ok(canvasFits(canvas.width, canvas.height));
  });
});

describe('LEDMaterialFactory: the colour fallback for panel-ID canvases that do not fit (B-L4, 08 P2-1d)', () => {
  const display = { panelIdsEnabled: true, ledSimEnabled: false, wireframe: false };
  const ledTiles = { tiled: () => { throw new Error('LED tiles are not used with panel IDs'); } };
  const setup = () => {
    const warnings = [];
    const win = { console: { warn: (msg) => warnings.push(msg) } };
    const { panelIds } = renderer();
    return { warnings, factory: new LEDMaterialFactory({ display, panelIds, ledTiles, win }) };
  };
  const notShown = (name, w, h) =>
    `Panel IDs are not shown for "${name}": its ${w}×${h} px texture exceeds this browser's canvas limit.`;

  test('section mode: the section colour, warned once per section and rebuild', () => {
    const { warnings, factory } = setup();
    const big = OVERSIZE();
    const small = section({ id: 8, name: 'Small' });
    factory.beginRebuild();
    const fallback = factory.section(big, 0, 0);
    assert.ok(fallback instanceof FakeMaterial);
    assert.equal(fallback.params.map, undefined);
    assert.ok(fallback.params.color instanceof FakeColor);
    assert.equal(fallback.params.color.css, big.color);
    assert.deepEqual(warnings, [notShown('Oversize', 70000, 128)]);
    factory.section(big, 0, 0);
    assert.equal(warnings.length, 1, 'the same section in the same rebuild warns once');
    const textured = factory.section(small, 1, 70);
    assert.ok(textured.params.map instanceof FakeCanvasTexture, 'a section that fits keeps its panel-ID texture');
    assert.equal(warnings.length, 1);
    factory.beginRebuild();
    factory.section(big, 0, 0);
    assert.equal(warnings.length, 2, 'warned again after the next rebuild started');
  });

  test('panel mode: every panel of an oversize panel canvas gets the section colour; one warning per section', () => {
    const { warnings, factory } = setup();
    const wide = section({ id: 3, name: 'Wide', panelCols: 4, panelRows: 2, ledX: 8192, ledY: 8 });
    factory.beginRebuild();
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 2; row++) {
        const material = factory.panel(wide, 0, col, row);
        assert.equal(material.params.map, undefined);
        assert.equal(material.params.color.css, wide.color);
      }
    }
    assert.deepEqual(warnings, [notShown('Wide', 32768, 32)]);
  });

  test('combined mode: an oversize atlas gives the vertex-colour material and one warning naming every section', () => {
    const { warnings, factory } = setup();
    const sections = [OVERSIZE(), section({ id: 9, name: 'Next' })];
    const atlas = computeAtlas(sections);
    factory.beginRebuild();
    const material = factory.combined(sections, atlas);
    assert.equal(material.params.vertexColors, true);
    assert.equal(material.params.map, undefined);
    factory.combined(sections, atlas);
    assert.deepEqual(warnings, [notShown('Oversize, Next', atlas.totalLedX * atlas.pxPerLed, atlas.totalLedY * atlas.pxPerLed)]);
    const fits = factory.combined([section({ name: 'Only' })], computeAtlas([section({ name: 'Only' })]));
    assert.ok(fits.params.map instanceof FakeCanvasTexture);
  });
});
