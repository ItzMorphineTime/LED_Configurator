/**
 * @module app/ProjectSession
 * The project session (spec 07 5.5.2, D5): opening a project file (the size guard, the read, the version dispatch and
 * validation through the injected serializer, the logo assets, then apply), saving it, a new project, the history
 * capture with the dirty and pristine-new flags, and `apply`, the one place that hydrates the live project from a
 * validated v2 object (07 4.4 rule 7; it absorbs 08's ProjectIO.#applyV2 and WallController.applyImport). Features
 * register their own restore step in the `features` hook map (07 C41): each hook's `hydrate(v2, ctx)` runs in step 3.
 * The legacy try/catch around the import parse lives here (R13 amendment; legacy alert text kept, V-5).
 * History (07 H1): App attaches the one undo stack (attachHistory). An open, a new project and a rename are one entry
 * each ('Open "<file>"', 'New project', 'Rename project'); undo and redo come back here as apply(reason 'undo' / 'redo').
 * Legacy source: index.html@cd3fd3f 4967-5010 (importJSON), 4942-4965 (exportJSON).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected, app/ may not import io/ or ui/).
 */

import { Events } from '../core/EventBus.js';
import { sectionKeyOf } from '../core/sectionIds.js';
import { MAX_IMPORT_BYTES } from '../domain/rules.js';
import { ProjectMeta } from '../domain/Project.js';
import { NO_HISTORY } from '../core/historyRecorder.js';

/** The largest ZIP an import reads (07 4.7 too-large: 2 GiB, the practical ArrayBuffer limit). */
export const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;

/** The MIME types a browser gives a .zip file. */
const ZIP_TYPES = Object.freeze(['application/zip', 'application/x-zip-compressed', 'application/x-zip']);

/**
 * The import alerts of 08 3.3 that are not an issue of the serializer (P2-3b): M-IMP-6 (the file is too large; never
 * read), M-IMP-7 (the read failed), the legacy parse alert (V-5) and M-IMP-5 (the corrections of an applied import:
 * up to 10 lines, then a count), with 07 D2's budget notes.
 */
export const ImportAlerts = Object.freeze({
  /** M-IMP-6 @returns {string} */
  tooLarge: () => `Import failed: the file is larger than ${Math.round(MAX_IMPORT_BYTES / 1048576)} MB, the maximum for a project file.`,
  /** M-IMP-7 @param {string} name  reader.error?.name @returns {string} */
  unreadable: (name) => `Import failed: the file could not be read (${name}).`,
  /** 07 D6: a ZIP over MAX_ZIP_BYTES @returns {string} */
  zipTooLarge: () => 'Import failed: the ZIP file is larger than 2 GB.',
  /** 07 D6: JSZip refused the archive @param {string} message @returns {string} */
  badZip: (message) => `Import failed: the ZIP file could not be read (${message}).`,
  /** 07 D6 @returns {string} */
  noProjectInZip: () => 'Import failed: the ZIP file contains no project file (.json).',
  /** the legacy parse alert (V-5), also for any other failure of the open @param {string} message @returns {string} */
  parseError: (message) => `Error parsing JSON file: ${message}`,
  /** M-IMP-5 @param {{message: string}[]} warnings @returns {string} */
  corrections: (warnings) => {
    const lines = warnings.slice(0, 10).map((w) => `• ${w.message}`);
    if (warnings.length > 10) lines.push(`• …and ${warnings.length - 10} more`);
    return `Imported with ${warnings.length} correction(s):\n${lines.join('\n')}`;
  },
  /**
   * The alert of an applied import: M-IMP-5 over the warnings that are corrections, then (07 D2) one "Note: " line per
   * `budget` warning (a note about the wall, not a correction); null when there is neither.
   * @param {{severity: string, code: string, message: string}[]} issues
   * @returns {string|null}
   */
  report: (issues) => {
    const warnings = issues.filter((i) => i.severity === 'warning');
    const corrections = warnings.filter((w) => w.code !== 'budget');
    const notes = warnings.filter((w) => w.code === 'budget').map((w) => `Note: ${w.message}`);
    const parts = corrections.length ? [ImportAlerts.corrections(corrections), ...notes] : notes;
    return parts.length ? parts.join('\n\n') : null;
  },
});

