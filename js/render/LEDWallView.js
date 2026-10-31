/**
 * @module render/LEDWallView
 * Builds and disposes the LED wall and panel-frame groups from a WallLayout; tags meshes.
 * Three builders reproduce the legacy mesh modes ('combined', 'section', anything else = panels) with the legacy
 * THREE allocation order (geometry -> texture -> material -> mesh), because three r128 sorts draw calls by ids
 * allocated from global counters (R4, R5). No extra parent, renderable or layer is introduced (R6).
 * The normals debug view's shading (docs/improvements/01-normals.md 5.2, F1-1) is a material override on the LED
 * meshes through MaterialOverride: the content materials are stashed while a shared debug material is shown, put back
 * before every rebuild disposes the old wall, and put back around stills (withContentMaterials, 07 C48). The debug
 * materials are created by DebugMaterials on first use, so nothing changes until the shading is switched on.
 * Panel mode with panel IDs (08 P2-12d, 08 6.15): one material per section, shared by its panels, samples the section
 * canvas; each panel's PlaneGeometry UVs are rewritten into section space (WallMeshBuilder.panelUvs). LED sim and colour
 * keep one material per panel and the per-panel 0..1 UVs of legacy.
 * Spec 04 (UV-7, UV-9): every mode takes its UVs from the rebuild's UV plans (the UV transforms; base UVs for LED-mask
 * content); the combined mesh has one geometry group per section and, in the default per-section layout, one material
 * per section; section canvases follow the 16 MP viewport budget; uv.panel_uvs = 'panel' restores the per-panel canvases.
 * Panel frames are adaptive (docs/improvements/06-morph-branding.md 6.7, 06 T5): each section's frames take the light
 * or the dark frame colour of SceneTheme, whichever contrasts more with the section colour (render/frameColor.js).
 * Legacy source: index.html@cd3fd3f 1457-1577, 1646-1678, 1710-1802.
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { computeAtlas, sectionTextureScale, panelPxPerLed } from '../geometry/TextureAtlas.js';
import { maxIndexOf, indexWidth } from '../geometry/WallMeshBuilder.js';
import { planSectionUvs, isLedMaskContent } from '../geometry/UvMapper.js';
import { UvSettings } from '../domain/UvSettings.js';
import { ResourceTracker } from './ResourceTracker.js';
import { MaterialOverride } from './MaterialOverride.js';
import { frameColorFor } from './frameColor.js';
import { scaleOf } from './LEDMaterialFactory.js';

/** The UV settings of a rebuild that passes none (unit tests): the defaults, frozen. */
const DEFAULT_UV_SETTINGS = Object.freeze(new UvSettings());

/**
 * The argument of geometry.setIndex for a combined or section grid (08 P2-1e; the viewport side of B-L5, 08 6.2): a
 * THREE.Uint32BufferAttribute when the largest index reaches 65,535, else the plain array as before (r128's setIndex
 * stores it as Uint16, unchanged). r128 alone switches to Uint32 only above 65,535, so a largest index of exactly 65,535
 * would be stored as Uint16, where WebGL2 reads it as the primitive-restart value and drops a triangle.
 * Side effects: may allocate one BufferAttribute (no THREE id).
 * @param {number[]} indices
 * @returns {number[]|THREE.Uint32BufferAttribute}
 */
function indexAttribute(indices) {
  return indexWidth(maxIndexOf(indices)) === 'uint32' ? new THREE.Uint32BufferAttribute(indices, 1) : indices;
}

/**
 * The PlaneGeometry vertex order is TL, TR, BL, BR (three r128: rows from the top, columns from the left); vertex k takes
 * the WallMeshBuilder corner PLANE_FROM_CORNER[k] of the order BL = 0, BR = 1, TR = 2, TL = 3 (04 6.12).
 * @type {readonly number[]}
 */
const PLANE_FROM_CORNER = Object.freeze([3, 2, 0, 1]);

/**
 * Writes the four corner UVs of a panel (builder order BL, BR, TR, TL) into a PlaneGeometry's uv attribute
 * (08 P2-12d). Called before the first render, so no needsUpdate is needed.
 * Side effects: writes geometry.attributes.uv (no THREE id).
 * @param {THREE.PlaneGeometry} geometry
 * @param {number[][]} uvs  WallMeshBuilder.panelUvs(panel, sl)
 */
