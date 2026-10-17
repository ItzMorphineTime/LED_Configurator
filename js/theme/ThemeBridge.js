/**
 * @module theme/ThemeBridge
 * Builds a Theme-shaped, deep-frozen object whose colour and font leaves come from CSS custom properties (read through
 * an injected reader). Every other leaf is copied from the base theme (docs/improvements/06-morph-branding.md 5.5, 6.2;
 * decision D7: the CSS tokens are the runtime source of every chrome, scene and canvas colour, and Theme.js holds the
 * identical fallbacks under the U4 parity test).
 * Layer: theme (imports nothing). Pure: no DOM, no THREE; Node-testable with a fake reader.
 */

/**
 * [path, cssVar, kind]. kind:
 *   'num'   -> 0xrrggbb            (accepts #rrggbb)
 *   'hex'   -> '#rrggbb' lowercase (accepts #rrggbb)
 *   'rgb01' -> [r/255, g/255, b/255]
 *   'css'   -> '#rrggbb' lowercase, or canonical 'rgba(r, g, b, a)' (accepts either; ints 0-255, a in [0, 1], printed
 *              with String(Number(a))). Used by spec 04's Theme.uv.
 * Every path exists in Theme with a leaf of the matching type (U2). The keys that later steps add land with their
 * rows: 06 T5 added scene.frameOnLight (--scene-frame-on-light), scene.cameraBody.outlineColor and
 * scene.frustumLines.haloColor (both --scene-overlay-halo, the halo of every two-tone overlay and edge outline, D15);
 * 01 F1-5 adds scene.wallBack (--scene-wall-back); the sibling specs add their keys of 06 5.12 (03 T1: scene.pivot.color,
 * selectedColor, anchorColor and haloColor, the last on --scene-overlay-halo).
 */
export const COLOR_BINDINGS = Object.freeze([
  ['scene.background',              '--scene-background',     'num'],
  ['scene.grid.centerColor',        '--scene-grid-center',    'num'],
  ['scene.grid.color',              '--scene-grid-line',      'num'],
  ['scene.frame',                   '--scene-frame',          'num'],
  ['scene.frameOnLight',            '--scene-frame-on-light', 'num'],   // 06 T5 (6.7: the dark frame)
  ['scene.cameraBody.color',        '--scene-camera-body',    'num'],
  ['scene.cameraBody.outlineColor', '--scene-overlay-halo',   'num'],   // 06 T5 (D15: the edge outline)
  ['scene.frustumLines.color',      '--scene-frustum',        'num'],
  ['scene.frustumLines.haloColor',  '--scene-overlay-halo',   'num'],   // 06 T5 (D15: the frustum halo)
  ['scene.frustumFill.color',       '--scene-frustum',        'num'],
  ['scene.safeZone.wallColor',      '--scene-safe-wall',      'rgb01'],
  ['scene.safeZone.thresholdColor', '--scene-safe-threshold', 'rgb01'],
  ['scene.safeZone.clampedColor',   '--scene-safe-clamped',   'rgb01'],   // 08 P2-5b (the clamped band edge, 6.9)
  ['scene.safeZone.lineColor',      '--scene-safe-line',      'num'],
  ['scene.safeZone.labelColor',     '--scene-safe-label',     'hex'],
  ['scene.debug.faceFront',         '--scene-face-front',     'num'],   // spec 01's debug view (01 4.6, CR-8; 06 T3)
  ['scene.debug.faceBack',          '--scene-face-back',      'num'],
  ['scene.debug.vertexNormal',      '--scene-normals',        'num'],
  ['scene.debug.faceNormal',        '--scene-normals-face',   'num'],
  ['scene.pivot.color',             '--scene-pivot',          'num'],   // spec 03's pivot marker (03 T1; 06 5.12)
  ['scene.pivot.selectedColor',     '--scene-pivot-selected', 'num'],
  ['scene.pivot.anchorColor',       '--scene-pivot-anchor',   'num'],
  ['scene.pivot.haloColor',         '--scene-overlay-halo',   'num'],
  ['canvas.background',             '--canvas-background',    'hex'],
  ['ui.status.within',              '--status-within',        'hex'],
  ['ui.status.offCenter',           '--status-off-center',    'hex'],
  ['ui.status.exceeds',             '--status-exceeds',       'hex'],
].map((row) => Object.freeze(row)));

