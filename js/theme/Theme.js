/**
 * @module theme/Theme
 * Every scene, canvas, status-colour, palette and export literal of the legacy page, copied verbatim with its
 * exact type (0x numbers stay numbers, CSS colour strings stay strings), plus the feature keys added since (SceneTheme
 * .debug, 01 F1-1). All objects and arrays are frozen.
 * Only app/App.js imports this module; every consumer receives `theme` (or one of its parts) by injection, so
 * Feature 6 swaps in a ThemeBridge-built object of the same shape in one line (never by mutating these objects): since
 * 06 T3 App injects buildTheme(Theme, the :root custom properties), and these values are its fallbacks, kept equal to
 * the tokens of css/02-tokens.css by the U4 parity test (tests/unit/theme.test.mjs).
 * Legacy source: index.html@cd3fd3f 1379-1384, 1406, 1431, 1440-1449, 1563, 1693, 1821, 2009, 2034, 2042, 2064,
 * 2092, 2107, 2110, 2181, 2334, 2407, 2425-2426, 2518-2524, 2698-2751, 2792, 2826, 2840-2841, 2915-2917, 2960,
 * 3010, 3029-3089, 3225, 3264, 3970-3975, 4520-4549, 4557-4561, 4721, 4915-4916, 4923, 4934, 4964.
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
 */
export const SceneTheme = deepFreeze({
  background: 0x0a0a0f,                                                     // 1431
  grid: { size: 50, divisions: 50, centerColor: 0x2a2a3a, color: 0x1a1a24, position: [12.5, 0, 12.5] },   // 1446-1447
  axesSize: 0.5,                                                            // 1449
  lights: { ambient: { color: 0xffffff, intensity: 0.3 },
            point: { color: 0xffffff, intensity: 0.8, position: [5, 5, 10] } },   // 1440-1443
  frame: 0x4a4a5a,                                                          // 1563
  cameraBody: { color: 0xff6600, opacity: 0.8 },                            // 2334
  frustumLines: { color: 0xffaa00, opacity: 0.7 },                          // 2407
  frustumFill: { color: 0xffaa00, opacity: 0.08 },                          // 2425-2426
  safeZone: { wallColor: [0.2, 1, 0.4], thresholdColor: [1, 0.2, 0.2], floorOpacity: 0.5,
              lineColor: 0xff4444, lineOpacity: 0.8, labelColor: '#ff4444', labelFont: 'bold 32px Arial' },   // 2698-2749
  person: { body: 0x4488ff, dark: 0x2244aa, opacity: 0.85 },                // 2840-2841
  car: { body: { color: 0xff4444, opacity: 0.85 }, dark: { color: 0x222222, opacity: 0.9 },
         glass: { color: 0x88ccff, opacity: 0.5 }, lights: 0xffffaa },      // 2915-2917, 2960
  gizmo: { x: 0xff4444, y: 0x44ff44, z: 0x4444ff, idleOpacity: 0.35, hoverOpacity: 1.0, dimmedOpacity: 0.15 },
         // 3010, 3029-3089, 3225, 3264. Axis colours are a convention: never brand them.
  debug: {                                                                  // 01 F1-1 (4.6): the normals debug view
    faceFront: 0x2f6bff, faceBack: 0xff3344,                                // face orientation (convention colours; never brand them)
    vertexNormal: 0xb8f03c, faceNormal: 0xff4fd8,                           // normal-line tips (lime, magenta)
    lineBaseFactor: 0.35,                                                   // line base colour = tip x factor
  },
});

/**
 * 2D canvas colours, fonts and alphas used by the LED tiles and the panel-ID textures.
 * The font helpers return the exact legacy `ctx.font` strings for a pixel size.
 */
export const CanvasTheme = deepFreeze({
  background: '#0a0a0f',                                                    // 1693, 1821, 2009, 2064
  panelBorderColors: ['#ff0000', '#00ff00', '#0000ff'],                     // 1384 (frozen array)
  panelLabelFont: (px) => `bold ${px}px 'JetBrains Mono', monospace`,       // 2034, 2092
  panelSectionNameFont: (px) => `${px}px 'JetBrains Mono', monospace`,      // 2042
  sectionLabelFont: (px) => `bold ${px}px 'Outfit', sans-serif`,            // 2107
  sectionLabelAlpha: 0.6,                                                   // 2110
  logoAlpha: 0.8,                                                           // 2181
});

/** DOM status colours of the frustum coverage readout (CSS colour strings). */
export const UiColors = deepFreeze({
  status: { within: '#00ff66', offCenter: '#ffaa00', exceeds: '#ff4444' },  // 2518-2524
});

/** Section colour palette (new sections and import fallback) and the card swatch colours. */
export const Palette = deepFreeze({
  sectionColors: ['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffdd00', '#aa66ff', '#66ffaa', '#ff6666'],   // 1379-1382
  cardSwatches: ['#00f0ff', '#ff00aa', '#00ff66', '#ff6b35', '#ffffff', '#ffdd00'],   // 3970-3975 (documentation:
                                                                                     // the card template keeps them literal in Phase 1)
  defaultSectionColor: '#00f0ff',                                           // 1406
});

/** Product name, export file headers, generator strings and download file names. */
export const Brand = deepFreeze({
  productName: 'LED Wall Configurator',
  objHeader: '# LED Wall Configuration OBJ Export\n',                       // 4557
  objGeneratorLine: '# Generated by LED Wall Configurator\n\n',             // 4559
  mtlHeader: '# LED Wall Materials\n\n',                                    // 4561
  gltfGenerator: 'LED Wall Configurator',                                   // 4721
  safeDistanceObjHeader: '# Safe Distance Floor Mesh\n# Exported from LED Wall Configurator\n\n',   // 2792
  files: { json: 'led-wall-config.json', obj: 'led-wall-config.obj', mtl: 'led-wall-config.mtl',
           gltf: 'led-wall-config.gltf', zip: 'led-wall-export.zip', panelIdsPng: 'panel-ids.png',
           safeDistanceObj: 'safe-distance-floor.obj' },
           // 4964, 4915, 4916 (and the OBJ `mtllib` line), 4923, 4549, 4934, 2826; ZIP entries 4520-4530
});

/**
 * The whole theme, injected by App.js: { scene, canvas, ui, palette, brand }.
 * Feature 6 replaces it with an object of the same shape.
 */
export const Theme = Object.freeze({ scene: SceneTheme, canvas: CanvasTheme, ui: UiColors, palette: Palette, brand: Brand });
