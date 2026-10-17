/**
 * @module ui/PivotPanel
 * The "Wall Pivot" section of the control panel (Feature 3, docs/improvements/03-pivot.md 3.2, 3.6, 5.3): the pivot-mode
 * radio cards, the offset inputs, Reset offset, Select pivot (O), the Ctrl-drag snap step, the keep-stage-layout and
 * marker toggles (commands down to PivotController), and the readout and status mirrors (events up). The pivot is
 * session-only until project file v2 (the owner's decision of 2026-10-17); the panel says so.
 * Every mirror is a pure function of the payload it receives (R3: idempotent; the panel keeps no event history), so
 * delivering any payload twice gives the same DOM.
 * Owns #pivot-mode-select (its .pivot-mode-option labels and pivot-mode radios), #pivot-offset-x/y/z,
 * #pivot-reset-offset, #pivot-select, #pivot-snap, #toggle-pivot-keep-stage, #toggle-pivot-marker, #pivot-readout and
 * #pivot-status.
 * Legacy source: none (new panel).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

import { Events } from '../core/EventBus.js';
import { PIVOT_MODES } from '../domain/Wall.js';
import { byId } from './dom.js';

/** A pivot more than this far from its anchor (metres) turns the readout into a warning (03 3.6). */
export const PIVOT_WARNING_DISTANCE_M = 50;

/** The offset axes, in input order. */
const AXES = Object.freeze(['x', 'y', 'z']);

/**
 * A signed metre value for the status line: '+1.250', '-2.000', and '0.000' for a zero (03 3.2's example "Stage origin
 * moved +1.250, 0.000 m"; 3.6's `dx >= 0 ? '+' : ''` would print '+0.000', so the sign is written for v > 0 only).
 * Side effects: none.
 * @param {number} v
 * @returns {string}
 */
const signed = (v) => `${v > 0 ? '+' : ''}${v.toFixed(3)}`;

/**
 * The readout line of a resolution (03 3.2, 3.6): the pivot point in the LAYOUT frame, or the empty-wall and
 * non-finite-layout texts, and whether the pivot is far from its anchor (the .pivot-warning line).
 * Side effects: none.
 * @param {import('../geometry/WallLayout.js').PivotResolution|null} resolution
 * @param {number} sectionCount  the wall's section count (0: the empty wall, reachable only before the B-L8 validator)
 * @returns {{text: string, warning: boolean}}
 */
export function pivotReadoutText(resolution, sectionCount) {
  if (!resolution) return { text: 'Pivot unavailable · invalid section values', warning: false };
  const p = resolution.point;
  const coords = `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)} m`;
  if (sectionCount === 0) return { text: `No wall sections · pivot at offset ${coords}`, warning: false };
  const o = resolution.offset;
  const d = Math.hypot(o.x, o.y, o.z);
  const text = `Pivot (from wall start): ${coords}`;
  return d > PIVOT_WARNING_DISTANCE_M
    ? { text: `${text} · Pivot is ${d.toFixed(1)} m from the anchor`, warning: true }
    : { text, warning: false };
}

/**
 * The status text of a WALL_PIVOT_CHANGED payload (03 3.6, 5.3), or null when the status must stay as it is.
 * Side effects: none.
 * @param {{source: string, resolution: object|null, stageShift: {x: number, z: number}, reexpressed: boolean}} payload
 * @returns {string|null}
 */
export function pivotStatusText({ source, resolution, stageShift, reexpressed }) {
  switch (source) {
    case 'mode':
    case 'offset':
    case 'reset-offset':
    case 'gizmo':
      if (stageShift.x !== 0 || stageShift.z !== 0) {
        return `Stage origin moved ${signed(stageShift.x)}, ${signed(stageShift.z)} m · camera and props kept their `
          + (reexpressed ? 'place' : 'coordinates');
      }
      return resolution ? `Pivot height ${resolution.point.y.toFixed(3)} m · affects exports only` : '';
    case 'import':
      return '';
    default:   // 'keep-stage', 'marker': the status is left unchanged
      return null;
  }
}

