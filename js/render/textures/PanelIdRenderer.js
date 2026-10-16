/**
 * @module render/textures/PanelIdRenderer
 * The panel-ID canvases: one canvas per panel (panel mode), one per section (section mode, ZIP textures) and
 * the combined atlas (combined mode, PNG export). Draws the RGB-cycling borders, the column/row labels, the
 * section name and the section logo. Pure 2D canvas: creates no THREE objects; the materials wrap the canvases.
 * Style and logos are read at draw time, exactly like legacy read its globals.
 * Legacy source: index.html@cd3fd3f 1680-1708 (combined canvas), 2001-2046 (panel canvas), 2052-2187 (section
 * canvas incl. the logo).
 * Layer: render (may import vendor/three, core, legacy, domain, geometry). The theme and document are injected.
 */

import { computeAtlas, sectionPxPerLed, panelPxPerLed } from '../../geometry/TextureAtlas.js';
import { columnLabel } from '../../geometry/PanelNaming.js';

/**
 * Draws panel-ID textures onto fresh canvases.
 */
export class PanelIdRenderer {
  /** @type {Document} */
  #doc;
  /** @type {import('../../domain/Project.js').PanelIdStyle} */
  #style;
  /** @type {import('../../domain/LogoLibrary.js').LogoLibrary} */
  #logos;
  /** @type {{canvas: object}} */
  #theme;

  /**
   * Stores the dependencies only (R4). Reads style and logos at draw time, exactly like legacy reads its globals.
   * Side effects: none.
   * @param {{doc: Document, style: import('../../domain/Project.js').PanelIdStyle,
   *          logos: import('../../domain/LogoLibrary.js').LogoLibrary, theme: {canvas: object}}} deps
   *   doc: creates the canvases; style: project.panelIdStyle; logos: project.logos; theme: { canvas: CanvasTheme }
   */
  constructor({ doc, style, logos, theme }) {
    this.#doc = doc;
    this.#style = style;
    this.#logos = logos;
    this.#theme = theme;
  }

  /**
   * The size of the panel-mode canvas of one panel of `section` (panelCanvas), by arithmetic only (no canvas):
   * ledX * scale x ledY * scale with scale = panelPxPerLed(ledX, ledY) (4-16 px/LED, so ledX >= 8,192 already exceeds
   * 32,767 px). 08 P2-1c (B-L4, 08 6.3).
   * Side effects: none.
   * @param {import('../../domain/WallSection.js').WallSection} section
   * @returns {{width: number, height: number}}
   */
  panelSize(section) {
    const scale = panelPxPerLed(section.ledX, section.ledY);
    return { width: section.ledX * scale, height: section.ledY * scale };
  }

  /**
   * The size of the canvas sectionCanvas(section, i, overrideScale) creates, by arithmetic only (no canvas):
   * (panelCols * ledX) * scale x (panelRows * ledY) * scale with scale = overrideScale || sectionPxPerLed(...).
   * 08 P2-1c (B-L4, 08 6.3).
   * Side effects: none.
   * @param {import('../../domain/WallSection.js').WallSection} section
   * @param {number|null} overrideScale  px per LED; falsy -> sectionPxPerLed, as in sectionCanvas
   * @returns {{width: number, height: number}}
   */
  sectionSize(section, overrideScale) {
    const canvasWidth = section.panelCols * section.ledX;
    const canvasHeight = section.panelRows * section.ledY;
    const scale = overrideScale || sectionPxPerLed(canvasWidth, canvasHeight);
    return { width: canvasWidth * scale, height: canvasHeight * scale };
  }

  /**
   * The size of the combined atlas canvas atlasCanvas(sections, atlas) creates, by arithmetic only (no canvas):
   * totalLedX * pxPerLed x totalLedY * pxPerLed. 08 P2-1c (B-L4, 08 6.3).
   * Side effects: none.
   * @param {import('../../domain/WallSection.js').WallSection[]} sections
   * @param {{totalLedX: number, totalLedY: number, pxPerLed: number}} [atlas]  defaults to computeAtlas(sections)
   * @returns {{width: number, height: number}}
   */
  atlasSize(sections, atlas = computeAtlas(sections)) {
    return { width: atlas.totalLedX * atlas.pxPerLed, height: atlas.totalLedY * atlas.pxPerLed };
  }

