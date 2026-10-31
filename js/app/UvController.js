/**
 * @module app/UvController
 * The UV use cases of spec 04 (docs/improvements/04-uvs-uv-editor.md 3.3-3.7, 5.3, 6.6, 6.8, 6.12; UV-11 to UV-15):
 * the viewer commands, the transform edits (field preview / commit / cancel, flips, feed turns, Source, presets, nudges,
 * Copy to all, handle drags), their undo history, the project UV settings and the hover readout.
 * Live path (6.12, without events in the pipeline): every edit writes the section's transform, re-plans that one section
 * against the layout and atlas cached from the last rebuild (UV edits change neither) and rewrites its UVs in place
 * (LEDWallView.updateSectionUvs: no rebuild, no texture); the viewer's data refresh is coalesced to one per animation
 * frame. It is a SelectionManager observer (it follows a selected wall section unless pinned; only spec 02's section
 * Selectables produce one) and a WallController rebuild observer (cache, viewed section, atlas note, viewer refresh).
 * History (path B, the owner's decision): UvFallbackHistory, a UV-only stack; one entry per committed edit (a field
 * commit, coalesced per field within 750 ms; a drag at its end; each button), none for previews or cancelled drags.
 * UV state is session-only until project file v2 (04 UV-5c): an import starts every section from the identity and
 * clears the UV history.
 * Legacy source: none (Feature 4).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

import { Events } from '../core/EventBus.js';
import { UvTransform, UvSettings } from '../domain/UvSettings.js';
import {
  planSectionUv, isLedMaskContent, presetFit, isFitResult, presetPixelAccurate, quarterTurn, dragTranslate, dragScale,
  dragRotate, sourceSize, applyUv, invertUv,
} from '../geometry/UvMapper.js';
import { describeHit } from '../geometry/PixelMap.js';
import { canvasFits } from '../geometry/TextureAtlas.js';

/** The numeric fields of the viewer and their history labels ('scale' sets both scales: the 🔗 lock). */
const FIELD_LABELS = Object.freeze({
  offsetU: 'Offset U', offsetV: 'Offset V', scaleU: 'Scale U', scaleV: 'Scale V', scale: 'Scale', rotation: 'Rotate',
});
/** The presets (04 6.6) and their labels. */
const PRESET_LABELS = Object.freeze({ reset: 'Reset', fit: 'Fit 0–1', pixel: 'Pixel-accurate' });
/** The settings and their history labels. */
const SETTING_LABELS = Object.freeze({
  combinedLayout: 'UV layout', panelUvs: 'Panel UVs', gltfAtlasTexcoord1: 'glTF atlas UVs',
});

