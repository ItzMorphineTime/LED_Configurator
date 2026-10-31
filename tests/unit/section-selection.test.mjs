// Wall section selection in the viewport (the owner's request of 2026-10-31): the pick resolution in the three mesh
// modes (LEDWallView.sectionOfWallHit), SelectionManager's pick provider (hitAt keeps the priority of camera, props and
// pivot; prune after rebuilds), app/SectionSelection (Selectables without a gizmo; deselect after a delete or an import;
// the badge follows a rename), ViewportInput's click-versus-drag threshold and right click, the section menu's keyboard
// and close logic (ui/SectionContextMenu) and the highlight (render/SectionHighlightView: lazy, re-resolved by id).
// Run: node --test tests/unit/section-selection.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FakeTHREE, Object3D } from './fixtures/fake-three.mjs';

class Line extends Object3D {
  constructor(geometry, material) { super(); this.isLine = true; this.geometry = geometry; this.material = material; this.distances = 0; }
  computeLineDistances() { this.distances++; return this; }
}
globalThis.window = { THREE: { ...FakeTHREE, Line, DoubleSide: 2 } };

const { sectionOfWallHit } = await import('../../js/render/LEDWallView.js');
const { SectionHighlightView, sectionCornerGrid, borderLoop, cellTriangles } = await import('../../js/render/SectionHighlightView.js');
const { SelectionManager } = await import('../../js/interaction/SelectionManager.js');
const { ViewportInput, CLICK_SLOP_PX, isDragTravel } = await import('../../js/interaction/ViewportInput.js');
const { SectionSelection, sectionSelectable } = await import('../../js/app/SectionSelection.js');
const { SectionContextMenu, menuKeyAction, clampMenuPosition, SECTION_MENU_ITEMS } = await import('../../js/ui/SectionContextMenu.js');
const { sectionSelectionId, sectionKeyOf } = await import('../../js/core/sectionIds.js');
const { Events, EventBus } = await import('../../js/core/EventBus.js');
const { RENDER_ORDER } = await import('../../js/core/renderOrder.js');
const { Theme } = await import('../../js/theme/Theme.js');
const { Project } = await import('../../js/domain/Project.js');
const { WallSection } = await import('../../js/domain/WallSection.js');
const { computeWallLayout } = await import('../../js/geometry/WallLayout.js');

// ---- pick resolution -------------------------------------------------------------------------------------------

describe('sectionOfWallHit: the section under a hit in the three mesh modes', () => {
  const ranges = [
    { sectionId: 7, sectionIndex: 0, indexStart: 0, indexCount: 12, vertexStart: 0, vertexCount: 6 },
    { sectionId: 9, sectionIndex: 1, indexStart: 12, indexCount: 24, vertexStart: 6, vertexCount: 9 },
  ];
  const combined = { userData: { kind: 'led-wall', mode: 'combined', sectionRanges: ranges } };

  test('combined: the face index picks the section range (the geometry groups follow the same ranges)', () => {
    assert.deepEqual(sectionOfWallHit({ object: combined, faceIndex: 0 }), { sectionId: 7, sectionIndex: 0 });
    assert.deepEqual(sectionOfWallHit({ object: combined, faceIndex: 3 }), { sectionId: 7, sectionIndex: 0 });
    assert.deepEqual(sectionOfWallHit({ object: combined, faceIndex: 4 }), { sectionId: 9, sectionIndex: 1 });
    assert.deepEqual(sectionOfWallHit({ object: combined, faceIndex: 11 }), { sectionId: 9, sectionIndex: 1 });
    assert.equal(sectionOfWallHit({ object: combined, faceIndex: 12 }), null, 'past the last range');
    assert.equal(sectionOfWallHit({ object: combined }), null, 'no face');
  });

  test('section and panel meshes: the mesh tag; anything else: null', () => {
    const section = { userData: { kind: 'led-wall', mode: 'section', sectionId: 'b', sectionIndex: 1 } };
    const panel = { userData: { kind: 'led-wall', mode: 'panel', sectionId: 3, sectionIndex: 2, col: 1, row: 0 } };
    assert.deepEqual(sectionOfWallHit({ object: section, faceIndex: 5 }), { sectionId: 'b', sectionIndex: 1 });
    assert.deepEqual(sectionOfWallHit({ object: panel, faceIndex: 0 }), { sectionId: 3, sectionIndex: 2 });
    assert.equal(sectionOfWallHit({ object: { userData: { selectType: 'person' } } }), null);
    assert.equal(sectionOfWallHit(null), null);
  });
});

