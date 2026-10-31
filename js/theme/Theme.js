/**
 * @module theme/Theme
 * The scene, canvas, status-colour, palette and export values of the app, each with its exact type (0x numbers stay
 * numbers, CSS colour strings stay strings), plus the feature keys added since (SceneTheme.debug, 01 F1-1). All
 * objects and arrays are frozen.
 * Only app/App.js imports this module; every consumer receives `theme` (or one of its parts) by injection, so
 * Feature 6 swaps in a ThemeBridge-built object of the same shape in one line (never by mutating these objects): since
 * 06 T3 App injects buildTheme(Theme, the :root custom properties), and these values are its fallbacks, kept equal to
 * the tokens of css/02-tokens.css by the U4 parity test (tests/unit/theme.test.mjs).
 * 06 T5 (docs/improvements/06-morph-branding.md 3.8, 5.4): the scene, canvas and status values are the Morph values
 * (D15: light/dark adaptive panel frames, an opaque camera body with an edge outline, a two-tone dashed frustum), the
 * canvas fonts are JetBrains Mono and Montserrat, and CanvasTheme.preloadFonts feeds the font gate (app/fontGate.js).
 * 06 T6a (5.4, 7): the brand strings name "Morph LED Configurator" (ASCII only: several OBJ importers read Latin-1),
 * with Brand.jsonGenerator for spec 07's JSON generator record. 06 T6b: every download file name derives from
 * Brand.filePrefix = 'morph-led-wall' (06 D9, Q11). 06 T7 (3.9, D8): the 8-colour Morph section palette with Studio
 * Grey #d9d9d6 as the default first section; the legacy palette stays only to fill colour-less sections of v1 files.
 * 03 T1 (4.1): SceneTheme.pivot, the pivot marker's two-tone colours and sizes, with the values of 06 5.12. 03 T10 (Q8):
 * the floor grid is 100 x 100 m, centred on the stage origin.
 * Legacy source: index.html@cd3fd3f 1379-1384, 1406, 1431, 1440-1449, 1563, 1693, 1821, 2009, 2034, 2042, 2064,
 * 2092, 2107, 2110, 2181, 2334, 2407, 2425-2426, 2518-2524, 2698-2751, 2792, 2826, 2840-2841, 2915-2917, 2960,
 * 3010, 3029-3089, 3225, 3264, 3970-3975, 4520-4549, 4557-4561, 4721, 4915-4916, 4923, 4934, 4964 (where each value
 * is used; the values that 06 T5 re-coloured are those of 06 3.8).
 * Layer: theme (imports no other directory of js/).
 */

/**
 * Recursively freezes plain objects and arrays (module-private; functions are left as they are).
 * @template T
 * @param {T} value
 * @returns {T} the same value, frozen
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * three.js scene colours, opacities and sizes (numbers are THREE colour hex values).
 * Gizmo axis colours are a convention (X red, Y green, Z blue): never brand them.
 * 06 T5 (3.8, D15): `frame` is the light panel frame and `frameOnLight` the dark one (LEDWallView picks one per
 * section with render/frameColor.js); the camera body is opaque with a Morph Black edge outline; the frustum lines are
 * a dashed light core over a solid Morph Black halo (CameraRigView).
 */
