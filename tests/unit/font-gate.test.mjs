// Unit tests for the font gate (docs/improvements/06-morph-branding.md 5.6, 06 T5; ARCHITECTURE 6.2 row F6-1):
// 1. app/fontGate.js runFontGate with a fake FontFaceSet, a fake renderer and a spy controller: the preload fonts are
//    loaded first, 0 rebuildIfPanelIds calls when nothing is pending and exactly 1 when something is, every pending
//    pair loaded with its own text, the pending list cleared, rejecting or throwing loads tolerated, never rejects;
// 2. render/textures/PanelIdRenderer.js takePendingFonts: the (font, text) pairs drawn while doc.fonts.check was
//    false, checked with the actual text, deduplicated, cleared by the call, each requested with doc.fonts.load once.
// The "only with panel IDs on" half of row F6-1 is WallController.rebuildIfPanelIds's, tested in
// wall-controller.test.mjs on the real controller.
// Run: node --test tests/unit/font-gate.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Theme } from '../../js/theme/Theme.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection } from '../../js/domain/WallSection.js';
import { runFontGate } from '../../js/app/fontGate.js';
import { PanelIdRenderer } from '../../js/render/textures/PanelIdRenderer.js';

/** A FontFaceSet stand-in: records every load(font, text) call; `fail` makes load reject (or throw for 'throw'). */
function fakeFonts({ fail = null, loaded = () => true } = {}) {
  const loads = [];
  return {
    loads,
    check: (font, text) => loaded(font, text),
    load(font, text) {
      loads.push(text === undefined ? [font] : [font, text]);
      if (fail === 'throw') throw new SyntaxError('bad font');
      if (fail === 'reject') return Promise.reject(new Error('network'));
      return Promise.resolve([]);
    },
  };
}
/** A renderer stand-in whose pending list is `pairs` until the first take. */
function fakePanelIds(pairs) {
  let pending = pairs;
  const takes = [];
  return { takes, takePendingFonts() { takes.push(pending); const out = pending; pending = []; return out; } };
}
const spyController = () => ({ calls: 0, rebuildIfPanelIds() { this.calls++; } });

describe('runFontGate (06 5.6)', () => {
  test('nothing pending: the preload fonts are loaded, then no rebuild, false', async () => {
    const fonts = fakeFonts();
    const panelIds = fakePanelIds([]);
    const wc = spyController();
    assert.equal(await runFontGate({ fonts, preloadFonts: Theme.canvas.preloadFonts, panelIds, wallController: wc }), false);
    assert.deepEqual(fonts.loads, Theme.canvas.preloadFonts.map((f) => [f]), 'each preload font, without a text');
    assert.equal(panelIds.takes.length, 1);
    assert.equal(wc.calls, 0);
  });

  test('something pending: every pair loaded with its own text, the list taken once, exactly one rebuildIfPanelIds, true', async () => {
    const pairs = [["bold 40px 'JetBrains Mono', ui-monospace, monospace", 'A1'],
      ["bold 120px 'Montserrat', system-ui, sans-serif", 'Łódź stage']];
    const fonts = fakeFonts();
    const panelIds = fakePanelIds(pairs);
    const wc = spyController();
    assert.equal(await runFontGate({ fonts, preloadFonts: ['32px X'], panelIds, wallController: wc }), true);
    assert.deepEqual(fonts.loads, [['32px X'], ...pairs]);
    assert.equal(wc.calls, 1);
    assert.equal(panelIds.takes.length, 1);
    assert.deepEqual(panelIds.takePendingFonts(), [], 'the pending list is cleared');
  });

  for (const fail of ['reject', 'throw']) {
    test(`loads that ${fail} are swallowed: still exactly one rebuild, and the promise resolves`, async () => {
      const fonts = fakeFonts({ fail });
      const wc = spyController();
      const result = await runFontGate({ fonts, preloadFonts: Theme.canvas.preloadFonts, panelIds: fakePanelIds([['32px X', 'A1']]), wallController: wc });
      assert.equal(result, true);
      assert.equal(wc.calls, 1);
    });
  }

  test('without a FontFaceSet (no doc.fonts) the pending pairs still lead to one rebuild', async () => {
    const wc = spyController();
    assert.equal(await runFontGate({ fonts: undefined, preloadFonts: ['32px X'], panelIds: fakePanelIds([['32px X', 'A1']]), wallController: wc }), true);
    assert.equal(wc.calls, 1);
  });

  test('never rejects: an error of the renderer or the controller goes to onError', async () => {
    const errors = [];
    const broken = { takePendingFonts() { throw new Error('take'); } };
    assert.equal(await runFontGate({ fonts: fakeFonts(), panelIds: broken, wallController: spyController(), onError: (e) => errors.push(e.message) }), false);
    const throwing = { rebuildIfPanelIds() { throw new Error('rebuild'); } };
    assert.equal(await runFontGate({ fonts: fakeFonts(), panelIds: fakePanelIds([['32px X', 'A']]), wallController: throwing, onError: (e) => errors.push(e.message) }), true,
      'true: it called rebuildIfPanelIds');
    assert.deepEqual(errors, ['take', 'rebuild']);
    await assert.doesNotReject(runFontGate({ fonts: fakeFonts(), panelIds: broken, wallController: spyController() }));
  });
});