function writePanelUvs(geometry, uvs) {
  const attribute = geometry.attributes.uv;
  for (let k = 0; k < 4; k++) {
    const [u, v] = uvs[PLANE_FROM_CORNER[k]];
    attribute.setXY(k, u, v);
  }
}

/**
 * @typedef {object} SectionNode
 * @property {*} sectionId
 * @property {number} sectionIndex
 * @property {THREE.Mesh[]} meshes
 * @property {{indexStart: number, indexCount: number}|null} indexRange  combined mode only
 */

/**
 * The viewport representation of the LED wall (legacy `ledWallGroup` and `frameGroup`).
 */
export class LEDWallView {
  /** @type {import('./SceneManager.js').SceneManager} */
  #sceneManager;
  /** @type {import('./LEDMaterialFactory.js').LEDMaterialFactory} */
  #materials;
  /** @type {import('../geometry/WallMeshBuilder.js').WallMeshBuilder} */
  #builder;
  /** @type {{scene: object}} */
  #theme;
  /**
   * Holds the current two group roots. Created by every rebuild() with the wall-texture dispose policy disposeMaps:
   * true (the B-H5 fix of Phase 1C H1; the switch Strategies.dispose.wallTextures was retired by 08 P2-12a) and
   * disposed by the next rebuild(); null before the first rebuild.
   * @type {ResourceTracker|null}
   */
  #tracker = null;
  /** @type {THREE.Group|null} legacy `ledWallGroup` */
  #wallGroup = null;
  /** @type {THREE.Group|null} legacy `frameGroup` */
  #frameGroup = null;
  /** @type {import('./DebugMaterials.js').DebugMaterials} the shared debug-shading materials (01 F1-1) */
  #debugMaterials;
  /** The stash of the content materials while a debug shading is shown (no THREE allocation). */
  #override = new MaterialOverride();
  /** @type {string} the current debug shading: 'content' | 'faceOrientation' | 'normalColors' */
  #shading = 'content';
  /** @type {import('../domain/Project.js').DisplaySettings|null} the display of the last rebuild (wireframe) */
  #display = null;

  /**
   * Stores the dependencies only (R4): nothing is allocated until rebuild().
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager,
   *          materials: import('./LEDMaterialFactory.js').LEDMaterialFactory,
   *          builder: import('../geometry/WallMeshBuilder.js').WallMeshBuilder,
   *          theme: {scene: object},
   *          debugMaterials: import('./DebugMaterials.js').DebugMaterials}} deps
   *   builder: the WallMeshBuilder of the viewport profile; theme: { scene: SceneTheme } (the frame colours
   *   frame and frameOnLight);
   *   debugMaterials: the shared debug-shading materials (01 F1-1; read only once a shading is set)
   */
  constructor({ sceneManager, materials, builder, theme, debugMaterials }) {
    this.#sceneManager = sceneManager;
    this.#materials = materials;
    this.#builder = builder;
    this.#theme = theme;
    this.#debugMaterials = debugMaterials;
  }

  /** Side effects: none. @returns {THREE.Group|null} legacy `ledWallGroup` (null before the first rebuild) */
  get wallGroup() {
    return this.#wallGroup;
  }

  /**
   * Side effects: none.
   * @returns {THREE.Group|null} legacy `frameGroup` (null before the first rebuild; in the scene only while frames are shown)
   */
  get frameGroup() {
    return this.#frameGroup;
  }