/** [path, cssVar, make]: make(fontFamilyList) returns the leaf (a (px) => string function, or a string). */
export const FONT_BINDINGS = Object.freeze([
  ['canvas.panelLabelFont',       '--font-mono', (f) => (px) => `bold ${px}px ${f}`],
  ['canvas.panelSectionNameFont', '--font-mono', (f) => (px) => `${px}px ${f}`],
  ['canvas.sectionLabelFont',     '--font-ui',   (f) => (px) => `bold ${px}px ${f}`],
  ['scene.safeZone.labelFont',    '--font-ui',   (f) => `600 32px ${f}`],
  // spec 04 adds ['uv.font', '--font-mono', (f) => `11px ${f}`]
].map((row) => Object.freeze(row)));

/**
 * Theme colour leaves that are deliberately not branded (functional conventions), read by the U10 and U11 tests:
 * the lights, the person and car props (the harness picks the person by its blue), the gizmo axes (XYZ = RGB) and the
 * panel-ID border cycle (R/G/B). Spec 01's face-orientation colours are not here: 01 CR-8 binds them to tokens.
 */
export const UNBRANDED = Object.freeze([
  'scene.lights.ambient.color', 'scene.lights.point.color',
  'scene.person.body', 'scene.person.dark',
  'scene.car.body.color', 'scene.car.dark.color', 'scene.car.glass.color', 'scene.car.lights',
  'scene.gizmo.x', 'scene.gizmo.y', 'scene.gizmo.z',
  'canvas.panelBorderColors',
]);

/**
 * Default of buildTheme's bindFonts option: false from 06 T2 to T4a (the canvas fonts kept the base Theme strings, so
 * a change of --font-ui / --font-mono reached the DOM only); true since 06 T5, so the canvas and safe-zone label fonts
 * come from --font-mono / --font-ui like every DOM font. App and the U4 parity test both omit the option, so they
 * always bind fonts identically.
 */
export const BIND_FONTS_DEFAULT = true;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const RGBA_RE = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*\.?\d+)\s*\)$/i;

/**
 * Parses a 6-digit hex colour.
 * @param {*} raw  the value; anything but a string is invalid
 * @returns {{hex: string, num: number, rgb01: number[]} | null}  null unless the trimmed text is exactly #rrggbb
 *   (any case); hex is lowercase, rgb01 uses parseInt(hh, 16) / 255 (the expression of the Theme.js fallbacks).
 * Side effects: none.
 */
export function parseHexColor(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!HEX_RE.test(s)) return null;
  const hex = s.toLowerCase();
  const channel = (i) => parseInt(hex.slice(i, i + 2), 16);
  return { hex, num: parseInt(hex.slice(1), 16), rgb01: [channel(1) / 255, channel(3) / 255, channel(5) / 255] };
}

/**
 * Parses a colour of the 'css' kind: #rrggbb, or rgba(r, g, b, a) with integer channels 0-255 and a in [0, 1].
 * @param {*} raw  the value; anything but a string is invalid
 * @returns {string | null}  '#rrggbb' lowercase, or the canonical 'rgba(r, g, b, a)' (one space after each comma, a
 *   printed with String(Number(a))); null for anything else (rgb(), hsl(), keywords, out-of-range values).
 * Side effects: none.
 */
export function parseCssColor(raw) {
  const hex = parseHexColor(raw);
  if (hex) return hex.hex;
  if (typeof raw !== 'string') return null;
  const m = RGBA_RE.exec(raw.trim());
  if (!m) return null;
  const rgb = [m[1], m[2], m[3]].map(Number);
  const a = Number(m[4]);
  if (rgb.some((c) => c > 255) || !(a >= 0 && a <= 1)) return null;
  return `rgba(${rgb.join(', ')}, ${String(a)})`;
}

