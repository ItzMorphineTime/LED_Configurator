/**
 * @module render/LEDMaterialFactory
 * The only constructor of LED wall materials. Content precedence: panel IDs, then LED simulation, then plain
 * section colour. Every material is a MeshBasicMaterial whose `side` comes from #side() and whose `wireframe`
 * follows display.wireframe. The texture of a material is always created before the material itself (legacy
 * argument evaluation order; THREE ids come from global counters, R5). A panel-ID canvas that the browser cannot
 * create (PanelIdRenderer returns null, 08 P2-1d, B-L4) falls back to the colour material of that mesh, with one
 * console warning per section and rebuild.
 * Panel mode with panel IDs takes one material per section, shared by its panels (sectionShared, 08 P2-12d). The combined
 * mesh takes one material per section (a Material[]) in the per-section UV layout (04 UV-7), and every section canvas
 * of the viewport follows the 16 MP budget of TextureAtlas.sectionTextureScale (04 6.4).
 * Legacy source: index.html@cd3fd3f 1664-1675 (combined), 1759-1769 (section), 1783-1793 + 2047-2048 (panel).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). Collaborators are injected.
 */

import THREE from '../vendor/three.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';

/**
 * The section-canvas scale of section i under a sectionTextureScale result (04 6.4): its px/LED when the budget reduced
 * the wall, else null (the legacy sectionPxPerLed).
 * @param {{scales: number[], reduced: boolean}|null} sectionScale
 * @param {number} i
 * @returns {number|null}
 */
export function scaleOf(sectionScale, i) {
  return sectionScale && sectionScale.reduced ? sectionScale.scales[i] : null;
}

/**
 * Builds wall materials from the current display settings.
 */
export class LEDMaterialFactory {
  /** @type {import('../domain/Project.js').DisplaySettings} */
  #display;
  /** @type {import('./textures/PanelIdRenderer.js').PanelIdRenderer} */
  #panelIds;
  /** @type {import('./textures/LEDPixelTextureFactory.js').LEDPixelTextureFactory} */
  #ledTiles;
  /** @type {Window} */
  #win;
  /** @type {Set<*>} what has been warned about since the last beginRebuild() (sections, or 'atlas') */
  #warned = new Set();

  /**
   * Stores the dependencies only (R4).
   * Side effects: none.
   * @param {{display: import('../domain/Project.js').DisplaySettings,
   *          panelIds: import('./textures/PanelIdRenderer.js').PanelIdRenderer,
   *          ledTiles: import('./textures/LEDPixelTextureFactory.js').LEDPixelTextureFactory, win: Window}} deps
   *   display: project.display (content and wireframe are read at call time); win: console for the warning of 08 P2-1d
   */
  constructor({ display, panelIds, ledTiles, win }) {
    this.#display = display;
    this.#panelIds = panelIds;
    this.#ledTiles = ledTiles;
    this.#win = win;
  }

  /**
   * Starts a wall rebuild (called by LEDWallView.rebuild before the meshes are built): the panel-ID fallback warning
   * may be given again, once per section (08 P2-1d).
   * Side effects: resets the warned set.
   */
  beginRebuild() {
    this.#warned = new Set();
  }