  /**
   * Replaces the wall: disposes the previous groups, builds the new meshes for the mesh mode, builds the frames
   * if shown, and adds the groups to the scene. The layout walk, stats, orbit target and camera hub of legacy
   * createLEDWall are the caller's (WallController.rebuild, P1). With a debug shading on (01 F1-1), step 0 puts the
   * content materials back first, so step 1 disposes the real materials and never the shared debug ones, and step 6
   * shows the shading on the new meshes.
   * Ports: index.html@cd3fd3f lines 1458-1477, 1551-1572.
   * The UV inputs of 04 6.13 (UV-7) come from WallController's P1 steps 2-3: the atlas, the section-texture scale (the
   * 16 MP viewport budget) and one UV plan per section (UvMapper.planSectionUvs, base UVs for LED-mask content) with the
   * project's UV settings; a caller that passes none (unit tests) gets them computed here with the default settings.
   * Side effects: scene removals/additions; THREE allocations and dispose events; canvases for panel IDs and LED tiles;
   *   mesh.material writes (debug shading).
   * @param {{layout: import('../geometry/WallLayout.js').WallLayout, meshMode: *,
   *          display: import('../domain/Project.js').DisplaySettings, atlas?: object|null,
   *          uvPlans?: import('../geometry/UvMapper.js').SectionUvPlan[]|null,
   *          sectionScale?: {scales: number[], reduced: boolean, pxPerLed: number|null}|null,
   *          uvSettings?: import('../domain/UvSettings.js').UvSettings|null}} args
   * @returns {void}
   */
  rebuild({ layout, meshMode, display, atlas = null, uvPlans = null, sectionScale = null, uvSettings = null }) {
    // 0. Put the content materials back (01 F1-1), so step 1 never disposes the shared debug materials.
    this.#override.restore();
    this.#display = display;

    // 1. Remove and dispose the previous wall group, then the previous frame group (legacy 1458-1474), with the
    // policy read in step 2 of the previous rebuild.
    if (this.#tracker) this.#tracker.dispose();

    // 2. New groups, tracked in legacy dispose order (wall, then frames).
    const wallGroup = new THREE.Group();
    const frameGroup = new THREE.Group();
    this.#wallGroup = wallGroup;
    this.#frameGroup = frameGroup;
    // The wall maps are always disposed (Phase 1C H1 fixed B-H5; 08 P2-12a retired the switch
    // Strategies.dispose.wallTextures): step 1 of the next rebuild also disposes every material map of these groups
    // (panel-ID CanvasTextures and LED tile clones). Each map belongs to exactly one material; the LED tile cache
    // masters are never placed on a material (LEDPixelTextureFactory.tile always returns a clone), so they are never
    // disposed here.
    this.#tracker = new ResourceTracker({ disposeMaps: true });
    this.#tracker.track(wallGroup, { detach: () => this.#sceneManager.remove(wallGroup) });
    this.#tracker.track(frameGroup, { detach: () => this.#sceneManager.remove(frameGroup) });

    // 3. Atlas bookkeeping, section-texture scale and UV plans (pure, PR1; WallController's P1 steps 2-3 since 04 UV-7),
    // then the mesh-mode dispatch. The material factory starts a new rebuild, so its panel-ID fallback warning
    // (08 P2-1d) is given once per section and rebuild.
    const sections = layout.sections.map((sl) => sl.section);
    const uv = {
      atlas: atlas ?? computeAtlas(sections),
      settings: uvSettings ?? DEFAULT_UV_SETTINGS,
      scale: sectionScale ?? sectionTextureScale(sections),
      plans: uvPlans,
    };
    uv.plans ??= planSectionUvs({ layout, atlas: uv.atlas, settings: uv.settings, meshMode,
      applyTransforms: !isLedMaskContent(display.content) });
    this.#materials.beginRebuild();
    // The three mesh modes (B-L8 fixed in 08 P2-3b: the validator maps an unknown imported mode to 'combined', so the
    // throw is unreachable from the app; legacy rendered any unknown mode as panels).
    if (meshMode === 'combined') {
      this.#buildCombined(layout, sections, uv);
    } else if (meshMode === 'section') {
      this.#buildSections(layout, uv);
    } else if (meshMode === 'panel') {
      this.#buildPanels(layout, sections, display, uv);
    } else {
      throw new Error(`Unknown mesh mode ${JSON.stringify(meshMode)}`);
    }

    // 4. Panel frames.
    if (display.showFrame) {
      this.#buildFrames(layout, display);
    }

    // 5. Scene.
    this.#sceneManager.add(wallGroup);
    if (display.showFrame) this.#sceneManager.add(frameGroup);

    // 6. The debug shading survives rebuilds (01 F1-1): a direct step, not a subscription (R2).
    if (this.#shading !== 'content') this.#applyShading();
  }

  /**
   * Shows a debug shading over every LED mesh (01 3.3, 5.2): 'content' puts the content materials back; any other
   * mode shows its shared DebugMaterials material (wireframe following display.wireframe) on every mesh of meshes().
   * Orthogonal to the wall content mode; kept across rebuilds (rebuild step 6). Idempotent. Emits nothing.
   * Side effects: mesh.material writes; may create the debug material (first use).
   * @param {string} mode  'content' | 'faceOrientation' | 'normalColors'
   * @returns {void}
   */
  setDebugShading(mode) {
    this.#shading = mode;
    this.#applyShading();
  }

  /**
   * Runs `fn` with the content materials on the wall (07 C48): stills and screenshots never show the debug shading
   * unless the caller asks for it. With an override shown it is removed, `fn` runs, and the shading is shown again
   * (also when `fn` throws); otherwise `fn` just runs. Synchronous.
   * Side effects: mesh.material writes around fn; whatever fn does.
   * @template T
   * @param {() => T} fn
   * @returns {T} fn's result
   */
  withContentMaterials(fn) {
    if (!this.#override.active) return fn();
    this.#override.restore();
    try {
      return fn();
    } finally {
      this.#applyShading();
    }
  }

  /** Shows the current shading: restore for 'content', else the shared debug material on every LED mesh. */
  #applyShading() {
    if (this.#shading === 'content') {
      this.#override.restore();
      return;
    }
    const material = this.#debugMaterials.forShading(this.#shading);
    material.wireframe = !!(this.#display && this.#display.wireframe);
    this.#override.apply(this.meshes(), material);
  }

  /**
   * One mesh for the whole wall, coloured per vertex (or textured by the atlas / LED tiles). Since 04 UV-7 the UVs come
   * from the plans (each section filling 0..1 in the default per-section layout, atlas-placed in the atlas layout, with
   * the UV transforms) and the geometry has one group per section (index = sectionIndex), so the per-section layout's
   * Material[] gives every section its own texture; a single material ignores the groups (r128).
   * Ports: index.html@cd3fd3f lines 1646-1677 (the arrays of 1580-1644 come from builder.combinedGrid).
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {{atlas: object, settings: object, scale: object, plans: object[]}} uv  the rebuild's UV inputs
   */
  #buildCombined(layout, sections, uv) {
    const g = this.#builder.combinedGrid(layout, uv.atlas, uv.plans);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(g.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
    geometry.setIndex(indexAttribute(g.indices));
    g.sectionRanges.forEach((r, i) => geometry.addGroup(r.indexStart, r.indexCount, i));

    // For combined mesh, use vertex colors to support multiple section colors
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.#vertexColors(layout), 3));

    const material = this.#materials.combined(sections, uv.atlas, uv.settings.combinedLayout, uv.scale);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { kind: 'led-wall', mode: 'combined', sectionRanges: g.sectionRanges };
    this.#wallGroup.add(mesh);
  }

  /**
   * Per-vertex section colours of the combined grid: one THREE.Color per section, repeated over its
   * (rows + 1) x (cols + 1) vertices.
   * Ports: index.html@cd3fd3f lines 1653-1661.
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @returns {number[]}
   */
  #vertexColors(layout) {
    const colors = [];
    layout.sections.forEach(({ section }) => {
      const color = new THREE.Color(section.color);
      for (let row = 0; row <= section.panelRows; row++) {
        for (let col = 0; col <= section.panelCols; col++) {
          colors.push(color.r, color.g, color.b);
        }
      }
    });
    return colors;
  }

  /**
   * One mesh per section with 0..1 UVs (04 UV-7: the section's plan, with its UV transform; base UVs for LED-mask
   * content) and the budgeted section canvas.
   * Ports: index.html@cd3fd3f lines 1710-1774 (the arrays of 1713-1751 come from builder.sectionGrid).
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {{atlas: object, scale: object, plans: object[]}} uv  the rebuild's UV inputs
   */
  #buildSections(layout, uv) {
    const { atlas } = uv;
    layout.sections.forEach((sl, i) => {
      const grid = this.#builder.sectionGrid(sl, { uv: uv.plans[i] });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(grid.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(grid.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(grid.uvs, 2));
      geometry.setIndex(indexAttribute(grid.indices));

      const material = this.#materials.section(sl.section, sl.sectionIndex, atlas.entries[i].startCol, scaleOf(uv.scale, i));

      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { kind: 'led-wall', mode: 'section', sectionId: sl.sectionId, sectionIndex: i };
      this.#wallGroup.add(mesh);
    });
  }

