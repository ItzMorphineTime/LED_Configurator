/**
 * @module app/ProjectIO
 * The export and import use cases (JSON, OBJ + MTL, glTF, panel-ID PNG, ZIP bundle, safe-distance OBJ, JSON
 * import) and the Downloader, the single owner of the legacy anchor-download sequence. Every export reads the
 * live project and a fresh layout (WallController.layout()); only the safe-distance OBJ reads a scene group.
 * Sync/async shape is legacy (R13): exportZIP and exportPanelIds stay async. Every export runs inside
 * #runExport (08 P2-1a, B-H3), which reports a failure as the M-EXP-1 alert instead of an uncaught exception or an
 * unhandled rejection; its try/catch and the legacy one around the import parse are the only ones (R13 amendment).
 * Legacy source: index.html@cd3fd3f 2786-2827 (exportSafeDistanceOBJ), 4491-4554 (exportZIP), 4911-4924
 * (exportOBJ, exportGLTF), 4926-4940 (exportPanelIds), 4942-4965 (exportJSON), 4967-5010 (importJSON),
 * 5082-5091 (downloadFile).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

import { computeAtlas } from '../geometry/TextureAtlas.js';
import { zipTextureFileName } from '../geometry/PanelNaming.js';
import { Strategies } from '../legacy/LegacyCompat.js';

/**
 * The dialogs facade (ui/dom.js createDialogs).
 * @typedef {{alert(msg: string): void}} Dialogs
 */

/**
 * The brand strings ProjectIO uses (Theme.Brand): every download file name.
 * @typedef {{files: {json: string, obj: string, mtl: string, gltf: string, zip: string, panelIdsPng: string,
 *            safeDistanceObj: string}}} IoBrand
 */

/** The single anchor-download sequence (legacy 5082-5091 == 4547-4553 == 4932-4938). */
export class Downloader {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;

  /**
   * Side effects: none.
   * @param {{doc: Document, win: Window}} deps  win: setTimeout for the deferred revoke
   */
  constructor({ doc, win }) {
    this.#doc = doc;
    this.#win = win;
  }

  /**
   * Downloads a Blob through a temporary anchor. `URL` is looked up at call time. The object URL is revoked in a
   * win.setTimeout(..., 0) after click() (08 P2-1a; legacy revoked it synchronously, which works in Chrome but
   * may cancel the download in other browsers).
   * Ports: index.html@cd3fd3f lines 5084-5090 (== 4547-4553 == 4932-4938).
   * Side effects: creates, appends, clicks and removes an <a>; creates an object URL; one timer that revokes it.
   * @param {Blob} blob
   * @param {string} filename
   * @throws {TypeError} from URL.createObjectURL for a null blob (B-L4, tagged at ProjectIO.exportPanelIds)
   */
  saveBlob(blob, filename) {
    const a = this.#doc.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = filename;
    this.#doc.body.appendChild(a);
    a.click();
    this.#doc.body.removeChild(a);
    this.#win.setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  /**
   * Downloads text as a file (legacy downloadFile). The Blob is created before the anchor, as legacy.
   * Ports: index.html@cd3fd3f lines 5082-5091.
   * Side effects: see saveBlob.
   * @param {string} content
   * @param {string} filename
   * @param {string} mimeType
   */
  saveText(content, filename, mimeType) {
    this.saveBlob(new Blob([content], { type: mimeType }), filename);
  }
}

/** Export and import use cases. */
export class ProjectIO {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('./WallController.js').WallController} */
  #wallController;
  /** @type {import('../io/ProjectSerializer.js').ProjectSerializer} */
  #serializer;
  /** @type {import('../io/ObjExporter.js').ObjExporter} */
  #objExporter;
  /** @type {import('../io/GltfExporter.js').GltfExporter} */
  #gltfExporter;
  /** @type {import('../render/textures/PanelIdRenderer.js').PanelIdRenderer} */
  #panelIds;
  /** @type {import('../render/SafeDistanceView.js').SafeDistanceView} */
  #safeDistance;
  /** @type {Downloader} */
  #downloader;
  /** @type {new () => object} the JSZip constructor (vendor/jszip.js, injected by App) */
  #JSZip;
  /** @type {Dialogs} */
  #dialogs;
  /** @type {IoBrand} */
  #brand;
  /** @type {Window} */
  #win;

  /**
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          wallController: import('./WallController.js').WallController,
   *          serializer: import('../io/ProjectSerializer.js').ProjectSerializer,
   *          objExporter: import('../io/ObjExporter.js').ObjExporter,
   *          gltfExporter: import('../io/GltfExporter.js').GltfExporter,
   *          panelIds: import('../render/textures/PanelIdRenderer.js').PanelIdRenderer,
   *          safeDistance: import('../render/SafeDistanceView.js').SafeDistanceView,
   *          downloader: Downloader, JSZip: new () => object, dialogs: Dialogs, brand: IoBrand,
   *          win: Window}} deps
   */
  constructor({ project, wallController, serializer, objExporter, gltfExporter, panelIds, safeDistance, downloader,
    JSZip, dialogs, brand, win }) {
    this.#project = project;
    this.#wallController = wallController;
    this.#serializer = serializer;
    this.#objExporter = objExporter;
    this.#gltfExporter = gltfExporter;
    this.#panelIds = panelIds;
    this.#safeDistance = safeDistance;
    this.#downloader = downloader;
    this.#JSZip = JSZip;
    this.#dialogs = dialogs;
    this.#brand = brand;
    this.#win = win;
  }

