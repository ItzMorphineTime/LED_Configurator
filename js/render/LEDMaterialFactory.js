/**
 * @module render/LEDMaterialFactory
 * The only constructor of LED wall materials. Content precedence: panel IDs, then LED simulation, then plain
 * section colour. Every material is a MeshBasicMaterial whose `side` comes from #side() and whose `wireframe`
 * follows display.wireframe. The texture of a material is always created before the material itself (legacy
 * argument evaluation order; THREE ids come from global counters, R5). A panel-ID canvas that the browser cannot
 * create (PanelIdRenderer returns null, 08 P2-1d, B-L4) falls back to the colour material of that mesh, with one
 * console warning per section and rebuild.
 * Legacy source: index.html@cd3fd3f 1664-1675 (combined), 1759-1769 (section), 1783-1793 + 2047-2048 (panel).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). Collaborators are injected.
 */

import THREE from '../vendor/three.js';
import { Strategies, unsupportedStrategy } from '../legacy/LegacyCompat.js';

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
   * The material of the combined mesh.
   * panel IDs: the atlas canvas as a CanvasTexture; LED sim: one white tile repeated over the whole atlas;
   * colour: vertex colours.
   * Ports: index.html@cd3fd3f lines 1664-1675 (the canvas of 1667 is PanelIdRenderer.atlasCanvas).
   * Side effects: allocates the texture(s) then the material (THREE ids).
   * @param {import('../domain/WallSection.js').WallSection[]} sections  the wall's sections, in order
   * @param {{totalLedX: number, totalLedY: number, pxPerLed: number, entries: object[]}} atlas  computeAtlas(sections)
   * @returns {THREE.MeshBasicMaterial}
   */
  combined(sections, atlas) {
    const display = this.#display;
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
      // LEGACY(B-L18, B-M5): white LEDs whatever the section colours, and the tile repeats over totalLedY
      // although the combined V spans each section's own height (sections of different heights are stretched).
      const ledColor = () => {
        switch (Strategies.combinedLedSimColor) {
          case 'white':
            return new THREE.Color("white");
          default:
            throw unsupportedStrategy('combinedLedSimColor', Strategies.combinedLedSimColor);
        }
      };
      material = new THREE.MeshBasicMaterial({ map: this.#ledTiles.tiled(atlas.totalLedX, atlas.totalLedY, ledColor()), side: this.#side(), wireframe: display.wireframe });
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
   * @returns {THREE.MeshBasicMaterial}
   */
  section(section, sectionIndex, startCol) {
    const display = this.#display;
    let material;
    if (display.panelIdsEnabled) {
      const panelIdCanvas = this.#panelIds.sectionCanvas(section, sectionIndex, null, startCol);
      if (panelIdCanvas === null) {
        // 08 P2-1d (B-L4): the section canvas does not fit; show the section colour.
        this.#warnNotShown(section, section.name, this.#panelIds.sectionSize(section, null));
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
   * The material of one panel mesh (panel mode).
   * panel IDs: the panel canvas; LED sim: the section-coloured tile repeated ledX x ledY; colour: section colour.
   * Ports: index.html@cd3fd3f lines 1779 (colour, PR6), 1783-1793, 2047-2048 (CanvasTexture).
   * Side effects: allocates the texture (if any) then the material (THREE ids).
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {number} sectionIndex  unused by the canvas (legacy passed it along and ignored it)
   * @param {*} globalCol  startCol + panel.col (raw `+`)
   * @param {number} row
   * @returns {THREE.MeshBasicMaterial}
   */
  panel(section, sectionIndex, globalCol, row) {
    const display = this.#display;
    let material;
    if (display.panelIdsEnabled) {
      // Use cumulative column for sequential labeling across all sections
      const canvas = this.#panelIds.panelCanvas(globalCol, row, section.ledX, section.ledY, section);
      if (canvas === null) {
        // 08 P2-1d (B-L4): the panel canvas does not fit (ledX >= 8,192 at 4 px/LED); show the section colour.
        this.#warnNotShown(section, section.name, this.#panelIds.panelSize(section));
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
