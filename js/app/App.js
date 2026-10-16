/**
 * @module app/App
 * Composition root. Constructs every module in the order of ARCHITECTURE.md section 7 (no THREE allocation, no
 * DOM mutation and no listeners while constructing: only DOM-id lookups and bus subscriptions), then runs the legacy
 * bootstrap `init(); setupUI(); setView('reset');` as the init phase, the setupUI phase and the reset view.
 * It is the only module that imports theme/Theme.js and vendor/jszip.js, and (besides the ui/ panels) the only one
 * that looks up DOM ids: '#three-canvas' for SceneManager and the six preview-window ids for PreviewWindow.
 * Nothing is attached to window.
 * Legacy source: index.html@cd3fd3f 1426-1455 (init), 3884-3890 (animate: the frame tick), 4148-4489 (setupUI,
 * statement order), 5093-5095 (bootstrap).
 * Layer: app/App.js (composition root; may import everything).
 */

import THREE from '../vendor/three.js';
import JSZip from '../vendor/jszip.js';
import { EventBus } from '../core/EventBus.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { Theme } from '../theme/Theme.js';
import { Project } from '../domain/Project.js';
import { DebugViewSettings } from '../domain/DebugViewSettings.js';
import { framingBounds } from '../geometry/WallLayout.js';
import { WallMeshBuilder } from '../geometry/WallMeshBuilder.js';
import { SceneManager } from '../render/SceneManager.js';
import { LEDWallView } from '../render/LEDWallView.js';
import { LEDMaterialFactory } from '../render/LEDMaterialFactory.js';
import { LEDPixelTextureFactory } from '../render/textures/LEDPixelTextureFactory.js';
import { PanelIdRenderer } from '../render/textures/PanelIdRenderer.js';
import { CameraRigView } from '../render/CameraRigView.js';
import { SafeDistanceView } from '../render/SafeDistanceView.js';
import { PreviewWindow } from '../render/PreviewWindow.js';
import { PersonPropView, CarPropView } from '../render/PropViews.js';
import { DebugMaterials } from '../render/DebugMaterials.js';
import { NormalsDebugView } from '../render/NormalsDebugView.js';
import { InteractionState, KeyboardState, PointerRay } from '../interaction/InputState.js';
import { OrbitController } from '../interaction/OrbitController.js';
import { SelectionManager } from '../interaction/SelectionManager.js';
import { TransformGizmo } from '../interaction/TransformGizmo.js';
import { PilotCameraDriver, PilotController } from '../interaction/PilotController.js';
import { ViewportInput } from '../interaction/ViewportInput.js';
import { ProjectSerializer } from '../io/ProjectSerializer.js';
import { ObjExporter } from '../io/ObjExporter.js';
import { GltfExporter } from '../io/GltfExporter.js';
import { WallController } from './WallController.js';
import { CameraHub, CameraController } from './CameraController.js';
import { PropController } from './PropController.js';
import { Downloader, ProjectIO } from './ProjectIO.js';
import { DebugViewController } from './DebugViewController.js';
import { byId, createDialogs } from '../ui/dom.js';
import { HeaderStats } from '../ui/HeaderStats.js';
import { SectionListPanel } from '../ui/SectionListPanel.js';
import { WallDisplayPanel } from '../ui/WallDisplayPanel.js';
import { SectionLogosPanel } from '../ui/SectionLogosPanel.js';
import { CameraPanel } from '../ui/CameraPanel.js';
import { PropControls } from '../ui/PropsPanel.js';
import { ViewportToolbar } from '../ui/ViewportToolbar.js';
import { ExportPanel } from '../ui/ExportPanel.js';

/**
 * The application: wires the modules together and runs the legacy bootstrap.
 */
export class App {
  /** @type {Document} */
  #doc;
  /** @type {Window} */
  #win;

  /**
   * Stores the injected browser objects. Constructs nothing else (start() runs the construct phase).
   * Side effects: none.
   * @param {{doc: Document, win: Window}} deps
   */
  constructor({ doc, win }) {
    this.#doc = doc;
    this.#win = win;
  }

