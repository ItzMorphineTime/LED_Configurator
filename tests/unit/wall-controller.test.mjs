// Unit tests for WP9: app/WallController (the P1 rebuild pipeline and the rebuild policy of ARCHITECTURE.md 6.2)
// and the wall panels ui/HeaderStats, ui/SectionListPanel, ui/SectionLogosPanel, ui/WallDisplayPanel.
//
// Part 1 drives WallController with a real Project and EventBus and spy stubs for the view, the LED tile cache, the
// orbit controller and the camera hub, and asserts every 6.2 row's rebuild count, cache clears and step order.
// Part 2 checks the import boundaries of the five WP9 modules.
// Part 3 (legacy parity) runs the verbatim legacy functions of index.html@cd3fd3f (read with `git show`) and the new
// panels + controller side by side on two identical fake DOMs built from the legacy markup, replays one long UI
// scenario on both, and compares every DOM write, listener registration, rebuild/cache-clear call and the model
// state after each step. It is skipped when `git show cd3fd3f:index.html` is unavailable.
//
// Run: node --test tests/unit/wall-controller.test.mjs   (zero dependencies; Node 22.7+)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Events, EventBus } from '../../js/core/EventBus.js';
import { Project } from '../../js/domain/Project.js';
import { WallSection, SECTION_FIELDS } from '../../js/domain/WallSection.js';
import { layoutProject } from '../../js/geometry/WallLayout.js';
import { Palette } from '../../js/theme/Theme.js';
import { WallController } from '../../js/app/WallController.js';
import { HeaderStats } from '../../js/ui/HeaderStats.js';
import { SectionListPanel } from '../../js/ui/SectionListPanel.js';
import { SectionLogosPanel } from '../../js/ui/SectionLogosPanel.js';
import { WallDisplayPanel } from '../../js/ui/WallDisplayPanel.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------------------------------------------
// Part 1: WallController with spies
// ---------------------------------------------------------------------------------------------------------------

/** Bare section fields (legacy object-literal shape). */
const fields = (over = {}) => ({
  id: 0, name: 'Wall 1', panelCols: 5, panelRows: 3, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32,
  curveIntensity: 0, angleOffset: 0, color: '#00f0ff', ...over,
});

/**
 * A WallController wired to a real Project and EventBus, with spy collaborators. `trace` records, in order, every
 * collaborator call and every emitted event (by Events key).
 */
function makeRig({ sections = null, panelIds = false, ledSim = false, cameraEnabled = false } = {}) {
  const project = Project.createDefault();
  if (sections) project.wall.replaceAll(sections.map((f) => new WallSection(f)));
  if (panelIds) project.display.setPanelIds(true);
  if (ledSim) project.display.setLedSim(true);
  project.camera.enabled = cameraEnabled;

  const bus = new EventBus();
  const trace = [];
  const events = [];
  const view = {
    calls: [],
    rebuild(args) { this.calls.push(args); trace.push('view.rebuild'); },
  };
  const ledTiles = { clears: 0, clearCache() { this.clears++; trace.push('ledTiles.clearCache'); } };
  const orbit = { calls: 0, updateCameraPosition() { this.calls++; trace.push('orbit.updateCameraPosition'); } };
  const hub = { calls: 0, refresh() { this.calls++; trace.push('hub.refresh'); } };
  for (const [key, type] of Object.entries(Events)) {
    bus.on(type, (payload) => { events.push({ key, payload }); trace.push(key); });
  }
  const wc = new WallController({ project, view, ledTiles, orbit, hub, bus, palette: Palette });
  const rebuilds = () => view.calls.length;
  const emitted = (key) => events.filter((e) => e.key === key).map((e) => e.payload);
  return { project, bus, trace, events, view, ledTiles, orbit, hub, wc, rebuilds, emitted };
}

/** The trace of one P1 run (preview off). */
const P1 = ['view.rebuild', 'WALL_STATS_CHANGED', 'orbit.updateCameraPosition', 'WALL_REBUILT'];

describe('WallController.rebuild (P1, ARCHITECTURE.md 6.1)', () => {
  test('constructor has no side effects', () => {
    const r = makeRig();
    assert.deepEqual(r.trace, []);
  });

  test('order: view, stats event, orbit, WALL_REBUILT; the hub is skipped while the preview is off (row 1)', () => {
    const r = makeRig();
    r.wc.rebuild();
    assert.deepEqual(r.trace, P1);
    assert.equal(r.hub.calls, 0);
    assert.equal(r.ledTiles.clears, 0);
  });

  test('order with the camera preview on: the hub runs after the orbit and before WALL_REBUILT', () => {
    const r = makeRig({ cameraEnabled: true });
    r.wc.rebuild();
    assert.deepEqual(r.trace, ['view.rebuild', 'WALL_STATS_CHANGED', 'orbit.updateCameraPosition', 'hub.refresh', 'WALL_REBUILT']);
    assert.equal(r.hub.calls, 1);
  });

  test('view.rebuild receives a fresh layout of the live sections, the mesh mode and the display settings', () => {
    const r = makeRig({ sections: [fields({ id: 3, panelCols: 4, curveIntensity: 5 }), fields({ id: 7, angleOffset: -30 })] });
    r.project.meshMode = 'section';
    r.wc.rebuild();
    const [args] = r.view.calls;
    assert.deepEqual(Object.keys(args), ['layout', 'meshMode', 'display']);
    assert.deepEqual(args.layout, layoutProject(r.project));
    assert.equal(args.meshMode, 'section');
    assert.equal(args.display, r.project.display);
    const [rebuilt] = r.emitted('WALL_REBUILT');
    assert.deepEqual(Object.keys(rebuilt), ['layout', 'meshMode', 'view']);
    assert.equal(rebuilt.layout, args.layout, 'WALL_REBUILT carries the same layout object');
    assert.equal(rebuilt.meshMode, 'section');
    assert.equal(rebuilt.view, r.view);
  });

  test('layout() is layoutProject(project), recomputed on every call', () => {
    const r = makeRig();
    const a = r.wc.layout();
    assert.deepEqual(a, layoutProject(r.project));
    r.project.wall.sections[0].setField('panelCols', '7');
    const b = r.wc.layout();
    assert.notEqual(a, b);
    assert.equal(b.sections[0].edges.length, 8);
  });

  test('publishStats emits WALL_STATS_CHANGED with wall.totals()', () => {
    const r = makeRig({ sections: [fields({ panelCols: 2.5, curveIntensity: -3 }), fields({ id: 1, ledX: 64 })] });
    r.wc.publishStats();
    assert.deepEqual(r.trace, ['WALL_STATS_CHANGED']);
    assert.deepEqual(r.emitted('WALL_STATS_CHANGED')[0], r.project.wall.totals());
  });

  test('exceptions propagate unchanged and stop the pipeline (no try/catch)', () => {
    const r = makeRig();
    const boom = new TypeError('boom');
    r.view.rebuild = () => { throw boom; };
    assert.throws(() => r.wc.rebuild(), (err) => err === boom);
    assert.deepEqual(r.trace, []);
    assert.equal(r.orbit.calls, 0);
  });
});

