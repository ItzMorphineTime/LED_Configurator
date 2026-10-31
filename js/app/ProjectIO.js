/**
 * @module app/ProjectIO
 * The export and import use cases (JSON, the OBJ ZIP (OBJ + MTL + the textures the MTL references: since 04 UV-8a and
 * UV-9 the section textures in section mode, combined per-section and panel section-space UVs, the combined atlas in the
 * combined atlas layout; 04 7.1), glTF, panel-ID
 * PNG, ZIP bundle, safe-distance OBJ, JSON import) and the Downloader, the single owner of the legacy anchor-download
 * sequence. Every export reads the live project and a fresh layout (WallController.layout({frame: 'export'}) since
 * 03 T3: the file origin is the pivot); only the safe-distance OBJ reads a scene group, which it re-expresses into the
 * export frame. Sync/async shape is legacy (R13): exportZIP and exportPanelIds stay async; exportOBJ is async since
 * 08 P2-6e (it builds an archive). Every export runs inside #runExport (08 P2-1a, B-H3), which reports a
 * failure as the M-EXP-1 alert instead of an uncaught exception or an unhandled rejection; its try/catch and the legacy
 * one around the import parse are the only ones (R13 amendment).
 * Since 08 P2-3b (B-L8 fixed) the import is validated (io/ProjectValidator through the injected serializer) and every
 * refusal and correction is reported (08 3.3: M-IMP-1 to M-IMP-7).
 * Legacy source: index.html@cd3fd3f 2786-2827 (exportSafeDistanceOBJ), 4491-4554 (exportZIP), 4911-4924
 * (exportOBJ, exportGLTF), 4926-4940 (exportPanelIds), 4942-4965 (exportJSON), 4967-5010 (importJSON),
 * 5082-5091 (downloadFile).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 */

import { computeAtlas, canvasFits, CANVAS_HARD_LIMITS } from '../geometry/TextureAtlas.js';
import { textureFileNames, atlasTexturePath } from '../geometry/PanelNaming.js';
import { MAX_IMPORT_BYTES } from '../domain/rules.js';
import { turnXZ, yawTrig } from '../geometry/WallOrientation.js';

/**
 * The dialogs facade (ui/dom.js createDialogs).
 * @typedef {{alert(msg: string): void}} Dialogs
 */

