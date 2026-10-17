/**
 * @module ui/SectionLogosPanel
 * The per-section logo rows inside the panel-ID options (upload, clear, position, scale): the legacy template,
 * the four logo handlers (LogoLibrary writes, then a rebuild iff panel IDs) and the list's mirror subscriptions.
 * Owns #section-logos-container.
 * Legacy source: index.html@cd3fd3f 2189-2254 (renderSectionLogosUI), 2256-2305 (logo handlers), 4020 / 4106 /
 * 4135 / 4197 (the re-render call sites, now mirror subscriptions).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 *
 * Template note: the template literal below is byte-identical to legacy, including the whitespace at the start of
 * every line inside the backticks (it is part of the innerHTML string), except for the four inline styles that
 * 06 T1 replaced by the classes of css/99-utilities.css: the name div (logo-row__title), the two labels
 * (logo-row__label) and the scale input (logo-row__input). The row div takes the class logo-row instead of the
 * legacy style.cssText; the file input keeps its inline display: none. 06 T4c spells the visible position
 * option labels in British English ("Top Centre", "Centre Left", "Centre", "Centre Right", "Bottom Centre"); the
 * option values (top-center, ...) are data and do not change. 08 P2-3a (B-M4, 08 6.5): the section name and every
 * id interpolation go through escapeHtml (legacy interpolated them raw). Do not re-indent it.
 */
import { Events } from '../core/EventBus.js';
import { LogoLibrary } from '../domain/LogoLibrary.js';
import { byId, escapeHtml } from './dom.js';

/**
 * One logo row's inner markup.
 * Ports: index.html@cd3fd3f lines 2201-2234 (with the 06 T1 classes and the 06 T4c labels, see the template note
 * above).
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {number} index
 * @param {*} hasLogo  truthy when an image is loaded for the section's id
 * @param {{position: string, scale: number}} logoData
 * @returns {string}
 */
function logoRowHtml(section, index, hasLogo, logoData) {
  return `
                    <div class="logo-row__title">${escapeHtml(section.name || 'Wall ' + (index + 1))}</div>
                    <div class="section-logo-upload">
                        <label class="section-logo-upload-btn ${hasLogo ? 'has-logo' : ''}" data-section-id="${escapeHtml(section.id)}">
                            ${hasLogo ? '✓ Logo uploaded' : '+ Upload Logo'}
                            <input type="file" accept="image/*" style="display: none;" data-section-id="${escapeHtml(section.id)}">
                        </label>
                        <button class="section-logo-clear ${hasLogo ? 'visible' : ''}" data-section-id="${escapeHtml(section.id)}" title="Remove logo">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="section-logo-position ${hasLogo ? 'visible' : ''}" data-section-id="${escapeHtml(section.id)}">
                        <label class="logo-row__label">Position</label>
                        <select data-section-id="${escapeHtml(section.id)}" data-field="position">
                            <option value="top-left" ${logoData.position === 'top-left' ? 'selected' : ''}>Top Left</option>
                            <option value="top-center" ${logoData.position === 'top-center' ? 'selected' : ''}>Top Centre</option>
                            <option value="top-right" ${logoData.position === 'top-right' ? 'selected' : ''}>Top Right</option>
                            <option value="center-left" ${logoData.position === 'center-left' ? 'selected' : ''}>Centre Left</option>
                            <option value="center" ${logoData.position === 'center' ? 'selected' : ''}>Centre</option>
                            <option value="center-right" ${logoData.position === 'center-right' ? 'selected' : ''}>Centre Right</option>
                            <option value="bottom-left" ${logoData.position === 'bottom-left' ? 'selected' : ''}>Bottom Left</option>
                            <option value="bottom-center" ${logoData.position === 'bottom-center' ? 'selected' : ''}>Bottom Centre</option>
                            <option value="bottom-right" ${logoData.position === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
                        </select>
                    </div>
                    <div class="section-logo-scale ${hasLogo ? 'visible' : ''}" data-section-id="${escapeHtml(section.id)}">
                        <label class="logo-row__label">Scale (%)</label>
                        <input type="number" value="${Math.round((logoData.scale || 0.3) * 100)}" min="5" max="100" step="5" 
                               data-section-id="${escapeHtml(section.id)}" data-field="scale"
                               class="logo-row__input">
                    </div>
                `;
}

/**
 * The section logo list.
 */
export class SectionLogosPanel {
  /** @type {Document} */
  #doc;
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../app/WallController.js').WallController} */
  #wallController;
  /** @type {HTMLElement|null} #section-logos-container */
  #container;