// ---- SelectionManager with a pick provider -----------------------------------------------------------------------

/** A legacy Selectable stub with one fake pick mesh. */
function selectable(id, extra = {}) {
  const s = { id, label: id.toUpperCase(), mesh: { name: id, userData: {} }, ...extra };
  s.isPickable = () => true;
  s.pickMeshes = () => [s.mesh];
  return s;
}

/**
 * A SelectionManager whose fake raycaster returns `rig.hits` ([mesh, distance, faceIndex?]) for the meshes it is asked
 * about, nearest first; a provider over one wall mesh whose faces map to sections through `rig.faceSections`.
 */
function makeSelectionRig({ mode = null, sections = [{ id: 1, name: 'Left' }, { id: 2, name: 'Right' }] } = {}) {
  const bus = new EventBus();
  const changes = [];
  bus.on(Events.SELECTION_CHANGED, (p) => changes.push(p));
  const gizmo = { mode, attach() {}, detach() {} };
  const rig = { hits: [], changes, wall: { name: 'wall', userData: { kind: 'led-wall' } }, faceSections: {} };
  const pointerRay = {
    fromEvent: () => ({
      intersectObjects: (meshes) => rig.hits.filter(([m]) => meshes.includes(m))
        .map(([object, distance, faceIndex]) => ({ object, distance, faceIndex })).sort((a, b) => a.distance - b.distance),
    }),
  };
  const interaction = { isDraggingGizmo: false, pilotMode: false };
  const selection = new SelectionManager({ bus, gizmo, pointerRay, interaction });
  const project = Project.createDefault();
  if (sections) project.wall.replaceAll(sections.map((f) => new WallSection(f)));
  const view = {
    meshes: () => [rig.wall],
    sectionOfHit: (hit) => (hit.object === rig.wall && rig.faceSections[hit.faceIndex] !== undefined
      ? { sectionId: rig.faceSections[hit.faceIndex], sectionIndex: 0 } : null),
  };
  const sectionSelection = new SectionSelection({ project, view, selection });
  for (const id of ['camera', 'person', 'car']) selection.register(rig[id] = selectable(id));
  selection.register(rig.pivot = selectable('pivot', { kind: 'pivot', pickPriority: 10 }));
  selection.registerProvider(sectionSelection);
  Object.assign(rig, { bus, selection, interaction, gizmo, project, sectionSelection });
  return rig;
}

