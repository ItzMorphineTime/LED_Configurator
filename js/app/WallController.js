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
 * | 1  | 1451   | bootstrap (App.start)            | rebuild()                            | always                                  | none (hub skipped: preview off)                         |
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
 * | 24 | 5002   | import FileReader.onload         | applyImport                          | always, inside the import `try`         | logos reset, labels iff mesh_mode, WALL_SECTIONS_CHANGED{import} |
 * | F6-1 | -    | web fonts settled (App.start, runFontGate) | rebuildIfPanelIds          | iff a panel-ID canvas was drawn with a pending (font, text) and panel IDs are on | none |
 *
 * No other path calls rebuild() (row F6-1, the font gate of 06 5.6, calls rebuildIfPanelIds at most once after the
 * web fonts settled). Never de-duplicate or debounce: row 8 rebuilds twice per click and rows 3, 16 and 19 rebuild
 * on every `input` event, exactly like legacy.
 */
import { Events } from '../core/EventBus.js';
import { layoutProject } from '../geometry/WallLayout.js';
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
   * A fresh layout of the live sections (the single cursor walk), as used by the rebuild and the exporters.
   * Ports: index.html@cd3fd3f lines 1479-1549 (the walk itself lives in geometry/WallLayout).
   * Side effects: none.
   * @returns {import('../geometry/WallLayout.js').WallLayout} layoutProject(project)
   */
  layout() {
    return layoutProject(this.#project);
  }

  /**
   * P1 (ARCHITECTURE.md 6.1), legacy createLEDWall: layout -> view rebuild -> stats -> orbit target -> camera hub
   * (iff the preview is on) -> WALL_REBUILT. Exceptions of steps 1-5 propagate unchanged (no try/catch, R13).
   * Ports: index.html@cd3fd3f lines 1457-1577 (orchestration; tail 1574-1576).
   * Side effects: view.rebuild (scene); emits WALL_STATS_CHANGED; orbit.updateCameraPosition (main camera);
   *   hub.refresh (iff project.camera.enabled); emits WALL_REBUILT {layout, meshMode, view}.
   */
  rebuild() {
    const project = this.#project;
    // 1. layout (PR1: computed before the view disposes the old wall; pure, no THREE ids)
    const layout = this.layout();
    // 2. dispose + groups + build + frames + scene.add (1458-1477, 1551-1572)
    const meshMode = project.meshMode;
    this.#view.rebuild({ layout, meshMode, display: project.display });
    // 3. updateStats() (1574)
    this.publishStats();
    // 4. updateCameraPosition() (1575): flat target; moves the camera even in pilot mode
    this.#orbit.updateCameraPosition();
    // 5. if (cameraPreviewEnabled) updateCameraFrustum() (1576): re-drives the pilot view after step 4
    if (project.camera.enabled) this.#hub.refresh();
    // 6. feature seam (no Phase-1 subscribers)
    this.#bus.emit(Events.WALL_REBUILT, { layout, meshMode, view: this.#view });
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
   * Ports: index.html@cd3fd3f lines 4019-4022.
   * Side effects: iff panel IDs: emits WALL_SECTION_RENAMED {}; rebuild().
   */
  commitRename() {
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
   * Ports: index.html@cd3fd3f lines 4976 + 4989 (via Wall.replaceAll), 4991-4996, 4998-5002.
   * Side effects: model (logos, wall, project.meshMode iff truthy); emits WALL_MESH_MODE_CHANGED {mode} iff meshMode is
   *   truthy, then WALL_SECTIONS_CHANGED {reason: 'import'}; rebuild().
   * @param {{sections: import('../domain/WallSection.js').WallSection[], meshMode: *,
   *          logos?: Array<[*, import('../domain/LogoLibrary.js').LogoEntry]>|null}} parsed
   *   sections and meshMode from the validated read; logos: [sectionId, entry] pairs to install after the reset (the
   *   later v2 restore, 08 6.17), null for a v1 import
   */
  applyImport({ sections, meshMode, logos = null }) {
    const project = this.#project;
    project.logos.clear();
    if (logos) for (const [sectionId, entry] of logos) project.logos.set(sectionId, entry);
    project.wall.replaceAll(sections);

    if (meshMode) {
      project.meshMode = meshMode;
      this.#bus.emit(Events.WALL_MESH_MODE_CHANGED, { mode: meshMode });
    }

    this.#bus.emit(Events.WALL_SECTIONS_CHANGED, { reason: 'import' });
    this.rebuild();
  }
}
