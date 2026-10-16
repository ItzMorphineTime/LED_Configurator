/**
 * @module render/frameColor
 * The adaptive panel-frame colour (docs/improvements/06-morph-branding.md 3.8, 6.7, D15; 06 T5). Panel frames always
 * lie on a section, so each section's frames take the light frame (`SceneTheme.frame`) or the dark frame
 * (`SceneTheme.frameOnLight`), whichever contrasts more with that section's colour: at least 3.65:1 for any colour
 * (the two WCAG ratios are equal at the worst colour, sqrt((L_light + 0.05) / (L_dark + 0.05))). Textured or
 * see-through panels (panel IDs, the LED simulation, HDRI content once spec 05 lands, wireframe) and free-string
 * colours get the light frame.
 * Pure: no THREE, no DOM, imports nothing; Node-tested (tests/unit/frame-color.test.mjs, U13).
 * Layer: render.
 */

const HEX_RE = /^#[0-9a-f]{6}$/i;

/**
 * The 8-bit channels of a colour.
 * @param {string|number} colour  '#rrggbb' (any case) or a 0xrrggbb number
 * @returns {number[]} [r, g, b]
 * @throws {TypeError} for anything else
 */
function channels(colour) {
  if (typeof colour === 'number' && Number.isInteger(colour) && colour >= 0 && colour <= 0xffffff) {
    return [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];
  }
  if (typeof colour === 'string' && HEX_RE.test(colour)) {
    return [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  }
  throw new TypeError(`frameColor: not a #rrggbb colour or a 0xrrggbb number: ${String(colour)}`);
}

/** The linear value of one 8-bit sRGB channel (WCAG 2.2). */
const linear = (c8) => {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * WCAG 2.2 relative luminance (06 6.1).
 * Side effects: none.
 * @param {string|number} hex  '#rrggbb' or 0xrrggbb
 * @returns {number} in [0, 1]
 */
export function relativeLuminance(hex) {
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG 2.2 contrast ratio of two opaque colours (06 6.1).
 * Side effects: none.
 * @param {string|number} hexA  '#rrggbb' or 0xrrggbb
 * @param {string|number} hexB  '#rrggbb' or 0xrrggbb
 * @returns {number} in [1, 21]
 */
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The frame colour of one section (06 6.7).
 * Side effects: none.
 * @param {*} sectionColor  the section's colour (a free string until spec 07's setColor rule)
 * @param {{panelIdsEnabled: boolean, ledSimEnabled: boolean, content?: string, wireframe: boolean}} display
 *   the display settings of the rebuild
 * @param {{frame: number, frameOnLight: number}} sceneTheme  the light and the dark frame colours
 * @returns {number} sceneTheme.frame or sceneTheme.frameOnLight
 */
export function frameColorFor(sectionColor, display, sceneTheme) {
  const light = sceneTheme.frame;
  const dark = sceneTheme.frameOnLight;
  // Near-black textures (panel IDs, LED tiles, HDRI content: spec 05 adds that content mode), or see-through panels
  // over the scene background (wireframe): the light frame.
  if (display.panelIdsEnabled || display.ledSimEnabled || display.content === 'hdri' || display.wireframe) return light;
  // Free-string colours (named colours, short hex, ...): the light frame, the legacy-like default.
  if (typeof sectionColor !== 'string' || !HEX_RE.test(sectionColor)) return light;
  return contrastRatio(sectionColor, light) >= contrastRatio(sectionColor, dark) ? light : dark;
}