describe('SelectionManager.hitAt: the click pick over the registered targets and the wall sections', () => {
  test('a wall hit resolves to its section; the nearest wall hit wins between sections', () => {
    const r = makeSelectionRig();
    const [a, b] = r.project.wall.sections;
    r.faceSections = { 0: a.id, 1: b.id };
    r.hits = [[r.wall, 5, 1], [r.wall, 6, 0]];
    assert.deepEqual(r.selection.hitAt({}), { id: sectionSelectionId(b.id), kind: 'section' });
    assert.deepEqual(r.changes, [], 'hitAt selects nothing');
  });

  test('camera, props and pivot keep their priority: in front of the wall, and the pivot (pickPriority) behind it', () => {
    const r = makeSelectionRig();
    r.faceSections = { 0: r.project.wall.sections[0].id };
    r.hits = [[r.person.mesh, 2], [r.wall, 4, 0]];
    assert.deepEqual(r.selection.hitAt({}), { id: 'person', kind: 'prop' });
    r.hits = [[r.wall, 2, 0], [r.pivot.mesh, 4]];
    assert.deepEqual(r.selection.hitAt({}), { id: 'pivot', kind: 'pivot' });
    r.hits = [[r.wall, 2, 0], [r.camera.mesh, 4]];
    assert.equal(r.selection.hitAt({}).kind, 'section', 'a camera behind the wall does not outrank it');
  });

  test('empty space, a hit that resolves to no section, pilot mode and a gizmo drag give null', () => {
    const r = makeSelectionRig();
    assert.equal(r.selection.hitAt({}), null);
    r.hits = [[r.wall, 3, 99]];
    assert.equal(r.selection.hitAt({}), null, 'click-through');
    r.faceSections = { 0: r.project.wall.sections[0].id };
    r.hits = [[r.wall, 3, 0]];
    r.interaction.pilotMode = true;
    assert.equal(r.selection.hitAt({}), null);
    r.interaction.pilotMode = false;
    r.interaction.isDraggingGizmo = true;
    assert.equal(r.selection.hitAt({}), null);
  });

  test('find() reaches the provider; its Selectables have kind section and no gizmo', () => {
    const r = makeSelectionRig();
    const s = r.project.wall.sections[1];
    const sel = r.selection.find(sectionSelectionId(s.id));
    assert.equal(sel.kind, 'section');
    assert.equal(r.selection.kindOf(sel), 'section');
    assert.equal(sel.label, String(s.name));
    assert.equal(sel.sectionId, s.id);
    assert.equal(sel.allowedAxes('translate'), null);
    assert.equal(sel.allowedAxes('rotate'), null);
    assert.equal(sel.hasGizmoTarget(), false);
    assert.equal(r.selection.find('section:nope'), null);
    assert.equal(r.selection.kindOf({ kind: 'section' }), null, 'an unknown object has no kind');
    r.selection.select(sel.id);
    assert.deepEqual(r.changes.at(-1), { id: sel.id, label: String(s.name), modes: [] }, 'no gizmo mode');
  });

  test('B-M14 mousedown pick: a miss keeps a selected section (an orbit drag starts with one), a legacy hit replaces it', () => {
    const r = makeSelectionRig({ mode: 'translate' });
    const id = sectionSelectionId(r.project.wall.sections[0].id);
    r.selection.select(id);
    r.hits = [];
    assert.equal(r.selection.pickAt({}), false);
    assert.equal(r.selection.selectedId, id);
    r.hits = [[r.car.mesh, 3]];
    assert.equal(r.selection.pickAt({}), true);
    assert.equal(r.selection.selectedId, 'car');
    r.hits = [];
    r.selection.pickAt({});
    assert.equal(r.selection.selectedId, null, 'a legacy target is still deselected by a miss (B-M14)');
  });
});

describe('SectionSelection: the selection stays valid across rebuilds', () => {
  test('a deleted section is deselected after the rebuild; another rebuild keeps the selection', () => {
    const r = makeSelectionRig();
    const s = r.project.wall.sections[1];
    r.selection.select(sectionSelectionId(s.id));
    r.sectionSelection.onWallRebuilt({ cause: 'edit' });
    assert.equal(r.selection.selectedId, sectionSelectionId(s.id));
    r.project.wall.removeById(s.id);
    r.sectionSelection.onWallRebuilt({ cause: 'edit' });
    assert.equal(r.selection.selectedId, null);
    assert.deepEqual(r.changes.at(-1), { id: null, label: null, modes: [] });
  });

  test('an import clears a section selection; legacy selections are never touched', () => {
    const r = makeSelectionRig();
    r.selection.select(sectionSelectionId(r.project.wall.sections[0].id));
    r.sectionSelection.onWallRebuilt({ cause: 'import' });
    assert.equal(r.selection.selectedId, null);
    r.selection.select('camera');
    const n = r.changes.length;
    r.sectionSelection.onWallRebuilt({ cause: 'import' });
    r.sectionSelection.onSectionRenamed();
    assert.equal(r.selection.selectedId, 'camera');
    assert.equal(r.changes.length, n);
  });

  test('a rename re-announces the selection with the new name (the badge); an unchanged name emits nothing', () => {
    const r = makeSelectionRig();
    const s = r.project.wall.sections[0];
    r.selection.select(sectionSelectionId(s.id));
    const n = r.changes.length;
    r.sectionSelection.onSectionRenamed();
    assert.equal(r.changes.length, n);
    s.rename('Stage <Left>', 0);
    r.sectionSelection.onSectionRenamed();
    assert.deepEqual(r.changes.at(-1), { id: sectionSelectionId(s.id), label: 'Stage <Left>', modes: [] });
  });

  test('ids are compared as plain-object keys (an imported string id names the same section)', () => {
    assert.equal(sectionSelectionId(3), 'section:3');
    assert.equal(sectionKeyOf('section:3'), '3');
    assert.equal(sectionKeyOf('camera'), null);
    assert.equal(sectionKeyOf(null), null);
    assert.equal(sectionSelectable({ id: '3', name: 7 }).id, 'section:3');
    assert.equal(sectionSelectable({ id: '3', name: 7 }).label, '7');
  });
});