export const SceneTheme = deepFreeze({
  background: 0x0a0a0a,                                                     // 1431 (Morph Black)
  // 03 T10 (Q8 option c, the owner's B6): 100 m x 100 m with 1 m lines, centred on the stage origin (the pivot on the
  // floor), so its centre lines cross where the axes do, for every pivot mode; legacy 1446-1447 was 50 x 50 at (12.5, 0, 12.5)
  grid: { size: 100, divisions: 100, centerColor: 0x333333, color: 0x1c1c1c, position: [0, 0, 0] },
  axesSize: 0.5,                                                            // 1449
  lights: { ambient: { color: 0xffffff, intensity: 0.3 },
            point: { color: 0xffffff, intensity: 0.8, position: [5, 5, 10] } },   // 1440-1443
  frame: 0xd4d4d4,                                                          // 1563: the light frame (06 6.7)
  frameOnLight: 0x0a0a0a,                                                   // 06 T5: the dark frame of light sections (6.7)
  cameraBody: { color: 0xc51622, opacity: 1.0, outlineColor: 0x0a0a0a },    // 2334; outlineColor 06 T5 (edge outline)
  frustumLines: { color: 0xf7f7f5, haloColor: 0x0a0a0a, opacity: 1.0, dashSize: 0.15, gapSize: 0.10 },
                                                                            // 2407; haloColor, dashSize, gapSize 06 T5
  frustumFill: { color: 0xf7f7f5, opacity: 0.05 },                          // 2425-2426
  safeZone: { wallColor: [0x3d / 255, 0xd6 / 255, 0x8c / 255], thresholdColor: [0xc5 / 255, 0x16 / 255, 0x22 / 255],
              clampedColor: [0xff / 255, 0x86 / 255, 0x40 / 255],   // 08 P2-5b: an outer vertex closer than D (6.9)
              floorOpacity: 0.5, lineColor: 0xf2555a, lineOpacity: 0.9, labelColor: '#f2555a',
              labelFont: "600 32px 'Montserrat', system-ui, sans-serif" },   // 2698-2749
  person: { body: 0x4488ff, dark: 0x2244aa, opacity: 0.85 },                // 2840-2841 (unchanged, 06 D12)
  car: { body: { color: 0xff4444, opacity: 0.85 }, dark: { color: 0x222222, opacity: 0.9 },
         glass: { color: 0x88ccff, opacity: 0.5 }, lights: 0xffffaa },      // 2915-2917, 2960 (unchanged, 06 D12)
  gizmo: { x: 0xff4444, y: 0x44ff44, z: 0x4444ff, idleOpacity: 0.35, hoverOpacity: 1.0, dimmedOpacity: 0.15 },
         // 3010, 3029-3089, 3225, 3264. Axis colours are a convention: never brand them.
  debug: {                                                                  // 01 F1-1 (4.6): the normals debug view
    faceFront: 0x2f6bff, faceBack: 0xff3344,                                // face orientation (convention colours; never brand them)
    vertexNormal: 0xb8f03c, faceNormal: 0xff4fd8,                           // normal-line tips (lime, magenta)
    lineBaseFactor: 0.35,                                                   // line base colour = tip x factor
  },
  pivot: {                                                                  // 03 T1 (4.1; the values of 06 5.12): the pivot marker
    color: 0xf7f7f5, selectedColor: 0xc51622, anchorColor: 0xa3a3a3,        // two-tone cores: idle, selected, anchor ghost
    haloColor: 0x0a0a0a,                                                    // the Morph Black halo (06 D15)
    opacity: 0.9, glyphHalfSize: 0.25, coreRadius: 0.06, pickRadius: 0.15, dash: 0.05,   // metres (opacity 0..1)
    minScreenHalfSizePx: 24,                                                // the cross is never shorter than this per arm (3.3)
  },
});

/**
 * 2D canvas colours, fonts and alphas used by the LED tiles and the panel-ID textures.
 * The font helpers return the `ctx.font` string for a pixel size (06 T5: JetBrains Mono, whose weight 700 the font URL
 * loads since 06 T5, for the panel labels; Montserrat for the section label). `preloadFonts` are the faces the font
 * gate loads at startup (06 5.6).
 */
export const CanvasTheme = deepFreeze({
  background: '#0a0a0a',                                                    // 1693, 1821, 2009, 2064
  panelBorderColors: ['#ff0000', '#00ff00', '#0000ff'],                     // 1384 (frozen array; unchanged, 06 D12)
  panelLabelFont: (px) => `bold ${px}px 'JetBrains Mono', ui-monospace, monospace`,    // 2034, 2092
  panelSectionNameFont: (px) => `${px}px 'JetBrains Mono', ui-monospace, monospace`,   // 2042
  sectionLabelFont: (px) => `bold ${px}px 'Montserrat', system-ui, sans-serif`,        // 2107
  sectionLabelAlpha: 0.6,                                                   // 2110
  logoAlpha: 0.8,                                                           // 2181
  preloadFonts: ["bold 32px 'JetBrains Mono'", "32px 'JetBrains Mono'", "bold 32px 'Montserrat'", "600 32px 'Montserrat'"],
                                                                            // 06 T5: the font gate (app/fontGate.js)
});

/** DOM status colours of the frustum coverage readout (CSS colour strings; 06 T5: success, warning, danger). */
export const UiColors = deepFreeze({
  status: { within: '#3dd68c', offCenter: '#ff8640', exceeds: '#f2555a' },  // 2518-2524
});

/**
 * The section palette (06 T7, 3.9): Studio Grey, Signal Red, Sky, Ember, Jade, Rose, Iris, Steel. Lowercase, so it
 * equals what <input type="color"> produces and the swatch .active match stays exact. No gold (>= 20 CIEDE2000 from
 * Pivot Gold, U6); distinct in every vision mode (U7).
 */
const SECTION_COLORS = deepFreeze(['#d9d9d6', '#c51622', '#58a6e8', '#e2803c', '#14a37f', '#e68ac0', '#7462d8', '#6c6c6c']);

