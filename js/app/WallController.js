/**
 * @module app/WallController
 * Wall use cases and the wall rebuild pipeline (legacy `createLEDWall` orchestration, P1) plus the header stats
 * publication. It mutates the domain, calls the render/interaction collaborators in legacy order and emits the
 * mirror events at the legacy DOM-write points. It never imports or calls ui/ (the panels mirror its events).
 * Legacy source: index.html@cd3fd3f 1457-1577 (createLEDWall: layout, view, tail 1574-1576), 2307-2313
 * (updateStats call), 3997-4074 (card handlers' model writes and rebuilds), 4081-4146 (addSection, deleteSection),
 * 4156-4227 (setupUI display handlers), 4976-5002 (import tail).
 * Layer: app (may import core, legacy, domain, geometry; collaborators are injected).
 *
 * Rebuild policy (ARCHITECTURE.md 6.2): this module is the only place, besides the bootstrap, that decides wall
 * rebuilds. The 24 legacy `createLEDWall()` call sites map to these calls (rows added after Phase 1 carry named ids,
 * ARCHITECTURE.md 6.2):
 *
 * | #  | Legacy | Trigger                          | Controller call(s)                   | Rebuild                                 | Other steps, in order                                   |
 * |----|--------|----------------------------------|--------------------------------------|-----------------------------------------|---------------------------------------------------------|
 * | 1  | 1451   | bootstrap (App.start)            | rebuild({cause: 'init'})             | always                                  | none (hub skipped: preview off)                         |
 * | 2  | 4000   | swatch click                     | setSectionColor                      | always                                  | swatch classes, dot, custom input (PR4)                 |
 * | 3  | 4010   | custom colour `input`            | setSectionColor                      | always                                  | clear swatches, dot (PR4)                               |
 * | 4  | 4021   | name `input`                     | renameSection, commitRename          | iff panel IDs                           | title patch; WALL_SECTION_RENAMED iff panel IDs         |
 * | 5  | 4074   | number `change`                  | setSectionField, commitSectionEdit   | always, stats first                     | write-back, card patch, WALL_STATS_CHANGED twice        |
 * | 6  | 4118   | #add-section-btn                 | addSection                           | always, unless 200 sections (M-SEC-1)   | WALL_SECTIONS_CHANGED{add}                              |
 * | 7  | 4145   | .section-delete                  | deleteSection                        | always unless count <= 1 (then nothing) | logo entry removed, WALL_SECTIONS_CHANGED{delete}       |
 * | 8  | 4161   | mesh-mode label click (x2)       | setMeshMode x2                       | always, twice per click (B-L13)         | label classes, WALL_MESH_MODE_CHANGED                   |
 * | 9  | 4165   | #toggle-wireframe                | setWireframe                         | always                                  | toggle class                                            |
 * | 10 | 4166   | #toggle-frame                    | setShowFrame                         | always                                  | toggle class                                            |
 * | 11 | 4178   | #toggle-led-sim                  | setLedSim                            | always, after ledTiles.clearCache()     | DISPLAY_CONTENT_CHANGED{ledSim}                         |
 * | 12 | 4183   | #led-layout change               | setLedLayout                         | iff LED sim (cache cleared always)      | -                                                       |
 * | 13 | 4198   | #toggle-panel-ids                | setPanelIds                          | always (no cache clear)                 | DISPLAY_CONTENT_CHANGED{panelIds} (logo list iff on)    |
 * | 14 | 4203   | #panel-border-thickness change   | setPanelIdStyle, rebuildIfPanelIds   | iff panel IDs                           | write-back                                              |
 * | 15 | 4208   | #panel-font-size change          | same                                 | iff panel IDs                           | write-back                                              |
 * | 16 | 4212   | #panel-font-color input          | same                                 | iff panel IDs                           | -                                                       |
 * | 17 | 4217   | #toggle-section-labels           | same                                 | iff panel IDs                           | toggle class                                            |
 * | 18 | 4222   | #section-label-size change       | same                                 | iff panel IDs                           | write-back                                              |
 * | 19 | 4226   | #section-label-color input       | same                                 | iff panel IDs                           | -                                                       |
 * | 20 | 2272   | logo img.onload                  | rebuildIfPanelIds                    | iff panel IDs                           | logo entry set, logo list render                        |
 * | 21 | 2285   | logo clear                       | rebuildIfPanelIds                    | iff panel IDs                           | entry deleted, logo list render                         |
 * | 22 | 2292   | logo position change             | rebuildIfPanelIds                    | iff the entry exists and panel IDs      | -                                                       |
 * | 23 | 2303   | logo scale change                | rebuildIfPanelIds                    | iff the entry exists and panel IDs      | write-back always                                       |
 * | 24 | 5002   | import FileReader.onload         | applyImport                          | always (cause 'import'), in the `try`   | logos reset, pivot reset + WALL_PIVOT_CHANGED{import} (03 4.4), labels iff mesh_mode, WALL_SECTIONS_CHANGED{import} |
 * | F6-1 | -    | web fonts settled (App.start, runFontGate) | rebuildIfPanelIds          | iff a panel-ID canvas was drawn with a pending (font, text) and panel IDs are on | none |
 * | F3-1 | -    | pivot mode radio `change`        | PivotController.setMode -> commitPivot | iff the stage origin moved (cause 'pivot') | re-express iff keep; WALL_PIVOT_CHANGED{mode} |
 * | F3-2 | -    | pivot offset input `change`      | PivotController.setOffsetAxis -> commitPivot | iff the origin's x or z moved (never for y) | write-back toFixed(3) |
 * | F3-3 | -    | #pivot-reset-offset              | PivotController.resetOffset -> commitPivot | iff the origin moved             | -                                                       |
 * | F3-4 | -    | gizmo mouse-up after a pivot drag | PivotController.endGizmoDrag({cancel: false}) -> commitPivot | iff the origin moved; zero during the drag | Escape (cancel) commits nothing |
 * | F3-5 | -    | keep-stage or marker toggle      | setKeepStageLayout / setMarkerVisible | never                                   | WALL_PIVOT_CHANGED only                                 |
 *
 * No other path calls rebuild() (row F6-1, the font gate of 06 5.6, calls rebuildIfPanelIds at most once after the
 * web fonts settled), except commitPivot (03 5.6, rows F3-1 to F3-4 through app/PivotController's P-PIVOT, 03 T4:
 * rebuild({cause: 'pivot'}) iff the stage origin moved, else the pivot cache only). WALL_REBUILT carries the cause:
 * 'init' (row 1), 'import' (row 24), 'pivot' (commitPivot) and 'edit' (every other row). Never de-duplicate or debounce: row 8 rebuilds twice per click and rows 3, 16 and 19 rebuild
 * on every `input` event, exactly like legacy.
 */