// ---- ViewportInput: click versus drag, right click ----------------------------------------------------------------

const target = () => ({
  listeners: [], addEventListener(type, fn) { this.listeners.push({ type, fn }); },
  fire(type, e = {}) { for (const l of this.listeners.filter((x) => x.type === type)) l.fn(e); },
});

function makeInputRig({ gizmoMode = null, gizmoTakes = false, pickHits = false } = {}) {
  const log = [];
  const doc = target();
  const win = target();
  const canvas = target();
  const interaction = { pilotMode: false, isDraggingGizmo: false, gestureCancelled: false };
  const gizmo = {
    mode: gizmoMode, target: null, setMode() {}, toggleSpace() {}, clearMode() {}, cancelDrag() {},
    onMouseDown: () => gizmoTakes, onMouseMove() {}, onHover() {}, onMouseUp() {},
  };
  const state = { selectedId: null, hit: null };
  const selection = {
    get selectedId() { return state.selectedId; },
    isSelected: (id) => state.selectedId === id,
    select: (id) => { state.selectedId = id; log.push(`select:${id}`); },
    deselect: () => { state.selectedId = null; log.push('deselect'); },
    pickAt: () => { log.push('pickAt'); return pickHits; },
    hitAt: () => { log.push('hitAt'); return state.hit; },
  };
  const pilot = { toggle() {}, onMouseDown: () => log.push('pilot.down'), onMouseMove() {}, onMouseUp() {}, onWheel() {} };
  const vi = new ViewportInput({
    doc, win, sceneManager: { renderer: { domElement: canvas } }, interaction, gizmo, selection, pilot,
    onPivotShortcut() {}, commands: { openSectionMenu: (req) => log.push(['menu', req]) },
  });
  vi.attachShortcuts();
  vi.attachPointer();
  const press = (x, y, button = 0) => canvas.fire('mousedown', { clientX: x, clientY: y, button });
  const move = (x, y) => canvas.fire('mousemove', { clientX: x, clientY: y });
  const release = (x, y, button = 0) => {
    const e = { clientX: x, clientY: y, button };
    canvas.fire('mouseup', e);
    win.fire('mouseup', e);
  };
  return { log, state, interaction, canvas, win, press, move, release };
}

