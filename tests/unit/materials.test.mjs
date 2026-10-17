// Unit tests for the render layer's panel-ID canvases and wall materials (08 P2-1c, P2-1d):
// 1. PanelIdRenderer: panelSize / sectionSize / atlasSize equal the sizes of the canvases the drawing methods create,
//    and the drawing methods return null (creating no canvas) beyond CANVAS_HARD_LIMITS;
// 2. LEDMaterialFactory: a null panel-ID canvas falls back to the colour material of that mesh, with one console warning
//    per section (or atlas) and rebuild, checked by a win.console spy (the harness does not record warnings, 08 2.4);
// 3. LEDWallView (08 P2-1e): the combined and section grids get a Uint32 index attribute as soon as the largest index
//    reaches 65,535, and the plain index array below (which r128 stores as Uint16);
// 4. panel mode with panel IDs (08 P2-12d, 6.15): one shared section material per section and section-space panel UVs;
//    LED sim and colour keep one material per panel and the PlaneGeometry's own UVs; the per-panel canvases of 04's
//    'panel' option use the wall-wide px/LED of TextureAtlas.panelPxPerLed.
// THREE is a recording fake installed as window.THREE before the render modules are imported, because
// js/vendor/three.js reads window.THREE when it is evaluated. The canvases come from a fake document whose 2D context
// accepts every call.
// Run: node --test tests/unit/materials.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { WallSection } from '../../js/domain/WallSection.js';
import { Project } from '../../js/domain/Project.js';
import { computeAtlas, canvasFits, panelPxPerLed } from '../../js/geometry/TextureAtlas.js';
import { CanvasTheme } from '../../js/theme/Theme.js';
import { Strategies } from '../../js/legacy/LegacyCompat.js';
import { computeWallLayout } from '../../js/geometry/WallLayout.js';
import { WallMeshBuilder, maxIndexOf } from '../../js/geometry/WallMeshBuilder.js';

/** The THREE subset LEDMaterialFactory and LEDWallView use; every constructor records its arguments. */
class FakeMaterial { constructor(params) { this.params = params; } }
class FakeCanvasTexture {
  constructor(canvas) { this.image = canvas; this.repeat = { set: (x, y) => { this.repeat.value = [x, y]; } }; }
  clone() { const t = new FakeCanvasTexture(this.image); t.master = this; return t; }
}
/** THREE.Color for '#rgb', '#rrggbb' (any case), 'white' and a FakeColor; getHexString() as r128 (lower-case rrggbb). */
class FakeColor {
  constructor(css) {
    this.css = css;
    const src = css instanceof FakeColor ? css.css : css;
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(src ?? '');
    this.hex = src === 'white' ? 'ffffff' : m ? (m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]).toLowerCase() : 'ffffff';
  }
  getHexString() { return this.hex; }
}
class FakeAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } }
class FakeUint32Attribute extends FakeAttribute {}
class FakeGeometry {
  constructor() { this.attributes = {}; this.index = undefined; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; }
  setIndex(index) { this.index = index; }
}
class FakeObject3D {
  constructor() { this.children = []; this.userData = {}; }
  add(child) { this.children.push(child); }
  traverse(cb) { cb(this); this.children.forEach((c) => c.traverse(cb)); }
}
class FakeMesh extends FakeObject3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.position = { set() {} }; this.rotation = {}; }
}
/** three r128 PlaneGeometry(w, h): 4 vertices TL, TR, BL, BR with the uvs (0,1), (1,1), (0,0), (1,0). */
class FakePlaneGeometry extends FakeGeometry {
  constructor(width, height) {
    super();
    const array = [0, 1, 1, 1, 0, 0, 1, 0];
    this.attributes.uv = { array, setXY(i, u, v) { array[2 * i] = u; array[2 * i + 1] = v; } };
    this.size = [width, height];
  }
}
const FakeTHREE = {
  MeshBasicMaterial: FakeMaterial, CanvasTexture: FakeCanvasTexture, Color: FakeColor, DoubleSide: 2,
  BufferGeometry: FakeGeometry, Float32BufferAttribute: FakeAttribute, Uint32BufferAttribute: FakeUint32Attribute,
  Group: FakeObject3D, Mesh: FakeMesh, PlaneGeometry: FakePlaneGeometry,
  RepeatWrapping: 1000, LinearFilter: 1006, LinearMipmapLinearFilter: 1008,
};
globalThis.window = { THREE: FakeTHREE };

