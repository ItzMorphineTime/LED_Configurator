/**
 * @module app/fontGate
 * The font gate (docs/improvements/06-morph-branding.md 5.6, 06 T5; ARCHITECTURE 6.2 row F6-1): canvas text drawn
 * before its web font arrived is redrawn once, when the fonts have settled. App.start runs it fire-and-forget after
 * the reset view.
 * Deterministic: panel IDs are off at startup and nothing is drawn before the fonts arrive, so it never rebuilds at
 * startup; in the harness every font is preloaded and every text is ASCII, so nothing is ever pending and no golden
 * output depends on its timing. A user who switched panel IDs on within the font-loading window gets exactly one
 * corrective rebuild.
 * Limitations (ARCHITECTURE 8.4): text drawn after the gate has settled waits for the next rebuild (PanelIdRenderer
 * requests its font on the first draw), and the safe-distance label is redrawn on the next camera change.
 * Layer: app (imports nothing; the FontFaceSet, the renderer and the controller are injected). Node-tested with fakes
 * (tests/unit/font-gate.test.mjs).
 */

/**
 * Settles a call that may throw synchronously or return a promise (or nothing).
 * @param {() => *} fn
 * @returns {Promise<*>}
 */
const attempt = (fn) => Promise.resolve().then(fn);

/**
 * Runs the gate:
 * 1. awaits fonts.load(f) for every preload font f (each failure swallowed; without a text the latin subset loads);
 * 2. pending = panelIds.takePendingFonts(): the [font, text] pairs PanelIdRenderer drew while fonts.check(font, text)
 *    was false (deduplicated; the call clears the list);
 * 3. if nothing is pending, returns false; otherwise awaits every fonts.load(font, text) (with the text, so a
 *    latin-ext or other subset a section name needs is loaded too; failures swallowed), then calls
 *    wallController.rebuildIfPanelIds() exactly once (it rebuilds only while panel IDs are on) and returns true.
 * Side effects: font loads; at most one wallController.rebuildIfPanelIds() call; onError(err) if a step throws.
 * @param {{fonts: FontFaceSet|undefined, preloadFonts: string[],
 *          panelIds: {takePendingFonts(): string[][]},
 *          wallController: {rebuildIfPanelIds(): void},
 *          onError?: (err: *) => void}} deps
 *   fonts: doc.fonts (a document without one skips the loads); preloadFonts: theme.canvas.preloadFonts;
 *   onError: receives an error thrown by takePendingFonts or rebuildIfPanelIds (default: ignored)
 * @returns {Promise<boolean>} true iff it called rebuildIfPanelIds. Never rejects.
 */
export async function runFontGate({ fonts, preloadFonts = [], panelIds, wallController, onError = () => {} }) {
  let rebuilt = false;
  try {
    const load = (font, text) => attempt(() => (text === undefined ? fonts?.load?.(font) : fonts?.load?.(font, text)));
    await Promise.allSettled(preloadFonts.map((font) => load(font)));
    const pending = panelIds.takePendingFonts();
    if (!pending.length) return false;
    await Promise.allSettled(pending.map(([font, text]) => load(font, text)));
    rebuilt = true;
    wallController.rebuildIfPanelIds();
  } catch (err) {
    onError(err);
  }
  return rebuilt;
}