/**
 * A fresh copy of a plain value: objects and arrays are copied (same key order), functions and primitives are kept.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) out[key] = deepClone(v);
    return out;
  }
  return value;
}

/**
 * Freezes objects and arrays recursively; functions are skipped (never frozen), because the font helpers are shared
 * with the base theme by reference and Theme.js keeps them unfrozen (ARCHITECTURE 3.4).
 * @template T
 * @param {T} value
 * @returns {T} the same value
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * The object that holds the leaf at a dotted path of a cloned theme, and the leaf's key.
 * @param {object} root
 * @param {string} path  e.g. 'scene.safeZone.wallColor'
 * @returns {{node: object, key: string}}
 * @throws {Error} when the path does not exist in the base theme (a binding table error, never a token error)
 */
function leafSlot(root, path) {
  const keys = path.split('.');
  let node = root;
  for (const key of keys.slice(0, -1)) {
    node = node !== null && typeof node === 'object' ? node[key] : undefined;
    if (node === null || typeof node !== 'object') throw new Error(`ThemeBridge: no ${path} in the base theme`);
  }
  const key = keys[keys.length - 1];
  if (!Object.prototype.hasOwnProperty.call(node, key)) throw new Error(`ThemeBridge: no ${path} in the base theme`);
  return { node, key };
}

/**
 * Replaces the leaf at a dotted path of a cloned theme.
 * @param {object} root
 * @param {string} path
 * @param {*} value
 * @throws {Error} when the path does not exist in the base theme (see leafSlot)
 */
function setLeaf(root, path, value) {
  const { node, key } = leafSlot(root, path);
  node[key] = value;
}

/**
 * Builds the bridged theme.
 * @param {typeof import('./Theme.js').Theme} base  the frozen Theme (fallback values and every non-bridged leaf)
 * @param {(cssVarName: string) => string} readVar  returns the computed value ('' when undefined)
 * @param {{warn?: (msg: string) => void, bindFonts?: boolean}} [options]  bindFonts defaults to BIND_FONTS_DEFAULT
 * @returns a deep-frozen object with exactly base's key structure and leaf types. Objects and arrays are fresh copies
 *   and are frozen; function leaves are shared with base by reference and never frozen, so base is never mutated.
 *   Never throws for missing or malformed tokens: each such leaf keeps its base value.
 * @throws {Error} when a COLOR_BINDINGS or FONT_BINDINGS path does not exist in base (a binding table error). Every
 *   path is checked before any token is read, so the error does not depend on the tokens or on bindFonts.
 * Side effects: calls warn at most once per CSS variable name (a variable bound to several leaves warns once), with
 *   `ThemeBridge: ${name} is missing or invalid (${JSON.stringify(raw)}); using the Theme.js fallback`.
 */
export function buildTheme(base, readVar, { warn = () => {}, bindFonts = BIND_FONTS_DEFAULT } = {}) {
  const out = deepClone(base);
  // A table error must not hide behind a missing token: check every bound path first.
  for (const [path] of COLOR_BINDINGS) leafSlot(out, path);
  for (const [path] of FONT_BINDINGS) leafSlot(out, path);
  const warned = new Set();
  const bad = (name, raw) => {
    if (warned.has(name)) return;
    warned.add(name);
    warn(`ThemeBridge: ${name} is missing or invalid (${JSON.stringify(raw)}); using the Theme.js fallback`);
  };
  for (const [path, name, kind] of COLOR_BINDINGS) {
    const raw = String(readVar(name) ?? '').trim();
    const v = kind === 'css' ? parseCssColor(raw) : parseHexColor(raw);
    if (v === null) { bad(name, raw); continue; }
    setLeaf(out, path, kind === 'num' ? v.num : kind === 'hex' ? v.hex : kind === 'rgb01' ? v.rgb01 : v);
  }
  if (bindFonts) {
    for (const [path, name, make] of FONT_BINDINGS) {
      const family = String(readVar(name) ?? '').trim();
      if (family === '') { bad(name, family); continue; }
      setLeaf(out, path, make(family));
    }
  }
  return deepFreeze(out);
}
