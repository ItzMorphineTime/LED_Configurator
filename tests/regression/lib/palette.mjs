// The live palette hook of the harness (docs/improvements/01-normals.md 8.2, T2; 07 C53): colour probes read the colours
// they look for from the page that is running, never from literals, so a palette or token change (spec 06 T5/T7,
// 07 U3) moves the probes with it and stays attributable to its own step.
//   livePalette(app)   app: an AppPage (lib/app.mjs). Resolves to the palette object below.
// Sources, in priority order for each scene colour:
//   1. the `--scene-*` custom property on :root (spec 06's tokens, read from the computed style), when it is defined;
//   2. the SceneTheme of the served build's js/theme/Theme.js (imported inside the page, the same module instance the
//      app uses; only when the page loads js/main.js as a module, so the original single-file page has none);
//   3. null (the probe that needs it records that it was skipped).
// Section colours always come from the DOM: each card's colour input in #wall-sections (the swatch values that
// sectionsSnapshot records), so they follow imports and edits.
// lib/probe.mjs readProbePalette builds the probe colours of the normals_debug scenario from it (01 T8).

/** The scene colours the probes use and the token that carries each one once spec 06 lands (06 5.12, 01 4.6). */
export const SCENE_COLOURS = Object.freeze({
  background: { token: '--scene-background', theme: ['background'] },
  cabinet: { token: '--scene-wall-back', theme: ['wallBack'] },
  faceFront: { token: '--scene-face-front', theme: ['debug', 'faceFront'] },
  faceBack: { token: '--scene-face-back', theme: ['debug', 'faceBack'] },
  vertexNormal: { token: '--scene-normals', theme: ['debug', 'vertexNormal'] },
  faceNormal: { token: '--scene-normals-face', theme: ['debug', 'faceNormal'] },
  frame: { token: '--scene-frame', theme: ['frame'] },
  gridCenter: { token: '--scene-grid-center', theme: ['grid', 'centerColor'] },
  gridLine: { token: '--scene-grid-line', theme: ['grid', 'color'] },
});

/**
 * A CSS colour or a 0xRRGGBB number as [r, g, b] (0..255), or null. Accepts #rgb, #rrggbb, rgb()/rgba() with integer
 * channels and plain numbers; anything else (keywords, hsl(), empty) gives null.
 * @param {string|number|null|undefined} v
 * @returns {number[]|null}
 */
export function toRgb(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff) return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (m) return [1, 2, 3].map((k) => Math.min(255, Number(m[k])));
  return null;
}

/**
 * The palette from the raw page data (pure, unit-tested):
 *   { sections: [{index, name, color, rgb}], wall: rgb of section 0 | null,
 *     <each SCENE_COLOURS key>: rgb | null, sources: {<key>: 'token' | 'theme' | null}, themeLoaded: boolean }
 * @param {{sections: {name: string, color: string}[], tokens: Record<string, string>, sceneTheme: object|null}} raw
 */
export function resolvePalette({ sections = [], tokens = {}, sceneTheme = null }) {
  const out = {
    sections: sections.map((s, index) => ({ index, name: s.name, color: s.color, rgb: toRgb(s.color) })),
    wall: null,
    sources: {},
    themeLoaded: !!sceneTheme,
  };
  out.wall = out.sections.length ? out.sections[0].rgb : null;
  for (const [key, { token, theme }] of Object.entries(SCENE_COLOURS)) {
    const fromToken = toRgb(tokens[token]);
    let fromTheme = null;
    if (sceneTheme) {
      let v = sceneTheme;
      for (const k of theme) v = v == null ? undefined : v[k];
      fromTheme = toRgb(v);
    }
    out[key] = fromToken || fromTheme;
    out.sources[key] = fromToken ? 'token' : fromTheme ? 'theme' : null;
  }
  return out;
}

/**
 * Reads the live palette of the page (see the header). The SceneTheme import is page-side and best effort: it resolves
 * js/theme/Theme.js against the page URL, so the original single-file page (no js/) simply has no theme.
 * @param {{eval(expr: string, timeoutMs?: number): Promise<any>}} app  an AppPage
 * @returns {Promise<ReturnType<typeof resolvePalette>>}
 */
export async function livePalette(app) {
  const tokenNames = JSON.stringify(Object.values(SCENE_COLOURS).map((c) => c.token));
  const raw = await app.eval(`(async () => {
    const cards = [...(document.getElementById('wall-sections')?.children || [])];
    const sections = cards.map((card) => ({
      name: card.querySelector('.section-name-input')?.value ?? null,
      color: card.querySelector('input[type="color"]')?.value ?? null,
    }));
    const css = getComputedStyle(document.documentElement);
    const tokens = {};
    for (const name of ${tokenNames}) { const v = css.getPropertyValue(name).trim(); if (v) tokens[name] = v; }
    let sceneTheme = null;
    // Only a module build has js/theme/Theme.js; asking the original page for it would record an HTTP 404.
    if (document.querySelector('script[type="module"][src$="js/main.js"]')) {
      try {
        const mod = await import(new URL('js/theme/Theme.js', location.href).href);
        sceneTheme = mod && mod.SceneTheme ? JSON.parse(JSON.stringify(mod.SceneTheme)) : null;
      } catch (e) { sceneTheme = null; }
    }
    return { sections, tokens, sceneTheme };
  })()`);
  return resolvePalette(raw);
}