import { Events } from '../core/EventBus.js';
import { computeWallLayout, layoutProject, resolvePivot, stageShift, yawShift } from '../geometry/WallLayout.js';
import { computeAtlas, sectionTextureScale } from '../geometry/TextureAtlas.js';
import { planSectionUvs, isLedMaskContent } from '../geometry/UvMapper.js';
import { Wall } from '../domain/Wall.js';

/**
 * Wall use cases and the P1 rebuild pipeline.
 */
export class WallController {
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../render/LEDWallView.js').LEDWallView} */
  #view;
  /** @type {import('../render/textures/LEDPixelTextureFactory.js').LEDPixelTextureFactory} */
  #ledTiles;
  /** @type {import('../interaction/OrbitController.js').OrbitController} */
  #orbit;
  /** @type {import('./CameraController.js').CameraHub} */
  #hub;
  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;
  /** @type {{sectionColors: ReadonlyArray<string>}} */
  #palette;
  /** @type {{alert(msg: string): void}} the dialogs facade (ui/dom.js createDialogs) */
  #dialogs;
  /**
   * The pivot resolution of the last rebuild (step 1) or pivot commit (03 5.6): null before the first rebuild and for a
   * non-finite layout. Read through pivotResolution by the framing bounds, the gizmo anchor and the exports.
   * @type {import('../geometry/WallLayout.js').PivotResolution|null}
   */
  #pivotResolution = null;
  /**
   * The stage layout of the last rebuild (step 1; 08 P2-11a): the layout instance whose memoised columnQuads() the
   * coverage analyser reads on every pose change. null before the first rebuild.
   * @type {import('../geometry/WallLayout.js').WallLayout|null}
   */
  #currentLayout = null;