describe('ViewportInput: only a click selects a section (travel < 4 px)', () => {
  test('the threshold', () => {
    assert.equal(CLICK_SLOP_PX, 4);
    assert.equal(isDragTravel({ x: 0, y: 0 }, { x: 3, y: 2 }), false);
    assert.equal(isDragTravel({ x: 0, y: 0 }, { x: 4, y: 0 }), true);
    assert.equal(isDragTravel({ x: 10, y: 10 }, { x: 10, y: 6 }), true);
  });

  test('a left click on a section selects it; on empty space it deselects', () => {
    const r = makeInputRig();
    r.state.hit = { id: 'section:1', kind: 'section' };
    r.press(100, 100);
    r.move(102, 101);
    r.release(102, 101);
    assert.deepEqual(r.log, ['hitAt', 'select:section:1']);
    r.log.length = 0;
    r.press(100, 100);
    r.release(100, 100);
    assert.deepEqual(r.log, ['hitAt'], 'the selected section again: nothing');
    r.state.hit = null;
    r.log.length = 0;
    r.press(5, 5);
    r.release(5, 5);
    assert.deepEqual(r.log, ['hitAt', 'deselect']);
  });

  test('an orbit drag never selects or deselects, even when it ends where it started', () => {
    const r = makeInputRig();
    r.state.selectedId = 'section:1';
    r.state.hit = null;
    r.press(100, 100);
    r.move(130, 110);
    r.move(100, 100);
    r.release(100, 100);
    r.state.hit = { id: 'section:2', kind: 'section' };
    r.press(100, 100);
    r.release(104, 100);
    assert.deepEqual(r.log, []);
    assert.equal(r.state.selectedId, 'section:1');
  });

  test('a camera, prop or pivot hit keeps the click; a press taken by the gizmo or the legacy pick is no click', () => {
    const r = makeInputRig();
    r.state.selectedId = 'section:1';
    r.state.hit = { id: 'person', kind: 'prop' };
    r.press(10, 10);
    r.release(10, 10);
    assert.equal(r.state.selectedId, 'section:1');
    const g = makeInputRig({ gizmoMode: 'translate', gizmoTakes: true });
    g.state.hit = { id: 'section:1', kind: 'section' };
    g.press(10, 10);
    g.release(10, 10);
    assert.deepEqual(g.log, []);
    const p = makeInputRig({ gizmoMode: 'translate', pickHits: true });
    p.state.hit = { id: 'section:1', kind: 'section' };
    p.press(10, 10);
    p.release(10, 10);
    assert.deepEqual(p.log, ['pickAt'], 'the legacy pick took the press (B-M14)');
  });

  test('nothing in pilot mode, for another button, or for a release outside the canvas', () => {
    const r = makeInputRig();
    r.state.hit = { id: 'section:1', kind: 'section' };
    r.interaction.pilotMode = true;
    r.press(10, 10);
    r.release(10, 10);
    r.interaction.pilotMode = false;
    r.press(10, 10, 0);
    r.release(10, 10, 1);
    r.press(10, 10);
    r.win.fire('mouseup', { clientX: 10, clientY: 10, button: 0 });
    r.canvas.fire('mouseup', { clientX: 10, clientY: 10, button: 0 });
    r.press(10, 10, 1);
    r.release(10, 10, 1);
    assert.deepEqual(r.log, ['pilot.down']);
  });

  test('a right click on a section selects it and opens the menu at the pointer; elsewhere nothing happens', () => {
    const r = makeInputRig();
    r.state.hit = { id: 'section:4', kind: 'section' };
    r.press(200, 120, 2);
    r.release(201, 121, 2);
    assert.deepEqual(r.log, ['hitAt', 'select:section:4', ['menu', { id: 'section:4', clientX: 201, clientY: 121 }]]);
    r.log.length = 0;
    r.state.hit = null;
    r.press(5, 5, 2);
    r.release(5, 5, 2);
    assert.deepEqual(r.log, ['hitAt'], 'no menu and no deselect on empty space');
    r.log.length = 0;
    r.state.hit = { id: 'section:4', kind: 'section' };
    r.press(200, 120, 2);
    r.move(220, 120);
    r.release(220, 120, 2);
    assert.deepEqual(r.log, [], 'a right drag orbits');
  });

  test('the browser context menu is suppressed on the canvas', () => {
    const r = makeInputRig();
    let prevented = 0;
    r.canvas.fire('contextmenu', { preventDefault: () => prevented++ });
    assert.equal(prevented, 1);
  });
});

// ---- the section menu ---------------------------------------------------------------------------------------------