/** Device names Windows reserves for any extension (a download named `con.json` cannot be written there). */
const RESERVED_FILE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * The download name of the Project section's Save (07 D8, the owner's rule): the project name as a safe slug (NFKD with
 * the combining marks dropped, so "Bühne" gives "buhne"; lower case; every run of characters other than a-z and 0-9
 * becomes one '-', none at either end; at most 64 characters) plus '.json'. The default name ("Untitled stage"), a name
 * without a letter or digit of a-z / 0-9 and a name Windows reserves give the brand's file name (Brand.files.json,
 * `morph-led-wall.json`).
 * Side effects: none.
 * @param {string} name  project.meta.name
 * @param {{files: {json: string}}} brand
 * @returns {string}
 */
export function projectFileName(name, brand) {
  if (typeof name !== 'string' || name === ProjectMeta.DEFAULT_NAME) return brand.files.json;
  const slug = name.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 64).replace(/-+$/, '');
  return slug === '' || RESERVED_FILE_NAME.test(slug) ? brand.files.json : `${slug}.json`;
}

/**
 * A feature's restore step (07 C41, 4.4 rule 7): `hydrate(v2, ctx)` writes the feature's live state from the validated
 * v2 object, in place, without rebuilding the wall (step 7 rebuilds once), emitting only the feature's own mirror events.
 * It runs in step 3 of every apply, after the wall, the mesh mode and the logos and before the display, in registration
 * order; it reads its own keys of `v2` (absent means default) and decides from `ctx.scope` whether a wall-scope (v1)
 * import resets or keeps its state.
 * @typedef {{hydrate(v2: object, ctx: {reason: string, scope: 'full'|'wall', project: object}): void}} FeatureHook
 */

/** The project session: open, save, new, capture and apply. */
export class ProjectSession {
  /** @type {import('../domain/Project.js').Project} */ #project;
  /** @type {import('../io/ProjectSerializer.js').ProjectSerializer} */ #serializer;
  /** @type {import('./AssetStore.js').AssetStore} */ #assets;
  /** @type {import('./WallController.js').WallController} */ #wallController;
  /** @type {import('./CameraController.js').CameraController} */ #cameraController;
  /** @type {import('./PropController.js').PropController} */ #personController;
  /** @type {import('./PropController.js').PropController} */ #carController;
  /** @type {{active: boolean, toggle(): void}} */ #pilot;
  /** @type {import('../interaction/SelectionManager.js').SelectionManager} */ #selection;
  /** @type {{toggleGrid(): void}} */ #sceneManager;
  /** @type {{clearCache(): void}} */ #ledTiles;
  /** @type {import('../core/EventBus.js').EventBus} */ #bus;
  /** @type {{alert(msg: string): void}} */ #dialogs;
  /** @type {{saveText(content: string, filename: string, mimeType: string): void}} */ #downloader;
  /** @type {{files: {json: string}}} */ #brand;
  /** @type {Window} FileReader */ #win;
  /** @type {{loadAsync(data: ArrayBuffer): Promise<object>}|null} the JSZip constructor (vendor/jszip.js; 07 D6) */ #JSZip;
  /** @type {(v2: object) => object} io/ProjectSchema.stateFromProject */ #stateFromProject;
  /** @type {(v2: object) => import('../domain/WallSection.js').WallSection[]} io/ProjectSchema.sectionsFromProject */
  #sectionsFromProject;
  /** @type {() => import('../domain/Project.js').Project} a new project (Project.createNew with the theme's colour) */
  #createProject;
  /** @type {Map<string, FeatureHook>} the hook map (07 C41), in registration order */
  #features = new Map();
  /** @type {boolean} */ #applying = false;
  /** @type {import('../core/historyRecorder.js').HistoryRecorder} the undo stack (07 H1), attached by App */
  #history = NO_HISTORY;
  /** @type {string|null} capture('history') after the last open, save or new (07 5.5.2 dirty) */
  #cleanSnapshot = null;
  /** @type {string|null} capture('history') of the last new project; cleared by an open (07 5.5.2 isPristineNew) */
  #newSnapshot = null;