  /**
   * Stores the collaborators only (R4).
   * Side effects: none.
   * @param {{project: import('../domain/Project.js').Project,
   *          view: import('../render/LEDWallView.js').LEDWallView,
   *          ledTiles: import('../render/textures/LEDPixelTextureFactory.js').LEDPixelTextureFactory,
   *          orbit: import('../interaction/OrbitController.js').OrbitController,
   *          hub: import('./CameraController.js').CameraHub,
   *          bus: import('../core/EventBus.js').EventBus,
   *          palette: {sectionColors: ReadonlyArray<string>},
   *          dialogs: {alert(msg: string): void}}} deps
   *   dialogs: for M-SEC-1 (08 P2-3b)
   */
  constructor({ project, view, ledTiles, orbit, hub, bus, palette, dialogs }) {
    this.#project = project;
    this.#view = view;
    this.#ledTiles = ledTiles;
    this.#orbit = orbit;
    this.#hub = hub;
    this.#bus = bus;
    this.#palette = palette;
    this.#dialogs = dialogs;
  }

  /**
   * The rebuild observers (04 5.3, UV-11; ordered direct calls, R2, not events): onWallRebuilt at P1 step 8 and
   * onSectionRenamed in commitRename. App registers the UvController before the bootstrap rebuild.
   * @type {{onWallRebuilt(info: object): void, onSectionRenamed?(): void}[]}
   */
  #rebuildObservers = [];

  /**
   * Registers a rebuild observer (04 5.3): `o.onWallRebuilt({layout, atlas, plans, sectionScale, cause})` is called at
   * every rebuild after the camera hub and before WALL_REBUILT (P1 step 8, 04 6.13), and `o.onSectionRenamed?.()` at
   * every commitRename, before its panel-ID branch.
   * Side effects: none besides the registration.
   * @param {{onWallRebuilt(info: object): void, onSectionRenamed?(): void}} o
   */
  addRebuildObserver(o) {
    this.#rebuildObservers.push(o);
  }