  /**
   * The panel-mode canvas of one panel: border, label and (optionally) the section name.
   * Ports: index.html@cd3fd3f lines 2002-2046 (the CanvasTexture of 2047-2048 is created by LEDMaterialFactory).
   * Side effects: creates and draws a canvas.
   * @param {*} col    global column index (cumulative across sections; raw `+` of the start column, B-L8)
   * @param {*} row    row index within the section
   * @param {*} ledX   section.ledX
   * @param {*} ledY   section.ledY
   * @param {import('../../domain/WallSection.js').WallSection} section
   * @returns {HTMLCanvasElement}
   */
  panelCanvas(col, row, ledX, ledY, section) {
    const style = this.#style;
    const canvasTheme = this.#theme.canvas;
    const canvas = this.#doc.createElement('canvas');
    // LEGACY(B-M16, B-L19): 4-16 px per LED for every panel with no global budget; panel mode draws no logo and
    // sizes the section name at a fixed 0.25 x the label size (sectionLabelFontSize is ignored).
    const scale = panelPxPerLed(ledX, ledY);
    canvas.width = ledX * scale;
    canvas.height = ledY * scale;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = canvasTheme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border with RGB cycling based on (col + row) % 3
    const borderColorIndex = (col + row) % 3;
    const borderColor = canvasTheme.panelBorderColors[borderColorIndex];
    const borderThickness = style.borderThickness * scale / 4;

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderThickness;
    ctx.strokeRect(borderThickness / 2, borderThickness / 2, canvas.width - borderThickness, canvas.height - borderThickness);

    // Label
    const colLabel = columnLabel(col);
    const rowLabel = (row + 1).toString();
    const label = `${colLabel}${rowLabel}`;

    // Font size: auto or fixed
    let fontSize = style.fontSize * scale / 4;
    if (fontSize === 0) {
      // Auto size based on canvas dimensions
      fontSize = Math.min(canvas.width, canvas.height) * 0.4;
    }

    ctx.fillStyle = style.fontColor;
    ctx.font = canvasTheme.panelLabelFont(fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    // Section name indicator (small text at bottom) if enabled
    if (style.sectionLabelEnabled && section && section.name) {
      const sectionFontSize = fontSize * 0.25;
      ctx.font = canvasTheme.panelSectionNameFont(sectionFontSize);
      ctx.fillStyle = style.sectionLabelColor;
      ctx.fillText(section.name, canvas.width / 2, canvas.height - borderThickness - sectionFontSize);
    }

    return canvas;
  }

  /**
   * One canvas for a whole section: every panel's border and label (rows flipped for texture coordinates,
   * column labels continued from `startCol`), the centred section name and the section logo.
   * Ports: index.html@cd3fd3f lines 2052-2187.
   * Side effects: creates and draws a canvas (and a canvas per call only; nothing is cached).
   * @param {import('../../domain/WallSection.js').WallSection} section
   * @param {number} sectionIndex  unused (kept for signature parity with legacy)
   * @param {number|null} overrideScale  px per LED; falsy -> sectionPxPerLed of the section's LED size
   * @param {*} [startCol]  the section's first global column (raw `+`, B-L8)
   * @returns {HTMLCanvasElement}
   */
  sectionCanvas(section, sectionIndex, overrideScale, startCol = 0) {
    const style = this.#style;
    const canvasTheme = this.#theme.canvas;
    // Create a single canvas for the entire section with all panel IDs
    const canvasWidth = section.panelCols * section.ledX;
    const canvasHeight = section.panelRows * section.ledY;
    const scale = overrideScale || sectionPxPerLed(canvasWidth, canvasHeight);

    const canvas = this.#doc.createElement('canvas');
    canvas.width = canvasWidth * scale;
    canvas.height = canvasHeight * scale;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = canvasTheme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const panelW = section.ledX * scale;
    const panelH = section.ledY * scale;
    const borderThickness = style.borderThickness * scale / 4;

    for (let row = 0; row < section.panelRows; row++) {
      for (let col = 0; col < section.panelCols; col++) {
        const x = col * panelW;
        const y = (section.panelRows - 1 - row) * panelH; // Flip Y for texture coords

        // Border with RGB cycling (use cumulative column for consistent pattern)
        const borderColorIndex = ((startCol + col) + row) % 3;
        ctx.strokeStyle = canvasTheme.panelBorderColors[borderColorIndex];
        ctx.lineWidth = borderThickness;
        ctx.strokeRect(x + borderThickness / 2, y + borderThickness / 2, panelW - borderThickness, panelH - borderThickness);

        // Label with cumulative column numbering
        const colLabel = columnLabel(startCol + col);
        const label = `${colLabel}${row + 1}`;

        let fontSize = style.fontSize * scale / 4;
        if (fontSize === 0) {
          fontSize = Math.min(panelW, panelH) * 0.35;
        }

        ctx.fillStyle = style.fontColor;
        ctx.font = canvasTheme.panelLabelFont(fontSize);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + panelW / 2, y + panelH / 2);
      }
    }

    // Draw section name in center if enabled
    if (style.sectionLabelEnabled && section.name) {
      let sectionFontSize = style.sectionLabelFontSize * scale / 4;
      if (sectionFontSize === 0) {
        sectionFontSize = Math.min(canvas.width, canvas.height) * 0.15;
      }

      ctx.fillStyle = style.sectionLabelColor;
      ctx.font = canvasTheme.sectionLabelFont(sectionFontSize);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = canvasTheme.sectionLabelAlpha;
      ctx.fillText(section.name, canvas.width / 2, canvas.height / 2);
      ctx.globalAlpha = 1.0;
    }

    // Draw section logo if set
    const logoData = this.#logos.get(section.id);
    if (logoData && logoData.image && logoData.image.complete) {
      // LEGACY(B-L35): no guard for a zero-size (or broken) image: the aspect becomes NaN/Infinity and the
      // drawImage arguments follow it, exactly like legacy.
      this.#drawLogo(ctx, canvas, logoData);
    }

    return canvas;
  }