  /**
   * Stores the collaborators and registers the given feature hooks (R4: nothing else).
   * Side effects: none.
   * @param {{project: object, serializer: object, assets?: import('./AssetStore.js').AssetStore, wallController?: object,
   *          cameraController?: object, personController?: object, carController?: object, pilot?: object,
   *          selection?: object, sceneManager?: object, ledTiles?: object, bus?: object, dialogs?: object,
   *          downloader?: object, brand?: object, win?: object, JSZip?: object, stateFromProject?: Function,
   *          sectionsFromProject?: Function, createProject?: Function, features?: Record<string, FeatureHook>}} deps
   *   stateFromProject / sectionsFromProject: io/ProjectSchema's, injected by App (app/ may not import io/); features:
   *   the initial hook map (more through registerFeature)
   */
  constructor({ project, serializer, assets = null, wallController = null, cameraController = null, personController = null,
    carController = null, pilot = null, selection = null, sceneManager = null, ledTiles = null, bus = null, dialogs = null,
    downloader = null, brand = null, win = null, JSZip = null, stateFromProject = null, sectionsFromProject = null,
    createProject = null, features = {} }) {
    this.#project = project;
    this.#serializer = serializer;
    this.#assets = assets;
    this.#wallController = wallController;
    this.#cameraController = cameraController;
    this.#personController = personController;
    this.#carController = carController;
    this.#pilot = pilot;
    this.#selection = selection;
    this.#sceneManager = sceneManager;
    this.#ledTiles = ledTiles;
    this.#bus = bus;
    this.#dialogs = dialogs;
    this.#downloader = downloader;
    this.#brand = brand;
    this.#win = win;
    this.#JSZip = JSZip;
    this.#stateFromProject = stateFromProject;
    this.#sectionsFromProject = sectionsFromProject;
    this.#createProject = createProject;
    for (const [name, hook] of Object.entries(features)) this.registerFeature(name, hook);
  }

  /**
   * Registers (or replaces) a feature's restore step (07 C41): `hook.hydrate(v2, {reason, scope, project})` runs in step
   * 3 of every apply, in registration order. App registers the landed features when it builds the session.
   * Side effects: writes the hook map.
   * @param {string} name  the feature's key ('pivot', 'uv', 'hdri', ...)
   * @param {FeatureHook} hook
   * @throws {TypeError} without a hydrate function
   */
  registerFeature(name, hook) {
    if (!hook || typeof hook.hydrate !== 'function') throw new TypeError(`ProjectSession: feature "${name}" has no hydrate(v2, ctx)`);
    this.#features.set(name, hook);
  }