  /**
   * One PlaneGeometry mesh per panel, placed at the panel centre and turned to the panel's angle. With panel IDs
   * (08 P2-12d, 08 6.15; B-M16 and, for the viewport, B-L19 fixed) each section first gets one material,
   * materials.sectionShared (the section canvas, with its logo and section-label size), shared by all of its panels, and
   * each panel's UVs are rewritten into section space: legacy drew one 4-16 px/LED canvas per panel, without the logo.
   * LED sim and colour keep one materials.panel per panel and the PlaneGeometry's own 0..1 UVs.
   * 04 UV-9: the panel UVs come from the section's plan (builder.panelUvs(panel, sl, plan)), so the section's UV
   * transform applies; with the legacy option uv.panel_uvs = 'panel' each panel instead gets its own per-panel canvas
   * (materials.panel at the wall-wide panelPxPerLed of the rebuild) and the PlaneGeometry's own 0..1 UVs. The shared
   * section canvas follows the 16 MP budget (04 6.4).
   * Ports: index.html@cd3fd3f lines 1776-1802.
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {import('../domain/Project.js').DisplaySettings} display  panelIdsEnabled
   * @param {{atlas: object, scale: object, plans: object[]}} uv  the rebuild's UV inputs
   */
  #buildPanels(layout, sections, display, uv) {
    const perPanelIds = display.panelIdsEnabled && uv.plans.some((p) => p.panelUvs === 'panel');
    const panelScale = perPanelIds ? panelPxPerLed(sections) : undefined;
    layout.sections.forEach((sl, i) => {
      const plan = uv.plans[i];
      const startCol = uv.atlas.entries[i].startCol;
      const shared = display.panelIdsEnabled && plan.panelUvs !== 'panel'
        ? this.#materials.sectionShared(sl.section, sl.sectionIndex, startCol, scaleOf(uv.scale, i)) : null;
      sl.panels.forEach((panel) => {
        const geometry = new THREE.PlaneGeometry(sl.panelW, sl.panelH);
        let material;
        if (shared !== null) {
          writePanelUvs(geometry, this.#builder.panelUvs(panel, sl, plan));
          material = shared;
        } else {
          material = this.#materials.panel(sl.section, sl.sectionIndex, startCol + panel.col, panel.row, panelScale);
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(panel.x, panel.y, panel.z);
        mesh.rotation.y = panel.rotY;
        mesh.userData = {
          kind: 'led-wall', mode: 'panel', sectionId: sl.sectionId, sectionIndex: i, col: panel.col, row: panel.row,
        };
        this.#wallGroup.add(mesh);
      });
    });
  }

  /**
   * One edge outline per panel (the inner BoxGeometry is never tracked or disposed, as legacy), in the section's
   * adaptive frame colour (06 6.7: light or dark by contrast with the section colour; light on textures and in
   * wireframe). Every change of colour, content mode or wireframe rebuilds (ARCHITECTURE 6.2), so it never goes stale.
   * Ports: index.html@cd3fd3f lines 1560-1568.
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {import('../domain/Project.js').DisplaySettings} display
   */
  #buildFrames(layout, display) {
    layout.sections.forEach(({ section, panels, panelW, panelH }) => {
      const color = frameColorFor(section.color, display, this.#theme.scene);
      panels.forEach((panel) => {
        const frameGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(panelW, panelH, 0.02));
        const frame = new THREE.LineSegments(frameGeometry, new THREE.LineBasicMaterial({ color }));
        frame.position.set(panel.x, panel.y, panel.z);
        frame.rotation.y = panel.rotY;
        this.#frameGroup.add(frame);
      });
    });
  }

