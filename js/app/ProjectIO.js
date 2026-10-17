/**
 * @module app/ProjectIO
 * The export and import use cases (JSON, OBJ + MTL, glTF, panel-ID PNG, ZIP bundle, safe-distance OBJ, JSON
 * import) and the Downloader, the single owner of the legacy anchor-download sequence. Every export reads the
 * live project and a fresh layout (WallController.layout()); only the safe-distance OBJ reads a scene group.
 * Sync/async shape is legacy (R13): exportZIP and exportPanelIds stay async. Every export runs inside
 * #runExport (08 P2-1a, B-H3), which reports a failure as the M-EXP-1 alert instead of an uncaught exception or an
 * unhandled rejection; its try/catch and the legacy one around the import parse are the only ones (R13 amendment).
 * Since 08 P2-3b (B-L8 fixed) the import is validated (io/ProjectValidator through the injected serializer) and every
 * refusal and correction is reported (08 3.3: M-IMP-1 to M-IMP-7).
 * Legacy source: index.html@cd3fd3f 2786-2827 (exportSafeDistanceOBJ), 4491-4554 (exportZIP), 4911-4924
 * (exportOBJ, exportGLTF), 4926-4940 (exportPanelIds), 4942-4965 (exportJSON), 4967-5010 (importJSON),
 * 5082-5091 (downloadFile).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

import { computeAtlas, canvasFits, CANVAS_HARD_LIMITS } from '../geometry/TextureAtlas.js';
import { zipTextureFileName } from '../geometry/PanelNaming.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { MAX_IMPORT_BYTES } from '../domain/rules.js';

/**
 * The dialogs facade (ui/dom.js createDialogs).
 * @typedef {{alert(msg: string): void}} Dialogs
 */

/**
 * The brand strings ProjectIO uses (Theme.Brand): every download file name.
 * @typedef {{files: {json: string, obj: string, mtl: string, gltf: string, zip: string, panelIdsPng: string,
 *            safeDistanceObj: string}}} IoBrand
 */

/**
 * The export size messages of 08 3.3 (B-L4, 08 P2-1c), exact texts.
 * M-EXP-2: the panel-ID atlas is larger than CANVAS_HARD_LIMITS; M-EXP-3: toBlob returned null (a device limit below
 * the hard limit); M-EXP-4: the ZIP left out textures that do not fit.
 */
const ExportMessages = Object.freeze({
  /** @param {number} w @param {number} h @returns {string} */
  atlasTooLarge: (w, h) => `The Panel ID image would be ${w}×${h} px, larger than this browser can create ` +
    `(${CANVAS_HARD_LIMITS.maxSide} px per side, ${Math.round(CANVAS_HARD_LIMITS.maxArea / 1e6)} MP). Reduce Pixels X/Y or ` +
    'the number of columns, or use Export All (ZIP), which writes one image per section.',
  /** @param {number} w @param {number} h @returns {string} */
  atlasNotCreated: (w, h) => `This browser could not create the ${w}×${h} px Panel ID image. Reduce Pixels X/Y or the ` +
    'number of columns.',
  /** @param {string[]} names  the left-out ZIP entry names @returns {string} */
  zipTexturesLeftOut: (names) => `The ZIP was created, but ${names.length} texture(s) were too large for this browser and ` +
    `were left out: ${names.join(', ')}.`,
});

/**
 * The import alerts of 08 3.3 that are not an issue of the serializer (P2-3b): M-IMP-6 (the file is too large; never
 * read), M-IMP-7 (the read failed) and M-IMP-5 (the corrections of an applied import: up to 10 lines, then a count).
 */
