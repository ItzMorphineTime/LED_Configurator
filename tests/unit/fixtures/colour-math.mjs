// Colour math for the token tests (docs/improvements/06-morph-branding.md 6.1 and 6.3): parsing of the token values,
// alpha compositing, WCAG 2.2 relative luminance and contrast, CIELAB (D65), CIEDE2000 (kL = kC = kH = 1) and the
// Machado dichromacy simulation of 6.3 (U7).
// Zero dependencies.

/**
 * A token colour value as an 8-bit RGB triple plus alpha: '#rrggbb' (any case) or 'rgba(r, g, b, a)'.
 * @param {string} value
 * @returns {{rgb: number[], a: number} | null} null for anything else (a shadow, a font, a gradient)
 */
export function parseColour(value) {
  const v = String(value).trim();
  const h = /^#([0-9a-f]{6})$/i.exec(v);
  if (h) return { rgb: [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)), a: 1 };
  const r = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i.exec(v);
  if (r) return { rgb: [r[1], r[2], r[3]].map(Number), a: r[4] === undefined ? 1 : Number(r[4]) };
  return null;
}

/** '#rrggbb' -> [r, g, b]; throws for anything else. */
export function hexRgb(hex) {
  const c = parseColour(hex);
  if (!c || c.a !== 1) throw new Error(`not an opaque #rrggbb colour: ${hex}`);
  return c.rgb;
}

/**
 * A token colour over an opaque background, per channel round(a * fg + (1 - a) * bg) (6.1).
 * @param {string} value '#rrggbb' or 'rgba(...)'
 * @param {number[]|string} bg the opaque background ([r, g, b] or '#rrggbb')
 * @returns {number[]}
 */
export function composite(value, bg) {
  const c = parseColour(value);
  if (!c) throw new Error(`not a colour: ${value}`);
  const b = typeof bg === 'string' ? hexRgb(bg) : bg;
  return c.rgb.map((f, i) => Math.round(c.a * f + (1 - c.a) * b[i]));
}

const lin = (c8) => {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.2 relative luminance of an 8-bit RGB triple. */
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG 2.2 contrast ratio of two opaque colours ([r, g, b] or '#rrggbb'). */
export function contrast(a, b) {
  const la = luminance(typeof a === 'string' ? hexRgb(a) : a);
  const lb = luminance(typeof b === 'string' ? hexRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** CIELAB (D65) of an 8-bit sRGB triple. */
export function lab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** CIEDE2000 colour difference of two Lab triples (Sharma, Wu and Dalal 2005; kL = kC = kH = 1). */
export function deltaE00Lab([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (b, a) => {
    if (b === 0 && a === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hb = hb < 360 ? hb + 360 : hb - 360;
    hb /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad)
    - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cpb;
  const Sh = 1 + 0.015 * Cpb * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** CIEDE2000 of two 8-bit sRGB colours ([r, g, b] or '#rrggbb'). */
export function deltaE00(a, b) {
  return deltaE00Lab(lab(typeof a === 'string' ? hexRgb(a) : a), lab(typeof b === 'string' ? hexRgb(b) : b));
}

// ---- dichromacy simulation (06 6.3, U7) ------------------------------------------------------------

/** Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear RGB (06 6.3). */
export const MACHADO = Object.freeze({
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
});

/** CIELAB (D65) of a linear RGB triple in [0, 1] (no 8-bit rounding). */
export function labFromLinear([R, G, B]) {
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/**
 * The CIELAB of an sRGB colour as seen in a vision mode: 'normal', or a dichromacy simulated with the MACHADO matrix
 * in linear RGB, clamped to [0, 1] and kept unrounded (06 6.3).
 * @param {string|number[]} colour '#rrggbb' or [r, g, b]
 * @param {'normal'|'protan'|'deutan'|'tritan'} mode
 */
export function labInMode(colour, mode) {
  const l = (typeof colour === 'string' ? hexRgb(colour) : colour).map(lin);
  const m = MACHADO[mode];
  if (!m) return labFromLinear(l);
  return labFromLinear(m.map((row) => Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))));
}