  /**
   * Feature seam (non-observable in Phase 1): the wall meshes in add order.
   * Side effects: none.
   * @returns {THREE.Mesh[]} a copy of wallGroup.children ([] before the first rebuild)
   */
  meshes() {
    return this.#wallGroup ? this.#wallGroup.children.slice() : [];
  }

  /**
   * Feature seam (non-observable in Phase 1): the meshes of each section, derived from the mesh tags.
   * Keys are String(sectionId). With duplicate ids (B-L8) the first section owns the node and later duplicates
   * append their meshes to it.
   * Side effects: none.
   * @returns {Map<string, SectionNode>}
   */
  sectionNodes() {
    /** @type {Map<string, SectionNode>} */
    const nodes = new Map();
    const nodeFor = (sectionId, sectionIndex, indexRange) => {
      const key = String(sectionId);
      if (!nodes.has(key)) nodes.set(key, { sectionId, sectionIndex, meshes: [], indexRange });
      return nodes.get(key);
    };
    for (const mesh of this.meshes()) {
      const tag = mesh.userData;
      if (tag.mode === 'combined') {
        for (const r of tag.sectionRanges) {
          nodeFor(r.sectionId, r.sectionIndex, { indexStart: r.indexStart, indexCount: r.indexCount }).meshes.push(mesh);
        }
      } else {
        nodeFor(tag.sectionId, tag.sectionIndex, null).meshes.push(mesh);
      }
    }
    return nodes;
  }
}