const ImportAlerts = Object.freeze({
  /** M-IMP-6 @returns {string} */
  tooLarge: () => `Import failed: the file is larger than ${Math.round(MAX_IMPORT_BYTES / 1048576)} MB, the maximum for a project file.`,
  /** M-IMP-7 @param {string} name  reader.error?.name @returns {string} */
  unreadable: (name) => `Import failed: the file could not be read (${name}).`,
  /** M-IMP-5 @param {{message: string}[]} warnings @returns {string} */
  corrections: (warnings) => {
    const lines = warnings.slice(0, 10).map((w) => `• ${w.message}`);
    if (warnings.length > 10) lines.push(`• …and ${warnings.length - 10} more`);
    return `Imported with ${warnings.length} correction(s):\n${lines.join('\n')}`;
  },
});

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
   * @throws {TypeError} from URL.createObjectURL for a null blob (no caller passes one since 08 P2-1c: Export Panel
   *   IDs alerts M-EXP-3 for a null toBlob result; any throw of an export is reported by ProjectIO.#runExport)
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
  /** @type {(project: object) => import('../domain/WallSection.js').WallSection[]} io/ProjectSchema.sectionsFromProject */
  #sectionsFromProject;

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
   *          win: Window, sectionsFromProject: (project: object) => import('../domain/WallSection.js').WallSection[]}} deps
   *   sectionsFromProject: io/ProjectSchema.sectionsFromProject, injected by App (app/ may not import io/; 08 P2-3b)
   */
  constructor({ project, wallController, serializer, objExporter, gltfExporter, panelIds, safeDistance, downloader,
    JSZip, dialogs, brand, win, sectionsFromProject }) {
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
    this.#sectionsFromProject = sectionsFromProject;
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
   * an error of the download step is reported by #runExport like any other. The size guard (08 6.3, B-L4 fixed in
   * 08 P2-1c): an atlas beyond CANVAS_HARD_LIMITS alerts M-EXP-2 before any canvas is created, and a null toBlob
   * result (a device limit below the hard limit) alerts M-EXP-3; neither downloads anything.
   * Ports: index.html@cd3fd3f lines 4926-4940.
   * Side effects: draws a canvas; one download (brand.files.panelIdsPng) when toBlob calls back; or one alert
   * (M-EXP-2, M-EXP-3, or M-EXP-1 from #runExport).
   * @returns {Promise<void>} never rejects
   */
  async exportPanelIds() {
    await this.#runExport('Export Panel IDs', async () => {
      const sections = this.#project.wall.sections;
      const atlas = computeAtlas(sections);
      const { width, height } = this.#panelIds.atlasSize(sections, atlas);
      if (!canvasFits(width, height)) {
        this.#dialogs.alert(ExportMessages.atlasTooLarge(width, height));
        return;
      }
      const combinedCanvas = this.#panelIds.atlasCanvas(sections, atlas);
      const blob = await new Promise((resolve) => combinedCanvas.toBlob(resolve, 'image/png'));
      if (blob === null) {
        this.#dialogs.alert(ExportMessages.atlasNotCreated(width, height));
        return;
      }
      this.#downloader.saveBlob(blob, this.#brand.files.panelIdsPng);
    });
  }

  /**
   * Export All (ZIP), in the legacy order: JSON ('zip' variant) -> layout -> OBJ + MTL -> glTF -> textures
   * folder -> one panel-ID PNG per section -> generateAsync -> download. The start columns come from
   * computeAtlas before the texture loop (PR7c). Size guard (08 6.3, B-L4 fixed in 08 P2-1c): a section whose
   * texture exceeds CANVAS_HARD_LIMITS is skipped up front (no canvas; JSON texture_file null; no MTL map_Kd), one
   * whose PNG still comes back as `data:,` is skipped late (the JSON and MTL entries are re-written), and after the
   * download M-EXP-4 names every left-out entry.
   * Ports: index.html@cd3fd3f lines 4491-4554.
   * Side effects: draws one canvas per shipped section; one download (brand.files.zip) after the archive is
   * generated, then the M-EXP-4 alert if textures were left out; or the M-EXP-1 alert (#runExport; for example
   * `name.replace is not a function` for a numeric imported name).
   * @returns {Promise<void>} never rejects (08 P2-1a; legacy rejected unhandled)
   */
  async exportZIP() {
    await this.#runExport('Export All (ZIP)', () => this.#writeZip());
  }

  /**
   * The body of exportZIP (legacy 4491-4554, with the 08 6.3 steps 1-5 of the size guard).
   * @returns {Promise<void>}
   */
  async #writeZip() {
    const JSZip = this.#JSZip;
    const zip = new JSZip();
    const brand = this.#brand;
    const project = this.#project;
    const sections = project.wall.sections;

    // 08 6.3 step 1: the pre-check, pure arithmetic before anything is written. Before 08 P2-6 the MTL keeps the
    // index naming (B-M2), so the left-out textures travel as a boolean per section, not as null names.
    const skipped = sections.map((section) => {
      const { width, height } = this.#panelIds.sectionSize(section, null);
      return !canvasFits(width, height);
    });
    const jsonText = () => JSON.stringify(this.#serializer.write(project, { variant: 'zip', skipped }), null, 2);

    // Step 2: JSON (texture_file null when skipped), OBJ + MTL (no map_Kd when skipped), glTF.
    zip.file(brand.files.json, jsonText());

    const layout = this.#wallController.layout();
    const objArgs = { sections, meshMode: project.meshMode, layout };
    const { objContent, mtlContent } = this.#objExporter.write({ ...objArgs, skipped });
    zip.file(brand.files.obj, objContent);
    zip.file(brand.files.mtl, mtlContent);

    const gltfContent = this.#gltfExporter.write(objArgs);
    zip.file(brand.files.gltf, JSON.stringify(gltfContent, null, 2));

    // Step 3: the textures that fit; a `data:,` result (a device limit below the hard limit) is skipped late.
    const texturesFolder = zip.folder('textures');
    const atlas = computeAtlas(sections);
    const late = [];
    for (let i = 0; i < sections.length; i++) {
      if (skipped[i]) continue;
      const section = sections[i];
      const canvas = this.#panelIds.sectionCanvas(section, i, null, atlas.entries[i].startCol);
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl === 'data:,') {
        late.push(i);
        continue;
      }
      const base64Data = dataUrl.split(',')[1];
      // LEGACY(B-L14): duplicate (or equally sanitised) section names give the same path, and JSZip silently
      // replaces the earlier texture.
      const filename = zipTextureFileName(section, i);
      texturesFolder.file(filename, base64Data, { base64: true });
    }

    // Step 4: re-write the JSON and MTL entries without the late textures (JSZip keeps an entry's position).
    if (late.length) {
      for (const i of late) skipped[i] = true;
      zip.file(brand.files.json, jsonText());
      zip.file(brand.files.mtl, this.#objExporter.write({ ...objArgs, skipped }).mtlContent);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    this.#downloader.saveBlob(content, brand.files.zip);

    // Step 5: name every left-out entry (the ZIP entry names, in section order).
    const leftOut = [];
    sections.forEach((section, i) => {
      if (skipped[i]) leftOut.push(`textures/${zipTextureFileName(section, i)}`);
    });
    if (leftOut.length) this.#dialogs.alert(ExportMessages.zipTexturesLeftOut(leftOut));
  }

  /**
   * Export Safe Distance OBJ: alerts when there is no safe-distance group; otherwise builds the text and Blob
   * and downloads it (B-M1 fixed in 08 P2-5a: legacy called a download helper that was never defined, so every
   * click threw a ReferenceError). Since 08 P2-5b the band is mitred, clamped and faces +Y (B-M15, B-L29), the OBJ
   * carries `vn` lines, and the band's clamp count (safeDistance.lastBand) adds the `# Clamped:` header line.
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

      const objContent = this.#objExporter.writeSafeDistance(safeDistanceMesh, this.#safeDistance.lastBand);

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
   * P-IMPORT (ARCHITECTURE.md 6.10; 08 4.3, P2-3b): a file larger than MAX_IMPORT_BYTES is refused before it is read
   * (M-IMP-6); a read failure alerts M-IMP-7 (legacy had no handler, B-L8); on load the text is parsed (a parse error
   * keeps the legacy alert text, V-5) and read through the serializer (version detection, v1 migration, validation).
   * A document with an error issue is refused with that issue's message and changes nothing (atomic import, 07 4.7);
   * otherwise the validated wall is applied (wall scope: sections, and the mesh mode when the file names one) and, if
   * the validator corrected anything, M-IMP-5 lists the corrections. The parse, read and apply steps stay inside the
   * legacy try/catch, so any other error still becomes the legacy alert. The input is reset synchronously so the same
   * file can be chosen again. A v1 import resets the logos (no logo is in a v1 file; B-L21 fixed in 08 P2-3d) and the
   * logo list re-renders when panel IDs are on.
   * Ports: index.html@cd3fd3f lines 4967-5010.
   * Side effects: one alert (M-IMP-6), or starts a FileReader; resets the input's value; later (on load or error) the
   * wall import pipeline and at most one alert (M-IMP-5), or one alert (an error message).
   * @param {Event} e  the #import-input change event
   */
  importFromInputEvent(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      this.#dialogs.alert(ImportAlerts.tooLarge());
      e.target.value = ''; // Reset input
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const result = this.#serializer.read(data);
        if (!result.ok) {
          this.#dialogs.alert(result.issues.find((issue) => issue.severity === 'error').message);
          return;
        }
        this.#wallController.applyImport({
          sections: this.#sectionsFromProject(result.project), meshMode: result.project.mesh_mode, logos: null,
        });
        const corrections = result.issues.filter((issue) => issue.severity === 'warning');
        if (corrections.length) this.#dialogs.alert(ImportAlerts.corrections(corrections));
      } catch (err) {
        this.#dialogs.alert('Error parsing JSON file: ' + err.message);
      }
    };
    reader.onerror = () => {
      this.#dialogs.alert(ImportAlerts.unreadable(reader.error?.name ?? 'unknown error'));
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  }
}