  /**
   * A fresh layout of the live sections (the single cursor walk) in a frame of 03 5.1: the stage frame (the default)
   * for the rebuild, the export frame for the exporters (ProjectIO, 03 7).
   * Ports: index.html@cd3fd3f lines 1479-1549 (the walk itself lives in geometry/WallLayout).
   * Side effects: none.
   * @param {{frame?: 'stage'|'export'|'layout'}} [options]
   * @returns {import('../geometry/WallLayout.js').WallLayout} layoutProject(project, {frame})
   */
  layout({ frame = 'stage' } = {}) {
    return layoutProject(this.#project, { frame });
  }

  /**
   * The cached pivot resolution (03 5.6): set in rebuild step 1 and by commitPivot, before WALL_REBUILT and
   * SELECTABLE_MOVED are emitted, so readers never depend on subscriber order.
   * Side effects: none.
   * @returns {import('../geometry/WallLayout.js').PivotResolution|null}
   */
  get pivotResolution() {
    return this.#pivotResolution;
  }

  /**
   * The stage layout of the last rebuild (08 P2-11a, 6.10): every wall change rebuilds, so it is the live wall in the
   * stage frame, and its memoised columnQuads() and worldVertices() are derived once per rebuild. Before the first
   * rebuild it is computed (and cached) on demand.
   * Side effects: on the first read before any rebuild, caches layout().
   * @returns {import('../geometry/WallLayout.js').WallLayout}
   */
  get currentLayout() {
    if (!this.#currentLayout) this.#currentLayout = this.layout();
    return this.#currentLayout;
  }

  /**
   * The resolution of the live pivot against the live sections, without rebuilding or caching (03 6.3).
   * Side effects: none.
   * @returns {import('../geometry/WallLayout.js').PivotResolution|null}
   *   resolvePivot(computeWallLayout(project.wall.sections), project.wall.pivot)
   */
  resolvePivotNow() {
    return resolvePivot(computeWallLayout(this.#project.wall.sections), this.#project.wall.pivot);
  }

  /**
   * The pivot use case's rebuild decision (03 5.6, P-PIVOT; ARCHITECTURE.md 6.2: this module decides wall rebuilds):
   * when the stage origin moved against the cached resolution, the wall rebuilds with cause 'pivot' (which caches
   * `after`); otherwise (a height-only change, or none) only the cache is updated, because the stage frame and the
   * framing read the stage origin only.
   * Side effects: rebuild({cause: 'pivot'}) or writes the cache.
   * @param {import('../geometry/WallLayout.js').PivotResolution|null} after  resolvePivotNow() of the new pivot
   */
  commitPivot(after) {
    const shift = stageShift(this.#pivotResolution, after);
    if (shift.x !== 0 || shift.z !== 0 || yawShift(this.#pivotResolution, after) !== 0) {   // 03 12.6: or the yaw
      this.rebuild({ cause: 'pivot' });
    } else {
      this.#pivotResolution = after;
    }
  }

  /**
   * P1 (ARCHITECTURE.md 6.1), legacy createLEDWall: layout -> view rebuild -> stats -> orbit target -> camera hub
   * (iff the preview is on) -> WALL_REBUILT. Exceptions of steps 1-5 propagate unchanged (no try/catch, R13).
   * Step 1 (03 5.6) lays the wall out in the stage frame, caches its pivot resolution and measures the stage-origin
   * shift against the previously cached one; WALL_REBUILT carries both with the cause (03 5.5): 'init' (the bootstrap),
   * 'pivot' (commitPivot), 'import' (applyImport) or 'edit' (every other call site).
   * Ports: index.html@cd3fd3f lines 1457-1577 (orchestration; tail 1574-1576).
   * Side effects: writes the layout and pivot caches; view.rebuild (scene); emits WALL_STATS_CHANGED; orbit.updateCameraPosition
   *   (main camera); hub.refresh (iff project.camera.enabled); emits WALL_REBUILT {layout, meshMode, view, cause,
   *   stageShift}.
   * @param {{cause?: 'init'|'pivot'|'import'|'edit'}} [options]
   */
  rebuild({ cause = 'edit' } = {}) {
    const project = this.#project;
    // 1. layout (PR1: computed before the view disposes the old wall; pure, no THREE ids), stage frame (03 5.6)
    const prev = this.#pivotResolution;
    const layout = this.layout();
    this.#currentLayout = layout;
    this.#pivotResolution = layout.pivot.resolution;
    const shift = stageShift(prev, this.#pivotResolution);
    const yawShiftDeg = yawShift(prev, this.#pivotResolution);   // 03 12.4
    // 2. (04 6.13 steps 2-3, UV-7; pure) the atlas, the section-texture scale of the 16 MP viewport budget and one UV
    // plan per section (base UVs for LED-mask content), then dispose + groups + build + frames + scene.add (1458-1477,
    // 1551-1572)
    const meshMode = project.meshMode;
    const sections = layout.sections.map((sl) => sl.section);
    const atlas = computeAtlas(sections);
    const sectionScale = sectionTextureScale(sections);
    const uvPlans = planSectionUvs({ layout, atlas, settings: project.uv, meshMode,
      applyTransforms: !isLedMaskContent(project.display.content) });
    this.#view.rebuild({ layout, meshMode, display: project.display, atlas, uvPlans, sectionScale, uvSettings: project.uv });
    // 3. updateStats() (1574)
    this.publishStats();
    // 4. updateCameraPosition() (1575): flat target; moves the camera even in pilot mode
    this.#orbit.updateCameraPosition();
    // 5. if (cameraPreviewEnabled) updateCameraFrustum() (1576): re-drives the pilot view after step 4
    if (project.camera.enabled) this.#hub.refresh();
    // 5b. (04 6.13 step 8, UV-11) the rebuild observers: the UvController caches the layout, atlas and plans for the live
    // UV path, keeps its viewed section valid and refreshes the viewer and the sidebar atlas note
    for (const o of this.#rebuildObservers) o.onWallRebuilt({ layout, atlas, plans: uvPlans, sectionScale, cause });
    // 6. feature seam: cause and stageShift since 03 T3 (additive; the Phase-1 subscribers ignore them)
    this.#bus.emit(Events.WALL_REBUILT, { layout, meshMode, view: this.#view, cause, stageShift: shift, yawShiftDeg });
  }

  /**
   * Publishes the header totals (legacy updateStats; the DOM writes are HeaderStats' mirror).
   * Ports: index.html@cd3fd3f lines 2307-2313 (call sites 1574, 4073).
   * Side effects: emits WALL_STATS_CHANGED with project.wall.totals().
   */
  publishStats() {
    this.#bus.emit(Events.WALL_STATS_CHANGED, this.#project.wall.totals());
  }

  /**
   * P-ADD (ARCHITECTURE.md 6.4): appends a copy of the last section, lets the panels re-render (the card list
   * snapshots and restores the collapse states, PR2/PR3), then rebuilds. A wall that already has Wall.MAX_SECTIONS
   * (200) sections gets the M-SEC-1 alert and nothing else (08 P2-3b: the validator refuses a file with more, so the app
   * never writes one). The wall is never empty since 08 P2-3b (B-L8 fixed: an import without sections is refused).
   * Ports: index.html@cd3fd3f lines 4081-4119.
   * Side effects: model (wall.sections, wall.nextSectionId); emits WALL_SECTIONS_CHANGED {reason: 'add', addedId};
   *   rebuild(); or, at the cap, one alert.
   */
  addSection() {
    if (!this.#project.wall.canAddSection()) {
      this.#dialogs.alert(`A wall can have at most ${Wall.MAX_SECTIONS} sections.`);
      return;
    }
    const newSection = this.#project.wall.appendLikeLast(this.#palette.sectionColors);
    this.#bus.emit(Events.WALL_SECTIONS_CHANGED, { reason: 'add', addedId: newSection.id });
    this.rebuild();
  }

  /**
   * P-DEL (ARCHITECTURE.md 6.4): no-op when the wall has one section or fewer; otherwise removes the section's
   * logo entry and every section with that id (duplicates included, B-L8), lets the panels re-render, then rebuilds.
   * Ports: index.html@cd3fd3f lines 4121-4146.
   * Side effects: model (logos, wall.sections); emits WALL_SECTIONS_CHANGED {reason: 'delete'}; rebuild().
   * @param {*} id  the section id captured by the card (compared strictly, never coerced)
   */
  deleteSection(id) {
    const project = this.#project;
    if (project.wall.count <= 1) return;

    // Clean up logo for deleted section
    project.logos.remove(id);

    project.wall.removeById(id);
    this.#bus.emit(Events.WALL_SECTIONS_CHANGED, { reason: 'delete' });

    this.rebuild();
  }

  /**
   * Stores a card number input through the section's field rules (model only; the card writes the value back,
   * patches itself and then calls commitSectionEdit()).
   * Ports: index.html@cd3fd3f lines 4028-4038.
   * Side effects: writes section[field].
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {string} field  the input's data-field
   * @param {string} raw    the input's value
   * @returns {number} the stored value
   */
  setSectionField(section, field, raw) {
    return section.setField(field, raw);
  }

  /**
   * The tail of the card number handler: updateStats() then createLEDWall(). The stats-first duplicate is kept
   * (it is observable when the rebuild throws).
   * Ports: index.html@cd3fd3f lines 4073-4074.
   * Side effects: emits WALL_STATS_CHANGED; rebuild() (which emits WALL_STATS_CHANGED again).
   */
  commitSectionEdit() {
    this.publishStats();
    this.rebuild();
  }

  /**
   * Swatch click / custom colour input: model, then rebuild (on every `input` event, never debounced).
   * Ports: index.html@cd3fd3f lines 3997 + 4000, 4007 + 4010.
   * Side effects: writes section.color; rebuild().
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {string} color
   */
  setSectionColor(section, color) {
    section.setColor(color);
    this.rebuild();
  }

  /**
   * Name input: an empty value falls back to `Wall ${index + 1}` (model only; the card patches its title and
   * then calls commitRename()).
   * Ports: index.html@cd3fd3f line 4016.
   * Side effects: writes section.name.
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {string} raw     the input's value
   * @param {number} index   the card index captured at render time
   * @returns {*} the stored name
   */
  renameSection(section, raw, index) {
    return section.rename(raw, index);
  }

  /**
   * The tail of the name handler: only with panel IDs on, the logo list re-renders (mirror) and the wall rebuilds.
   * 04 5.3 (UV-11): every rebuild observer hears of the rename first, always (the UV viewer's names refresh even when
   * panel IDs are off and nothing rebuilds).
   * Ports: index.html@cd3fd3f lines 4019-4022.
   * Side effects: o.onSectionRenamed?.() for each rebuild observer; iff panel IDs: emits WALL_SECTION_RENAMED {}; rebuild().
   */
  commitRename() {
    for (const o of this.#rebuildObservers) o.onSectionRenamed?.();
    if (this.#project.display.panelIdsEnabled) {
      this.#bus.emit(Events.WALL_SECTION_RENAMED, {});
      this.rebuild();
    }
  }

  /**
   * Mesh-mode label click: model, label mirror, rebuild.
   * Ports: index.html@cd3fd3f lines 4160-4161.
   * Side effects: writes project.meshMode; emits WALL_MESH_MODE_CHANGED {mode}; rebuild().
   * @param {*} mode  the label's data-mode ('combined' | 'section' | 'panel')
   */
  setMeshMode(mode) {
    // LEGACY(B-L13): called twice per label click (the hidden radio's synthetic click bubbles back to the label),
    // so the wall rebuilds twice. Never de-duplicate here and never add a "mode unchanged" guard in Phase 1.
    this.#project.meshMode = mode;
    this.#bus.emit(Events.WALL_MESH_MODE_CHANGED, { mode });
    this.rebuild();
  }

  /**
   * Ports: index.html@cd3fd3f line 4165 (after the toggle class flip).
   * Side effects: writes display.wireframe; rebuild().
   * @param {boolean} on  the toggle's new state
   */
  setWireframe(on) {
    this.#project.display.wireframe = on;
    this.rebuild();
  }

  /**
   * Ports: index.html@cd3fd3f line 4166 (after the toggle class flip).
   * Side effects: writes display.showFrame; rebuild().
   * @param {boolean} on  the toggle's new state
   */
  setShowFrame(on) {
    this.#project.display.showFrame = on;
    this.rebuild();
  }

  /**
   * LED simulation toggle: model (forces panel IDs off when turning on), option-block mirror, tile cache clear,
   * rebuild.
   * Ports: index.html@cd3fd3f lines 4168-4178 (after the toggle class flip).
   * Side effects: writes display.content; emits DISPLAY_CONTENT_CHANGED {toggled: 'ledSim', on, forcedOff};
   *   ledTiles.clearCache(); rebuild().
   * @param {boolean} on  the toggle's new state
   */
  setLedSim(on) {
    const forcedOff = this.#project.display.setLedSim(on);
    this.#bus.emit(Events.DISPLAY_CONTENT_CHANGED, { toggled: 'ledSim', on, forcedOff });
    this.#ledTiles.clearCache();
    this.rebuild();
  }

  /**
   * LED layout select: model, tile cache clear (always), rebuild only while LED sim is on.
   * Ports: index.html@cd3fd3f lines 4181-4183.
   * Side effects: writes display.ledLayout; ledTiles.clearCache(); rebuild() iff LED sim.
   * @param {string} layout  the select's value
   */
  setLedLayout(layout) {
    const display = this.#project.display;
    display.ledLayout = layout;
    this.#ledTiles.clearCache();
    if (display.ledSimEnabled) this.rebuild();
  }

  /**
   * Panel-ID toggle: model (forces LED sim off when turning on), option-block mirror (and the logo list render
   * when on), rebuild. No tile cache clear, as legacy.
   * Ports: index.html@cd3fd3f lines 4188-4198 (after the toggle class flip).
   * Side effects: writes display.content; emits DISPLAY_CONTENT_CHANGED {toggled: 'panelIds', on, forcedOff};
   *   rebuild().
   * @param {boolean} on  the toggle's new state
   */
  setPanelIds(on) {
    const forcedOff = this.#project.display.setPanelIds(on);
    this.#bus.emit(Events.DISPLAY_CONTENT_CHANGED, { toggled: 'panelIds', on, forcedOff });
    this.rebuild();
  }

  /**
   * Panel-ID style input (model only): numeric keys go through PanelIdStyle.RULES (parseInt without radix),
   * colours and the section-label flag are stored as given. The panel writes numeric values back and then calls
   * rebuildIfPanelIds().
   * Ports: index.html@cd3fd3f lines 4201, 4206, 4211, 4216, 4220, 4225.
   * Side effects: writes project.panelIdStyle[key].
   * @param {'borderThickness'|'fontSize'|'fontColor'|'sectionLabelEnabled'|'sectionLabelFontSize'|'sectionLabelColor'} key
   * @param {*} rawOrValue
   * @returns {*} the stored value
   */
  setPanelIdStyle(key, rawOrValue) {
    return this.#project.panelIdStyle.set(key, rawOrValue);
  }

  /**
   * `if (panelIdsEnabled) createLEDWall();` of the style inputs and the logo handlers (rows 14-23), and the font
   * gate's one corrective redraw (row F6-1, app/fontGate.js).
   * Ports: index.html@cd3fd3f lines 4203, 4208, 4212, 4217, 4222, 4226, 2272, 2285, 2292, 2303.
   * Side effects: rebuild() iff panel IDs are on.
   */
  rebuildIfPanelIds() {
    if (this.#project.display.panelIdsEnabled) this.rebuild();
  }

  /**
   * The tail of P-IMPORT (ARCHITECTURE.md 6.10), inside the import `try`: reset the logo library and install only the
   * logos given (08 P2-3d, B-L21 fixed: legacy kept every entry, so logos keyed by old ids reattached to imported
   * sections that reused those ids; a v1 import passes none), replace the sections (and the id allocator), adopt a
   * truthy mesh mode (label mirror), re-render the cards (first expanded) and, with panel IDs on, the logo list, rebuild.
   * Feature 3 (03 4.4, Q14; 12.11): the file's pivot replaces the session's; a file without one (every file until project
   * file v2: the pivot is session-only, the owner's decision of 2026-10-17) keeps the session's pivot and orientation
   * (the owner's rule of 2026-10-17). Either way after the sections and before the rebuild, which runs with cause 'import'. An import is a load: nothing is re-expressed. Since 03 T4 the pivot
   * mirrors hear of it at once (WALL_PIVOT_CHANGED {source: 'import'}, 03 5.5), before the other import mirrors.
   * Ports: index.html@cd3fd3f lines 4976 + 4989 (via Wall.replaceAll), 4991-4996, 4998-5002.
   * Side effects: model (logos, wall, wall.pivot, project.meshMode iff truthy); emits WALL_PIVOT_CHANGED {source:
   *   'import', pivot, resolution: resolvePivotNow(), stageShift against the cache, reexpressed: false, rebuilds: true},
   *   then WALL_MESH_MODE_CHANGED {mode} iff meshMode is truthy, then WALL_SECTIONS_CHANGED {reason: 'import'};
   *   rebuild({cause: 'import'}).
   * @param {{sections: import('../domain/WallSection.js').WallSection[], meshMode: *,
   *          logos?: Array<[*, import('../domain/LogoLibrary.js').LogoEntry]>|null,
   *          pivot?: import('../domain/Wall.js').WallPivot|null}} parsed
   *   sections and meshMode from the validated read; logos: [sectionId, entry] pairs to install after the reset (the
   *   later v2 restore, 08 6.17), null for a v1 import; pivot: the file's validated pivot (03 T7, with project file v2),
   *   null or absent for a v1 file (the identity)
   */
  applyImport({ sections, meshMode, logos = null, pivot = null }) {
    const project = this.#project;
    project.logos.clear();
    if (logos) for (const [sectionId, entry] of logos) project.logos.set(sectionId, entry);
    project.wall.replaceAll(sections);
    // Owner rule (03 12.11): a file without a pivot (every v1 file) keeps the session's pivot and orientation
    if (pivot) project.wall.pivot = pivot;
    // 03 T4 (4.4, 5.5): the pivot mirrors follow the file's pivot before the rebuild; nothing is re-expressed.
    const resolution = this.resolvePivotNow();
    this.#bus.emit(Events.WALL_PIVOT_CHANGED, {
      source: 'import', pivot: project.wall.pivot.clone(), resolution,
      stageShift: stageShift(this.#pivotResolution, resolution), yawShiftDeg: yawShift(this.#pivotResolution, resolution),
      reexpressed: false, rebuilds: true,
    });

    if (meshMode) {
      project.meshMode = meshMode;
      this.#bus.emit(Events.WALL_MESH_MODE_CHANGED, { mode: meshMode });
    }

    this.#bus.emit(Events.WALL_SECTIONS_CHANGED, { reason: 'import' });
    this.rebuild({ cause: 'import' });
  }
}
