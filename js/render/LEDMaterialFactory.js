/**
 * @module render/LEDMaterialFactory
 * The only constructor of LED wall materials. Content precedence: panel IDs, then LED simulation, then plain
 * section colour. Every material is a MeshBasicMaterial whose `side` comes from #side() and whose `wireframe`
 * follows display.wireframe. The texture of a material is always created before the material itself (legacy
 * argument evaluation order; THREE ids come from global counters, R5).
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

  /**
   * Stores the dependencies only (R4).
   * Side effects: none.
   * @param {{display: import('../domain/Project.js').DisplaySettings,
   *          panelIds: import('./textures/PanelIdRenderer.js').PanelIdRenderer,
   *          ledTiles: import('./textures/LEDPixelTextureFactory.js').LEDPixelTextureFactory}} deps
   *   display: project.display (content and wireframe are read at call time)
   */
  constructor({ display, panelIds, ledTiles }) {
    this.#display = display;
    this.#panelIds = panelIds;
    this.#ledTiles = ledTiles;
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
   * The `side` of every wall material (the LEGACY_SITES site `LEDMaterialFactory.js#side`). A constant: no ids,
   * cannot throw in Phase 1.
   * @returns {number} THREE.DoubleSide
   */
  #side() {
    // LEGACY(B-H1): DoubleSide conceals the inverted winding.
    switch (Strategies.mesh.viewport.side) {
      case 'double':
        return THREE.DoubleSide;
      default:
        throw unsupportedStrategy('mesh.viewport.side', Strategies.mesh.viewport.side);
    }
  }
}