  /**
   * Runs ARCHITECTURE.md section 7 exactly: construct (no side effects except DOM-id lookups and bus subscriptions),
   * then the legacy init() phase (1426-1455), the legacy setupUI() phase (4148-4489, statement order) and
   * setView('reset') (5095). Nothing is attached to window.
   * Ports: index.html@cd3fd3f lines 5093-5095.
   * Side effects: builds the scene and the wall, adds every DOM/canvas/window listener in the legacy order, starts
   *   the frame loop (its first frame runs synchronously inside the init phase), renders the section cards and
   *   emits the bootstrap events (WALL_STATS_CHANGED).
   * @returns {void}
   */
  start() {
    const doc = this.#doc;
    const win = this.#win;

    // ---- construct (R4: no THREE allocation, no DOM mutation, no listeners; lookups and bus subscriptions only) ----
    const theme = Theme;
    const brand = theme.brand;
    const bus = new EventBus();
    const dialogs = createDialogs(win);
    const project = Project.createDefault();
    const display = project.display;
    const style = project.panelIdStyle;
    const logos = project.logos;
    const cine = project.camera;
    const person = project.person;
    const car = project.car;
    const frameBounds = () => framingBounds(project);
    const colorToRgb = (s) => new THREE.Color(s);

    const interaction = new InteractionState();
    const keyboard = new KeyboardState({ doc, win });
    const sceneManager = new SceneManager({ canvas: byId(doc, 'three-canvas'), win, display, theme });
    const pointerRay = new PointerRay({ sceneManager });
    const ledTiles = new LEDPixelTextureFactory({ doc, display, theme });
    const panelIds = new PanelIdRenderer({ doc, style, logos, theme });
    const materials = new LEDMaterialFactory({ display, panelIds, ledTiles, win });
    // The normals debug view (01 F1-1, 5.7): settings, lazily created materials, the wall override and the lines.
    // Nothing is allocated until a debug option is switched on; the lines view subscribes WALL_REBUILT before the
    // bootstrap rebuild, so it caches the first layout.
    const debugSettings = new DebugViewSettings();
    const debugMaterials = new DebugMaterials({ theme });
    const wallView = new LEDWallView({
      sceneManager, materials, builder: new WallMeshBuilder(Strategies.mesh.viewport), theme, debugMaterials,
    });
    const normalsView = new NormalsDebugView({ sceneManager, bus, settings: debugSettings, materials: debugMaterials, theme });
    // F1-1 has no bus, no event and no UI: 01 T7 (F1-2) adds the bus, DEBUG_VIEW_CHANGED and DebugViewControls.
    const debugController = new DebugViewController({ settings: debugSettings, wallView, normalsView });
    const rig = new CameraRigView({ sceneManager, bus, theme });
    const safeDistance = new SafeDistanceView({ sceneManager, doc, theme });
    const preview = new PreviewWindow({
      doc,
      win,
      cine,
      elements: {
        windowEl: byId(doc, 'camera-preview-window'),
        canvas: byId(doc, 'camera-preview-canvas'),
        resizeHandle: byId(doc, 'camera-preview-resize'),
        info: byId(doc, 'camera-preview-info'),
        fov: byId(doc, 'camera-preview-fov'),
        res: byId(doc, 'camera-preview-res'),
      },
    });
    const personView = new PersonPropView({ sceneManager, theme });
    const carView = new CarPropView({ sceneManager, theme });
    // Subscribed before the bootstrap rebuild, so the first WALL_STATS_CHANGED reaches the header.
    const headerStats = new HeaderStats({ doc, bus });
    const orbit = new OrbitController({ sceneManager, keyboard, interaction, frameBounds });
    const gizmo = new TransformGizmo({ sceneManager, pointerRay, interaction, bus, theme });
    const selection = new SelectionManager({ bus, gizmo, pointerRay, interaction });
    const pilotDriver = new PilotCameraDriver({ sceneManager, cine, rig, interaction });
    const hub = new CameraHub({ project, rig, preview, safeDistance, pilotDriver, frameBounds, bus });
    const pilot = new PilotController({
      sceneManager, cine, driver: pilotDriver, orbit, keyboard, interaction, hub, bus, dialogs,
    });
    const cameraController = new CameraController({ project, rig, preview, hub, pilot, selection, frameBounds, bus });
    const personController = new PropController({ prop: person, view: personView, selection, bus });
    const carController = new PropController({ prop: car, view: carView, selection, bus });
    // Registration order is the raycast tie order of legacy handleViewportClick (3438-3461): camera, person, car.
    selection.register(cameraController);
    selection.register(personController);
    selection.register(carController);
    const wallController = new WallController({
      project, view: wallView, ledTiles, orbit, hub, bus, palette: theme.palette,
    });
    const serializer = new ProjectSerializer({ palette: theme.palette });
    const objExporter = new ObjExporter({ brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.obj) });
    const gltfExporter = new GltfExporter({ brand, colorToRgb, builder: new WallMeshBuilder(Strategies.mesh.gltf) });
    const projectIO = new ProjectIO({
      project,
      wallController,
      serializer,
      objExporter,
      gltfExporter,
      panelIds,
      safeDistance,
      downloader: new Downloader({ doc, win }),
      JSZip,
      dialogs,
      brand,
      win,
    });
    // Panels: WALL_SECTIONS_CHANGED runs SectionListPanel then SectionLogosPanel, and DISPLAY_CONTENT_CHANGED runs
    // WallDisplayPanel then SectionLogosPanel (construction order = subscription order, ARCHITECTURE.md 5.2).
    const sectionList = new SectionListPanel({ doc, project, wallController, bus });
    const displayPanel = new WallDisplayPanel({ doc, wallController, bus });
    const logosPanel = new SectionLogosPanel({ doc, project, wallController, bus });
    const cameraPanel = new CameraPanel({ doc, project, cameraController, projectIO, bus, theme });
    const personControls = new PropControls({ doc, prefix: 'person', controller: personController, prop: person, bus });
    const carControls = new PropControls({ doc, prefix: 'car', controller: carController, prop: car, bus });
    const toolbar = new ViewportToolbar({ doc, orbit, sceneManager, gizmo, pilot, bus });
    const viewportInput = new ViewportInput({ doc, win, sceneManager, interaction, gizmo, selection, pilot });
    const exportPanel = new ExportPanel({ doc, projectIO });
    // Legacy animate body (3886-3889).
    const tick = () => {
      orbit.tickKeyboard();
      pilot.tickKeyboard();
      sceneManager.render();
      preview.render(sceneManager.scene);
    };