/** A raw UI value as a number (numbers as given, anything else through parseFloat). */
const num = (raw) => (typeof raw === 'number' ? raw : parseFloat(raw));
/** The pixel size of a section. */
const dims = (s) => ({ W: s.panelCols * s.ledX, H: s.panelRows * s.ledY });
/** Whether every count of a section is a positive integer (edits are refused otherwise, 04 3.8). */
const validCounts = (s) => [s.panelCols, s.panelRows, s.ledX, s.ledY].every((n) => Number.isInteger(n) && n >= 1);
/** A signed fixed-point number with a typographic minus. */
const signed = (x, digits) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(digits)}`;

/**
 * A copy of `base` with one field set through UvTransform's rules ('scale' sets both scales). Always derived from the
 * session's before-state, so repeated previews of a negative scale never toggle the flip twice.
 * @param {UvTransform} base
 * @param {string} field
 * @param {*} raw
 * @returns {UvTransform}
 */
function withField(base, field, raw) {
  const t = base.clone();
  if (field === 'scale') {
    t.setField('scaleU', raw);
    t.setField('scaleV', raw);
  } else {
    t.setField(field, raw);
  }
  return t;
}

/**
 * The drag tooltip of 04 3.4: `Δu +0.0125 (4 px) · Δv +0.0000 (0 px)`, `Scale 87.5 %` or `Rot 45°`.
 * @returns {string}
 */
function dragTooltip(handle, t0, t, W, H) {
  if (handle === 'island') {
    const [Ws, Hs] = sourceSize(t, W, H);
    const du = t.offsetU - t0.offsetU;
    const dv = t.offsetV - t0.offsetV;
    return `Δu ${signed(du, 4)} (${Math.round(du * Ws)} px) · Δv ${signed(dv, 4)} (${Math.round(dv * Hs)} px)`;
  }
  if (handle === 'rotate') return `Rot ${Number(t.rotation.toFixed(1))}°`;
  const pu = Number((t.scaleU * 100).toFixed(1));
  const pv = Number((t.scaleV * 100).toFixed(1));
  return pu === pv ? `Scale ${pu} %` : `Scale ${pu} % × ${pv} %`;
}

/** The UV use cases. */
export class UvController {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('./WallController.js').WallController} */
  #wallController;
  /** @type {import('../render/LEDWallView.js').LEDWallView} */
  #view;
  /** @type {import('./UvViewModel.js').UvViewModel} */
  #viewModel;
  /** @type {{setEnabled(on: boolean): void}|null} the wall hover probe (enabled while the viewer is open) */
  #probe;
  /** @type {import('./UvFallbackHistory.js').UvFallbackHistory} */
  #history;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {() => number} */
  #maxTextureSize;
  /** @type {(fn: () => void) => *} */
  #raf;
  /** @type {{layout: object, atlas: object, plans: object[], sectionScale: object|null}|null} the last rebuild's */
  #cache = null;
  /** @type {{sectionId: *, field: string, before: UvTransform}|null} the open field session (a cancel snapshot) */
  #field = null;
  /** @type {{sectionId: *, handle: string, t0: UvTransform, uv0: number[]}|null} the active handle drag */
  #drag = null;
  #refreshPending = false;
  /** @type {string} the last published hover (repeated identical readouts are not re-published) */
  #hoverKey = '';

  /**
   * Stores the collaborators only (R4): no renderer is read here (maxTextureSize is a getter, read in onWallRebuilt).
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          wallController: import('./WallController.js').WallController,
   *          view: import('../render/LEDWallView.js').LEDWallView,
   *          viewModel: import('./UvViewModel.js').UvViewModel,
   *          probe?: {setEnabled(on: boolean): void}|null,
   *          history: import('./UvFallbackHistory.js').UvFallbackHistory,
   *          bus: import('../core/EventBus.js').EventBus,
   *          maxTextureSize: () => number,
   *          raf: (fn: () => void) => *}} deps
   *   maxTextureSize: () => renderer.capabilities.maxTextureSize; raf: coalesces the viewer refresh to one per frame
   */
  constructor({ project, wallController, view, viewModel, probe = null, history, bus, maxTextureSize, raf }) {
    this.#project = project;
    this.#wallController = wallController;
    this.#view = view;
    this.#viewModel = viewModel;
    this.#probe = probe;
    this.#history = history;
    this.#bus = bus;
    this.#maxTextureSize = maxTextureSize;
    this.#raf = raf;
  }

  // ---- viewer commands ------------------------------------------------------------------------------------------

  /** Opens or closes the viewer (U, the toolbar button). Side effects: as openViewer / closeViewer. */
  toggleViewer() {
    if (this.#viewModel.open) this.closeViewer();
    else this.openViewer();
  }

  /**
   * Opens the viewer on a section: the given one, else the last viewed one, else the first.
   * Side effects: viewer state (UV_VIEWER_CHANGED), probe enabled, a data refresh (UV_DATA_CHANGED).
   * @param {*} [sectionId]
   */
  openViewer(sectionId = null) {
    const vm = this.#viewModel;
    const id = this.#validSectionId(sectionId ?? vm.sectionId);
    if (!Object.is(id, vm.sectionId)) this.#endSessions(false);
    vm.setSection(id);
    vm.setOpen(true);
    this.#probe?.setEnabled(true);
    this.#refresh(false);
  }

  /**
   * Closes the viewer: an open field session is committed, a drag cancelled, the hover cleared.
   * Side effects: viewer state (UV_VIEWER_CHANGED), probe disabled, UV_HOVER_CHANGED null.
   */
  closeViewer() {
    this.#endSessions(false);
    this.#probe?.setEnabled(false);
    this.#viewModel.setOpen(false);
    this.#publishHover('wall', null, null);
  }

  /**
   * Shows another section in the viewer (dropdown, wall double-click, card button, selection).
   * Side effects: viewer state and refresh.
   * @param {*} sectionId
   */
  viewSection(sectionId) {
    const id = this.#validSectionId(sectionId);
    if (id === null || Object.is(id, this.#viewModel.sectionId)) return;
    this.#endSessions(false);
    this.#viewModel.setSection(id);
    this.#refresh(false);
  }

  /** Side effects: viewer state and refresh. @param {string} kind  'panelIds' | 'ledSim' | 'checker' | 'none' */
  setBackground(kind) {
    this.#viewModel.setBackground(kind);
    this.#refresh(false);
  }

  /** Side effects: viewer state and refresh. @param {string} space  'section' | 'atlas' (read-only) */
  setSpace(space) {
    this.#endSessions(false);
    this.#viewModel.setSpace(space);
    this.#refresh(false);
  }

  /** Side effects: viewer state (the viewer resolves 'auto' itself). @param {string} kind  'auto' | 'texture' | 'square' */
  setAspect(kind) {
    this.#viewModel.setAspect(kind);
  }

  /** Side effects: viewer state. @param {boolean} on  a pinned viewer ignores selection changes */
  setPinned(on) {
    this.#viewModel.setPinned(on);
  }

  /** Side effects: none. @returns {boolean} a handle drag is active */
  get dragging() {
    return this.#drag !== null;
  }

  // ---- observers ------------------------------------------------------------------------------------------------

  /**
   * SelectionManager observer (04 5.3): follows `kind === 'section'` (the primary's sectionId) unless pinned; a deselect
   * (kind null) and every other kind leave the viewer unchanged.
   * Side effects: as viewSection.
   * @param {{kind: string|null, primary: {sectionId?: *}|null}} payload
   */
  onSelectionChanged(payload) {
    if (payload?.kind !== 'section' || this.#viewModel.pinned) return;
    const id = payload.primary?.sectionId;
    if (id !== undefined && id !== null) this.viewSection(id);
  }

  /**
   * WallController rebuild observer (P1 step 8, the bootstrap rebuild included): caches the layout, atlas and plans of
   * the live path; drops the history and sessions of vanished sections (all of them on an import, whose sections start
   * from the identity: UV state is session-only); moves the viewer to the nearest remaining section; emits
   * UV_SETTINGS_CHANGED with the atlas note values (maxTextureSize read here); refreshes the viewer.
   * Side effects: as listed.
   * @param {{layout: object, atlas: object, plans: object[], sectionScale?: object|null, cause?: string}} info
   */
  onWallRebuilt({ layout, atlas, plans, sectionScale = null, cause = 'edit' }) {
    this.#cache = { layout, atlas, plans: plans.slice(), sectionScale };
    const live = new Set(layout.sections.map((sl) => sl.sectionId));
    if (cause === 'import') {
      this.#history.clear();
      this.#field = null;
      this.#drag = null;
    } else {
      this.#history.prune((id) => live.has(id));
      if (this.#field && !live.has(this.#field.sectionId)) this.#field = null;
      if (this.#drag && !live.has(this.#drag.sectionId)) this.#drag = null;
    }
    const vm = this.#viewModel;
    if (vm.sectionId !== null && !live.has(vm.sectionId)) {
      const n = layout.sections.length;
      vm.setSection(n ? layout.sections[Math.min(vm.viewedIndex, n - 1)].sectionId : null);
    }
    this.#emitSettings();
    this.#refresh(true);
  }

  /**
   * WallController.commitRename observer: the names of the header, dropdown and readout, without re-rendering the
   * background (a panel-ID rebuild, when panel IDs are on, follows and refreshes it).
   * Side effects: a viewer refresh.
   */
  onSectionRenamed() {
    this.#refresh(false);
  }

  // ---- numeric fields (04 3.3: input previews, change commits, Escape cancels) -----------------------------------

  /**
   * Live preview of a field (`input`): writes the domain and the viewport in place, no history entry. The first preview
   * of a session stores the before-state (a cancel snapshot). Non-numeric text is ignored while typing.
   * Side effects: domain write, live UVs, UV_TRANSFORM_CHANGED (live), a coalesced refresh.
   * @param {*} sectionId
   * @param {'offsetU'|'offsetV'|'scaleU'|'scaleV'|'scale'|'rotation'} field  UV units, scales as fractions, degrees
   * @param {*} raw
   */
  previewField(sectionId, field, raw) {
    const section = this.#section(sectionId);
    if (!section || !FIELD_LABELS[field] || !Number.isFinite(num(raw)) || !validCounts(section)) return;
    if (this.#drag) this.cancelDrag();
    const f = this.#field;
    if (f && !(Object.is(f.sectionId, sectionId) && f.field === field)) this.#finishField();
    if (!this.#field) this.#field = { sectionId, field, before: section.uvTransform.clone() };
    this.#applyLive(section, withField(this.#field.before, field, raw), 'preview', true);
  }

  /**
   * Commit of a field (`change`: Enter, blur after editing, a spinner click): one history entry
   * `UV <Field> (<name>)`, coalesced per section and field within 750 ms.
   * Side effects: domain write, live UVs, UV_TRANSFORM_CHANGED, a history entry iff the value changed.
   * @param {*} sectionId
   * @param {string} field
   * @param {*} raw
   * @returns {object|null} the stored transform (plain fields) for the write-back, null when refused
   */
  commitField(sectionId, field, raw) {
    const section = this.#section(sectionId);
    if (!section || !FIELD_LABELS[field] || !validCounts(section)) return null;
    const f = this.#field;
    if (f && !(Object.is(f.sectionId, sectionId) && f.field === field)) this.#finishField();
    const before = this.#field ? this.#field.before : section.uvTransform.clone();
    this.#field = null;
    const t = withField(before, field, raw);
    this.#applyLive(section, t, 'field', false);
    if (!t.equals(before)) {
      this.#recordTransforms(`UV ${FIELD_LABELS[field]} (${section.name})`, [section], [before],
        { coalesceKey: `uv:${section.id}:${field}` });
    }
    return { ...section.uvTransform };
  }

  /**
   * Escape in a field: reverts the session's previews to its before-state; no entry.
   * Side effects: domain write, live UVs, UV_TRANSFORM_CHANGED.
   * @param {*} sectionId
   */
  cancelField(sectionId) {
    const f = this.#field;
    if (!f || !Object.is(f.sectionId, sectionId)) return;
    this.#field = null;
    const section = this.#section(sectionId);
    if (section) this.#applyLive(section, f.before, 'field', false);
  }

  // ---- buttons and keys (one history entry each) ------------------------------------------------------------------

  /** Flip U / Flip V. Side effects: as #oneShot. @param {*} sectionId @param {'u'|'v'} axis */
  toggleFlip(sectionId, axis) {
    const key = axis === 'v' ? 'flipV' : 'flipU';
    this.#oneShot(sectionId, `UV flip ${axis === 'v' ? 'V' : 'U'}`, 'flip', (t) => new UvTransform({ ...t, [key]: !t[key] }));
  }

  /**
   * Turn the feed 90° (04 6.6): dir +1 turns the image on the wall clockwise; Source toggles on non-square sections.
   * Side effects: as #oneShot.
   * @param {*} sectionId
   * @param {1|-1} dir
   */
  turnFeed(sectionId, dir) {
    this.#oneShot(sectionId, 'UV turn feed', 'turn', (t, W, H) => quarterTurn(t, dir > 0 ? 1 : -1, W, H));
  }

  /** The Source orientation (H×W when on). Side effects: as #oneShot. @param {*} sectionId @param {boolean} on */
  setSourceRotated(sectionId, on) {
    this.#oneShot(sectionId, 'UV source', 'source', (t) => new UvTransform({ ...t, sourceRotated: !!on }));
  }

  /** Reset, Fit 0–1 or Pixel-accurate (04 6.6). Side effects: as #oneShot. @param {*} sectionId @param {'reset'|'fit'|'pixel'} name */
  applyPreset(sectionId, name) {
    const fn = { reset: () => UvTransform.identity(), fit: presetFit, pixel: presetPixelAccurate }[name];
    if (fn) this.#oneShot(sectionId, `UV ${PRESET_LABELS[name]}`, 'preset', fn);
  }

  /**
   * Arrow-key nudge (04 3.6): the offset moves by du, dv source pixels, or by du, dv panels (Shift). Repeated nudges
   * within 750 ms make one entry.
   * Side effects: as #oneShot.
   * @param {*} sectionId
   * @param {number} du  -1, 0 or 1
   * @param {number} dv  -1, 0 or 1
   * @param {boolean} [byPanel]
   */
  nudge(sectionId, du, dv, byPanel = false) {
    this.#oneShot(sectionId, 'UV nudge', 'nudge', (t, W, H, s) => {
      const [Ws, Hs] = sourceSize(t, W, H);
      const out = t.clone();
      out.setField('offsetU', t.offsetU + du * (byPanel ? 1 / s.panelCols : 1 / Ws));
      out.setField('offsetV', t.offsetV + dv * (byPanel ? 1 / s.panelRows : 1 / Hs));
      return out;
    }, { coalesceKey: `uv:${sectionId}:nudge` });
  }

  /**
   * Copy to all (04 6.6): this section's transform on every other section, a Fit result re-fitted per section (Fit keeps
   * the rotation, flips and Source); one entry 'UV copy to all'.
   * Side effects: domain writes, live UVs, UV_TRANSFORM_CHANGED per changed section, one history entry.
   * @param {*} sectionId
   */
  copyToAll(sectionId) {
    const src = this.#section(sectionId);
    if (!src || !validCounts(src)) return;
    this.#endSessions(false);
    const t = src.uvTransform;
    const { W, H } = dims(src);
    const fit = isFitResult(t, W, H);
    const targets = [];
    const befores = [];
    for (const s of this.#project.wall.sections) {
      if (s === src || !validCounts(s)) continue;
      const d = dims(s);
      const next = fit ? presetFit(t, d.W, d.H) : t.clone();
      if (next.equals(s.uvTransform)) continue;
      targets.push(s);
      befores.push(s.uvTransform.clone());
      this.#applyLive(s, next, 'copy', false);
    }
    if (targets.length) this.#recordTransforms('UV copy to all', targets, befores);
  }

  // ---- handle drags (04 3.4, 6.8) -----------------------------------------------------------------------------------

  /**
   * Starts a drag of the island ('island'), a corner or edge handle ('bl'|'br'|'tr'|'tl'|'l'|'r'|'b'|'t') or the rotate
   * knob ('rotate'); `uv` is the pointer in the section's UV space.
   * Side effects: ends a field session (commit).
   * @param {*} sectionId
   * @param {string} handle
   * @param {number[]} uv
   * @returns {boolean} whether the drag started
   */
  beginDrag(sectionId, handle, uv) {
    const section = this.#section(sectionId);
    if (!section || !validCounts(section)) return false;
    this.#endSessions(false);
    this.#drag = { sectionId, handle, t0: section.uvTransform.clone(), uv0: [uv[0], uv[1]] };
    return true;
  }

  /**
   * One pointer move of the drag: translate snaps to whole source pixels unless Alt, with the axis lock the viewer chose
   * (Shift); scale snaps to 1 % unless Alt and is uniform while the lock is on (Shift inverts it); rotate snaps to 15°,
   * 90° with Shift, free with Alt. No history entry until endDrag.
   * Side effects: domain write, live UVs, UV_TRANSFORM_CHANGED (live), a coalesced refresh.
   * @param {number[]} uv
   * @param {{alt?: boolean, shift?: boolean, axisLock?: 'u'|'v'|null, lock?: boolean}} [modifiers]
   * @returns {{tooltip: string}|null}
   */
  updateDrag(uv, { alt = false, shift = false, axisLock = null, lock = true } = {}) {
    const d = this.#drag;
    const section = d ? this.#section(d.sectionId) : null;
    if (!section) return null;
    const { W, H } = dims(section);
    let t;
    if (d.handle === 'island') t = dragTranslate(d.t0, W, H, d.uv0, uv, { snap: !alt, axisLock });
    else if (d.handle === 'rotate') t = dragRotate(d.t0, W, H, d.uv0, uv, { snapDeg: alt ? null : shift ? 90 : 15 });
    else t = dragScale(d.t0, W, H, d.handle, uv, { uniform: lock !== shift, snapPercent: !alt });
    this.#applyLive(section, t, 'drag', true);
    return { tooltip: dragTooltip(d.handle, d.t0, t, W, H) };
  }

  /**
   * Ends the drag: one history entry 'UV drag (<name>)' iff the transform changed (no coalescing, no transaction).
   * Side effects: UV_TRANSFORM_CHANGED (not live), a history entry.
   */
  endDrag() {
    const d = this.#drag;
    this.#drag = null;
    const section = d ? this.#section(d.sectionId) : null;
    if (!section || section.uvTransform.equals(d.t0)) return;
    this.#emitTransform(section, 'drag', false);
    this.#recordTransforms(`UV drag (${section.name})`, [section], [d.t0]);
  }

  /**
   * Escape during a drag: restores the start transform; no entry.
   * Side effects: domain write, live UVs, UV_TRANSFORM_CHANGED.
   * @returns {boolean} whether a drag was cancelled
   */
  cancelDrag() {
    const d = this.#drag;
    this.#drag = null;
    if (!d) return false;
    const section = this.#section(d.sectionId);
    if (section) this.#applyLive(section, d.t0, 'drag', false);
    return true;
  }

  // ---- history ----------------------------------------------------------------------------------------------------

  /** Cancels an open drag or field session, then undoes one entry. Side effects: domain writes, live UVs or a rebuild. */
  undo() {
    this.#endSessions(true);
    const e = this.#history.undo();
    if (e) this.#applyEntry(e, 'before');
    this.#scheduleRefresh();
  }

  /** Cancels an open drag or field session, then redoes one entry. Side effects: as undo. */
  redo() {
    this.#endSessions(true);
    const e = this.#history.redo();
    if (e) this.#applyEntry(e, 'after');
    this.#scheduleRefresh();
  }

  // ---- settings (UV-14) -------------------------------------------------------------------------------------------

  /** Side effects: as #changeSetting. @param {string} value  'per-section' | 'atlas' */
  setCombinedLayout(value) {
    this.#changeSetting('combinedLayout', UvSettings.RULES.combinedLayout(value));
  }

  /** Side effects: as #changeSetting. @param {string} value  'section' | 'panel' */
  setPanelUvs(value) {
    this.#changeSetting('panelUvs', UvSettings.RULES.panelUvs(value));
  }

  /** Side effects: as #changeSetting (export-only: never rebuilds). @param {boolean} on */
  setGltfAtlasTexcoord1(on) {
    this.#changeSetting('gltfAtlasTexcoord1', UvSettings.RULES.gltfAtlasTexcoord1(on));
  }

  /** The colour-mode chip's action (04 3.7): panel IDs on, like the toggle. Side effects: WallController.setPanelIds(true). */
  showPanelIds() {
    this.#wallController.setPanelIds(true);
  }

  // ---- hover (UV-15) and the canvas readout (UV-12) --------------------------------------------------------------

  /**
   * The wall hover probe's delivery: the hovered front LED mesh hit (or null) as a readout and a panel outline.
   * Side effects: UV_HOVER_CHANGED (deduplicated).
   * @param {object|null} hit  a raw raycast intersection
   */
  onWallHover(hit) {
    if (!this.#viewModel.open || !this.#cache) return;
    const r = hit ? this.#view.resolveHit(hit) : null;
    if (!r) {
      this.#publishHover('wall', null, null);
      return;
    }
    this.#publishHover('wall', this.#describe(r.sectionIndex, r.baseU, r.baseV), r.panelCorners3D);
  }

  /**
   * Double-click on the front of the wall: opens the viewer on that section (04 3.5, without spec 02).
   * Side effects: as openViewer.
   * @param {object|null} hit
   */
  onWallDoubleClick(hit) {
    const r = hit ? this.#view.resolveHit(hit) : null;
    if (r) this.openViewer(r.sectionId);
  }

  /**
   * The canvas hover readout: the wall pixel that samples the source point (u, v) of the viewed section's UV space
   * (the inverse transform), or nothing outside the island. probeUv(null) clears it.
   * Side effects: UV_HOVER_CHANGED (deduplicated).
   * @param {*} sectionId
   * @param {number} [u]
   * @param {number} [v]
   */
  probeUv(sectionId, u, v) {
    const cache = this.#cache;
    const i = cache && sectionId !== null && sectionId !== undefined
      ? cache.layout.sections.findIndex((sl) => Object.is(sl.sectionId, sectionId)) : -1;
    const s = i >= 0 ? cache.layout.sections[i].section : null;
    if (!s || !validCounts(s)) {
      this.#publishHover('uv-canvas', null, null);
      return;
    }
    const { W, H } = dims(s);
    const [bu, bv] = invertUv(s.uvTransform, W, H, u, v);
    if (!(bu >= 0 && bu <= 1 && bv >= 0 && bv <= 1)) {
      this.#publishHover('uv-canvas', null, null);
      return;
    }
    const d = this.#describe(i, bu, bv);
    this.#publishHover('uv-canvas', d, this.#view.panelCornersWorld(d.sectionId, d.col, d.row));
  }

  // ---- internals --------------------------------------------------------------------------------------------------

  /** @returns {import('../domain/WallSection.js').WallSection|null} the live section with that id */
  #section(id) {
    return this.#project.wall.sections.find((s) => Object.is(s.id, id)) ?? null;
  }

  /** @returns {*} id when such a section exists, else the first section's id, else null */
  #validSectionId(id) {
    const sections = this.#project.wall.sections;
    if (id !== null && id !== undefined && sections.some((s) => Object.is(s.id, id))) return id;
    return sections.length ? sections[0].id : null;
  }

  /**
   * Ends the open sessions: a drag is cancelled; a field session is committed (navigation, other edits) or cancelled
   * (undo / redo).
   * @param {boolean} cancel
   */
  #endSessions(cancel) {
    if (this.#drag) this.cancelDrag();
    if (this.#field) {
      if (cancel) this.cancelField(this.#field.sectionId);
      else this.#finishField();
    }
  }

  /** Commits the open field session at its current (previewed) value. */
  #finishField() {
    const f = this.#field;
    this.#field = null;
    const section = f ? this.#section(f.sectionId) : null;
    if (!section || section.uvTransform.equals(f.before)) return;
    this.#emitTransform(section, 'field', false);
    this.#recordTransforms(`UV ${FIELD_LABELS[f.field]} (${section.name})`, [section], [f.before],
      { coalesceKey: `uv:${section.id}:${f.field}` });
  }

  /**
   * One button or key edit: derive the new transform, write it live, record one entry iff it changed.
   * @param {*} sectionId
   * @param {string} label
   * @param {string} source
   * @param {(t: UvTransform, W: number, H: number, s: object) => UvTransform} fn
   * @param {{coalesceKey?: string}} [options]
   */
  #oneShot(sectionId, label, source, fn, options = {}) {
    const section = this.#section(sectionId);
    if (!section || !validCounts(section)) return;
    this.#endSessions(false);
    const before = section.uvTransform.clone();
    const { W, H } = dims(section);
    const t = fn(before.clone(), W, H, section);
    if (t.equals(before)) return;
    this.#applyLive(section, t, source, false);
    this.#recordTransforms(`${label} (${section.name})`, [section], [before], options);
  }

  /**
   * The live path of 04 6.12: domain write, one plan against the cached layout and atlas, in-place UVs (a no-op for
   * LED-mask content), UV_TRANSFORM_CHANGED, a coalesced viewer refresh. Never rebuilds.
   */
  #applyLive(section, t, source, live) {
    section.setUvTransform(t);
    const cache = this.#cache;
    const i = cache ? cache.layout.sections.findIndex((sl) => sl.section === section) : -1;
    if (i >= 0) {
      const project = this.#project;
      const plan = planSectionUv(cache.layout.sections[i], i, {
        atlas: cache.atlas, settings: project.uv, meshMode: project.meshMode,
        applyTransforms: !isLedMaskContent(project.display.content),
      });
      cache.plans[i] = plan;
      this.#view.updateSectionUvs(section.id, plan);
    }
    this.#emitTransform(section, source, live);
    this.#scheduleRefresh();
  }

  /** Emits UV_TRANSFORM_CHANGED for a section's current transform. */
  #emitTransform(section, source, live) {
    const { W, H } = dims(section);
    const t = section.uvTransform;
    this.#bus.emit(Events.UV_TRANSFORM_CHANGED, { sectionId: section.id, transform: { ...t }, summary: t.summaryFor(W, H), source, live });
  }

  /** Records one transform entry (the sections' given before-states and current after-states). */
  #recordTransforms(label, sections, befores, options = {}) {
    this.#history.record(label, {
      kind: 'transforms',
      before: sections.map((s, k) => ({ id: s.id, t: befores[k].clone() })),
      after: sections.map((s) => ({ id: s.id, t: s.uvTransform.clone() })),
    }, options);
    this.#scheduleRefresh();
  }

  /** Applies one side of a history entry. */
  #applyEntry(e, side) {
    if (e.kind === 'settings') {
      this.#applySetting(e.key, e[side]);
      return;
    }
    for (const { id, t } of e[side]) {
      const section = this.#section(id);
      if (section) this.#applyLive(section, t, 'history', false);
    }
  }

  /** A settings change: one entry, then the setting (04 5.3). */
  #changeSetting(key, value) {
    const before = this.#project.uv[key];
    if (before === value) return;
    this.#endSessions(false);
    this.#history.record(`${SETTING_LABELS[key]}: ${value === true ? 'on' : value === false ? 'off' : value}`,
      { kind: 'settings', key, before, after: value });
    this.#applySetting(key, value);
  }

  /**
   * Writes one setting, emits UV_SETTINGS_CHANGED, then rebuilds iff the active mesh mode uses it (the combined layout
   * in Combined mode, the panel UVs in Panel mode; the glTF option is export-only).
   */
  #applySetting(key, value) {
    const project = this.#project;
    project.uv.assign({ [key]: value });
    this.#emitSettings();
    const mode = project.meshMode;
    if ((key === 'combinedLayout' && mode === 'combined') || (key === 'panelUvs' && mode === 'panel')) {
      this.#wallController.rebuild();
    } else {
      this.#scheduleRefresh();
    }
  }

  /** UV_SETTINGS_CHANGED with the sidebar's atlas note values (04 3.3, 5.4). */
  #emitSettings() {
    const uv = this.#project.uv;
    const cache = this.#cache;
    let atlas = null;
    let sectionTextures = null;
    if (cache) {
      const a = cache.atlas;
      const pngWidth = a.totalLedX * a.pxPerLed;
      const pngHeight = a.totalLedY * a.pxPerLed;
      const maxTextureSize = this.#maxTextureSize();
      atlas = {
        widthLed: a.totalLedX, heightLed: a.totalLedY, pngPxPerLed: a.pxPerLed, pngWidth, pngHeight,
        overTexture: uv.combinedLayout === 'atlas' && Math.max(pngWidth, pngHeight) > maxTextureSize,
        fitsCanvas: canvasFits(pngWidth, pngHeight), maxTextureSize,
        larger4K: (a.totalLedX > 3840 || a.totalLedY > 2160) && (a.totalLedX > 2160 || a.totalLedY > 3840),
      };
      if (cache.sectionScale) sectionTextures = { reduced: cache.sectionScale.reduced, pxPerLed: cache.sectionScale.pxPerLed };
    }
    this.#bus.emit(Events.UV_SETTINGS_CHANGED, {
      combinedLayout: uv.combinedLayout, panelUvs: uv.panelUvs, gltfAtlasTexcoord1: uv.gltfAtlasTexcoord1, atlas, sectionTextures,
    });
  }

  /** The readout of one base UV of layout section i (PixelMap.describeHit with the export plan, plus the view UV). */
  #describe(i, baseU, baseV) {
    const { layout, atlas } = this.#cache;
    const project = this.#project;
    const sl = layout.sections[i];
    const plan = planSectionUv(sl, i, { atlas, settings: project.uv, meshMode: project.meshMode, applyTransforms: true });
    const entry = atlas.entries[i];
    const d = describeHit({ sl, startCol: entry.startCol, atlas, entry, plan, baseU, baseV });
    const t = sl.section.uvTransform;
    const [viewU, viewV] = applyUv(t, d.W, d.H, baseU, baseV);
    return { ...d, ledX: sl.section.ledX, ledY: sl.section.ledY, viewU, viewV };
  }

  /** Publishes a hover readout unless it equals the last one. */
  #publishHover(source, hit, corners) {
    const key = hit ? `${source}|${String(hit.sectionId)}|${hit.px}|${hit.pyTop}|${hit.finalU}|${hit.finalV}|${hit.viewU}|${hit.viewV}`
      : `${source}|-`;
    if (key === this.#hoverKey) return;
    this.#hoverKey = key;
    this.#viewModel.publishHover(source, hit, corners);
  }

  /** One viewer refresh per animation frame at most (live edits). */
  #scheduleRefresh() {
    if (this.#refreshPending || !this.#viewModel.open) return;
    this.#refreshPending = true;
    this.#raf(() => {
      this.#refreshPending = false;
      this.#refresh(false);
    });
  }

  /** Recomputes the viewer data now (no-op before the first rebuild or while closed). */
  #refresh(backgroundDirty) {
    this.#viewModel.refresh(this.#cache, { backgroundDirty, history: this.#history.snapshot() });
  }
}