/**
 * The brand strings ProjectIO uses (Theme.Brand): every download file name (objZip: the Export OBJ archive, 08 P2-6e).
 * @typedef {{files: {json: string, obj: string, mtl: string, gltf: string, zip: string, objZip: string,
 *            panelIdsPng: string, safeDistanceObj: string}}} IoBrand
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
   * Export OBJ (ZIP): one download, brand.files.objZip, holding brand.files.obj, brand.files.mtl (named by the OBJ's
   * `mtllib` line) and every texture the MTL references, at the referenced path (08 P2-6e, the owner's decision of
   * 2026-10-17, which replaces 08 Q7's two downloads: legacy fired the MTL as a second download 100 ms later, which a
   * browser may block, so an importer such as Blender found no materials; B-L7 fixed). Order: JSZip -> layout -> the
   * texture plan (the names and the pre-check of Export All, 08 6.3 and 6.6) of what the MTL references (#mtlTextureRefs,
   * 04 7.1) -> OBJ + MTL (the UVs and map_Kd of project.uv; map_Kd only for a shipped texture) -> the textures (a
   * `data:,` PNG is left out late and the MTL entry is written again) -> generateAsync -> download -> M-EXP-4 if textures
   * were left out. Panel mode with the per-panel UVs references no texture, so its archive holds the OBJ and the MTL only.
   * The body is the private #writeObjZip().
   * Ports: index.html@cd3fd3f lines 4911-4917 (the OBJ and MTL text), 4534-4543 (the texture loop, as in Export All).
   * Side effects: draws one canvas per shipped section texture (section mode) or the atlas canvas (combined mode); one
   * download (brand.files.objZip) after the archive is generated, then the M-EXP-4 alert if textures were left out; or
   * the M-EXP-1 alert (#runExport).
   * @returns {Promise<void>} never rejects
   */
  async exportOBJ() {
    await this.#runExport('Export OBJ (ZIP)', () => this.#writeObjZip());
  }

  /**
   * The body of exportOBJ (08 P2-6e).
   * @returns {Promise<void>}
   */
  async #writeObjZip() {
    const zip = new this.#JSZip();
    const brand = this.#brand;
    const project = this.#project;
    const sections = project.wall.sections;
    const layout = this.#wallController.layout({ frame: 'export' });   // 03 T3: the file origin is the pivot
    const objArgs = { sections, meshMode: project.meshMode, layout, uvSettings: project.uv };

    // The archive ships exactly what the MTL references (08 P2-6e; 04 7.1 since UV-8a and UV-9): one texture per section
    // in section mode, in combined mode with the per-section layout and in panel mode with section-space UVs; the combined
    // atlas in combined mode with the atlas layout; nothing in panel mode with the per-panel UVs.
    const refs = this.#mtlTextureRefs();
    const plan = refs.sections ? this.#planSectionTextures(sections) : null;
    const atlasPlan = refs.atlas ? this.#planAtlas(sections) : null;
    const writeObj = () => this.#objExporter.write({
      ...objArgs, textureNames: plan && plan.textureNames, atlasFile: atlasPlan && atlasPlan.file,
    });
    const { objContent, mtlContent } = writeObj();
    zip.file(brand.files.obj, objContent);
    zip.file(brand.files.mtl, mtlContent);

    const lateSections = plan !== null && this.#addSectionTextures(zip.folder('textures'), sections, plan);
    const lateAtlas = atlasPlan !== null && this.#addAtlasTexture(zip, sections, atlasPlan);
    if (lateSections || lateAtlas) zip.file(brand.files.mtl, writeObj().mtlContent);

    const content = await zip.generateAsync({ type: 'blob' });
    this.#downloader.saveBlob(content, brand.files.objZip);
    this.#reportLeftOut(plan, atlasPlan);
  }

  /**
   * Which textures the MTL and the ZIP glTF reference for the current mesh mode and UV settings (04 7.1): the section
   * textures (section mode, combined 'per-section', panel 'section') or the combined atlas (combined 'atlas').
   * Side effects: none.
   * @returns {{sections: boolean, atlas: boolean}}
   */
  #mtlTextureRefs() {
    const { meshMode, uv } = this.#project;
    const atlasLayout = uv.combinedLayout === 'atlas';
    return {
      sections: meshMode === 'section' || (meshMode === 'combined' && !atlasLayout) || (meshMode === 'panel' && uv.panelUvs !== 'panel'),
      atlas: meshMode === 'combined' && atlasLayout,
    };
  }

  /**
   * Export glTF: the document pretty-printed with 2 spaces (any size since 08 P2-1a: the chunked encoder).
   * Ports: index.html@cd3fd3f lines 4919-4924.
   * Side effects: one download (brand.files.gltf, application/json), or the M-EXP-1 alert (#runExport).
   */
  exportGLTF() {
    this.#runExport('Export glTF', () => {
      const layout = this.#wallController.layout({ frame: 'export' });   // 03 T3: the file origin is the pivot
      const gltfContent = this.#gltfExporter.write({
        sections: this.#project.wall.sections, meshMode: this.#project.meshMode, layout, uvSettings: this.#project.uv,
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
   * folder -> one panel-ID PNG per section -> (08 P2-7f) the combined atlas -> generateAsync -> download. The start
   * columns come from computeAtlas before the texture loop (PR7c). Size guard (08 6.3, B-L4 fixed in 08 P2-1c): a
   * section texture or the atlas that exceeds CANVAS_HARD_LIMITS is skipped up front (no canvas; JSON texture_file null;
   * no MTL map_Kd), one whose PNG still comes back as `data:,` is skipped late (the JSON and MTL entries are re-written),
   * and after the download M-EXP-4 names every left-out entry. The atlas (08 P2-7f, Q5; 04 7.5) ships in every mesh mode
   * at PanelNaming.atlasTexturePath(brand.files); only the combined MTL references it (its UVs are atlas-placed).
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

    // Step 1: the texture names and the pre-check (#planSectionTextures). A left-out texture's textureNames entry is
    // null: JSON texture_file null and no MTL map_Kd.
    const plan = this.#planSectionTextures(sections);
    const atlasPlan = this.#planAtlas(sections);
    const jsonText = () => JSON.stringify(this.#serializer.write(project, { variant: 'zip', textureNames: plan.textureNames }),
      null, 2);

    // Step 2: JSON (texture_file null when skipped), OBJ + MTL (no map_Kd when skipped), glTF.
    zip.file(brand.files.json, jsonText());

    const layout = this.#wallController.layout({ frame: 'export' });   // 03 T3: the file origin is the pivot
    const objArgs = { sections, meshMode: project.meshMode, layout, uvSettings: project.uv };
    // Every texture ships; the MTL and the glTF reference the ones their UVs address (04 7.1, 7.3: the atlas only while
    // the UVs are atlas-placed, combined mode with the atlas layout; 08 6.3 step 1, P2-7f).
    const writeObj = () => this.#objExporter.write({ ...objArgs, textureNames: plan.textureNames, atlasFile: atlasPlan.file });
    const gltfText = () => JSON.stringify(this.#gltfExporter.write({
      ...objArgs, textures: { sectionFiles: plan.textureNames, atlasFile: atlasPlan.file },
    }), null, 2);
    const { objContent, mtlContent } = writeObj();
    zip.file(brand.files.obj, objContent);
    zip.file(brand.files.mtl, mtlContent);

    zip.file(brand.files.gltf, gltfText());

    // Steps 3-4: the textures that fit, then the atlas; when one is left out late, re-write the entries that name it
    // without it (JSZip keeps an entry's position): the JSON for a section texture, the MTL and the glTF for either.
    const lateSections = this.#addSectionTextures(zip.folder('textures'), sections, plan);
    const lateAtlas = this.#addAtlasTexture(zip, sections, atlasPlan);
    if (lateSections) zip.file(brand.files.json, jsonText());
    if (lateSections || lateAtlas) {
      zip.file(brand.files.mtl, writeObj().mtlContent);
      zip.file(brand.files.gltf, gltfText());
    }

    const content = await zip.generateAsync({ type: 'blob' });
    this.#downloader.saveBlob(content, brand.files.zip);

    // Step 5: name every left-out entry.
    this.#reportLeftOut(plan, atlasPlan);
  }

  /**
   * The section textures of an archive (08 6.3 step 1, 6.6), shared by Export All (ZIP) and Export OBJ (ZIP):
   * names = PanelNaming.textureFileNames(sections) (unique, B-L14 fixed in 08 P2-6b), the one list of the texture
   * entries, the JSON texture_file, the MTL map_Kd and M-EXP-4; skipped[i] = the texture exceeds CANVAS_HARD_LIMITS
   * (pure arithmetic, before anything is written); textureNames[i] = skipped[i] ? null : names[i].
   * Side effects: none.
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @returns {{names: string[], skipped: boolean[], textureNames: (string|null)[]}} a fresh plan (the arrays are updated
   *   by #addSectionTextures)
   * @throws {TypeError} name.replace is not a function (textureFileNames) for a non-string truthy name
   */
  #planSectionTextures(sections) {
    const names = textureFileNames(sections);
    const skipped = sections.map((section) => {
      const { width, height } = this.#panelIds.sectionSize(section, null);
      return !canvasFits(width, height);
    });
    return { names, skipped, textureNames: names.map((name, i) => (skipped[i] ? null : name)) };
  }

  /**
   * 08 6.3 step 3 (legacy 4534-4543): draws each planned section texture (start columns from computeAtlas, PR7c) and adds
   * it to `folder` as names[i]; a `data:,` result (a device limit below the hard limit) is left out late: its skipped
   * entry becomes true and its textureNames entry null (step 4's bookkeeping).
   * Side effects: draws one canvas per planned texture; adds the PNG entries; updates plan.skipped / plan.textureNames.
   * @param {{file(name: string, data: string, options: object): *}} folder  zip.folder('textures')
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {{names: string[], skipped: boolean[], textureNames: (string|null)[]}} plan
   * @returns {boolean} true when a texture was left out late (the caller re-writes the entries that name the textures)
   */
  #addSectionTextures(folder, sections, plan) {
    const atlas = computeAtlas(sections);
    const late = [];
    for (let i = 0; i < sections.length; i++) {
      if (plan.skipped[i]) continue;
      const section = sections[i];
      const canvas = this.#panelIds.sectionCanvas(section, i, null, atlas.entries[i].startCol);
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl === 'data:,') {
        late.push(i);
        continue;
      }
      const base64Data = dataUrl.split(',')[1];
      folder.file(plan.names[i], base64Data, { base64: true });
    }
    for (const i of late) {
      plan.skipped[i] = true;
      plan.textureNames[i] = null;
    }
    return late.length > 0;
  }

  /**
   * The combined atlas of an archive (08 6.3 step 1, P2-7f; Q5): its entry path PanelNaming.atlasTexturePath(brand.files)
   * and the pre-check (pure arithmetic, before anything is written): skipped = the atlasSize canvas exceeds
   * CANVAS_HARD_LIMITS; file = the path, or null when skipped (no map_Kd).
   * Side effects: none.
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @returns {{path: string, skipped: boolean, file: string|null}} a fresh plan (updated by #addAtlasTexture)
   */
  #planAtlas(sections) {
    const path = atlasTexturePath(this.#brand.files);
    const { width, height } = this.#panelIds.atlasSize(sections, computeAtlas(sections));
    const skipped = !canvasFits(width, height);
    return { path, skipped, file: skipped ? null : path };
  }

  /**
   * 08 6.3 step 3 for the atlas (P2-7f): draws the atlas canvas (the image of Export Panel IDs) and adds it to the
   * archive at plan.path; a `data:,` result is left out late (plan.skipped true, plan.file null).
   * Side effects: draws the atlas canvas (none when skipped up front); adds the PNG entry; updates the plan.
   * @param {{file(name: string, data: string, options: object): *}} zip
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {{path: string, skipped: boolean, file: string|null}} plan
   * @returns {boolean} true when the atlas was left out late (the caller re-writes the MTL)
   */
  #addAtlasTexture(zip, sections, plan) {
    if (plan.skipped) return false;
    const dataUrl = this.#panelIds.atlasCanvas(sections, computeAtlas(sections)).toDataURL('image/png');
    if (dataUrl === 'data:,') {
      plan.skipped = true;
      plan.file = null;
      return true;
    }
    zip.file(plan.path, dataUrl.split(',')[1], { base64: true });
    return false;
  }

  /**
   * 08 6.3 step 5: after the download, M-EXP-4 names every left-out texture entry: the section textures
   * (`textures/<name>`, in section order), then the atlas (08 P2-7f).
   * Side effects: at most one alert.
   * @param {{names: string[], skipped: boolean[]}|null} plan  the section textures, or null when none are planned
   * @param {{path: string, skipped: boolean}|null} [atlasPlan]  the atlas, or null when it is not planned
   */
  #reportLeftOut(plan, atlasPlan = null) {
    const leftOut = plan ? plan.names.filter((name, i) => plan.skipped[i]).map((name) => `textures/${name}`) : [];
    if (atlasPlan && atlasPlan.skipped) leftOut.push(atlasPlan.path);
    if (leftOut.length) this.#dialogs.alert(ExportMessages.zipTexturesLeftOut(leftOut));
  }

  /**
   * Export Safe Distance OBJ: alerts when there is no safe-distance group; otherwise builds the text and Blob
   * and downloads it (B-M1 fixed in 08 P2-5a: legacy called a download helper that was never defined, so every
   * click threw a ReferenceError). Since 08 P2-5b the band is mitred, clamped and faces +Y (B-M15, B-L29), the OBJ
   * carries `vn` lines, and the band's clamp count (safeDistance.lastBand) adds the `# Clamped:` header line. Since 03 T3
   * (7.1) the vertices are written in the current export frame: translate = (sb.x - P.x, -P.y, sb.z - P.z), with sb the
   * stage origin the group was built in (SafeDistanceView's userData.stageOrigin, so a stale group, B-M8, is re-expressed)
   * and P the cached pivot point (0 at the identity pivot, whose bytes are unchanged).
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

      // 03 T3 (7.1): from the stage frame the group was built in (its stamp) into the current export frame
      const sb = safeDistanceMesh.userData?.stageOrigin ?? { x: 0, z: 0 };
      const r = this.#wallController.pivotResolution;
      const P = r?.point ?? { x: 0, y: 0, z: 0 };
      // 03 12.8: s_E = R(psi - psi_b) s + R(psi)(O_b - P) in x and z, y - P.y
      const yaw = r?.yawDeg ?? 0;
      const yawB = safeDistanceMesh.userData?.stageYawDeg ?? 0;
      const d = yaw === 0 ? { x: sb.x - P.x, z: sb.z - P.z } : turnXZ(sb.x - P.x, sb.z - P.z, yawTrig(yaw));
      const translate = { x: d.x, y: -P.y, z: d.z };
      const objContent = this.#objExporter.writeSafeDistance(safeDistanceMesh, this.#safeDistance.lastBand,
        { translate, yawDeg: yaw - yawB });

      const blob = new Blob([objContent], { type: 'text/plain' });
      this.#downloader.saveBlob(blob, this.#brand.files.safeDistanceObj);
    });
  }

  /**
   * Runs one export and reports its failure instead of letting it escape (08 P2-1a, B-H3; 08 3.3 M-EXP-1): a
   * synchronous throw, or the rejection of the promise `fn` returns, becomes the alert
   * `${label} failed: ${message}. No file was downloaded.` followed by win.console.warn(err). This try/catch is the
   * sanctioned exception to R13 (ARCHITECTURE.md 1.6).
   * Side effects: those of fn; on failure one alert and one console warning.
   * @template T
   * @param {string} label  the export's button label: 'Export JSON' | 'Export OBJ (ZIP)' | 'Export glTF' |
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