  /**
   * Draws a section logo scaled to `logoData.scale` of the canvas (aspect kept) at one of nine positions.
   * Ports: index.html@cd3fd3f lines 2118-2183.
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {{image: HTMLImageElement, scale?: number, position?: string}} logoData
   */
  #drawLogo(ctx, canvas, logoData) {
    const img = logoData.image;
    const logoScale = logoData.scale || 0.3;
    const position = logoData.position || 'center';

    // Calculate logo size (percentage of canvas)
    const maxLogoWidth = canvas.width * logoScale;
    const maxLogoHeight = canvas.height * logoScale;

    // Maintain aspect ratio
    const imgAspect = img.width / img.height;
    let logoW, logoH;
    if (maxLogoWidth / maxLogoHeight > imgAspect) {
      logoH = maxLogoHeight;
      logoW = logoH * imgAspect;
    } else {
      logoW = maxLogoWidth;
      logoH = logoW / imgAspect;
    }

    // Calculate position
    let logoX, logoY;
    const margin = Math.min(canvas.width, canvas.height) * 0.05;

    switch (position) {
      case 'top-left':
        logoX = margin;
        logoY = margin;
        break;
      case 'top-center':
        logoX = (canvas.width - logoW) / 2;
        logoY = margin;
        break;
      case 'top-right':
        logoX = canvas.width - logoW - margin;
        logoY = margin;
        break;
      case 'center-left':
        logoX = margin;
        logoY = (canvas.height - logoH) / 2;
        break;
      case 'center':
      default:
        logoX = (canvas.width - logoW) / 2;
        logoY = (canvas.height - logoH) / 2;
        break;
      case 'center-right':
        logoX = canvas.width - logoW - margin;
        logoY = (canvas.height - logoH) / 2;
        break;
      case 'bottom-left':
        logoX = margin;
        logoY = canvas.height - logoH - margin;
        break;
      case 'bottom-center':
        logoX = (canvas.width - logoW) / 2;
        logoY = canvas.height - logoH - margin;
        break;
      case 'bottom-right':
        logoX = canvas.width - logoW - margin;
        logoY = canvas.height - logoH - margin;
        break;
    }

    ctx.globalAlpha = this.#theme.canvas.logoAlpha;
    ctx.drawImage(img, logoX, logoY, logoW, logoH);
    ctx.globalAlpha = 1.0;
  }

  /**
   * The combined-mode atlas: every section canvas side by side, bottom-aligned, at the atlas px/LED.
   * Ports: index.html@cd3fd3f lines 1680-1708 (totals, scale and running offsets come from the atlas).
   * Side effects: creates and draws a canvas (plus one section canvas per section).
   * @param {import('../../domain/WallSection.js').WallSection[]} sections
   * @param {{totalLedX: number, totalLedY: number, pxPerLed: number,
   *          entries: {startCol: *, ledOffsetX: number}[]}} [atlas]  defaults to computeAtlas(sections)
   * @returns {HTMLCanvasElement}
   */
  atlasCanvas(sections, atlas = computeAtlas(sections)) {
    const scale = atlas.pxPerLed;
    const canvas = this.#doc.createElement('canvas');
    canvas.width = atlas.totalLedX * scale;
    canvas.height = atlas.totalLedY * scale;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = this.#theme.canvas.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    sections.forEach((section, sectionIndex) => {
      const entry = atlas.entries[sectionIndex];
      const sectionCanvas = this.sectionCanvas(section, sectionIndex, scale, entry.startCol);
      // Draw section canvas at correct position, accounting for different heights
      const yOffset = (atlas.totalLedY - section.panelRows * section.ledY) * scale;
      ctx.drawImage(sectionCanvas, entry.ledOffsetX * scale, yOffset);
    });

    return canvas;
  }
}
