/**
 * @module ui/ViewportToolbar
 * The viewport toolbar: view presets, grid button, gizmo mode/space/pilot buttons (commands down), and the
 * mirrors of the selection badge, gizmo buttons and pilot banner (events up).
 * Owns #view-front, #view-side, #view-top, #view-reset, #toggle-grid, #gizmo-translate, #gizmo-rotate,
 * #gizmo-space, #gizmo-pilot, #selection-indicator (and its .selected-name) and #pilot-info.
 * 03 T5 (3.3, 5.4): the badge suffix " (translate only)" while a target that supports no rotate mode (the pivot) is
 * selected in rotate mode, from the cached SELECTION_CHANGED.modes (never gizmo.target).
 * Legacy source: index.html@cd3fd3f 3155-3167 (updateSelectionIndicator), 3176-3177 / 4428-4429 (mode
 * buttons), 3184-3188 (space button), 3484-3485 (pilot button and banner), 4394-4407 (button listeners).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { Events } from '../core/EventBus.js';
import { byId } from './dom.js';

/**
 * The viewport toolbar panel. Its buttons call OrbitController (view presets), SceneManager (grid),
 * TransformGizmo (mode, space) and PilotController (pilot toggle); its bus subscriptions mirror the selection
 * badge, the gizmo buttons and the pilot banner. Owns no legacy global, only its DOM elements.
 * Wiring (App): constructed with the other panels (the constructor subscribes the mirrors); bind() in the setupUI
 * phase (4394-4407).
 */
export class ViewportToolbar {
  /** @type {import('../interaction/OrbitController.js').OrbitController} */
  #orbit;
  /** @type {import('../render/SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('../interaction/TransformGizmo.js').TransformGizmo} */
  #gizmo;
  /** @type {import('../interaction/PilotController.js').PilotController} */
  #pilot;
  /** @type {HTMLElement} */ #viewFront;
  /** @type {HTMLElement} */ #viewSide;
  /** @type {HTMLElement} */ #viewTop;
  /** @type {HTMLElement} */ #viewReset;
  /** @type {HTMLElement} */ #toggleGrid;
  /** @type {HTMLElement} */ #gizmoTranslate;
  /** @type {HTMLElement} */ #gizmoRotate;
  /** @type {HTMLElement} */ #gizmoSpace;
  /** @type {HTMLElement} */ #gizmoPilot;
  /** @type {HTMLElement} */ #selectionIndicator;
  /** @type {HTMLElement} */ #pilotInfo;
  /** @type {{id: string|null, label: string|null, modes: string[]}} the last SELECTION_CHANGED payload (03 T5) */
  #selection = { id: null, label: null, modes: [] };
  /** @type {'translate'|'rotate'|null} the last GIZMO_MODE_CHANGED mode (03 T5) */
  #mode = null;

  /**
   * Stores the collaborators, looks up the owned elements and subscribes the four mirrors:
   *  SELECTION_CHANGED({id, label, modes}): id ? (add 'visible'; .selected-name = label || 'Unknown') : (remove 'visible'; 'None')
   *    (3155-3167); 03 T5: + ' (translate only)' while the gizmo mode is rotate and modes lacks 'rotate'
   *  GIZMO_MODE_CHANGED({mode}): #gizmo-translate.classList.toggle('active', mode === 'translate'); #gizmo-rotate likewise (3176-3177, 4428-4429);
   *    03 T5: the badge suffix is re-evaluated for a selected target whose modes lack 'rotate'
   *  GIZMO_SPACE_CHANGED({space}): text 'W' | 'L'; toggle 'world' / 'local'; title 'World Space (L to toggle)' | 'Local Space (L to toggle)' (3184-3188)
   *  PILOT_CHANGED({active}): #gizmo-pilot toggle 'active'; #pilot-info toggle 'visible' (3484-3485)
   * Side effects: DOM lookups (no mutation); four bus subscriptions.
   * @param {{doc: Document, orbit: import('../interaction/OrbitController.js').OrbitController,
   *          sceneManager: import('../render/SceneManager.js').SceneManager,
   *          gizmo: import('../interaction/TransformGizmo.js').TransformGizmo,
   *          pilot: import('../interaction/PilotController.js').PilotController,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ doc, orbit, sceneManager, gizmo, pilot, bus }) {
    this.#orbit = orbit;
    this.#sceneManager = sceneManager;
    this.#gizmo = gizmo;
    this.#pilot = pilot;

    this.#viewFront = byId(doc, 'view-front');
    this.#viewSide = byId(doc, 'view-side');
    this.#viewTop = byId(doc, 'view-top');
    this.#viewReset = byId(doc, 'view-reset');
    this.#toggleGrid = byId(doc, 'toggle-grid');
    this.#gizmoTranslate = byId(doc, 'gizmo-translate');
    this.#gizmoRotate = byId(doc, 'gizmo-rotate');
    this.#gizmoSpace = byId(doc, 'gizmo-space');
    this.#gizmoPilot = byId(doc, 'gizmo-pilot');
    this.#selectionIndicator = byId(doc, 'selection-indicator');
    this.#pilotInfo = byId(doc, 'pilot-info');

    bus.on(Events.SELECTION_CHANGED, (payload) => this.#mirrorSelection(payload));
    bus.on(Events.GIZMO_MODE_CHANGED, (payload) => this.#mirrorMode(payload));
    bus.on(Events.GIZMO_SPACE_CHANGED, (payload) => this.#mirrorSpace(payload));
    bus.on(Events.PILOT_CHANGED, (payload) => this.#mirrorPilot(payload));
  }

  /**
   * Adds the toolbar button listeners in legacy order: view presets, grid (the button's own 'active' class,
   * then sceneManager.toggleGrid(): the class and display.showGrid are independent, as legacy), gizmo
   * translate, rotate, space, pilot.
   * Ports: index.html@cd3fd3f lines 4394-4407.
   * Side effects: adds 9 click listeners.
   */
  bind() {
    this.#viewFront.addEventListener('click', () => this.#orbit.setView('front'));
    this.#viewSide.addEventListener('click', () => this.#orbit.setView('side'));
    this.#viewTop.addEventListener('click', () => this.#orbit.setView('top'));
    this.#viewReset.addEventListener('click', () => this.#orbit.setView('reset'));
    const toggleGrid = this.#toggleGrid;
    toggleGrid.addEventListener('click', () => {
      toggleGrid.classList.toggle('active');
      this.#sceneManager.toggleGrid();
    });

    // Gizmo controls
    this.#gizmoTranslate.addEventListener('click', () => this.#gizmo.setMode('translate'));
    this.#gizmoRotate.addEventListener('click', () => this.#gizmo.setMode('rotate'));
    this.#gizmoSpace.addEventListener('click', () => this.#gizmo.toggleSpace());
    this.#gizmoPilot.addEventListener('click', () => this.#pilot.toggle());
  }