/**
 * The status text of a WALL_REBUILT payload (03 3.6, 5.3), or null when the status must stay as it is.
 * Side effects: none.
 * @param {{cause?: string, stageShift?: {x: number, z: number}}} payload
 * @returns {string|null}
 */
export function rebuildStatusText({ cause, stageShift }) {
  if (cause === 'init' || cause === 'import') return '';
  if (cause === 'edit') {
    const s = stageShift ?? { x: 0, z: 0 };
    return s.x !== 0 || s.z !== 0
      ? `Wall edit moved the stage origin by ${signed(s.x)}, ${signed(s.z)} m (relative to the wall start) · camera and props kept their coordinates`
      : '';
  }
  return null;   // 'pivot': the WALL_PIVOT_CHANGED of the same commit already wrote it
}

/**
 * The Wall Pivot panel. One instance, constructed by App with the other panels (the constructor subscribes the
 * mirrors); bind() in the setupUI phase, right after the display panel (the sidebar order).
 */
export class PivotPanel {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../app/PivotController.js').PivotController} */
  #pivotController;
  /** @type {HTMLInputElement[]} the three pivot-mode radios, in PIVOT_MODES order */
  #radios;
  /** @type {Record<'x'|'y'|'z', HTMLInputElement>} */
  #offsets;
  /** @type {HTMLButtonElement} */ #reset;
  /** @type {HTMLButtonElement} */ #select;
  /** @type {HTMLSelectElement} */ #snap;
  /** @type {HTMLElement} */ #keep;
  /** @type {HTMLElement} */ #marker;
  /** @type {HTMLElement} */ #readout;
  /** @type {HTMLElement} */ #status;

  /**
   * Stores the collaborators, looks up the owned elements and subscribes the mirrors:
   *  WALL_PIVOT_CHANGED -> radios, offsets, reset state, toggles, readout; status = pivotStatusText(payload) unless null
   *  WALL_REBUILT       -> readout from layout.pivot.resolution; status = rebuildStatusText(payload) unless null
   *  SELECTION_CHANGED  -> #pivot-select .active and aria-pressed
   * Side effects: DOM lookups (no mutation); three bus subscriptions.
   * @param {{doc: Document, project: import('../domain/Project.js').Project,
   *          pivotController: import('../app/PivotController.js').PivotController,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ doc, project, pivotController, bus }) {
    this.#project = project;
    this.#pivotController = pivotController;
    const group = byId(doc, 'pivot-mode-select');
    this.#radios = PIVOT_MODES.map((mode) => group.querySelector(`input[name="pivot-mode"][value="${mode}"]`));
    this.#offsets = { x: byId(doc, 'pivot-offset-x'), y: byId(doc, 'pivot-offset-y'), z: byId(doc, 'pivot-offset-z') };
    this.#reset = byId(doc, 'pivot-reset-offset');
    this.#select = byId(doc, 'pivot-select');
    this.#snap = byId(doc, 'pivot-snap');
    this.#keep = byId(doc, 'toggle-pivot-keep-stage');
    this.#marker = byId(doc, 'toggle-pivot-marker');
    this.#readout = byId(doc, 'pivot-readout');
    this.#status = byId(doc, 'pivot-status');

    bus.on(Events.WALL_PIVOT_CHANGED, (payload) => this.#mirrorPivot(payload));
    bus.on(Events.WALL_REBUILT, (payload) => this.#mirrorRebuilt(payload));
    bus.on(Events.SELECTION_CHANGED, ({ id }) => this.#mirrorSelection(id === pivotController.id));
  }

  /**
   * The panel listeners: each radio's `change` (never a label click, B-L13) -> setMode; each offset's `change` ->
   * setOffsetAxis and the write-back toFixed(3) (a rejected entry reverts to the stored value); Reset offset; Select
   * pivot -> toggleSelect; the snap select -> setSnapStep(Number(value)); each toggle's click and its Space / Enter
   * keydown (role="switch", B-L36) -> setKeepStageLayout / setMarkerVisible with the negated model value (the mirror
   * writes the class and aria-checked).
   * Side effects: adds 3 + 3 + 1 + 1 + 1 + 4 listeners.
   * @returns {void}
   */
  bind() {
    const controller = this.#pivotController;
    for (const radio of this.#radios) {
      radio.addEventListener('change', () => {
        if (radio.checked) controller.setMode(radio.value);
      });
    }
    for (const axis of AXES) {
      const input = this.#offsets[axis];
      input.addEventListener('change', () => {
        input.value = controller.setOffsetAxis(axis, input.value).toFixed(3);
      });
    }
    this.#reset.addEventListener('click', () => controller.resetOffset());
    this.#select.addEventListener('click', () => controller.toggleSelect());
    const snap = this.#snap;
    snap.addEventListener('change', () => controller.setSnapStep(Number(snap.value)));
    this.#bindSwitch(this.#keep, () => controller.setKeepStageLayout(!controller.pivot.keepStageLayout));
    this.#bindSwitch(this.#marker, () => controller.setMarkerVisible(!this.#project.display.showPivotMarker));
  }

