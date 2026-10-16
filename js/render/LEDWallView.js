/**
 * @module render/LEDWallView
 * Builds and disposes the LED wall and panel-frame groups from a WallLayout; tags meshes.
 * Three builders reproduce the legacy mesh modes ('combined', 'section', anything else = panels) with the legacy
 * THREE allocation order (geometry -> texture -> material -> mesh), because three r128 sorts draw calls by ids
 * allocated from global counters (R4, R5). No extra parent, renderable or layer is introduced (R6).
 * Legacy source: index.html@cd3fd3f 1457-1577, 1646-1678, 1710-1802.
 * Layer: render (may import vendor/three, core, legacy, domain, geometry).
 */

import THREE from '../vendor/three.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { computeAtlas } from '../geometry/TextureAtlas.js';
import { ResourceTracker } from './ResourceTracker.js';

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
   * Holds the current two group roots. Created by every rebuild() with the wall-texture dispose policy read there
   * (Strategies.dispose.wallTextures, true since Phase 1C H1: the B-H5 fix) and disposed by the next rebuild();
   * null before the first rebuild.
   * @type {ResourceTracker|null}
   */
  #tracker = null;
  /** @type {THREE.Group|null} legacy `ledWallGroup` */
  #wallGroup = null;
  /** @type {THREE.Group|null} legacy `frameGroup` */
  #frameGroup = null;

  /**
   * Stores the dependencies only (R4): nothing is allocated until rebuild().
   * Side effects: none.
   * @param {{sceneManager: import('./SceneManager.js').SceneManager,
   *          materials: import('./LEDMaterialFactory.js').LEDMaterialFactory,
   *          builder: import('../geometry/WallMeshBuilder.js').WallMeshBuilder,
   *          theme: {scene: object}}} deps
   *   builder: the WallMeshBuilder of the viewport profile; theme: { scene: SceneTheme } (frame colour)
   */
  constructor({ sceneManager, materials, builder, theme }) {
    this.#sceneManager = sceneManager;
    this.#materials = materials;
    this.#builder = builder;
    this.#theme = theme;
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
   * createLEDWall are the caller's (WallController.rebuild, P1).
   * Ports: index.html@cd3fd3f lines 1458-1477, 1551-1572.
   * Side effects: scene removals/additions; THREE allocations and dispose events; canvases for panel IDs and LED tiles.
   * @param {{layout: import('../geometry/WallLayout.js').WallLayout, meshMode: *,
   *          display: import('../domain/Project.js').DisplaySettings}} args
   * @returns {void}
   */
  rebuild({ layout, meshMode, display }) {
    // 1. Remove and dispose the previous wall group, then the previous frame group (legacy 1458-1474), with the
    // policy read in step 2 of the previous rebuild.
    if (this.#tracker) this.#tracker.dispose();

    // 2. New groups, tracked in legacy dispose order (wall, then frames).
    const wallGroup = new THREE.Group();
    const frameGroup = new THREE.Group();
    this.#wallGroup = wallGroup;
    this.#frameGroup = frameGroup;
    // The dispose policy is Strategies.dispose.wallTextures (true since Phase 1C H1, which fixed B-H5): step 1 of
    // the next rebuild also disposes every material map of these groups (panel-ID CanvasTextures and LED tile
    // clones). Each map belongs to exactly one material; the LED tile cache masters are never placed on a material
    // (LEDPixelTextureFactory.tile always returns a clone), so they are never disposed here.
    this.#tracker = new ResourceTracker({ disposeMaps: Strategies.dispose.wallTextures });
    this.#tracker.track(wallGroup, { detach: () => this.#sceneManager.remove(wallGroup) });
    this.#tracker.track(frameGroup, { detach: () => this.#sceneManager.remove(frameGroup) });

    // 3. Atlas bookkeeping (pure, PR1), then the mesh-mode dispatch.
    const sections = layout.sections.map((sl) => sl.section);
    const atlas = computeAtlas(sections);
    if (meshMode === 'combined') {
      this.#buildCombined(layout, sections, atlas);
    } else if (meshMode === 'section') {
      this.#buildSections(layout, atlas);
    } else {
      // LEGACY(B-L8): any unknown (imported) mesh mode renders as individual panels.
      this.#buildPanels(layout, atlas);
    }

    // 4. Panel frames.
    if (display.showFrame) {
      this.#buildFrames(layout);
    }

    // 5. Scene.
    this.#sceneManager.add(wallGroup);
    if (display.showFrame) this.#sceneManager.add(frameGroup);
  }

  /**
   * One mesh for the whole wall, coloured per vertex (or textured by the atlas / LED tiles).
   * Ports: index.html@cd3fd3f lines 1646-1677 (the arrays of 1580-1644 come from builder.combinedGrid).
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {import('../domain/WallSection.js').WallSection[]} sections
   * @param {object} atlas
   */
  #buildCombined(layout, sections, atlas) {
    const g = this.#builder.combinedGrid(layout, atlas);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(g.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
    geometry.setIndex(g.indices);

    // For combined mesh, use vertex colors to support multiple section colors
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.#vertexColors(layout), 3));

    const material = this.#materials.combined(sections, atlas);

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
   * One mesh per section with 0..1 UVs.
   * Ports: index.html@cd3fd3f lines 1710-1774 (the arrays of 1713-1751 come from builder.sectionGrid).
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {object} atlas
   */
  #buildSections(layout, atlas) {
    layout.sections.forEach((sl, i) => {
      const grid = this.#builder.sectionGrid(sl, { uv: 'unit' });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(grid.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(grid.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(grid.uvs, 2));
      geometry.setIndex(grid.indices);

      const material = this.#materials.section(sl.section, sl.sectionIndex, atlas.entries[i].startCol);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { kind: 'led-wall', mode: 'section', sectionId: sl.sectionId, sectionIndex: i };
      this.#wallGroup.add(mesh);
    });
  }

  /**
   * One PlaneGeometry mesh per panel, placed at the panel centre and turned to the panel's angle.
   * Ports: index.html@cd3fd3f lines 1776-1802.
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   * @param {object} atlas
   */
  #buildPanels(layout, atlas) {
    layout.sections.forEach((sl, i) => {
      const startCol = atlas.entries[i].startCol;
      sl.panels.forEach((panel) => {
        const geometry = new THREE.PlaneGeometry(sl.panelW, sl.panelH);
        const material = this.#materials.panel(sl.section, sl.sectionIndex, startCol + panel.col, panel.row);

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
   * One edge outline per panel (the inner BoxGeometry is never tracked or disposed, as legacy).
   * Ports: index.html@cd3fd3f lines 1560-1568.
   * @param {import('../geometry/WallLayout.js').WallLayout} layout
   */
  #buildFrames(layout) {
    layout.sections.forEach(({ panels, panelW, panelH }) => {
      panels.forEach((panel) => {
        const frameGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(panelW, panelH, 0.02));
        const frame = new THREE.LineSegments(frameGeometry, new THREE.LineBasicMaterial({ color: this.#theme.scene.frame }));
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