  /** Side effects: none. @returns {string[]} the registered feature names, in step-3 order */
  get features() {
    return [...this.#features.keys()];
  }

  /**
   * Late binding (07 5.5.2; History needs the session, the session records through History): this session's open, new
   * and rename record on `history`, and `history` captures and applies through this session.
   * Side effects: history.attach(this).
   * @param {import('./History.js').History} history
   */
  attachHistory(history) {
    this.#history = history;
    history.attach(this);
  }

  /** Side effects: none. @returns {boolean} true while apply() runs (History ignores every record then, 07 5.6.1) */
  get applying() {
    return this.#applying;
  }

  /**
   * The project as a string (07 5.5.2): JSON.stringify(serializer.write(project, {variant})). The 'history' variant
   * holds no view-only and no derived key and each asset by id only.
   * Side effects: none.
   * @param {'history'|'file'|'autosave'} [variant]
   * @returns {string}
   */
  capture(variant = 'history') {
    return JSON.stringify(this.#serializer.write(this.#project, { variant }));
  }

  /**
   * Whether the project changed since the last open, save or new (07 5.5.2; read by a later Autosave's beforeunload
   * guard). Before any of them, App marks the bootstrap project clean (markClean).
   * Side effects: none.
   * @returns {boolean}
   */
  get dirty() {
    return this.capture('history') !== this.#cleanSnapshot;
  }

  /**
   * Whether the project is still exactly what newProject() (or the bootstrap, markClean({pristineNew: true})) produced
   * (07 5.5.2; read by a later Autosave, 6.11). An open clears it.
   * Side effects: none.
   * @returns {boolean}
   */
  get isPristineNew() {
    return this.#newSnapshot !== null && this.capture('history') === this.#newSnapshot;
  }

  /**
   * Takes the clean snapshot (and, with pristineNew, the new-project snapshot): after a save, an open, a new project, and
   * by App once after the bootstrap.
   * Side effects: writes the snapshots.
   * @param {{pristineNew?: boolean}} [options]
   */
  markClean({ pristineNew = false } = {}) {
    this.#cleanSnapshot = this.capture('history');
    if (pristineNew) this.#newSnapshot = this.#cleanSnapshot;
  }

  /**
   * Hydrates the live project from a VALIDATED v2 object (07 5.5.2; never called with unvalidated input), in this order:
   *  1. a clean pilot exit (pilot.toggle, 08 P2-4);
   *  2. remember the selected id, then deselect (only when something is selected);
   *  3. the domain in place, no rebuild: the wall (Wall.replaceAll recomputes the id allocator) and the mesh mode; the
   *     logos (a wall-scope import clears them, B-L21; a full apply installs the images of the session's AssetStore
   *     by the file's asset ids); every registered feature hook; then, full scope only: the display (DisplaySettings
   *     .assign; the view-only grid in step 6), the panel-ID style (PanelIdStyle.assign), the camera lens
   *     (CineCamera.assign: filmback, size and focal length, never the pose or `enabled`), the extensions and the
   *     project meta. A wall-scope apply with a mesh mode emits WALL_MESH_MODE_CHANGED (the legacy import's label
   *     mirror, which the parity tests compare);
   *  4. full scope: the preview first (setPreviewEnabled when it differs; turning it on resets the pose);
   *  5. full scope: the poses (CameraController.applyImportedPose keeps the pose for the next enable when the preview
   *     is off, 08 Q19; then each prop's pose and scale), so a saved pose survives step 4 (07 C30, AC 59);
   *  6. full scope: the grid (SceneManager.toggleGrid when it differs, except for undo and redo, which keep the live
   *     view-only values), the safe-distance floor and each prop's visibility when they differ, the LED tile cache;
   *  7. one rebuild (cause 'import'): stats, orbit re-centre, the camera hub when the preview is on, the rebuild
   *     observers (the UV controller resets its session state, a section selection is pruned);
   *  8. PROJECT_REPLACED {reason, scope}: the panels sync from the model;
   *  9. (the viewport is not persisted yet: no orbit or preview-window step);
   * 10. re-select the remembered id when it still resolves and is pickable: a static id (camera, props, pivot) for every
   *     reason, a section id only for undo and redo (after an open an equal id names another section, 02 CR-07-d).
   * A wall-scope (v1) import runs steps 1-3 (wall, mesh mode, logos cleared, hooks), 7, 8 and 10 only: the camera,
   * props, display and styling stay exactly as they are (07 4.6), and no pose is re-applied (the keep-pose flag of a
   * re-applied pose would change the next preview enable).
   * The body runs with `applying` true (try/finally); a nested apply throws.
   * Side effects: the whole live project, the scene and every mirror (see the steps).
   * @param {object} v2  a validated v2 object (serializer.read(...).project), or for scope 'wall' the validated wall
   *   ({sections, mesh_mode}: mesh_mode null keeps the current mode)
   * @param {{reason: 'open'|'import'|'new'|'undo'|'redo'|'restore', scope?: 'full'|'wall'}} options
   * @throws {Error} when called while applying
   */
  apply(v2, { reason, scope = 'full' }) {
    if (this.#applying) throw new Error('ProjectSession.apply is not re-entrant');
    this.#applying = true;
    try {
      this.#apply(v2, reason, scope);
    } finally {
      this.#applying = false;
    }
  }

  /** The body of apply (steps 1-10). @param {object} v2 @param {string} reason @param {'full'|'wall'} scope */
  #apply(v2, reason, scope) {
    const project = this.#project;
    const full = scope === 'full';
    const keepView = !full || reason === 'undo' || reason === 'redo';
    // 1-2
    if (this.#pilot.active) this.#pilot.toggle();
    const remembered = this.#selection.selectedId;
    if (remembered !== null) this.#selection.deselect();
    // 3. the domain, in place (no rebuild)
    const state = full ? this.#stateFromProject(v2) : null;
    if (full) project.logos.replaceAll(this.#logoEntries(state.logos));
    else project.logos.clear();
    project.wall.replaceAll(full ? state.sections : this.#sectionsFromProject(v2));
    const meshMode = full ? state.meshMode : v2.mesh_mode;
    if (meshMode) project.meshMode = meshMode;
    for (const hook of this.#features.values()) hook.hydrate(v2, { reason, scope, project });
    if (full) {
      project.display.assign(state.display);
      project.panelIdStyle.assign(state.panelIdStyle);
      const { filmback, filmbackWidth, filmbackHeight, focalLength } = state.camera;
      project.camera.assign({ filmback, filmbackWidth, filmbackHeight, focalLength });
      project.setExtensions(state.extensions);
      project.meta.assign(state.meta);
    } else if (meshMode) {
      this.#bus.emit(Events.WALL_MESH_MODE_CHANGED, { mode: meshMode });
    }
    if (full) {
      // 4. the preview first, 5. then the poses
      const cc = this.#cameraController;
      if (state.camera.enabled !== project.camera.enabled) cc.setPreviewEnabled(state.camera.enabled);
      cc.applyImportedPose(state.camera);
      this.#personController.applyImportedPose(state.person);
      this.#carController.applyImportedPose(state.car);
      // 6. the other view state
      const display = project.display;
      if (!keepView && typeof state.display.showGrid === 'boolean' && state.display.showGrid !== display.showGrid) this.#sceneManager.toggleGrid();
      if (state.display.showSafeDistance !== display.showSafeDistance) cc.setSafeDistanceEnabled(state.display.showSafeDistance);
      for (const [controller, prop, values] of [[this.#personController, project.person, state.person],
        [this.#carController, project.car, state.car]]) {
        if (prop.visible !== values.visible) controller.setVisible(values.visible);
      }
      this.#ledTiles.clearCache();
    }
    // 7-8
    this.#wallController.rebuild({ cause: 'import' });
    this.#bus.emit(Events.PROJECT_REPLACED, { reason, scope });
    // 10. re-selection
    if (remembered !== null && (sectionKeyOf(remembered) === null || reason === 'undo' || reason === 'redo')) {
      const s = this.#selection.find(remembered);
      if (s && (typeof s.isPickable !== 'function' || s.isPickable())) this.#selection.select(remembered);
    }
  }

  /**
   * The logo entries of a full apply: [sectionId, {position, scale, image, ...meta}] for every section logo whose
   * asset the session's AssetStore holds (a missing one shows no logo; its warning was raised by the open).
   * @param {Array<{sectionId: number, assetId: string, position: string, scale: number}>} logos
   * @returns {Array<[number, object]>}
   */
  #logoEntries(logos) {
    const out = [];
    for (const logo of logos) {
      const asset = this.#assets ? this.#assets.get(logo.assetId) : null;
      if (asset && asset.image) out.push([logo.sectionId, { position: logo.position, scale: logo.scale, image: asset.image, ...asset.meta }]);
    }
    return out;
  }

  /**
   * P-IMPORT (ARCHITECTURE.md 6.10; 07 5.5.2 openFile; 08 4.3): a .json file larger than MAX_IMPORT_BYTES (a .zip larger
   * than MAX_ZIP_BYTES, 07 D6) is refused before it is read (M-IMP-6); a read failure alerts M-IMP-7. A .zip (by name or
   * type; 07 D6) is opened with JSZip and its project file is the first `*.json` entry at the archive's root, else the
   * first anywhere (an Export All archive holds one; its glTF is .gltf); an entry over MAX_IMPORT_BYTES is refused like a
   * large file, an archive without one or one JSZip cannot read alerts why. The text is parsed (a parse error keeps the
   * legacy alert text, V-5) and read through the serializer (version detection, v1 migration, validation). A document
   * with an error issue is refused with that issue's message and changes nothing (atomic, 07 4.7). A v1 file is applied
   * with scope 'wall' (reason 'import'); a v2 file has its logo assets loaded into the AssetStore first (inline ones from
   * their data URI, `storage: 'zip'` ones from the archive's entry at their path; an asset that cannot be loaded or is
   * not in the archive is dropped with a warning, a sanitised SVG or a checksum mismatch kept with a warning, 07 4.5) and
   * is then applied whole (reason 'open'). Then the clean snapshot is taken (an open is not an edit) and, when there are
   * warnings, one alert (M-IMP-5 with the budget notes). Any other failure of the parse, read or apply alerts like a
   * parse error (the legacy try/catch, R13).
   * Side effects: at most one alert; on success the whole project (see apply).
   * @param {File} file
   * @returns {Promise<boolean>} whether the file was applied; never rejects
   */
  openFile(file) {
    const zip = /\.zip$/i.test(String(file.name ?? '')) || ZIP_TYPES.includes(String(file.type ?? '').toLowerCase());
    if (file.size > (zip ? MAX_ZIP_BYTES : MAX_IMPORT_BYTES)) {
      this.#dialogs.alert(zip ? ImportAlerts.zipTooLarge() : ImportAlerts.tooLarge());
      return Promise.resolve(false);
    }
    const label = `Open "${String(file.name ?? 'project')}"`;
    return this.#read(file, zip).then((content) => (zip ? this.#openZip(content, label) : this.#open(content, null, label)),
      (error) => {
        this.#dialogs.alert(ImportAlerts.unreadable(error?.name ?? 'unknown error'));
        return false;
      })
      // an archive entry that cannot be inflated (#openZip; #open itself never rejects)
      .then(undefined, (err) => {
        this.#dialogs.alert(ImportAlerts.badZip(err?.message ?? String(err)));
        return false;
      });
  }

  /**
   * Reads a file as text, or (a ZIP) as an ArrayBuffer, through the window's FileReader (onload is set before the read
   * starts).
   * @param {File} file
   * @param {boolean} binary
   * @returns {Promise<string|ArrayBuffer>} rejects with reader.error (or {name: 'unknown error'})
   */
  #read(file, binary) {
    return new Promise((resolve, reject) => {
      const reader = new this.#win.FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = () => reject(reader.error ?? { name: 'unknown error' });
      if (binary) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    });
  }

  /**
   * Opens an archive (07 D6): its project JSON entry, then #open with every file entry by path.
   * @param {ArrayBuffer} buffer
   * @param {string} label  the history label
   * @returns {Promise<boolean>}
   */
  async #openZip(buffer, label) {
    const archive = await this.#JSZip.loadAsync(buffer).then((a) => a, (err) => {
      this.#dialogs.alert(ImportAlerts.badZip(err?.message ?? String(err)));
      return null;
    });
    if (!archive) return false;
    const entries = new Map();
    archive.forEach((path, entry) => { if (!entry.dir) entries.set(path, entry); });
    const jsons = [...entries.keys()].filter((path) => /\.json$/i.test(path));
    const name = jsons.find((path) => !path.includes('/')) ?? jsons[0];
    if (name === undefined) {
      this.#dialogs.alert(ImportAlerts.noProjectInZip());
      return false;
    }
    const size = entries.get(name)._data?.uncompressedSize;
    if (Number.isFinite(size) && size > MAX_IMPORT_BYTES) {
      this.#dialogs.alert(ImportAlerts.tooLarge());
      return false;
    }
    const text = await entries.get(name).async('string');
    if (text.length > MAX_IMPORT_BYTES) {
      this.#dialogs.alert(ImportAlerts.tooLarge());
      return false;
    }
    return this.#open(text, entries, label);
  }

  /**
   * Parse, read, load the assets, apply, record one history entry (07 H1: undo brings the previous project back),
   * report (openFile after the read).
   * @param {string} text
   * @param {Map<string, {async(type: string): Promise<*>}>|null} entries  the archive's file entries by path (a ZIP), or null
   * @param {string} label  the history label, 'Open "<file name>"'
   * @returns {Promise<boolean>}
   */
  async #open(text, entries, label) {
    try {
      const result = this.#serializer.read(JSON.parse(text));
      if (!result.ok) {
        this.#dialogs.alert(result.issues.find((issue) => issue.severity === 'error').message);
        return false;
      }
      const issues = [...result.issues];
      if (result.scope === 'wall') {
        this.apply(result.project, { reason: 'import', scope: 'wall' });
      } else {
        await this.#loadAssets(result.project, issues, entries);
        this.apply(result.project, { reason: 'open', scope: 'full' });
        this.#newSnapshot = null;
      }
      this.markClean();
      this.#history.record(label);
      const report = ImportAlerts.report(issues);
      if (report) this.#dialogs.alert(report);
      return true;
    } catch (err) {
      this.#dialogs.alert(ImportAlerts.parseError(err.message));
      return false;
    }
  }

  /**
   * Loads every logo asset of a validated v2 object into the AssetStore (07 4.5): an inline asset through
   * addFromDataUri, a `storage: 'zip'` asset (07 D6) through addFromBytes with the bytes of the archive's entry at its
   * path; an asset that cannot be loaded, or whose entry is not there (a ZIP's JSON opened alone), is dropped (its
   * sections show no logo), a sanitised SVG or a raster whose SHA-256 differs from the file's is kept, each with a
   * warning. A loaded asset whose stored id differs from the file's (a sanitised SVG) is renamed in `v2` (its entry and
   * every section logo), so apply finds it by id.
   * Side effects: fills the AssetStore; rewrites asset ids in `v2` (a fresh validated object); pushes warnings.
   * @param {object} v2
   * @param {object[]} issues
   * @param {Map<string, {async(type: string): Promise<*>}>|null} entries  the archive's entries (a ZIP), or null
   * @returns {Promise<void>}
   */
  async #loadAssets(v2, issues, entries) {
    const warn = (message) => issues.push({ path: 'assets', code: 'sanitized', severity: 'warning', message });
    for (const asset of v2.assets) {
      let res = null;
      let given = asset.data_uri;
      if (asset.storage === 'inline') {
        res = await this.#assets.addFromDataUri(asset, asset.data_uri);
      } else if (asset.storage === 'zip') {
        const entry = entries ? entries.get(asset.path) : undefined;
        if (!entry) {
          warn(`Logo "${asset.name}": dropped (its image ${asset.path} is not in this file; open the project's ZIP)`);
          continue;
        }
        res = await this.#assets.addFromBytes(asset, await entry.async('uint8array'));
        given = res.dataUri;
      }
      if (!res || !res.ok) {
        warn(`Logo "${asset.name}": dropped (the image could not be loaded)`);
        continue;
      }
      if (res.meta.dataUri !== given) warn(`Logo "${asset.name}": unsafe or unsized SVG content was removed`);
      else if (asset.sha256 && asset.sha256 !== res.meta.sha256) warn(`Logo "${asset.name}": the image does not match its checksum`);
      if (res.meta.assetId !== asset.id) {
        for (const s of v2.sections) if (s.logo && s.logo.asset_id === asset.id) s.logo.asset_id = res.meta.assetId;
        asset.id = res.meta.assetId;
      }
    }
  }

  /**
   * Export JSON / Save (07 5.5.2 saveFile): the 'file' document pretty-printed with 2 spaces as `fileName` (Export JSON:
   * brand.files.json; the Project section's Save names it after the project, projectFileName, 07 D8), then the clean
   * snapshot.
   * Ports: index.html@cd3fd3f lines 4942-4965.
   * Side effects: one download; writes the clean snapshot. A throw propagates (ProjectIO.#runExport reports it).
   * @param {{fileName?: string}} [options]
   */
  saveFile({ fileName = this.#brand.files.json } = {}) {
    const doc = this.#serializer.write(this.#project, { variant: 'file' });
    this.#downloader.saveText(JSON.stringify(doc, null, 2), fileName, 'application/json');
    this.markClean();
  }

  /** Side effects: none. @returns {string} the project's name (project.meta.name; 07 D8's #project-name) */
  get name() {
    return this.#project.meta.name;
  }

  /**
   * Renames the project (07 3.3, D8): ProjectMeta.setName (the validator's text rule: sanitizeText to 64 units, trimmed,
   * empty gives the default). A rename is an edit: the project is dirty until it is saved; one history entry 'Rename
   * project' (coalesced, 07 H1).
   * Side effects: writes project.meta.name; a history entry.
   * @param {*} raw  the typed value
   * @returns {string} the stored name
   */
  setName(raw) {
    return this.#history.run('Rename project', () => this.#project.meta.setName(raw), { coalesceKey: 'project:name' });
  }

  /**
   * A new project (07 5.5.2 newProject; the Project section's New, 07 D8): the 'file' document of createProject(), read
   * back through the serializer (valid by construction) and applied whole (reason 'new'); then the clean and new-project
   * snapshots and one history entry 'New project' (07 H1: undo brings the previous project back).
   * Side effects: see apply; a history entry.
   */
  newProject() {
    const doc = JSON.parse(JSON.stringify(this.#serializer.write(this.#createProject(), { variant: 'file' })));
    const result = this.#serializer.read(doc);
    if (!result.ok) throw new Error('ProjectSession.newProject: the new project does not validate');
    this.apply(result.project, { reason: 'new', scope: 'full' });
    this.markClean({ pristineNew: true });
    this.#history.record('New project');
  }
}