  /**
   * A role="switch" toggle: click, and Space or Enter while focused (the default Space scroll is prevented).
   * @param {HTMLElement} el
   * @param {() => void} flip
   */
  #bindSwitch(el, flip) {
    el.addEventListener('click', flip);
    el.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      flip();
    });
  }

  /**
   * WALL_PIVOT_CHANGED mirror: the radios (checked and the label's .active), the offsets (toFixed(3)), the Reset state,
   * the two toggles, the readout and (for the sources that set it) the status.
   * @param {{source: string, pivot: {mode: string, offset: {x: number, y: number, z: number}, keepStageLayout: boolean},
   *          resolution: object|null, stageShift: {x: number, z: number}, reexpressed: boolean}} payload
   */
  #mirrorPivot(payload) {
    const { pivot } = payload;
    for (const radio of this.#radios) {
      const on = radio.value === pivot.mode;
      radio.checked = on;
      radio.closest('.pivot-mode-option').classList.toggle('active', on);
    }
    for (const axis of AXES) this.#offsets[axis].value = pivot.offset[axis].toFixed(3);
    this.#reset.disabled = pivot.offset.x === 0 && pivot.offset.y === 0 && pivot.offset.z === 0;
    this.#setSwitch(this.#keep, pivot.keepStageLayout);
    this.#setSwitch(this.#marker, this.#project.display.showPivotMarker === true);
    this.#writeReadout(payload.resolution);
    const status = pivotStatusText(payload);
    if (status !== null) this.#status.textContent = status;
  }

  /**
   * WALL_REBUILT mirror: the readout (section edits move the anchor) and the status by cause (03 5.3).
   * @param {{layout?: {pivot?: {resolution: object|null}}, cause?: string, stageShift?: {x: number, z: number}}} payload
   */
  #mirrorRebuilt(payload) {
    this.#writeReadout(payload.layout?.pivot?.resolution ?? null);
    const status = rebuildStatusText(payload);
    if (status !== null) this.#status.textContent = status;
  }

  /**
   * SELECTION_CHANGED mirror: #pivot-select shows whether the pivot is selected.
   * @param {boolean} selected
   */
  #mirrorSelection(selected) {
    this.#select.classList.toggle('active', selected);
    this.#select.setAttribute('aria-pressed', String(selected));
  }

  /** @param {object|null} resolution */
  #writeReadout(resolution) {
    const { text, warning } = pivotReadoutText(resolution, this.#project.wall.count);
    this.#readout.textContent = text;
    this.#readout.classList.toggle('pivot-warning', warning);
  }

  /**
   * @param {HTMLElement} el  a .toggle with role="switch"
   * @param {boolean} on
   */
  #setSwitch(el, on) {
    el.classList.toggle('active', on);
    el.setAttribute('aria-checked', String(on));
  }
}