// ---- PanelIdRenderer.takePendingFonts ------------------------------------------------------------------------------

/** A 2D context that accepts every method call and property write. */
const fakeContext = () => new Proxy({}, {
  get: (target, key) => (key in target ? target[key] : () => {}),
  set: (target, key, value) => { target[key] = value; return true; },
});
/** A document with canvases and the given FontFaceSet. */
const fakeDoc = (fonts) => ({ fonts, createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext() }) });

function renderer(fonts, sectionFields = {}) {
  const project = Project.createDefault();
  project.panelIdStyle.sectionLabelEnabled = true;
  const section = new WallSection({ id: 0, name: 'Łódź', panelCols: 2, panelRows: 1, panelWidth: 500, panelHeight: 500,
    ledX: 32, ledY: 32, curveIntensity: 0, angleOffset: 0, color: '#d9d9d6', ...sectionFields });
  const panelIds = new PanelIdRenderer({ doc: fakeDoc(fonts), style: project.panelIdStyle, logos: project.logos, theme: Theme });
  return { panelIds, section };
}

describe('PanelIdRenderer.takePendingFonts (06 5.6)', () => {
  test('all fonts loaded: nothing is pending and nothing is requested', () => {
    const checks = [];
    const fonts = fakeFonts({ loaded: (font, text) => { checks.push([font, text]); return true; } });
    const { panelIds, section } = renderer(fonts);
    panelIds.sectionCanvas(section, 0, 1);
    panelIds.panelCanvas(0, 0, 32, 32, section);
    assert.deepEqual(panelIds.takePendingFonts(), []);
    assert.deepEqual(fonts.loads, []);
    assert.deepEqual(checks.map(([, text]) => text), ['A1', 'B1', 'Łódź', 'A1', 'Łódź'], 'checked with the actual texts');
    assert.ok(checks.every(([font]) => font.includes("'JetBrains Mono'") || font.includes("'Montserrat'")));
  });

  test('a font that is not loaded: each (font, text) pair once, in draw order; the take clears the list', () => {
    const fonts = fakeFonts({ loaded: (font, text) => text !== 'Łódź' });   // the latin-ext subset is missing
    const { panelIds, section } = renderer(fonts);
    panelIds.sectionCanvas(section, 0, 1);
    panelIds.sectionCanvas(section, 0, 1);
    panelIds.panelCanvas(0, 0, 32, 32, section);
    const pending = panelIds.takePendingFonts();
    assert.equal(pending.length, 2, 'the section label (section canvas) and the section name (panel canvas), once each');
    assert.deepEqual(pending.map(([, text]) => text), ['Łódź', 'Łódź']);
    assert.match(pending[0][0], /^bold [0-9.]+px 'Montserrat', system-ui, sans-serif$/);
    assert.match(pending[1][0], /^[0-9.]+px 'JetBrains Mono', ui-monospace, monospace$/);
    assert.deepEqual(panelIds.takePendingFonts(), [], 'cleared');
    assert.deepEqual(fonts.loads, pending, 'each recorded pair is requested once, with its text');
  });

  test('a pair recorded again after a take is pending again but not requested again; a throwing check counts as loaded', () => {
    const fonts = fakeFonts({ loaded: (font, text) => text !== 'Łódź' });
    const { panelIds, section } = renderer(fonts);
    panelIds.sectionCanvas(section, 0, 1);
    assert.equal(panelIds.takePendingFonts().length, 1);
    panelIds.sectionCanvas(section, 0, 1);
    assert.equal(panelIds.takePendingFonts().length, 1);
    assert.equal(fonts.loads.length, 1);
    const throwing = { check() { throw new SyntaxError('bad font'); }, load() { throw new Error('never'); } };
    const r = renderer(throwing);
    r.panelIds.sectionCanvas(r.section, 0, 1);
    assert.deepEqual(r.panelIds.takePendingFonts(), []);
    const none = renderer(undefined);
    none.panelIds.sectionCanvas(none.section, 0, 1);
    assert.deepEqual(none.panelIds.takePendingFonts(), [], 'no FontFaceSet: nothing is pending');
  });
});