describe('SectionContextMenu', () => {
  test('menuKeyAction: arrows cycle, Home / End jump, Escape and Tab close, other keys pass', () => {
    assert.deepEqual(menuKeyAction('ArrowDown', 0, 3), { focus: 1 });
    assert.deepEqual(menuKeyAction('ArrowDown', 2, 3), { focus: 0 });
    assert.deepEqual(menuKeyAction('ArrowUp', 0, 3), { focus: 2 });
    assert.deepEqual(menuKeyAction('ArrowDown', -1, 3), { focus: 0 });
    assert.deepEqual(menuKeyAction('ArrowUp', -1, 3), { focus: 2 });
    assert.deepEqual(menuKeyAction('Home', 2, 3), { focus: 0 });
    assert.deepEqual(menuKeyAction('End', 0, 3), { focus: 2 });
    assert.deepEqual(menuKeyAction('Escape', 1, 3), { close: true });
    assert.deepEqual(menuKeyAction('Tab', 1, 3), { close: true });
    assert.equal(menuKeyAction('Enter', 1, 3), null);
    assert.equal(menuKeyAction('g', 1, 3), null);
  });

  test('clampMenuPosition keeps the menu inside the host', () => {
    assert.deepEqual(clampMenuPosition(100, 50, 180, 120, 800, 600), { left: 100, top: 50 });
    assert.deepEqual(clampMenuPosition(790, 590, 180, 120, 800, 600), { left: 616, top: 476 });
    assert.deepEqual(clampMenuPosition(-20, -5, 180, 120, 800, 600), { left: 4, top: 4 });
    assert.deepEqual(clampMenuPosition(50, 50, 900, 120, 800, 600), { left: 4, top: 50 }, 'wider than the host');
  });

  /** A minimal DOM: elements with listeners, attributes, focus and containment. */
  function makeDom() {
    const doc = target();
    const win = target();
    doc.removed = [];
    win.removed = [];
    doc.removeEventListener = (type, fn) => { doc.removed.push(type); doc.listeners = doc.listeners.filter((l) => l.fn !== fn); };
    win.removeEventListener = (type, fn) => { win.removed.push(type); win.listeners = win.listeners.filter((l) => l.fn !== fn); };
    doc.body = { isConnected: true, focus() {} };
    doc.activeElement = doc.body;
    const element = () => {
      const el = {
        ...target(), children: [], attrs: {}, style: {}, hidden: false, textContent: '', isConnected: true,
        offsetWidth: 180, offsetHeight: 110,
        setAttribute(k, v) { this.attrs[k] = String(v); },
        appendChild(c) { c.parent = this; this.children.push(c); return c; },
        contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; },
        focus() { doc.activeElement = this; },
        click() { this.fire('click', {}); },
      };
      return el;
    };
    doc.createElement = () => element();
    const host = element();
    host.clientWidth = 800;
    host.clientHeight = 600;
    host.getBoundingClientRect = () => ({ left: 400, top: 60 });
    return { doc, win, host };
  }

  function makeMenu() {
    const dom = makeDom();
    const log = [];
    const menu = new SectionContextMenu({
      ...dom, commands: { changeSettings: (id) => log.push(['settings', id]), editUvs: (id) => log.push(['uvs', id]), deselect: () => log.push(['deselect']) },
    });
    return { ...dom, log, menu };
  }
  const key = (el, k) => {
    const e = { key: k, stopped: 0, prevented: 0, stopPropagation() { this.stopped++; }, preventDefault() { this.prevented++; } };
    el.fire('keydown', e);
    return e;
  };

  test('nothing exists before the first open; open places it at the pointer with the name as text and focuses item 1', () => {
    const m = makeMenu();
    assert.equal(m.menu.element, null);
    assert.equal(m.host.children.length, 0);
    m.menu.open({ sectionId: 5, label: '<b>Left</b>', clientX: 500, clientY: 160 });
    const el = m.menu.element;
    assert.equal(m.host.children[0], el);
    assert.equal(el.attrs.role, 'menu');
    assert.equal(el.children[0].textContent, '<b>Left</b>', 'textContent, never markup');
    assert.deepEqual(el.children.slice(1).map((b) => [b.textContent, b.attrs.role]), SECTION_MENU_ITEMS.map((i) => [i.label, 'menuitem']));
    assert.equal(el.hidden, false);
    assert.deepEqual(el.style, { left: '100px', top: '100px' });
    assert.equal(m.doc.activeElement, el.children[1]);
    assert.ok(m.menu.isOpen);
  });

  test('arrow keys move the focus; every key stops at the menu; Escape closes and restores the focus', () => {
    const m = makeMenu();
    const before = { isConnected: true, focus() { m.doc.activeElement = this; } };
    m.doc.activeElement = before;
    m.menu.open({ sectionId: 5, label: 'A', clientX: 500, clientY: 160 });
    const el = m.menu.element;
    const items = el.children.slice(1);
    assert.equal(key(el, 'ArrowDown').prevented, 1);
    assert.equal(m.doc.activeElement, items[1]);
    key(el, 'ArrowUp');
    key(el, 'ArrowUp');
    assert.equal(m.doc.activeElement, items[2]);
    const g = key(el, 'g');
    assert.equal(g.stopped, 1, 'a shortcut key never reaches the viewport');
    assert.equal(g.prevented, 0);
    const esc = key(el, 'Escape');
    assert.equal(esc.stopped, 1, 'Escape does not also deselect');
    assert.equal(m.menu.isOpen, false);
    assert.equal(el.hidden, true);
    assert.equal(m.doc.activeElement, before);
  });

  test('closes on a press outside it, Escape outside it, a wheel, a resize or a blur, and removes its listeners; a press inside keeps it', () => {
    for (const trigger of ['outside', 'escape', 'wheel', 'resize', 'blur']) {
      const m = makeMenu();
      m.menu.open({ sectionId: 1, label: 'A', clientX: 410, clientY: 70 });
      m.doc.fire('pointerdown', { target: m.menu.element.children[2] });
      m.doc.fire('keydown', { key: 'Escape', target: m.menu.element.children[1] });
      m.doc.fire('keydown', { key: 'g', target: m.host });
      assert.ok(m.menu.isOpen, 'inside');
      if (trigger === 'outside') m.doc.fire('pointerdown', { target: m.host });
      else if (trigger === 'escape') m.doc.fire('keydown', { key: 'Escape', target: m.doc.body });
      else if (trigger === 'wheel') m.doc.fire('wheel', {});
      else m.win.fire(trigger, {});
      assert.equal(m.menu.isOpen, false, trigger);
      assert.deepEqual(m.doc.listeners.map((l) => l.type), [], `${trigger}: document listeners removed`);
      assert.deepEqual(m.win.listeners.map((l) => l.type), [], `${trigger}: window listeners removed`);
    }
  });

  test('the items run their commands for the menu\'s section and close it', () => {
    const m = makeMenu();
    for (const [i, expected] of [[1, ['settings', 'sec']], [2, ['uvs', 'sec']], [3, ['deselect']]]) {
      m.menu.open({ sectionId: 'sec', label: 'A', clientX: 410, clientY: 70 });
      m.menu.element.children[i].click();
      assert.equal(m.menu.isOpen, false);
      assert.deepEqual(m.log.at(-1), expected);
    }
  });
});