  /**
   * Looks up #section-logos-container and subscribes the three re-render mirrors:
   *  WALL_SECTIONS_CHANGED: render() iff reason !== 'import' and panel IDs are on   (4106, 4135)
   *  WALL_SECTION_RENAMED: render()   (4020; WallController already gated it on panel IDs)
   *  DISPLAY_CONTENT_CHANGED: render() iff toggled === 'panelIds' && on   (4197)
   * Construct it after SectionListPanel and WallDisplayPanel, so its mirrors run after theirs (legacy order).
   * Side effects: DOM lookup (no mutation); three bus subscriptions.
   * @param {{doc: Document, project: import('../domain/Project.js').Project,
   *          wallController: import('../app/WallController.js').WallController,
   *          bus: import('../core/EventBus.js').EventBus}} deps
   */
  constructor({ doc, project, wallController, bus }) {
    this.#doc = doc;
    this.#project = project;
    this.#wallController = wallController;
    this.#container = byId(doc, 'section-logos-container');

    bus.on(Events.WALL_SECTIONS_CHANGED, ({ reason }) => {
      // LEGACY(B-L21): an import does not re-render the logo list (and does not reset the logos), so with panel
      // IDs on the list keeps showing the pre-import sections.
      if (reason !== 'import' && this.#project.display.panelIdsEnabled) this.render();
    });
    bus.on(Events.WALL_SECTION_RENAMED, () => this.render());
    bus.on(Events.DISPLAY_CONTENT_CHANGED, ({ toggled, on }) => {
      if (toggled === 'panelIds' && on) this.render();
    });
  }

  /**
   * Re-renders one row per section, then wires the row controls (after appending every row, as legacy).
   * Ports: index.html@cd3fd3f lines 2189-2254.
   * Side effects: replaces the content of #section-logos-container; adds the row listeners.
   */
  render() {
    const container = this.#container;
    if (!container) return;

    container.innerHTML = '';

    const logos = this.#project.logos;
    this.#project.wall.sections.forEach((section, index) => {
      const hasLogo = logos.hasImage(section.id);
      const logoData = logos.get(section.id) || { position: 'center', scale: 0.3 };

      const sectionDiv = this.#doc.createElement('div');
      sectionDiv.className = 'logo-row';
      // The section name and ids are escaped (B-M4 fixed in 08 P2-3a). The id is written to data-section-id and
      // parsed back with parseInt by the handlers, while this render (and the panel-ID renderer) read the entry with
      // the id itself; since 08 P2-3b (B-L8 fixed) every id is a validated integer, for which both give the same key
      // (legacy ids such as 'a', '07' or 1.5 never showed their logo).
      sectionDiv.innerHTML = logoRowHtml(section, index, hasLogo, logoData);
      container.appendChild(sectionDiv);
    });

    // Add event listeners
    container.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', (e) => this.#onUpload(e));
    });

    container.querySelectorAll('.section-logo-clear').forEach(btn => {
      btn.addEventListener('click', (e) => this.#onClear(e));
    });

    container.querySelectorAll('select[data-field="position"]').forEach(select => {
      select.addEventListener('change', (e) => this.#onPosition(e));
    });

    container.querySelectorAll('input[data-field="scale"]').forEach(input => {
      input.addEventListener('change', (e) => this.#onScale(e));
    });
  }

  /**
   * File input change: read the file as a data URL, load it into an Image, store it under parseInt(id),
   * re-render the list and rebuild iff panel IDs. FileReader and Image are looked up at call time.
   * Ports: index.html@cd3fd3f lines 2256-2278.
   * Side effects: async: logos.setImage, render(), wallController.rebuildIfPanelIds().
   * @param {Event} e
   */
  #onUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const sectionId = parseInt(e.target.dataset.sectionId);
    const reader = new FileReader();

    // LEGACY(B-L35): no reader.onerror / img.onerror and no zero-size guard; a failed load does nothing.
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        this.#project.logos.setImage(sectionId, img);

        this.render();
        this.#wallController.rebuildIfPanelIds();
      };
      img.src = event.target.result;
    };

    reader.readAsDataURL(file);
  }

  /**
   * Clear button: delete the entry, re-render, rebuild iff panel IDs.
   * Ports: index.html@cd3fd3f lines 2280-2286.
   * Side effects: logos.remove; render(); wallController.rebuildIfPanelIds().
   * @param {Event} e
   */
  #onClear(e) {
    const sectionId = parseInt(e.currentTarget.dataset.sectionId);
    this.#project.logos.remove(sectionId);

    this.render();
    this.#wallController.rebuildIfPanelIds();
  }

  /**
   * Position select: only an existing entry is updated (and only then the wall rebuilds iff panel IDs).
   * Ports: index.html@cd3fd3f lines 2288-2294.
   * Side effects: logos.setPosition; wallController.rebuildIfPanelIds() iff the entry exists.
   * @param {Event} e
   */
  #onPosition(e) {
    const sectionId = parseInt(e.target.dataset.sectionId);
    if (this.#project.logos.setPosition(sectionId, e.target.value)) {
      this.#wallController.rebuildIfPanelIds();
    }
  }

  /**
   * Scale input: parse and clamp the percentage, always write it back, then update an existing entry (and
   * rebuild iff panel IDs).
   * Ports: index.html@cd3fd3f lines 2296-2305.
   * Side effects: writes the input value; logos.setScale; wallController.rebuildIfPanelIds() iff the entry exists.
   * @param {Event} e
   */
  #onScale(e) {
    const sectionId = parseInt(e.target.dataset.sectionId);
    const scalePercent = LogoLibrary.parseScalePercent(e.target.value);
    e.target.value = scalePercent;

    if (this.#project.logos.setScale(sectionId, scalePercent / 100)) {
      this.#wallController.rebuildIfPanelIds();
    }
  }
}