    // ---- legacy init() (1426-1455) ----
    sceneManager.init();                       // 1427-1449: scene, camera, renderer, lights, grid, axes
    wallController.rebuild();                  // 1451: P1 (stats via HeaderStats, orbit target; hub skipped)
    orbit.attach();                            // 1452 setupControls: canvas mousedown, mousemove, mouseup, mouseleave, wheel
    keyboard.attach();                         // 1452 setupControls: doc keydown, doc keyup, win blur
    sceneManager.attachResize();               // 1453
    sceneManager.startLoop(tick);              // 1454: the first frame runs synchronously, before setupUI

    // ---- legacy setupUI() (4148-4489), statement order ----
    sectionList.render();                      // 4149
    sectionList.expandFirst();                 // 4150-4152
    sectionList.bindAddButton();               // 4154
    displayPanel.bind();                       // 4156-4227
    cameraPanel.bind();                        // 4230-4329
    personControls.bind();                     // 4332-4361
    carControls.bind();                        // 4363-4392
    toolbar.bind();                            // 4394-4407
    viewportInput.attachShortcuts();           // 4410-4434 (doc keydown, after KeyboardState's)
    viewportInput.attachPointer();             // 4437-4479 (canvas listeners after the orbit ones; win mouseup; wheel)
    exportPanel.bind();                        // 4481-4488

    // ---- legacy setView('reset') (5095) ----
    orbit.setView('reset');
  }
}