const { PanelIdRenderer } = await import('../../js/render/textures/PanelIdRenderer.js');
const { LEDMaterialFactory } = await import('../../js/render/LEDMaterialFactory.js');
const { LEDWallView } = await import('../../js/render/LEDWallView.js');
const { LEDPixelTextureFactory } = await import('../../js/render/textures/LEDPixelTextureFactory.js');

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
    // Per-panel canvases (04's 'panel' option since 08 P2-12d): the wall-wide px/LED of panelPxPerLed is at least 1, so
    // ledX 32,768 gives 32,768 px; 32,767 fits. (Legacy's 4 px/LED minimum made ledX 8,192 too wide already.)
    const wide = section({ name: 'Wide', ledX: 32768, ledY: 8 });
    assert.equal(panelPxPerLed([wide]), 1);
    assert.deepEqual(panelIds.panelSize(wide), { width: 32768, height: 8 });
    assert.equal(panelIds.panelCanvas(0, 0, wide.ledX, wide.ledY, wide), null);
    assert.equal(doc.canvases.length, 0, 'no canvas was created');
    const fits = section({ name: 'Fits', ledX: 32767, ledY: 8 });
    const canvas = panelIds.panelCanvas(0, 0, fits.ledX, fits.ledY, fits);
    assert.deepEqual([canvas.width, canvas.height], [32767, 8]);
    assert.ok(canvasFits(canvas.width, canvas.height));
    // An explicit scale (the rebuild's wall-wide value) is used as given.
    assert.deepEqual(panelIds.panelSize(fits, 2), { width: 65534, height: 16 });
    assert.equal(panelIds.panelCanvas(0, 0, fits.ledX, fits.ledY, fits, 2), null);
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

  test("panel mode (per-panel canvases, 04's option): every panel of an oversize panel canvas gets the section colour; one warning per section", () => {
    const { warnings, factory } = setup();
    const wide = section({ id: 3, name: 'Wide', panelCols: 4, panelRows: 2, ledX: 32768, ledY: 8 });
    factory.beginRebuild();
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 2; row++) {
        const material = factory.panel(wide, 0, col, row);
        assert.equal(material.params.map, undefined);
        assert.equal(material.params.color.css, wide.color);
      }
    }
    assert.deepEqual(warnings, [notShown('Wide', 32768, 8)]);
  });

  test('sectionShared (08 P2-12d): the section material of section(), with its fallback and its once-per-section warning', () => {
    const { warnings, factory } = setup();
    factory.beginRebuild();
    const shared = factory.sectionShared(section({ name: 'Fits' }), 0, 5);
    assert.ok(shared.params.map instanceof FakeCanvasTexture, 'the section canvas');
    assert.deepEqual([shared.params.map.image.width, shared.params.map.image.height], [5 * 32 * 4, 3 * 32 * 4]);
    const big = OVERSIZE();
    assert.equal(factory.sectionShared(big, 1, 5).params.color.css, big.color);
    factory.section(big, 1, 5);
    assert.deepEqual(warnings, [notShown('Oversize', 70000, 128)], 'sectionShared and section share the warning key');
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

describe('LEDWallView index attribute (B-L5 viewport, 08 P2-1e)', () => {
  /** One flat section of cols x rows panels: (cols + 1) * (rows + 1) grid vertices. */
  const wall = (cols, rows) => computeWallLayout([section({ name: 'Big', panelCols: cols, panelRows: rows, ledX: 8, ledY: 8 })]);
  /** Rebuilds a fake-THREE view of the layout in meshMode; returns the wall meshes. */
  const build = (layout, meshMode) => {
    const scene = [];
    const materials = { beginRebuild() {}, combined: () => new FakeMaterial({}), section: () => new FakeMaterial({}),
      panel: () => new FakeMaterial({}) };
    const view = new LEDWallView({ sceneManager: { add: (g) => scene.push(g), remove: () => {} }, materials,
      builder: new WallMeshBuilder(Strategies.mesh.viewport), theme: { scene: { frame: 0x4a4a5a } } });
    view.rebuild({ layout, meshMode, display: { showFrame: false } });
    return view.meshes();
  };

  for (const meshMode of ['combined', 'section']) {
    test(`${meshMode}: 65,535 vertices (largest index 65,534) keep the plain array; 65,536 (65,535) get Uint32`, () => {
      const [below] = build(wall(254, 256), meshMode);   // 255 x 257 = 65,535 vertices
      assert.equal(below.geometry.attributes.position.array.length / 3, 65535);
      assert.ok(Array.isArray(below.geometry.index), 'the plain array: r128 stores it as Uint16');
      assert.equal(maxIndexOf(below.geometry.index), 65534);

      const [at] = build(wall(255, 255), meshMode);      // 256 x 256 = 65,536 vertices
      assert.ok(at.geometry.index instanceof FakeUint32Attribute, 'r128 alone would store 65,535 as Uint16 (restart)');
      assert.equal(at.geometry.index.itemSize, 1);
      assert.equal(maxIndexOf(at.geometry.index.array), 65535);
      assert.deepEqual(at.geometry.index.array, new WallMeshBuilder(Strategies.mesh.viewport).sectionGrid(wall(255, 255).sections[0]).indices);
    });
  }

  test('every harness-sized wall keeps the plain index array (no viewport output changes)', () => {
    for (const meshMode of ['combined', 'section']) {
      for (const mesh of build(computeWallLayout(Project.createDefault().wall.sections), meshMode)) {
        assert.ok(Array.isArray(mesh.geometry.index), meshMode);
      }
    }
  });
});

describe('LEDWallView panel mode with panel IDs: one material per section, section-space UVs (B-M16, B-L19; 08 P2-12d)', () => {
  const twoSections = () => [section({ id: 0, name: 'A', panelCols: 3, panelRows: 2 }),
    section({ id: 1, name: 'B', panelCols: 2, panelRows: 1, curveIntensity: 5 })];
  /** Rebuilds a fake-THREE view in panel mode; the factory records which method made each material. */
  const build = (display) => {
    const calls = [];
    const materials = {
      beginRebuild() {},
      sectionShared: (s, i, startCol) => { calls.push(['sectionShared', s.name, startCol]); return new FakeMaterial({ shared: s.name }); },
      panel: (s, i, col, row) => { calls.push(['panel', s.name, col, row]); return new FakeMaterial({ panel: `${s.name}${col},${row}` }); },
    };
    const builder = new WallMeshBuilder(Strategies.mesh.viewport);
    const view = new LEDWallView({ sceneManager: { add() {}, remove() {} }, materials, builder, theme: { scene: { frame: 0x4a4a5a } } });
    const layout = computeWallLayout(twoSections());
    view.rebuild({ layout, meshMode: 'panel', display: { showFrame: false, ...display } });
    return { calls, meshes: view.meshes(), layout, builder };
  };

  test('panel IDs: one sectionShared material per section (start columns from the atlas), the same object on every panel', () => {
    const { calls, meshes } = build({ panelIdsEnabled: true });
    assert.deepEqual(calls, [['sectionShared', 'A', 0], ['sectionShared', 'B', 3]]);
    assert.equal(meshes.length, 3 * 2 + 2 * 1);
    const a = meshes.filter((m) => m.userData.sectionIndex === 0);
    const b = meshes.filter((m) => m.userData.sectionIndex === 1);
    assert.ok(a.every((m) => m.material === a[0].material) && b.every((m) => m.material === b[0].material));
    assert.notEqual(a[0].material, b[0].material);
    assert.equal(new Set(meshes.map((m) => m.material)).size, 2, 'as many panel-ID materials as sections (08 criterion 47)');
  });

  test('panel IDs: each PlaneGeometry (TL, TR, BL, BR) carries the builder panelUvs (BL, BR, TR, TL) in section space', () => {
    const { meshes, layout, builder } = build({ panelIdsEnabled: true });
    let k = 0;
    for (const sl of layout.sections) {
      for (const panel of sl.panels) {
        const [bl, br, tr, tl] = builder.panelUvs(panel, sl);
        assert.deepEqual(meshes[k].geometry.attributes.uv.array, [...tl, ...tr, ...bl, ...br], `${sl.section.name} ${panel.col},${panel.row}`);
        k++;
      }
    }
    // The top-right panel of A (col 2, row 1) spans u 2/3..1, v 1/2..1.
    const topRight = meshes[5];
    assert.ok(topRight.userData.col === 2 && topRight.userData.row === 1);
    assert.deepEqual(topRight.geometry.attributes.uv.array, [2 / 3, 1, 1, 1, 2 / 3, 0.5, 1, 0.5]);
  });

  for (const display of [{ ledSimEnabled: true }, {}]) {
    test(`${display.ledSimEnabled ? 'LED sim' : 'colour'}: one materials.panel per panel and the PlaneGeometry's own 0..1 UVs (unchanged)`, () => {
      const { calls, meshes } = build({ panelIdsEnabled: false, ...display });
      assert.deepEqual(calls.map((c) => c[0]), Array(8).fill('panel'));
      assert.deepEqual(calls.slice(0, 2), [['panel', 'A', 0, 0], ['panel', 'A', 1, 0]]);
      assert.deepEqual(calls[6], ['panel', 'B', 3, 0], 'global columns continue from the atlas start column');
      for (const m of meshes) assert.deepEqual(m.geometry.attributes.uv.array, [0, 1, 1, 1, 0, 0, 1, 0]);
    });
  }
});

describe('combined LED sim takes the section colours (B-L18; 08 P2-7e)', () => {
  test('the combined LED-sim material is a white tile (repeat totalLedX x totalLedY) times the vertex colours', () => {
    const calls = [];
    const ledTiles = { tiled: (x, y, color) => { calls.push([x, y, color]); return new FakeCanvasTexture({ tile: true }); } };
    const display = { panelIdsEnabled: false, ledSimEnabled: true, wireframe: false };
    const { panelIds } = renderer();
    const factory = new LEDMaterialFactory({ display, panelIds, ledTiles, win: { console: { warn() {} } } });
    const sections = [section({ name: 'A', color: '#ff0000' }), section({ id: 1, name: 'B', color: '#00ff00', panelRows: 5 })];
    const atlas = computeAtlas(sections);
    const material = factory.combined(sections, atlas);
    assert.equal(material.params.vertexColors, true, 'the section colours come from the vertex colours');
    assert.ok(material.params.map instanceof FakeCanvasTexture);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 2), [atlas.totalLedX, atlas.totalLedY]);
    assert.equal(calls[0][2].getHexString(), 'ffffff', 'a white tile');
    assert.equal(Strategies.combinedLedSimColor, undefined, 'the switch is retired');
  });

  test('LEDPixelTextureFactory.tile: the cache key is the normalised hex colour, so equal colours share one master', () => {
    // A 2D context whose methods return a gradient stand-in (the tile painters call createRadialGradient().addColorStop).
    const paintable = () => new Proxy({}, {
      get: (target, key) => (key in target ? target[key] : () => ({ addColorStop() {} })),
      set: (target, key, value) => { target[key] = value; return true; },
    });
    const canvases = [];
    const doc = { canvases, createElement: (tag) => { const c = { tag, width: 0, height: 0, getContext: paintable }; canvases.push(c); return c; } };
    const display = { ledLayout: 'single-dot' };
    const tiles = new LEDPixelTextureFactory({ doc, display, theme: { canvas: CanvasTheme } });
    const a = tiles.tile('#00F0FF');
    const b = tiles.tile('#00f0ff');
    assert.equal(a.master, b.master, "'#00F0FF' and '#00f0ff' are one tile");
    assert.equal(doc.canvases.length, 1);
    const white = tiles.tile(new FakeColor('white'));
    assert.equal(tiles.tile('#ffffff').master, white.master, 'a THREE.Color and its hex string are one tile');
    assert.notEqual(tiles.tile(new FakeColor('#ff0000')).master, white.master, 'two Color objects no longer share "[object Object]"');
    assert.equal(doc.canvases.length, 3);
    display.ledLayout = 'square';
    assert.notEqual(tiles.tile('#00f0ff').master, a.master, 'the layout is part of the key');
    const tiled = tiles.tiled(7, 3, '#00f0ff');
    assert.deepEqual(tiled.repeat.value, [7, 3]);
  });
});
