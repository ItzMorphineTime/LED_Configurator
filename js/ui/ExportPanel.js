/**
 * @module ui/ExportPanel
 * The Export section of the control panel: the five export buttons, the Import JSON button and its hidden file
 * input. Commands go down to ProjectIO; this panel mirrors no events.
 * Owns #export-zip, #export-panel-ids, #export-json, #export-obj, #export-gltf, #import-json, #import-input.
 * Legacy source: index.html@cd3fd3f 4481-4488 (export/import listeners in setupUI).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { byId } from './dom.js';

/** Binds the export buttons and the JSON import input. */
export class ExportPanel {
  /** @type {import('../app/ProjectIO.js').ProjectIO} */
  #projectIO;
  /** @type {HTMLElement} */ #exportZip;
  /** @type {HTMLElement} */ #exportPanelIds;
  /** @type {HTMLElement} */ #exportJson;
  /** @type {HTMLElement} */ #exportObj;
  /** @type {HTMLElement} */ #exportGltf;
  /** @type {HTMLElement} */ #importJson;
  /** @type {HTMLInputElement} */ #importInput;

  /**
   * Stores the collaborator and looks up the owned elements (no mutation, no listeners).
   * Side effects: DOM lookups only.
   * @param {{doc: Document, projectIO: import('../app/ProjectIO.js').ProjectIO}} deps
   */
  constructor({ doc, projectIO }) {
    this.#projectIO = projectIO;

    this.#exportZip = byId(doc, 'export-zip');
    this.#exportPanelIds = byId(doc, 'export-panel-ids');
    this.#exportJson = byId(doc, 'export-json');
    this.#exportObj = byId(doc, 'export-obj');
    this.#exportGltf = byId(doc, 'export-gltf');
    this.#importJson = byId(doc, 'import-json');
    this.#importInput = byId(doc, 'import-input');
  }

  /**
   * Adds the listeners in legacy order: export-zip -> projectIO.exportZIP(); export-panel-ids ->
   * exportPanelIds(); export-json -> exportJSON(); export-obj -> exportOBJ(); export-gltf -> exportGLTF();
   * #import-json click -> #import-input.click(); #import-input change -> projectIO.importFromInputEvent(e).
   * The listeners return the promise of the async exports, so a rejection stays unhandled, as legacy.
   * Ports: index.html@cd3fd3f lines 4482-4488.
   * Side effects: adds 6 click listeners and 1 change listener.
   */
  bind() {
    const projectIO = this.#projectIO;
    this.#exportZip.addEventListener('click', () => projectIO.exportZIP());
    this.#exportPanelIds.addEventListener('click', () => projectIO.exportPanelIds());
    this.#exportJson.addEventListener('click', () => projectIO.exportJSON());
    this.#exportObj.addEventListener('click', () => projectIO.exportOBJ());
    this.#exportGltf.addEventListener('click', () => projectIO.exportGLTF());
    this.#importJson.addEventListener('click', () => this.#importInput.click());
    this.#importInput.addEventListener('change', (e) => projectIO.importFromInputEvent(e));
  }
}