  /**
   * SELECTION_CHANGED mirror: the selection badge (03 T5: with the translate-only suffix, see #badgeName).
   * Ports: index.html@cd3fd3f lines 3155-3167.
   * @param {{id: string|null, label: string|null, modes?: string[]}} payload
   */
  #mirrorSelection({ id, label, modes = ['translate', 'rotate'] }) {
    this.#selection = { id, label, modes };
    const indicator = this.#selectionIndicator;
    const nameSpan = indicator.querySelector('.selected-name');

    if (id) {
      indicator.classList.add('visible');
      nameSpan.textContent = this.#badgeName();
    } else {
      indicator.classList.remove('visible');
      nameSpan.textContent = 'None';
    }
  }

  /**
   * GIZMO_MODE_CHANGED mirror: the translate/rotate buttons; 03 T5: the badge name of a selected target that supports no
   * rotate mode (a legacy target's badge is never rewritten here).
   * Ports: index.html@cd3fd3f lines 3176-3177 (and 4428-4429 for mode null).
   * @param {{mode: 'translate'|'rotate'|null}} payload
   */
  #mirrorMode({ mode }) {
    this.#mode = mode;
    this.#gizmoTranslate.classList.toggle('active', mode === 'translate');
    this.#gizmoRotate.classList.toggle('active', mode === 'rotate');
    if (this.#selection.id && !this.#selection.modes.includes('rotate')) {
      this.#selectionIndicator.querySelector('.selected-name').textContent = this.#badgeName();
    }
  }

  /**
   * The badge name: label || 'Unknown', plus ' (translate only)' while the gizmo is in rotate mode and the selected target
   * does not support it (03 3.3: "Selected: Pivot (translate only)").
   * @returns {string}
   */
  #badgeName() {
    const { label, modes } = this.#selection;
    const name = label || 'Unknown';
    // 2026-10-31: a target without any gizmo mode (a wall section) gets no suffix
    return this.#mode === 'rotate' && modes.includes('translate') && !modes.includes('rotate') ? `${name} (translate only)` : name;
  }

  /**
   * GIZMO_SPACE_CHANGED mirror: the space button text, classes and title.
   * Ports: index.html@cd3fd3f lines 3184-3188.
   * @param {{space: 'world'|'local'}} payload
   */
  #mirrorSpace({ space }) {
    const btn = this.#gizmoSpace;
    btn.textContent = space === 'world' ? 'W' : 'L';
    btn.classList.toggle('world', space === 'world');
    btn.classList.toggle('local', space === 'local');
    btn.title = space === 'world' ? 'World Space (L to toggle)' : 'Local Space (L to toggle)';
  }

  /**
   * PILOT_CHANGED mirror: the pilot button and the pilot banner.
   * Ports: index.html@cd3fd3f lines 3484-3485.
   * @param {{active: boolean}} payload
   */
  #mirrorPilot({ active }) {
    this.#gizmoPilot.classList.toggle('active', active);
    this.#pilotInfo.classList.toggle('visible', active);
  }
}