describe('rebuild policy (ARCHITECTURE.md 6.2): run counts and tile-cache clears', () => {
  test('rows 2-3 setSectionColor: model then one rebuild per call, never de-duplicated', () => {
    const r = makeRig();
    const section = r.project.wall.sections[0];
    r.wc.setSectionColor(section, '#123456');
    assert.equal(section.color, '#123456');
    assert.equal(r.rebuilds(), 1);
    r.wc.setSectionColor(section, '#123456');
    assert.equal(r.rebuilds(), 2, 'the same colour twice rebuilds twice (input events are never debounced)');
    assert.equal(r.ledTiles.clears, 0);
  });

  test('row 4 rename with panel IDs off: model only, 0 rebuilds, no WALL_SECTION_RENAMED', () => {
    const r = makeRig({ sections: [fields(), fields({ id: 1 }), fields({ id: 2, name: 'Wall 3' })] });
    const section = r.project.wall.sections[2];
    assert.equal(r.wc.renameSection(section, 'Stage Left', 2), 'Stage Left');
    assert.equal(r.wc.renameSection(section, '', 2), 'Wall 3', 'an empty input falls back to the default name');
    r.wc.commitRename();
    assert.deepEqual(r.trace, []);
    assert.equal(r.rebuilds(), 0);
    assert.equal(r.emitted('WALL_SECTION_RENAMED').length, 0);
  });

  test('row 4 rename with panel IDs on: WALL_SECTION_RENAMED {} then one rebuild', () => {
    const r = makeRig({ panelIds: true });
    r.wc.renameSection(r.project.wall.sections[0], 'Main', 0);
    r.wc.commitRename();
    assert.deepEqual(r.trace, ['WALL_SECTION_RENAMED', ...P1]);
    assert.deepEqual(r.emitted('WALL_SECTION_RENAMED'), [{}]);
    assert.equal(r.rebuilds(), 1);
  });

  test('row 5 number edit: setSectionField parses (model only), commitSectionEdit publishes stats twice (stats first)', () => {
    const r = makeRig();
    const section = r.project.wall.sections[0];
    assert.equal(r.wc.setSectionField(section, 'panelCols', '75'), 50);
    assert.equal(r.wc.setSectionField(section, 'ledX', ''), 32);
    assert.equal(r.wc.setSectionField(section, 'panelRows', '2.5'), 2.5, 'B-L15: no rounding');
    assert.equal(section.panelCols, 50);
    assert.deepEqual(r.trace, []);
    r.wc.commitSectionEdit();
    assert.deepEqual(r.trace, ['WALL_STATS_CHANGED', ...P1]);
    assert.equal(r.emitted('WALL_STATS_CHANGED').length, 2);
    assert.equal(r.rebuilds(), 1);
  });

  test('row 5: the stats-first duplicate is observable when the rebuild throws', () => {
    const r = makeRig();
    r.view.rebuild = () => { throw new Error('webgl lost'); };
    assert.throws(() => r.wc.commitSectionEdit(), /webgl lost/);
    assert.equal(r.emitted('WALL_STATS_CHANGED').length, 1);
  });

  test('row 6 addSection: append, WALL_SECTIONS_CHANGED {add, addedId} before the rebuild, one rebuild', () => {
    const r = makeRig();
    let seenCount = null;
    r.bus.on(Events.WALL_SECTIONS_CHANGED, () => { seenCount = r.project.wall.count; });
    r.wc.addSection();
    assert.equal(seenCount, 2, 'the model changed before the mirror ran');
    assert.deepEqual(r.trace, ['WALL_SECTIONS_CHANGED', ...P1]);
    assert.deepEqual(r.emitted('WALL_SECTIONS_CHANGED'), [{ reason: 'add', addedId: 1 }]);
    const added = r.project.wall.sections[1];
    assert.equal(added.id, 1);
    assert.equal(added.name, 'Wall 2');
    assert.equal(added.color, Palette.sectionColors[1]);
    assert.equal(r.project.wall.nextSectionId, 2);
    assert.equal(r.rebuilds(), 1);
    assert.equal(r.ledTiles.clears, 0);
  });

  test('row 6 addSection on an empty wall: allocator incremented, TypeError, nothing else', () => {
    const r = makeRig({ sections: [] });
    assert.equal(r.project.wall.nextSectionId, -Infinity);
    r.project.wall.nextSectionId = 4;
    assert.throws(() => r.wc.addSection(), TypeError);
    assert.equal(r.project.wall.nextSectionId, 5);
    assert.deepEqual(r.trace, []);
  });

  test('row 7 deleteSection with one section: nothing at all', () => {
    const r = makeRig();
    r.project.logos.ensure(0);
    r.wc.deleteSection(0);
    assert.deepEqual(r.trace, []);
    assert.equal(r.project.wall.count, 1);
    assert.notEqual(r.project.logos.get(0), undefined, 'the logo entry is kept');
  });

  test('row 7 deleteSection: logo entry removed, every duplicate id removed, WALL_SECTIONS_CHANGED {delete}, one rebuild', () => {
    const r = makeRig({ sections: [fields({ id: 0 }), fields({ id: 4 }), fields({ id: 4, name: 'dup' }), fields({ id: 9 })] });
    r.project.logos.ensure(4);
    r.project.logos.ensure(9);
    let seen = null;
    r.bus.on(Events.WALL_SECTIONS_CHANGED, () => { seen = r.project.wall.sections.map((s) => s.id); });
    r.wc.deleteSection(4);
    assert.deepEqual(seen, [0, 9], 'the mirror sees the new list');
    assert.deepEqual(r.trace, ['WALL_SECTIONS_CHANGED', ...P1]);
    assert.deepEqual(r.emitted('WALL_SECTIONS_CHANGED'), [{ reason: 'delete' }]);
    assert.equal(r.project.logos.get(4), undefined);
    assert.notEqual(r.project.logos.get(9), undefined);
    assert.equal(r.rebuilds(), 1);
  });

  test('row 7 deleteSection compares ids strictly (a string id is not the number)', () => {
    const r = makeRig({ sections: [fields({ id: '4' }), fields({ id: 4 })] });
    r.wc.deleteSection(4);
    assert.deepEqual(r.project.wall.sections.map((s) => s.id), ['4']);
  });

  test('row 8 setMeshMode x2 (one label click): 2 rebuilds and 2 WALL_MESH_MODE_CHANGED, model written before the emit', () => {
    const r = makeRig();
    const seen = [];
    r.bus.on(Events.WALL_MESH_MODE_CHANGED, ({ mode }) => seen.push([mode, r.project.meshMode]));
    r.wc.setMeshMode('section');
    r.wc.setMeshMode('section');
    assert.equal(r.rebuilds(), 2);
    assert.deepEqual(r.emitted('WALL_MESH_MODE_CHANGED'), [{ mode: 'section' }, { mode: 'section' }]);
    assert.deepEqual(seen, [['section', 'section'], ['section', 'section']]);
    assert.deepEqual(r.trace, ['WALL_MESH_MODE_CHANGED', ...P1, 'WALL_MESH_MODE_CHANGED', ...P1]);
    assert.equal(r.view.calls[1].meshMode, 'section');
  });

  test('rows 9-10 setWireframe / setShowFrame: model then one rebuild each, no cache clear', () => {
    const r = makeRig();
    r.wc.setWireframe(true);
    assert.equal(r.project.display.wireframe, true);
    assert.equal(r.rebuilds(), 1);
    r.wc.setShowFrame(true);
    assert.equal(r.project.display.showFrame, true);
    assert.equal(r.rebuilds(), 2);
    r.wc.setWireframe(false);
    assert.equal(r.project.display.wireframe, false);
    assert.equal(r.rebuilds(), 3);
    assert.equal(r.ledTiles.clears, 0);
  });

  test('row 11 setLedSim(true) with panel IDs on: event (forcedOff true), cache clear, rebuild', () => {
    const r = makeRig({ panelIds: true });
    r.wc.setLedSim(true);
    assert.deepEqual(r.emitted('DISPLAY_CONTENT_CHANGED'), [{ toggled: 'ledSim', on: true, forcedOff: true }]);
    assert.deepEqual(r.trace, ['DISPLAY_CONTENT_CHANGED', 'ledTiles.clearCache', ...P1]);
    assert.equal(r.ledTiles.clears, 1);
    assert.equal(r.rebuilds(), 1);
    assert.equal(r.project.display.ledSimEnabled, true);
    assert.equal(r.project.display.panelIdsEnabled, false);
  });

  test('row 11 setLedSim without a forced change, and off again', () => {
    const r = makeRig();
    r.wc.setLedSim(true);
    r.wc.setLedSim(false);
    assert.deepEqual(r.emitted('DISPLAY_CONTENT_CHANGED'), [
      { toggled: 'ledSim', on: true, forcedOff: false },
      { toggled: 'ledSim', on: false, forcedOff: false },
    ]);
    assert.equal(r.project.display.content, 'color');
    assert.equal(r.ledTiles.clears, 2);
    assert.equal(r.rebuilds(), 2);
  });

  test('row 12 setLedLayout with LED sim off: 1 clear, 0 rebuilds', () => {
    const r = makeRig();
    r.wc.setLedLayout('rgb-stripe');
    assert.equal(r.project.display.ledLayout, 'rgb-stripe');
    assert.equal(r.ledTiles.clears, 1);
    assert.equal(r.rebuilds(), 0);
    assert.deepEqual(r.trace, ['ledTiles.clearCache']);
  });

  test('row 12 setLedLayout with LED sim on: 1 clear, then 1 rebuild', () => {
    const r = makeRig({ ledSim: true });
    r.wc.setLedLayout('square');
    assert.deepEqual(r.trace, ['ledTiles.clearCache', ...P1]);
  });

  test('row 13 setPanelIds: event (forcedOff when LED sim was on), rebuild, no cache clear', () => {
    const r = makeRig({ ledSim: true });
    r.wc.setPanelIds(true);
    assert.deepEqual(r.emitted('DISPLAY_CONTENT_CHANGED'), [{ toggled: 'panelIds', on: true, forcedOff: true }]);
    assert.deepEqual(r.trace, ['DISPLAY_CONTENT_CHANGED', ...P1]);
    assert.equal(r.ledTiles.clears, 0);
    assert.equal(r.project.display.panelIdsEnabled, true);
    r.wc.setPanelIds(false);
    assert.deepEqual(r.emitted('DISPLAY_CONTENT_CHANGED')[1], { toggled: 'panelIds', on: false, forcedOff: false });
    assert.equal(r.project.display.content, 'color');
    assert.equal(r.ledTiles.clears, 0);
    assert.equal(r.rebuilds(), 2);
  });

  test('rows 14-19 setPanelIdStyle: model only, numeric keys parsed with PanelIdStyle.RULES', () => {
    const r = makeRig();
    assert.equal(r.wc.setPanelIdStyle('borderThickness', '40'), 32);
    assert.equal(r.wc.setPanelIdStyle('borderThickness', '0'), 8, 'B-L9: 0 falls back to the default');
    assert.equal(r.wc.setPanelIdStyle('fontSize', '12.9px'), 12);
    assert.equal(r.wc.setPanelIdStyle('sectionLabelFontSize', '999'), 400);
    assert.equal(r.wc.setPanelIdStyle('fontColor', '#ff0000'), '#ff0000');
    assert.equal(r.wc.setPanelIdStyle('sectionLabelColor', 'red'), 'red');
    assert.equal(r.wc.setPanelIdStyle('sectionLabelEnabled', false), false);
    assert.equal(r.project.panelIdStyle.sectionLabelFontSize, 400);
    assert.deepEqual(r.trace, []);
  });

  test('rows 14-23 rebuildIfPanelIds: 0 rebuilds with panel IDs off, 1 with panel IDs on (never a cache clear)', () => {
    const off = makeRig();
    off.wc.rebuildIfPanelIds();
    assert.deepEqual(off.trace, []);
    const ledSim = makeRig({ ledSim: true });
    ledSim.wc.rebuildIfPanelIds();
    assert.deepEqual(ledSim.trace, []);
    const on = makeRig({ panelIds: true });
    on.wc.rebuildIfPanelIds();
    assert.deepEqual(on.trace, P1);
    assert.equal(on.ledTiles.clears, 0);
  });

  test('row 24 applyImport with a mesh mode: replace, WALL_MESH_MODE_CHANGED, WALL_SECTIONS_CHANGED {import}, rebuild', () => {
    const r = makeRig();
    r.project.logos.ensure(0).position = 'top-left';
    const sections = [new WallSection(fields({ id: 5 })), new WallSection(fields({ id: 2 }))];
    const seen = [];
    r.bus.on(Events.WALL_MESH_MODE_CHANGED, () => seen.push(['mode', r.project.meshMode, r.project.wall.sections === sections]));
    r.bus.on(Events.WALL_SECTIONS_CHANGED, () => seen.push(['sections', r.project.wall.count]));
    r.wc.applyImport({ sections, meshMode: 'panel' });
    assert.deepEqual(r.trace, ['WALL_MESH_MODE_CHANGED', 'WALL_SECTIONS_CHANGED', ...P1]);
    assert.deepEqual(r.emitted('WALL_MESH_MODE_CHANGED'), [{ mode: 'panel' }]);
    assert.deepEqual(r.emitted('WALL_SECTIONS_CHANGED'), [{ reason: 'import' }]);
    assert.deepEqual(seen, [['mode', 'panel', true], ['sections', 2]]);
    assert.equal(r.project.wall.sections, sections);
    assert.equal(r.project.wall.nextSectionId, 6);
    assert.equal(r.project.meshMode, 'panel');
    assert.equal(r.project.logos.get(0).position, 'top-left', 'B-L21: logos are not reset');
    assert.equal(r.rebuilds(), 1);
  });

  test('row 24 applyImport without a (truthy) mesh mode keeps the mode and emits no label event', () => {
    for (const meshMode of [undefined, '', 0, null]) {
      const r = makeRig();
      r.project.meshMode = 'section';
      r.wc.applyImport({ sections: [new WallSection(fields({ id: 'a' }))], meshMode });
      assert.equal(r.project.meshMode, 'section');
      assert.deepEqual(r.trace, ['WALL_SECTIONS_CHANGED', ...P1]);
      assert.ok(Number.isNaN(r.project.wall.nextSectionId), 'B-L8: non-numeric ids give a NaN allocator');
    }
  });

  test('row 24 applyImport of an empty list rebuilds an empty wall (allocator -Infinity)', () => {
    const r = makeRig();
    r.wc.applyImport({ sections: [], meshMode: 'combined' });
    assert.equal(r.project.wall.count, 0);
    assert.equal(r.project.wall.nextSectionId, -Infinity);
    assert.deepEqual(r.emitted('WALL_STATS_CHANGED'), [{ totalPixels: 0, totalPanels: 0, totalSections: 0, totalArc: 0 }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Part 2: import boundaries (ARCHITECTURE.md 1.3)
// ---------------------------------------------------------------------------------------------------------------

/** The static import specifiers of a module, resolved relative to js/. */
function importsOf(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const out = [];
  for (const m of src.matchAll(/^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    out.push(join(dirname(rel), m[1]).split('\\').join('/').replace(/^js\//, ''));
  }
  return out;
}

describe('import boundaries', () => {
  test('WallController imports only core/, legacy/, domain/, geometry/', () => {
    const imports = importsOf('js/app/WallController.js');
    assert.ok(imports.length > 0);
    for (const spec of imports) assert.match(spec, /^(core|legacy|domain|geometry)\//, spec);
  });

  for (const file of ['HeaderStats', 'SectionListPanel', 'SectionLogosPanel', 'WallDisplayPanel']) {
    test(`ui/${file} imports only core/, legacy/, domain/ and ui/dom.js`, () => {
      const imports = importsOf(`js/ui/${file}.js`);
      assert.ok(imports.length > 0);
      for (const spec of imports) assert.match(spec, /^(core\/|legacy\/|domain\/|ui\/dom\.js$)/, spec);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// A small fake DOM: enough HTML parsing, selectors and mutation logging to replay the legacy UI code.
// ---------------------------------------------------------------------------------------------------------------

const VOID_TAGS = new Set(['input', 'br', 'img', 'meta', 'link', 'hr', 'source', 'col', 'area', 'base', 'embed', 'param', 'track', 'wbr']);
const TAG_RE = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const ATTR_RE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parseAttrs(text) {
  const attrs = {};
  for (const m of text.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

/** Selectors used by the code under test: `.cls`, `tag`, `tag[attr="v"]`. */
function matches(el, selector) {
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  const m = /^([a-z]+)(?:\[([\w-]+)="([^"]*)"\])?$/.exec(selector);
  if (!m) throw new Error(`unsupported selector ${selector}`);
  return el.tagName === m[1] && (m[2] === undefined || el.attrs[m[2]] === m[3]);
}

class FakeClassList {
  #el;
  #set;
  constructor(el, tokens) { this.#el = el; this.#set = new Set(tokens); }
  contains(c) { return this.#set.has(c); }
  // Only effective changes are logged: the observable result, not the no-op calls (a mirror may re-assert state).
  add(c) { if (!this.#set.has(c)) { this.#set.add(c); this.#el.doc.record(this.#el, 'class+', c); } }
  remove(c) { if (this.#set.delete(c)) this.#el.doc.record(this.#el, 'class-', c); }
  toggle(c, force) {
    const on = force === undefined ? !this.#set.has(c) : !!force;
    if (on) this.add(c); else this.remove(c);
    return on;
  }
  reset(tokens) { this.#set = new Set(tokens); }
  get tokens() { return [...this.#set]; }
}

class FakeElement {
  constructor(doc, tagName, attrs) {
    this.doc = doc;
    this.uid = doc.nextUid++;
    this.tagName = tagName;
    this.attrs = attrs;
    this.parent = null;            // kept after a detach (region lookup only)
    this.children = [];
    this.listeners = {};
    this.innerSource = '';
    this.text = undefined;
    this.classList = new FakeClassList(this, (attrs.class || '').split(/\s+/).filter(Boolean));
    this.dataset = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    this.styleValues = {};
    const self = this;
    this.style = new Proxy(this.styleValues, {
      set(target, prop, value) { target[prop] = value; doc.record(self, `style.${String(prop)}`, value); return true; },
    });
    this.valueSet = false;
    this.rawValue = attrs.value;
    this.files = [];
  }

  get id() { return this.attrs.id; }
  get firstChild() { return this.children[0] ?? null; }

  get value() {
    if (this.valueSet || this.tagName !== 'select') return this.rawValue ?? '';
    const options = this.descendants().filter((e) => e.tagName === 'option');
    const sel = options.find((o) => 'selected' in o.attrs) ?? options[0];
    return sel ? sel.attrs.value : '';
  }
  set value(v) { this.doc.record(this, 'value', v); this.setValueSilently(String(v)); }
  setValueSilently(v) { this.valueSet = true; this.rawValue = v; }

  get innerHTML() { return this.innerSource; }
  set innerHTML(html) {
    this.doc.record(this, 'innerHTML', html);
    this.children = [];
    this.innerSource = html;
    parseInto(this, html);
  }
  set textContent(v) { this.doc.record(this, 'textContent', v); this.children = []; this.text = v; }
  get textContent() { return this.text; }
  set className(v) { this.doc.record(this, 'className', v); this.classList.reset(String(v).split(/\s+/).filter(Boolean)); }

  appendChild(child) { this.doc.record(this, 'appendChild', child.uid); this.attach(child, this.children.length); return child; }
  insertBefore(child, ref) {
    this.doc.record(this, 'insertBefore', child.uid, ref ? ref.uid : null);
    const i = ref ? this.children.indexOf(ref) : -1;
    this.attach(child, i < 0 ? this.children.length : i);
    return child;
  }
  attach(child, index) { child.parent = this; this.children.splice(index, 0, child); }
  remove() {
    this.doc.record(this, 'remove');
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }

  descendants() {
    const out = [];
    const walk = (el) => { for (const c of el.children) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.descendants().find((e) => matches(e, sel)) ?? null; }
  querySelectorAll(sel) { return this.descendants().filter((e) => matches(e, sel)); }
  closest(sel) {
    for (let el = this; el && el.tagName !== '#root'; el = el.parent) if (matches(el, sel)) return el;
    return null;
  }

  addEventListener(type, fn) { this.doc.record(this, 'listen', type); (this.listeners[type] ??= []).push(fn); }

  /** Dispatches to this element's own listeners (no bubbling), with `this` = the element, like the DOM. */
  fire(type, { target = this } = {}) {
    const event = { type, target, currentTarget: this, stopPropagation: () => this.doc.record(this, 'stopPropagation') };
    for (const fn of [...(this.listeners[type] ?? [])]) fn.call(this, event);
  }

  snapshot() {
    return {
      uid: this.uid, tag: this.tagName, classes: this.classList.tokens, style: { ...this.styleValues },
      value: this.valueSet ? this.rawValue : undefined, text: this.text,
      listeners: Object.fromEntries(Object.entries(this.listeners).map(([k, v]) => [k, v.length])),
      children: this.children.map((c) => c.snapshot()),
    };
  }
}

function parseInto(parent, html) {
  const stack = [{ el: parent, start: 0 }];
  for (const m of html.matchAll(TAG_RE)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].el.tagName === name) {
          stack[i].el.innerSource = html.slice(stack[i].start, m.index);
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const name = m[2].toLowerCase();
    const el = new FakeElement(parent.doc, name, parseAttrs(m[3]));
    stack[stack.length - 1].el.attach(el, stack[stack.length - 1].el.children.length);
    if (!VOID_TAGS.has(name) && m[4] !== '/') stack.push({ el, start: m.index + m[0].length });
  }
}

class FakeDocument {
  constructor(markup) {
    this.nextUid = 0;
    this.log = [];
    this.root = new FakeElement(this, '#root', {});
    parseInto(this.root, markup);
  }
  record(el, op, ...args) { this.log.push({ el, entry: [el.uid, op, ...args] }); }
  call(name) { this.log.push({ el: null, entry: ['call', name] }); }
  getElementById(id) { return this.root.descendants().find((e) => e.id === id) ?? null; }
  querySelector(sel) { return this.root.querySelector(sel); }
  querySelectorAll(sel) { return this.root.querySelectorAll(sel); }
  createElement(tag) { const el = new FakeElement(this, tag, {}); this.record(el, 'create', tag); return el; }
  take() { const out = this.log; this.log = []; return out; }
  byId(id) { return this.getElementById(id); }
}

/** The DOM region an op belongs to: the card list, the logo list, a call, or anything else. */
function regionOf({ el }) {
  if (!el) return 'calls';
  for (let e = el; e; e = e.parent) {
    if (e.id === 'wall-sections') return 'cards';
    if (e.id === 'section-logos-container') return 'logos';
  }
  return 'other';
}

// ---------------------------------------------------------------------------------------------------------------
// Part 3: legacy parity (index.html@cd3fd3f)
// ---------------------------------------------------------------------------------------------------------------

/** index.html at the baseline commit, or null when git is unavailable. */
function legacyIndex() {
  try {
    return execFileSync('git', ['show', 'cd3fd3f:index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const LEGACY = legacyIndex();
const LEGACY_LINES = LEGACY ? LEGACY.split(/\r?\n/) : [];
/** Lines a..b (1-based, inclusive) of the legacy file. */
const lines = (a, b) => LEGACY_LINES.slice(a - 1, b).join('\n');

/** Builds the legacy UI functions over `doc` (verbatim source; the legacy globals become closure variables). */
function buildLegacy(doc, initialSections) {
  const expectStart = (n, text) => {
    if (!LEGACY_LINES[n - 1].trimStart().startsWith(text)) throw new Error(`index.html line ${n} is not "${text}"`);
  };
  expectStart(2189, 'function renderSectionLogosUI() {');
  expectStart(2307, 'function updateStats() {');
  expectStart(3892, 'function renderWallSections() {');
  expectStart(4081, 'function addSection() {');
  expectStart(4121, 'function deleteSection(id) {');
  expectStart(4149, 'renderWallSections();');
  expectStart(4224, "document.getElementById('section-label-color')");
  expectStart(4975, 'if (data.sections && Array.isArray(data.sections)) {');
  const src = `
    let wallSections = initialSections;
    let nextSectionId = 1;
    let meshMode = 'combined';
    let wireframeEnabled = false, showFrame = false, ledSimEnabled = false, ledLayout = 'single-dot';
    let panelIdsEnabled = false, panelBorderThickness = 8, panelFontSize = 0;
    let panelIdFontColor = '#ffffff', sectionLabelEnabled = true, sectionLabelFontSize = 0, sectionLabelColor = '#888888';
    let sectionLogos = {};
    const sectionColors = ${JSON.stringify(Palette.sectionColors)};
    function createLEDWall() { document.call('createLEDWall'); updateStats(); }
    function clearLEDTextureCache() { document.call('clearCache'); }
${lines(2189, 2318)}
${lines(3892, 4146)}
    function setupUIWall() {
${lines(4149, 4227)}
    }
    function importTail(data) {
${lines(4975, 5003)}
    }
    return {
      createLEDWall, setupUIWall, importTail, addSection,
      state: () => ({ wallSections, nextSectionId, meshMode, wireframeEnabled, showFrame, ledSimEnabled, ledLayout,
        panelIdsEnabled, panelBorderThickness, panelFontSize, panelIdFontColor, sectionLabelEnabled,
        sectionLabelFontSize, sectionLabelColor, sectionLogos }),
    };`;
  // eslint-disable-next-line no-new-func
  return new Function('document', 'initialSections', src)(doc, initialSections);
}

/** The markup that holds every element the wall panels own (header stats .. logo container). */
const panelMarkup = () => lines(880, 993);

/** The new world on its own fake document, wired like App.start (section 7). */
function buildModern(doc) {
  const project = Project.createDefault();
  const bus = new EventBus();
  const view = { rebuild: () => doc.call('createLEDWall') };
  const ledTiles = { clearCache: () => doc.call('clearCache') };
  const orbit = { updateCameraPosition() {} };
  const hub = { refresh() { throw new Error('the hub must not run while the preview is off'); } };
  const headerStats = new HeaderStats({ doc, bus });
  const wallController = new WallController({ project, view, ledTiles, orbit, hub, bus, palette: Palette });
  const sectionList = new SectionListPanel({ doc, project, wallController, bus });
  const displayPanel = new WallDisplayPanel({ doc, wallController, bus });
  const logosPanel = new SectionLogosPanel({ doc, project, wallController, bus });
  return { project, bus, wallController, headerStats, sectionList, displayPanel, logosPanel };
}

/** Section values compared with Object.is, the display/style flags and the logo entries. */
function assertSameModel(L, M, label) {
  const s = L.state();
  const p = M.project;
  assert.equal(p.wall.count, s.wallSections.length, `${label}: section count`);
  s.wallSections.forEach((ls, i) => {
    const ms = p.wall.sections[i];
    for (const f of SECTION_FIELDS) assert.ok(Object.is(ls[f], ms[f]), `${label}: section ${i}.${f}: ${String(ls[f])} vs ${String(ms[f])}`);
  });
  assert.ok(Object.is(s.nextSectionId, p.wall.nextSectionId), `${label}: nextSectionId ${s.nextSectionId} vs ${p.wall.nextSectionId}`);
  assert.equal(p.meshMode, s.meshMode, `${label}: meshMode`);
  const d = p.display;
  assert.deepEqual(
    [d.wireframe, d.showFrame, d.ledSimEnabled, d.panelIdsEnabled, d.ledLayout],
    [s.wireframeEnabled, s.showFrame, s.ledSimEnabled, s.panelIdsEnabled, s.ledLayout], `${label}: display`);
  const st = p.panelIdStyle;
  assert.deepEqual(
    [st.borderThickness, st.fontSize, st.fontColor, st.sectionLabelEnabled, st.sectionLabelFontSize, st.sectionLabelColor],
    [s.panelBorderThickness, s.panelFontSize, s.panelIdFontColor, s.sectionLabelEnabled, s.sectionLabelFontSize, s.sectionLabelColor],
    `${label}: panel-ID style`);
  const keys = new Set([...Object.keys(s.sectionLogos), ...s.wallSections.map((x) => String(x.id)), ...Array.from({ length: 12 }, (_, i) => String(i))]);
  for (const key of keys) {
    const a = s.sectionLogos[key];
    const b = p.logos.get(key);
    assert.equal(b === undefined, a === undefined, `${label}: logo entry ${key} presence`);
    if (a) assert.deepEqual([b.position, b.scale, !!b.image], [a.position, a.scale, !!a.image], `${label}: logo entry ${key}`);
  }
}

const entries = (log) => log.map((x) => x.entry);
const byRegion = (log) => {
  const out = { cards: [], logos: [], calls: [], other: [] };
  for (const x of log) out[regionOf(x)].push(x.entry);
  return out;
};

class FakeFileReader {
  readAsDataURL(file) { this.onload({ target: { result: `data:image/png;base64,${file.name}` } }); }
}
class FakeImage {
  set src(v) { this.source = v; this.onload(); }
}

describe('legacy parity: panels + WallController vs index.html@cd3fd3f', { skip: LEGACY ? false : 'git show cd3fd3f:index.html unavailable' }, () => {
  let saved;
  before(() => {
    saved = { FileReader: globalThis.FileReader, Image: globalThis.Image };
    globalThis.FileReader = FakeFileReader;
    globalThis.Image = FakeImage;
  });
  after(() => {
    globalThis.FileReader = saved.FileReader;
    globalThis.Image = saved.Image;
  });

  test('one long UI scenario: identical DOM writes, listener order, rebuild/cache calls and model after every step', () => {
    const ldoc = new FakeDocument(panelMarkup());
    const mdoc = new FakeDocument(panelMarkup());
    const L = buildLegacy(ldoc, [fields()]);
    const M = buildModern(mdoc);

    /**
     * Runs `act(doc, which)` on both worlds and compares. `regions: true` compares per DOM region (cards, logos,
     * calls, other) instead of one sequence: the declared reordering PR3 (logo list after the collapse restore).
     */
    const step = (label, act, { regions = false, throws = null } = {}) => {
      const run = (doc, which) => {
        if (!throws) { act(doc, which); return; }
        assert.throws(() => act(doc, which), throws, `${label}: ${which} must throw`);
      };
      run(ldoc, 'legacy');
      run(mdoc, 'modern');
      const a = ldoc.take();
      const b = mdoc.take();
      if (regions) assert.deepEqual(byRegion(b), byRegion(a), `${label}: per-region DOM log`);
      else assert.deepEqual(entries(b), entries(a), `${label}: DOM log`);
      assert.deepEqual(mdoc.root.snapshot(), ldoc.root.snapshot(), `${label}: DOM snapshot`);
      assertSameModel(L, M, label);
      return a;
    };

    const card = (doc, i) => doc.querySelectorAll('.wall-section')[i];
    const cardInput = (doc, i, field) => card(doc, i).querySelectorAll('input[type="number"]').find((e) => e.dataset.field === field);
    const setNumber = (doc, i, field, raw) => { const el = cardInput(doc, i, field); el.setValueSilently(raw); el.fire('change'); };
    const setName = (doc, i, raw) => { const el = card(doc, i).querySelector('.section-name-input'); el.setValueSilently(raw); el.fire('input'); };
    const click = (doc, id) => doc.byId(id).fire('click');
    const change = (doc, id, value, type = 'change') => { const el = doc.byId(id); el.setValueSilently(value); el.fire(type); };
    const label = (doc, mode) => doc.querySelectorAll('.mesh-mode-option').find((o) => o.dataset.mode === mode);
    const logoRow = (doc, i, sel) => doc.byId('section-logos-container').querySelectorAll(sel)[i];
    const rebuilds = (log) => log.filter((x) => x.entry[0] === 'call' && x.entry[1] === 'createLEDWall').length;

    // ---- bootstrap: init() rebuild, then setupUI's wall part (render, expand first, add button, display listeners)
    let log = step('bootstrap', (doc, which) => {
      if (which === 'legacy') { L.createLEDWall(); L.setupUIWall(); return; }
      M.wallController.rebuild();
      M.sectionList.render();
      M.sectionList.expandFirst();
      M.sectionList.bindAddButton();
      M.displayPanel.bind();
    });
    assert.equal(rebuilds(log), 1);
    assert.ok(entries(log).some((e) => e[1] === 'listen'), 'listeners were registered (and compared in order)');

    // ---- cards: add, collapse, add, delete (collapse snapshot/restore)
    step('add #1', (doc) => click(doc, 'add-section-btn'));
    step('collapse card 0', (doc) => card(doc, 0).querySelector('.section-header').fire('click'));
    step('add #2', (doc) => click(doc, 'add-section-btn'));
    step('header click inside the delete button does not toggle', (doc) => {
      const header = card(doc, 1).querySelector('.section-header');
      header.fire('click', { target: card(doc, 1).querySelector('.section-delete').querySelector('svg') });
    });
    step('delete card 1', (doc) => card(doc, 1).querySelector('.section-delete').fire('click'));

    // ---- number edits: 4K warning insert / update / remove, B-L16 title regex, hints, clamps, write-back
    log = step('cols 50', (doc) => setNumber(doc, 0, 'panelCols', '50'));
    assert.equal(rebuilds(log), 1);
    assert.equal(entries(log).filter((e) => e[1] === 'textContent' && e[2] === '50').length, 0, 'write-back is a number');
    assert.equal(entries(log).filter((e) => e[1] === 'value' && e[2] === 50).length, 1, 'write-back of the parsed value');
    step('ledX 100 -> exceeds 4K (warning inserted, title ⚠)', (doc) => setNumber(doc, 0, 'ledX', '100'));
    step('ledX 200 -> still exceeds (span text)', (doc) => setNumber(doc, 0, 'ledX', '200'));
    step('cols 2.5 -> fits (warning removed)', (doc) => setNumber(doc, 0, 'panelCols', '2.5'));
    step('curve -2.5', (doc) => setNumber(doc, 0, 'curveIntensity', '-2.5'));
    step('curve empty -> 0', (doc) => setNumber(doc, 0, 'curveIntensity', ''));
    step('curve 7.25 on card 1', (doc) => setNumber(doc, 1, 'curveIntensity', '7.25'));
    step('offset 500 -> 180', (doc) => setNumber(doc, 0, 'angleOffset', '500'));
    step('width 20 -> 50, height abc -> 500, ledY 3 -> 8, rows 99 -> 20', (doc) => {
      setNumber(doc, 1, 'panelWidth', '20');
      setNumber(doc, 1, 'panelHeight', 'abc');
      setNumber(doc, 1, 'ledY', '3');
      setNumber(doc, 1, 'panelRows', '99');
    });
    step('rename card 0 "Foo"', (doc) => setName(doc, 0, 'Foo'));
    step('renamed card exceeds 4K: no title ⚠ (B-L16)', (doc) => { setNumber(doc, 0, 'panelCols', '50'); setNumber(doc, 0, 'ledX', '100'); });
    step('rename card 0 "" -> "Wall 1"', (doc) => setName(doc, 0, ''));
    step('fits again', (doc) => setNumber(doc, 0, 'ledX', '32'));
    step('exceeds again with a default name: title ⚠', (doc) => setNumber(doc, 0, 'ledX', '100'));
    step('rename while exceeding keeps the ⚠', (doc) => setName(doc, 0, 'Wall 9 B'));

    // ---- colours
    step('swatch click', (doc) => card(doc, 1).querySelectorAll('.color-swatch-small')[1].fire('click'));
    step('custom colour input x2', (doc) => {
      const input = card(doc, 1).querySelector('.color-input-custom');
      input.setValueSilently('#123456');
      input.fire('input');
      input.fire('input');
    });

    // ---- mesh mode (label click fires twice: B-L13), wireframe, frames
    log = step('mesh mode "section" (double fire)', (doc) => { label(doc, 'section').fire('click'); label(doc, 'section').fire('click'); });
    assert.equal(rebuilds(log), 2);
    step('mesh mode "panel"', (doc) => label(doc, 'panel').fire('click'));
    step('wireframe on, frames on, wireframe off', (doc) => { click(doc, 'toggle-wireframe'); click(doc, 'toggle-frame'); click(doc, 'toggle-wireframe'); });

    // ---- LED sim and layout
    log = step('LED sim on', (doc) => click(doc, 'toggle-led-sim'));
    assert.deepEqual(entries(log).filter((e) => e[0] === 'call').map((e) => e[1]), ['clearCache', 'createLEDWall']);
    step('layout rgb-stripe (LED sim on)', (doc) => change(doc, 'led-layout', 'rgb-stripe'));
    step('LED sim off', (doc) => click(doc, 'toggle-led-sim'));
    log = step('layout square (LED sim off): clear only', (doc) => change(doc, 'led-layout', 'square'));
    assert.deepEqual(entries(log), [['call', 'clearCache']]);
    step('style input with panel IDs off: no rebuild', (doc) => change(doc, 'panel-border-thickness', '40'));

    // ---- panel IDs (forces LED sim off, logo list renders), style inputs
    step('LED sim on again', (doc) => click(doc, 'toggle-led-sim'));
    log = step('panel IDs on: LED sim forced off, logo list rendered', (doc) => click(doc, 'toggle-panel-ids'));
    assert.ok(entries(log).some((e) => e[1] === 'innerHTML' && String(e[2]).includes('section-logo-upload')));
    step('border 40 -> 32', (doc) => change(doc, 'panel-border-thickness', '40'));
    step('border 0 -> 8', (doc) => change(doc, 'panel-border-thickness', '0'));
    step('font size abc -> 0, 12.7 -> 12', (doc) => { change(doc, 'panel-font-size', 'abc'); change(doc, 'panel-font-size', '12.7'); });
    step('font colour input', (doc) => change(doc, 'panel-font-color', '#ff0000', 'input'));
    step('section labels off', (doc) => click(doc, 'toggle-section-labels'));
    step('label size 500 -> 400', (doc) => change(doc, 'section-label-size', '500'));
    step('label colour input', (doc) => change(doc, 'section-label-color', '#00ff00', 'input'));
    step('rename with panel IDs on: logo list + rebuild', (doc) => setName(doc, 1, 'Side'));

    // ---- logos
    step('position on a row without an entry: nothing', (doc) => {
      const el = logoRow(doc, 0, 'select[data-field="position"]');
      el.setValueSilently('top-left');
      el.fire('change');
    });
    step('scale 3 -> 5 written back, no entry: no rebuild', (doc) => {
      const el = logoRow(doc, 0, 'input[data-field="scale"]');
      el.setValueSilently('3');
      el.fire('change');
    });
    step('upload a logo on row 0', (doc) => {
      const el = logoRow(doc, 0, 'input[type="file"]');
      el.files = [{ name: 'logo.png' }];
      el.fire('change');
    });
    step('upload without a file: nothing', (doc) => {
      const el = logoRow(doc, 1, 'input[type="file"]');
      el.files = [];
      el.fire('change');
    });
    step('position top-left on row 0', (doc) => {
      const el = logoRow(doc, 0, 'select[data-field="position"]');
      el.setValueSilently('top-left');
      el.fire('change');
    });
    step('scale 55 on row 0', (doc) => {
      const el = logoRow(doc, 0, 'input[data-field="scale"]');
      el.setValueSilently('55');
      el.fire('change');
    });
    step('clear row 1 (no entry)', (doc) => logoRow(doc, 1, '.section-logo-clear').fire('click'));
    step('upload on row 1', (doc) => {
      const el = logoRow(doc, 1, 'input[type="file"]');
      el.files = [{ name: 'b.png' }];
      el.fire('change');
    });

    // ---- add / delete with panel IDs on (PR3: the logo list renders after the collapse restore)
    step('add with panel IDs on', (doc) => click(doc, 'add-section-btn'), { regions: true });
    step('delete card 1 with panel IDs on (its logo entry goes)', (doc) => card(doc, 1).querySelector('.section-delete').fire('click'), { regions: true });
    step('clear row 0', (doc) => logoRow(doc, 0, '.section-logo-clear').fire('click'));

    // ---- LED sim while panel IDs are on: panel IDs forced off, no logo render
    step('LED sim on with panel IDs on', (doc) => click(doc, 'toggle-led-sim'));
    step('panel IDs on again (LED sim forced off)', (doc) => click(doc, 'toggle-panel-ids'));
    step('upload on row 0 again', (doc) => {
      const el = logoRow(doc, 0, 'input[type="file"]');
      el.files = [{ name: 'c.png' }];
      el.fire('change');
    });

    // ---- import (labels iff mesh_mode, cards re-rendered with the first expanded, logos untouched: B-L21)
    const importData = {
      mesh_mode: 'combined',
      sections: [
        { id: 0, name: '', panel: { columns: 2, rows: 0 }, curvature: { angle_degrees: -4, angle_offset_degrees: 15 } },
        { id: 'a', name: 'Alpha', panel: { columns: '3', width_mm: '600' }, led_resolution: { x: 128 }, color: 'red' },
        { name: 'No id', panel: { columns: 50 }, led_resolution: { x: 100 } },
      ],
    };
    const importAs = (data) => (doc, which) => {
      if (which === 'legacy') { L.importTail(data); return; }
      // ProjectSerializer.read (WP5) is replaced here by the verbatim legacy mapping 4976-4988.
      const sections = data.sections.map((s, i) => new WallSection({
        id: s.id !== undefined ? s.id : i,
        name: s.name || `Wall ${i + 1}`,
        panelCols: s.panel?.columns || 5,
        panelRows: s.panel?.rows || 3,
        panelWidth: s.panel?.width_mm || 500,
        panelHeight: s.panel?.height_mm || 500,
        ledX: s.led_resolution?.x || 32,
        ledY: s.led_resolution?.y || 32,
        curveIntensity: s.curvature?.angle_degrees || 0,
        angleOffset: s.curvature?.angle_offset_degrees || 0,
        color: s.color || Palette.sectionColors[i % Palette.sectionColors.length],
      }));
      M.wallController.applyImport({ sections, meshMode: data.mesh_mode });
    };
    log = step('import with mesh_mode and string/missing ids', importAs(importData));
    assert.equal(rebuilds(log), 1);
    step('add after the import (NaN allocator: the new card stays collapsed)', (doc) => click(doc, 'add-section-btn'), { regions: true });
    step('delete the string-id section', (doc) => card(doc, 1).querySelector('.section-delete').fire('click'), { regions: true });
    step('collapse/expand cards', (doc) => { card(doc, 0).querySelector('.section-header').fire('click'); card(doc, 2).querySelector('.section-header').fire('click'); });
    step('add after a delete keeps the collapse states', (doc) => click(doc, 'add-section-btn'), { regions: true });
    step('import without mesh_mode', importAs({ sections: [{ id: 3, name: 'Solo' }, { id: 8 }] }));
    step('mesh mode after import', (doc) => label(doc, 'section').fire('click'));
    step('import of an empty list', importAs({ mesh_mode: 'panel', sections: [] }));
    step('add on the empty wall throws TypeError after the allocator increment', (doc) => click(doc, 'add-section-btn'), { throws: TypeError });
    step('stats after the failed add', (doc, which) => (which === 'legacy' ? L.createLEDWall() : M.wallController.rebuild()));
  });

  test('delete keeps every remaining card\'s own collapse state (PR2: the snapshot maps the cards to the rendered list)', () => {
    // The long scenario above only deletes cards whose collapse state equals that of the card after them, so a
    // snapshot keyed by the live (already filtered) list would pass there. Here the states alternate.
    const ldoc = new FakeDocument(panelMarkup());
    const mdoc = new FakeDocument(panelMarkup());
    const L = buildLegacy(ldoc, [fields()]);
    const M = buildModern(mdoc);
    const both = (label, act) => {
      act(ldoc, 'legacy');
      act(mdoc, 'modern');
      assert.deepEqual(entries(mdoc.take()), entries(ldoc.take()), `${label}: DOM log`);
      assert.deepEqual(mdoc.root.snapshot(), ldoc.root.snapshot(), `${label}: DOM snapshot`);
      assertSameModel(L, M, label);
    };
    const card = (doc, i) => doc.querySelectorAll('.wall-section')[i];
    const collapsed = (doc) => doc.querySelectorAll('.wall-section').map((el) => el.classList.contains('collapsed'));

    both('bootstrap', (doc, which) => {
      if (which === 'legacy') { L.createLEDWall(); L.setupUIWall(); return; }
      M.wallController.rebuild();
      M.sectionList.render();
      M.sectionList.expandFirst();
      M.sectionList.bindAddButton();
      M.displayPanel.bind();
    });
    for (let i = 1; i <= 3; i++) both(`add #${i}`, (doc) => doc.byId('add-section-btn').fire('click'));
    both('collapse cards 1 and 3', (doc) => {
      card(doc, 1).querySelector('.section-header').fire('click');
      card(doc, 3).querySelector('.section-header').fire('click');
    });
    assert.deepEqual(collapsed(mdoc), [false, true, false, true]);
    both('delete the collapsed card 1 (id 1)', (doc) => card(doc, 1).querySelector('.section-delete').fire('click'));
    assert.deepEqual(collapsed(mdoc), [false, false, true], 'ids 0, 2, 3 keep their own states');
    both('delete the expanded card 0 (id 0)', (doc) => card(doc, 0).querySelector('.section-delete').fire('click'));
    assert.deepEqual(collapsed(mdoc), [false, true], 'ids 2, 3 keep their own states');
  });

  test('card template parity for odd section values (strings, NaN ids, fractions, unescaped markup)', () => {
    const variants = [
      [fields()],
      [fields({ id: 'x"y', name: '<b>bold</b> "q"', color: 'red', panelCols: '7', ledX: '64', curveIntensity: '3', angleOffset: undefined })],
      [fields({ id: NaN, name: 'Wall 12', panelCols: 2.5, curveIntensity: -0.5, angleOffset: -15, color: '#ffffff' }),
        fields({ id: 1, name: 'N', panelCols: 50, ledX: 100, ledY: 999, panelRows: 20, curveIntensity: 1e-7, angleOffset: 0, color: '#ffdd00' })],
      [fields({ name: 0, color: undefined, curveIntensity: NaN, angleOffset: '' })],
    ];
    for (const sections of variants) {
      const ldoc = new FakeDocument(panelMarkup());
      const mdoc = new FakeDocument(panelMarkup());
      const L = buildLegacy(ldoc, sections.map((s) => ({ ...s })));
      const M = buildModern(mdoc);
      M.project.wall.replaceAll(sections.map((s) => new WallSection(s)));
      L.setupUIWall();
      M.sectionList.render();
      M.sectionList.expandFirst();
      M.sectionList.bindAddButton();
      M.displayPanel.bind();
      M.logosPanel.render();
      const a = entries(ldoc.take());
      const b = entries(mdoc.take());
      assert.deepEqual(b.slice(0, a.length), a, 'card list markup, listeners and the display listeners');
      assert.ok(b.slice(a.length).some((e) => e[1] === 'innerHTML'), 'the logo list rendered');
    }
  });

  test('logo row template parity (entries, positions, scales, string ids)', () => {
    const sections = [fields({ id: 0, name: '' }), fields({ id: '1', name: 'Str' }), fields({ id: 2, name: 'Two' }), fields({ id: 3, name: 'Three' })];
    const ldoc = new FakeDocument(panelMarkup());
    const mdoc = new FakeDocument(panelMarkup());
    const L = buildLegacy(ldoc, sections.map((s) => ({ ...s })));
    const M = buildModern(mdoc);
    M.project.wall.replaceAll(sections.map((s) => new WallSection(s)));
    // Same logo entries on both sides, set through the UI handlers of each world.
    for (const [doc, world] of [[ldoc, 'legacy'], [mdoc, 'modern']]) {
      if (world === 'legacy') L.setupUIWall(); else { M.sectionList.render(); M.sectionList.expandFirst(); M.sectionList.bindAddButton(); M.displayPanel.bind(); }
      doc.byId('toggle-panel-ids').fire('click');
      const rows = (sel) => doc.byId('section-logos-container').querySelectorAll(sel);
      rows('input[type="file"]')[0].files = [{ name: 'a.png' }];
      rows('input[type="file"]')[0].fire('change');
      rows('input[type="file"]')[1].files = [{ name: 'b.png' }];
      rows('input[type="file"]')[1].fire('change');
      const pos = rows('select[data-field="position"]')[1];
      pos.setValueSilently('bottom-right');
      pos.fire('change');
      const scale = rows('input[data-field="scale"]')[3];
      scale.setValueSilently('250');
      scale.fire('change');
      const scale0 = rows('input[data-field="scale"]')[0];
      scale0.setValueSilently('45');
      scale0.fire('change');
      // A rename with panel IDs on re-renders the logo list (4019-4020), showing the stored position and scale.
      const nameInput = doc.querySelectorAll('.wall-section')[2].querySelector('.section-name-input');
      nameInput.setValueSilently('Renamed');
      nameInput.fire('input');
    }
    const a = entries(ldoc.take());
    const b = entries(mdoc.take());
    assert.deepEqual(b, a);
    const logoHtml = (log) => log.filter((e) => e[1] === 'innerHTML' && String(e[2]).includes('section-logo-upload')).map((e) => e[2]);
    const last = logoHtml(a).slice(-sections.length).join('\n');   // the rows of the last render
    assert.equal((last.match(/✓ Logo uploaded/g) || []).length, 2, 'two logos show as uploaded');
    assert.ok(last.includes('value="45"'), 'the stored scale is rendered');
    assert.ok(last.includes('<option value="bottom-right" selected>'), 'the stored position is rendered');
    assert.ok(last.includes('>Renamed</div>'), 'the renamed section is listed');
  });
});

describe('HeaderStats', () => {
  test('writes the four values with the legacy formatting (textContent)', () => {
    const els = {};
    const doc = { getElementById: (id) => (els[id] ??= { textContent: undefined }) };
    const bus = new EventBus();
    new HeaderStats({ doc, bus });
    bus.emit(Events.WALL_STATS_CHANGED, { totalPixels: 1234567.5, totalPanels: 7.5, totalSections: 2, totalArc: 12.25 });
    assert.equal(els['total-pixels'].textContent, (1234567.5).toLocaleString());
    assert.equal(els['total-panels'].textContent, 7.5);
    assert.equal(els['total-sections'].textContent, 2);
    assert.equal(els['total-arc'].textContent, '12.3°');
  });
});