  /**
   * The material(s) of the combined mesh, by content and UV layout (04 6.4).
   * 'atlas' layout: one material. panel IDs: the atlas canvas as a CanvasTexture; LED sim: one white tile repeated over the
   * whole atlas (one tile per LED: the pixel-accurate atlas UVs of 08 P2-7a give each section its own LED rows)
   * multiplied by the vertex colours, so every section's LEDs take its colour (08 P2-7e, B-L18 fixed); colour: vertex
   * colours.
   * 'per-section' layout (04 UV-7, the default): panel IDs and LED sim give a Material[] with one slot per section
   * (index = sectionIndex; LEDWallView adds one geometry group per section): panel IDs slot i = section(section_i, i,
   * startCol_i, scale_i), the Section-mode material (scale_i null unless the 16 MP budget reduced it); LED sim slot i = the
   * white tile repeated (cols_i·ledX_i, rows_i·ledY_i) times the vertex colours (one section: exactly the atlas material's
   * parameters). Colour: one vertex-colour material (r128 ignores groups for a single material).
   * Ports: index.html@cd3fd3f lines 1664-1675 (the canvas of 1667 is PanelIdRenderer.atlasCanvas).
   * Side effects: allocates the texture(s) then the material (THREE ids), slot by slot.
   * @param {import('../domain/WallSection.js').WallSection[]} sections  the wall's sections, in order
   * @param {{totalLedX: number, totalLedY: number, pxPerLed: number, entries: object[]}} atlas  computeAtlas(sections)
   * @param {'atlas'|'per-section'} [combinedLayout]  Project.uv.combinedLayout; default 'atlas'
   * @param {{scales: number[], reduced: boolean}|null} [sectionScale]  TextureAtlas.sectionTextureScale(sections)
   * @returns {THREE.MeshBasicMaterial|THREE.MeshBasicMaterial[]}
   */
  combined(sections, atlas, combinedLayout = 'atlas', sectionScale = null) {
    const display = this.#display;
    if (combinedLayout === 'per-section' && (display.panelIdsEnabled || display.ledSimEnabled)) {
      return sections.map((section, i) => (display.panelIdsEnabled
        ? this.section(section, i, atlas.entries[i].startCol, scaleOf(sectionScale, i))
        : new THREE.MeshBasicMaterial({ map: this.#ledTiles.tiled(section.panelCols * section.ledX, section.panelRows * section.ledY, new THREE.Color("white")), vertexColors: true, side: this.#side(), wireframe: display.wireframe })));
    }
    let material;
    if (display.panelIdsEnabled) {
      // Create combined panel ID texture
      const combinedCanvas = this.#panelIds.atlasCanvas(sections, atlas);
      if (combinedCanvas === null) {
        // 08 P2-1d (B-L4): the atlas does not fit; show the section colours (the colour branch's material).
        const names = sections.map((section) => section.name).join(', ');
        this.#warnNotShown('atlas', names, this.#panelIds.atlasSize(sections, atlas));
        return new THREE.MeshBasicMaterial({ vertexColors: true, side: this.#side(), wireframe: display.wireframe });
      }
      const texture = this.#canvasTexture(combinedCanvas);
      material = new THREE.MeshBasicMaterial({ map: texture, side: this.#side(), wireframe: display.wireframe });
    } else if (display.ledSimEnabled) {
      // 08 P2-7e (B-L18 fixed; Strategies.combinedLedSimColor retired): a white tile times the per-section vertex colours,
      // so the combined LED sim shows each section's colour as section and panel modes do (legacy: white LEDs, no
      // vertexColors). The tile repeats totalLedX x totalLedY times over the atlas UVs, one tile per LED: since 08 P2-7a
      // (B-M5 fixed) each section spans v in [0, uvHeight], its own LED rows.
      material = new THREE.MeshBasicMaterial({ map: this.#ledTiles.tiled(atlas.totalLedX, atlas.totalLedY, new THREE.Color("white")), vertexColors: true, side: this.#side(), wireframe: display.wireframe });
    } else {
      material = new THREE.MeshBasicMaterial({ vertexColors: true, side: this.#side(), wireframe: display.wireframe });
    }
    return material;
  }

  /**
   * The material of one section mesh.
   * panel IDs: the section canvas (labels continued from startCol); LED sim: the section-coloured tile repeated
   * once per LED; colour: the section colour.
   * Ports: index.html@cd3fd3f lines 1714 (colour, PR6), 1759-1769.
   * Side effects: allocates the texture (if any) then the material (THREE ids).
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {number} sectionIndex
   * @param {*} startCol  the section's first global column (atlas.entries[i].startCol)
   * @param {number|null} [scale]  the canvas px/LED when the viewport budget reduced it (04 6.4,
   *   TextureAtlas.sectionTextureScale); null: the legacy sectionPxPerLed
   * @returns {THREE.MeshBasicMaterial}
   */
  section(section, sectionIndex, startCol, scale = null) {
    const display = this.#display;
    let material;
    if (display.panelIdsEnabled) {
      const panelIdCanvas = this.#panelIds.sectionCanvas(section, sectionIndex, scale, startCol);
      if (panelIdCanvas === null) {
        // 08 P2-1d (B-L4): the section canvas does not fit; show the section colour.
        this.#warnNotShown(section, section.name, this.#panelIds.sectionSize(section, scale));
        return this.#colorMaterial(section);
      }
      const texture = this.#canvasTexture(panelIdCanvas);
      material = new THREE.MeshBasicMaterial({ map: texture, side: this.#side(), wireframe: display.wireframe });
    } else if (display.ledSimEnabled) {
      material = new THREE.MeshBasicMaterial({ map: this.#ledTiles.tiled(section.panelCols * section.ledX, section.panelRows * section.ledY, section.color), side: this.#side(), wireframe: display.wireframe });
    } else {
      material = this.#colorMaterial(section);
    }
    return material;
  }

  /**
   * The material shared by every panel of one section in panel mode with panel IDs (08 P2-12d, 08 6.15; B-M16 and, for
   * the viewport, B-L19 fixed): the section material of section(), so the panels sample the section canvas (with its
   * logo and section-label size, at most one canvas per section instead of one per panel) through the section-space UVs
   * LEDWallView writes into each panel (WallMeshBuilder.panelUvs). A canvas that does not fit falls back to the section
   * colour with the warning of section(). The budgeted scale of 04 6.4 (UV-7) as in section().
   * Side effects: as section().
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {number} sectionIndex
   * @param {*} startCol  the section's first global column (atlas.entries[i].startCol)
   * @param {number|null} [scale]  as section()
   * @returns {THREE.MeshBasicMaterial}
   */
  sectionShared(section, sectionIndex, startCol, scale = null) {
    return this.section(section, sectionIndex, startCol, scale);
  }

  /**
   * The material of one panel mesh (panel mode).
   * panel IDs: the per-panel canvas (since 08 P2-12d reached only by 04's `uv.panel_uvs = 'panel'` option: panel mode
   * with panel IDs uses sectionShared); LED sim: the section-coloured tile repeated ledX x ledY; colour: section colour.
   * Ports: index.html@cd3fd3f lines 1779 (colour, PR6), 1783-1793, 2047-2048 (CanvasTexture).
   * Side effects: allocates the texture (if any) then the material (THREE ids).
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {number} sectionIndex  unused by the canvas (legacy passed it along and ignored it)
   * @param {*} globalCol  startCol + panel.col (raw `+`)
   * @param {number} row
   * @param {number} [scale]  the per-panel canvas px/LED (the rebuild's wall-wide panelPxPerLed); default: the
   *   PanelIdRenderer default
   * @returns {THREE.MeshBasicMaterial}
   */
  panel(section, sectionIndex, globalCol, row, scale = undefined) {
    const display = this.#display;
    let material;
    if (display.panelIdsEnabled) {
      // Use cumulative column for sequential labeling across all sections
      const canvas = this.#panelIds.panelCanvas(globalCol, row, section.ledX, section.ledY, section, scale);
      if (canvas === null) {
        // 08 P2-1d (B-L4): the panel canvas does not fit (beyond CANVAS_HARD_LIMITS); show the section colour.
        this.#warnNotShown(section, section.name, this.#panelIds.panelSize(section, scale));
        return this.#colorMaterial(section);
      }
      const texture = this.#canvasTexture(canvas);
      material = new THREE.MeshBasicMaterial({ map: texture, side: this.#side(), wireframe: display.wireframe });
    } else if (display.ledSimEnabled) {
      material = new THREE.MeshBasicMaterial({ map: this.#ledTiles.tiled(section.ledX, section.ledY, section.color), side: this.#side(), wireframe: display.wireframe });
    } else {
      material = this.#colorMaterial(section);
    }
    return material;
  }

  /**
   * The console warning of the panel-ID fallback (08 6.3, P2-1d), at most once per key and rebuild (a section in
   * section and panel mode, 'atlas' in combined mode, whose name lists the section names).
   * Side effects: one win.console.warn the first time a key is seen since beginRebuild().
   * @param {*} key
   * @param {*} name
   * @param {{width: number, height: number}} size  the canvas size that does not fit
   */
  #warnNotShown(key, name, { width, height }) {
    if (this.#warned.has(key)) return;
    this.#warned.add(key);
    this.#win.console.warn(`Panel IDs are not shown for "${name}": its ${width}×${height} px texture exceeds this browser's canvas limit.`);
  }

  /**
   * A panel-ID canvas wrapped in a texture (flagged for upload twice, as legacy did).
   * Ports: index.html@cd3fd3f lines 1668-1669 == 1762-1763 == 2047-2048.
   * @param {HTMLCanvasElement} canvas
   * @returns {THREE.CanvasTexture}
   */
  #canvasTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * The plain-colour material of a section or panel. The THREE.Color is created here instead of before the
   * geometry (PR6: a Color carries no id).
   * Ports: index.html@cd3fd3f lines 1714/1779 (colour), 1768 == 1792.
   * @param {import('../domain/WallSection.js').WallSection} section
   * @returns {THREE.MeshBasicMaterial}
   */
  #colorMaterial(section) {
    const sectionColor = new THREE.Color(section.color);
    return new THREE.MeshBasicMaterial({ color: sectionColor, side: this.#side(), wireframe: this.#display.wireframe });
  }

  /**
   * The `side` of every wall material (`Strategies.mesh.viewport.side`; no LEGACY_SITES entry since 08 P2-2a). A
   * constant: no ids, cannot throw for the shipped value.
   * @returns {number} THREE.DoubleSide
   */
  #side() {
    // DoubleSide is a design choice since 08 P2-2a (B-H1 fixed: the strips are wound counter-clockwise toward the
    // stage), not a concealment: the orbit camera can go behind the wall. 'front' is a later Feature 1/5 option.
    switch (Strategies.mesh.viewport.side) {
      case 'double':
        return THREE.DoubleSide;
      default:
        throw unsupportedStrategy('mesh.viewport.side', Strategies.mesh.viewport.side);
    }
  }
}