  /**
   * Export JSON: the 'file' document, pretty-printed with 2 spaces.
   * Ports: index.html@cd3fd3f lines 4942-4965.
   * Side effects: one download (brand.files.json, application/json), or the M-EXP-1 alert (#runExport).
   */
  exportJSON() {
    this.#runExport('Export JSON', () => {
      const exportData = this.#serializer.write(this.#project, { variant: 'file' });
      this.#downloader.saveText(JSON.stringify(exportData, null, 2), this.#brand.files.json, 'application/json');
    });
  }

  /**
   * Export OBJ: the OBJ now, the MTL as a second download after Strategies.mtlDownloadDelayMs.
   * Ports: index.html@cd3fd3f lines 4911-4917.
   * Side effects: one download now (brand.files.obj), one timer that downloads brand.files.mtl; or the M-EXP-1
   * alert (#runExport; for example the TypeError of combined mode on an empty wall).
   */
  exportOBJ() {
    this.#runExport('Export OBJ', () => {
      const layout = this.#wallController.layout();
      const { objContent, mtlContent } = this.#objExporter.write({
        sections: this.#project.wall.sections, meshMode: this.#project.meshMode, layout,
      });
      this.#downloader.saveText(objContent, this.#brand.files.obj, 'text/plain');
      // LEGACY(B-L7): the MTL is a second download fired 100 ms later (browsers may block it as a multiple
      // download), and the textures its map_Kd lines reference are never delivered.
      this.#win.setTimeout(() => this.#downloader.saveText(mtlContent, this.#brand.files.mtl, 'text/plain'),
        Strategies.mtlDownloadDelayMs);
    });
  }

  /**
   * Export glTF: the document pretty-printed with 2 spaces (any size since 08 P2-1a: the chunked encoder).
   * Ports: index.html@cd3fd3f lines 4919-4924.
   * Side effects: one download (brand.files.gltf, application/json), or the M-EXP-1 alert (#runExport).
   */
  exportGLTF() {
    this.#runExport('Export glTF', () => {
      const layout = this.#wallController.layout();
      const gltfContent = this.#gltfExporter.write({
        sections: this.#project.wall.sections, meshMode: this.#project.meshMode, layout,
      });
      this.#downloader.saveText(JSON.stringify(gltfContent, null, 2), this.#brand.files.gltf, 'application/json');
    });
  }

  /**
   * Export Panel IDs: the combined atlas canvas as PNG. Stays async; the toBlob callback is awaited (08 P2-1a), so
   * an error of the download step is reported by #runExport like any other.
   * Ports: index.html@cd3fd3f lines 4926-4940.
   * Side effects: draws a canvas; one download (brand.files.panelIdsPng) when toBlob calls back, or the M-EXP-1
   * alert.
   * @returns {Promise<void>} never rejects
   */
  async exportPanelIds() {
    await this.#runExport('Export Panel IDs', async () => {
      const combinedCanvas = this.#panelIds.atlasCanvas(this.#project.wall.sections);
      // LEGACY(B-L4): no canvas-size guard: past the browser canvas limit toBlob yields null and
      // URL.createObjectURL(null) throws (since 08 P2-1a reported as the M-EXP-1 alert).
      const blob = await new Promise((resolve) => combinedCanvas.toBlob(resolve, 'image/png'));
      this.#downloader.saveBlob(blob, this.#brand.files.panelIdsPng);
    });
  }

  /**
   * Export All (ZIP), in the legacy order: JSON ('zip' variant) -> layout -> OBJ + MTL -> glTF -> textures
   * folder -> one panel-ID PNG per section -> generateAsync -> download. The start columns come from
   * computeAtlas before the texture loop (PR7c).
   * Ports: index.html@cd3fd3f lines 4491-4554.
   * Side effects: draws one canvas per section; one download (brand.files.zip) after the archive is generated, or
   * the M-EXP-1 alert (#runExport; for example `name.replace is not a function` for a numeric imported name).
   * @returns {Promise<void>} never rejects (08 P2-1a; legacy rejected unhandled)
   */
  async exportZIP() {
    await this.#runExport('Export All (ZIP)', () => this.#writeZip());
  }

  /**
   * The body of exportZIP (legacy 4491-4554).
   * @returns {Promise<void>}
   */
  async #writeZip() {
    const JSZip = this.#JSZip;
    const zip = new JSZip();
    const brand = this.#brand;
    const project = this.#project;
    const sections = project.wall.sections;

    const jsonData = this.#serializer.write(project, { variant: 'zip' });
    zip.file(brand.files.json, JSON.stringify(jsonData, null, 2));

    const layout = this.#wallController.layout();
    const { objContent, mtlContent } = this.#objExporter.write({ sections, meshMode: project.meshMode, layout });
    zip.file(brand.files.obj, objContent);
    zip.file(brand.files.mtl, mtlContent);

    const gltfContent = this.#gltfExporter.write({ sections, meshMode: project.meshMode, layout });
    zip.file(brand.files.gltf, JSON.stringify(gltfContent, null, 2));

    const texturesFolder = zip.folder('textures');
    const atlas = computeAtlas(sections);
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const canvas = this.#panelIds.sectionCanvas(section, i, null, atlas.entries[i].startCol);
      // LEGACY(B-L4): no canvas-size guard: an oversized canvas yields `data:,`, i.e. a silent 0-byte PNG.
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      // LEGACY(B-L14): duplicate (or equally sanitised) section names give the same path, and JSZip silently
      // replaces the earlier texture.
      const filename = zipTextureFileName(section, i);
      texturesFolder.file(filename, base64Data, { base64: true });
    }

    const content = await zip.generateAsync({ type: 'blob' });
    this.#downloader.saveBlob(content, brand.files.zip);
  }

  /**
   * Export Safe Distance OBJ: alerts when there is no safe-distance group; otherwise builds the text and Blob
   * and downloads it (B-M1 fixed in 08 P2-5a: legacy called a download helper that was never defined, so every
   * click threw a ReferenceError). The band keeps its legacy per-column geometry until 08 P2-5b.
   * Ports: index.html@cd3fd3f lines 2786-2827 (the download call of 2826 is the Downloader's).
   * Side effects: an alert, or one download (brand.files.safeDistanceObj, text/plain), or the M-EXP-1 alert.
   */
  exportSafeDistanceOBJ() {
    this.#runExport('Export Safe Distance OBJ', () => {
      const safeDistanceMesh = this.#safeDistance.object3D;
      if (!safeDistanceMesh) {
        this.#dialogs.alert('Enable Safe Distance 3D visualization first');
        return;
      }

      const objContent = this.#objExporter.writeSafeDistance(safeDistanceMesh);

      const blob = new Blob([objContent], { type: 'text/plain' });
      this.#downloader.saveBlob(blob, this.#brand.files.safeDistanceObj);
    });
  }

  /**
   * Runs one export and reports its failure instead of letting it escape (08 P2-1a, B-H3; 08 3.3 M-EXP-1): a
   * synchronous throw, or the rejection of the promise `fn` returns, becomes the alert
   * `${label} failed: ${message}. No file was downloaded.` followed by win.console.warn(err). This try/catch is the
   * sanctioned exception to R13 (ARCHITECTURE.md 1.6). Errors of timers the export starts (the MTL download of
   * Export OBJ) are not covered.
   * Side effects: those of fn; on failure one alert and one console warning.
   * @template T
   * @param {string} label  the export's button label: 'Export JSON' | 'Export OBJ' | 'Export glTF' |
   *   'Export Panel IDs' | 'Export All (ZIP)' | 'Export Safe Distance OBJ'
   * @param {() => T} fn
   * @returns {T|Promise<*>|undefined} fn's value (a returned promise is chained so that it never rejects), or
   *   undefined after a synchronous failure
   */
  #runExport(label, fn) {
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result.then(undefined, (err) => this.#exportFailed(label, err));
      }
      return result;
    } catch (err) {
      this.#exportFailed(label, err);
      return undefined;
    }
  }

  /**
   * The M-EXP-1 report of #runExport (the exact text of 08 3.3).
   * Side effects: one alert, then one win.console.warn(err).
   * @param {string} label
   * @param {*} err  usually an Error; anything else is reported through String(err)
   */
  #exportFailed(label, err) {
    const message = err !== null && typeof err === 'object' && 'message' in err ? err.message : String(err);
    this.#dialogs.alert(`${label} failed: ${message}. No file was downloaded.`);
    this.#win.console.warn(err);
  }

  /**
   * P-IMPORT (ARCHITECTURE.md 6.10): reads the chosen file as text; on load parses it, reads it as v1 and
   * applies it. Only the parse + read + apply step is inside the legacy try/catch; any error becomes the legacy
   * alert. The input is reset synchronously so the same file can be chosen again. Logos are neither reset nor
   * re-rendered (B-L21, tagged at WallController.applyImport).
   * Ports: index.html@cd3fd3f lines 4967-5010.
   * Side effects: starts a FileReader; resets the input's value; later (on load) the wall import pipeline or
   * an alert.
   * @param {Event} e  the #import-input change event
   */
  importFromInputEvent(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const parsed = this.#serializer.read(data);
        if (parsed) this.#wallController.applyImport(parsed);
      } catch (err) {
        this.#dialogs.alert('Error parsing JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  }
}