// ---- the highlight ------------------------------------------------------------------------------------------------

describe('SectionHighlightView', () => {
  test('borderLoop walks the border once and closes on its first point; cellTriangles covers every cell', () => {
    assert.deepEqual(borderLoop(2, 2), [0, 1, 3, 2, 0]);
    assert.deepEqual(borderLoop(3, 2), [0, 1, 2, 5, 4, 3, 0]);
    assert.deepEqual(borderLoop(2, 3), [0, 1, 3, 5, 4, 2, 0]);
    const grid = { points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], perRow: 2, rows: 2 };
    assert.deepEqual(Array.from(cellTriangles(grid)), [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
  });

  function makeView() {
    const bus = new EventBus();
    const helpers = [];
    const view = new SectionHighlightView({ sceneManager: { addHelper: (g) => helpers.push(g) }, bus, theme: Theme });
    return { bus, helpers, view };
  }
  const layoutOf = (sections) => computeWallLayout(sections.map((f) => new WallSection(f)));
  const linePoints = (view) => {
    const a = view.group.children[1].geometry.getAttribute('position');
    return Array.from({ length: a.count }, (_, i) => [a.getX(i), a.getY(i), a.getZ(i)].map((v) => Math.round(v * 1e6) / 1e6));
  };

  test('nothing is allocated until a section is selected; legacy selections never show it', () => {
    const v = makeView();
    v.bus.emit(Events.WALL_REBUILT, { layout: layoutOf([{ id: 1, panelCols: 2, panelRows: 1 }]) });
    v.bus.emit(Events.SELECTION_CHANGED, { id: 'camera', label: 'Camera', modes: [] });
    assert.equal(v.view.group, null);
    assert.deepEqual(v.helpers, []);
  });

  test('the selected section is tinted and outlined on the helpers layer, re-resolved by id after rebuilds', () => {
    const v = makeView();
    const flat = { panelCols: 2, panelRows: 1, panelWidth: 500, panelHeight: 500, curveIntensity: 0, angleOffset: 0 };
    v.bus.emit(Events.WALL_REBUILT, { layout: layoutOf([{ ...flat, id: 1 }, { ...flat, id: 2 }]) });
    v.bus.emit(Events.SELECTION_CHANGED, { id: 'section:2', label: 'B', modes: [] });
    assert.equal(v.helpers.length, 1);
    assert.equal(v.helpers[0], v.view.group);
    assert.ok(v.view.visible);
    const [tint, halo, core] = v.view.group.children;
    assert.equal(halo.geometry, core.geometry, 'one closed line geometry drawn twice');
    assert.equal(halo.renderOrder, RENDER_ORDER.HIGHLIGHT_HALO);
    assert.equal(core.renderOrder, RENDER_ORDER.SECTION_HIGHLIGHT);
    assert.equal(core.material.depthTest, false);
    assert.equal(tint.material.depthWrite, false);
    assert.equal(tint.geometry.getAttribute('position').count, 2 * 2 * 3, 'two panels, two triangles each');
    assert.deepEqual(linePoints(v.view), [[1, 0, 0], [1.5, 0, 0], [2, 0, 0], [2, 0.5, 0], [1.5, 0.5, 0], [1, 0.5, 0], [1, 0, 0]]);
    // the first section is deleted: the second is found again by id at its new place
    const oldLine = halo.geometry;
    v.bus.emit(Events.WALL_REBUILT, { layout: layoutOf([{ ...flat, id: 2 }]) });
    assert.ok(v.view.visible);
    assert.equal(oldLine.disposed, 1, 'the replaced geometry is disposed');
    assert.deepEqual(linePoints(v.view)[2], [1, 0, 0]);
    // the selected section itself is deleted (before its deselect arrives): hidden
    v.bus.emit(Events.WALL_REBUILT, { layout: layoutOf([{ ...flat, id: 3 }]) });
    assert.equal(v.view.visible, false);
    v.bus.emit(Events.SELECTION_CHANGED, { id: null, label: null, modes: [] });
    assert.equal(v.view.visible, false);
    assert.equal(v.helpers.length, 1, 'allocated once');
  });

  test('sectionCornerGrid: the layout grid of a section, null for a missing one', () => {
    const layout = layoutOf([{ id: 1, panelCols: 3, panelRows: 2, panelWidth: 500, panelHeight: 500, curveIntensity: 5, angleOffset: 0 }]);
    const g = sectionCornerGrid(layout, 0);
    assert.equal(g.perRow, 4);
    assert.equal(g.rows, 3);
    assert.equal(sectionCornerGrid(layout, 1), null);
  });
});