/**
 * The UV viewer's 2D canvas colours and font (docs/improvements/04-uvs-uv-editor.md 5.3, the values of 06 5.12): wire,
 * island and handle strokes are two-tone (a 2 px wider `halo` stroke under the light core, 06 D15); `outside` dims the
 * area outside 0-1; checkerA / checkerB are the UV checker and the empty canvas. Each colour has its --uv-* token
 * (ThemeBridge COLOR_BINDINGS; the halo is --scene-overlay-halo) and the font follows --font-mono (FONT_BINDINGS).
 */
export const UvViewerTheme = deepFreeze({
  wire: '#f7f7f5', wireMinor: 'rgba(247, 247, 245, 0.35)', island: '#f7f7f5', handle: '#f7f7f5', handleActive: '#f2555a',
  outside: 'rgba(10, 10, 10, 0.6)', pixelGrid: 'rgba(247, 247, 245, 0.08)', crosshair: '#f2555a', checkerA: '#262626',
  checkerB: '#161616', halo: '#0a0a0a', font: "11px 'JetBrains Mono', ui-monospace, monospace",
});

/**
 * Section colour palette: sectionColors for added sections (index = sections.length % 8, 1379-1382) and v2 imports
 * without a colour; cardSwatches, the card's swatches (the same array, 3970-3975); defaultSectionColor, the first
 * section of a new project (1406); legacySectionColors, the Phase-1 palette, only to fill the missing colours of a v1
 * file (06 4.3, Q20; spec 07 C11), so an old file looks as it did when it was authored.
 */
export const Palette = deepFreeze({
  sectionColors: SECTION_COLORS,
  cardSwatches: SECTION_COLORS,
  defaultSectionColor: '#d9d9d6',
  legacySectionColors: ['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffdd00', '#aa66ff', '#66ffaa', '#ff6666'],
});

/** The product name (06 D1, Q1). */
const PRODUCT_NAME = 'Morph LED Configurator';
/** The prefix of every download file name (06 D9, Q11; spec 07 R4's <prefix>, spec 09's brandFilePrefix). */
const FILE_PREFIX = 'morph-led-wall';

/**
 * Product name, export file headers, generator strings and download file names (06 T6a: the Morph strings; 06 T6b:
 * filePrefix and the file names derived from it, 06 5.4).
 * jsonGenerator is the name half of the JSON generator record (06 4.2): every writer of one composes
 * { name: brand.jsonGenerator.name, version: appVersion } (spec 07 D4, C10, C62); the Phase-1 v1 writer has none.
 */
export const Brand = deepFreeze({
  productName: PRODUCT_NAME,
  jsonGenerator: { name: PRODUCT_NAME },                                    // 06 4.2
  shortName: 'LED Configurator',                                            // the header's product name next to the wordmark
  company: 'Morph',
  homepage: 'https://itzmorphinetime.github.io/LED_Configurator/',
  filePrefix: FILE_PREFIX,                                                  // 06 T6b
  objHeader: '# Morph LED Configurator - LED wall OBJ export\n',            // 4557
  objGeneratorLine: '# Generated by Morph LED Configurator\n\n',             // 4559
  mtlHeader: '# Morph LED Configurator - LED wall materials\n\n',           // 4561
  gltfGenerator: PRODUCT_NAME,                                              // 4721 (no version, 06 Q12)
  safeDistanceObjHeader: '# Safe Distance Floor Mesh\n# Exported from Morph LED Configurator\n\n',   // 2792
  files: {                                                                  // all derived from FILE_PREFIX (06 T6b, U9)
    json: `${FILE_PREFIX}.json`, obj: `${FILE_PREFIX}.obj`, mtl: `${FILE_PREFIX}.mtl`, gltf: `${FILE_PREFIX}.gltf`,
    zip: `${FILE_PREFIX}-export.zip`, panelIdsPng: `${FILE_PREFIX}-panel-ids.png`,
    objZip: `${FILE_PREFIX}-obj.zip`,                                         // 08 P2-6e: Export OBJ (ZIP)
    safeDistanceObj: `${FILE_PREFIX}-safe-distance.obj`,
    hdriPixelMap: `${FILE_PREFIX}-hdri-pixel-map.png`,                       // spec 05 (unused until it lands)
  },
  // used at 4964, 4915, 4916 (and the OBJ `mtllib` line), 4923, 4549, 4934, 2826; ZIP entries 4520-4530; objZip is the
  // Export OBJ archive (08 P2-6e), whose entries are obj, mtl and the textures/ files
});

/**
 * The whole theme, injected by App.js: { scene, canvas, ui, palette, brand, uv } (uv: spec 04's UV viewer, UV-12).
 * Feature 6 replaces it with an object of the same shape.
 */
export const Theme = Object.freeze({
  scene: SceneTheme, canvas: CanvasTheme, ui: UiColors, palette: Palette, brand: Brand, uv: UvViewerTheme,
});
