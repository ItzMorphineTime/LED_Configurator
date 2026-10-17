/**
 * @module ui/SectionListPanel
 * The wall-section cards: the legacy card templates, the card handlers (commands down to WallController), the
 * in-place card patch after a number edit, the collapse snapshot/restore around add/delete, and the
 * #add-section-btn button. Owns #wall-sections, #add-section-btn and every card element.
 * Legacy source: index.html@cd3fd3f 3892-4079 (renderWallSections), 4083-4086 / 4109-4116 / 4125-4128 /
 * 4138-4143 (collapse snapshot and restore of addSection / deleteSection), 4149-4154 (setupUI: first card
 * expanded, add button), 4998-5001 (import: re-render, first card expanded).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 *
 * Template note: the two template literals below are byte-identical to legacy, including the whitespace at the
 * start of every line inside the backticks (it is part of the innerHTML string), except that the offset hint's
 * inline font-size became the class curve-hint--small of css/99-utilities.css (06 T1), and the British copy of
 * 06 T4c: the labels "Panel Angle (°)" (was "Angle Between Panels (°)", which wrapped to two lines under
 * Montserrat) and "Panel Colour", the custom input's title "Custom colour". The colour dot's and the swatches'
 * inline backgrounds are per-section data and stay. Do not re-indent them. 06 T7: the swatches are rendered from the
 * injected palette's cardSwatches, one per line with the legacy indentation, so the six legacy swatches would give the
 * legacy markup byte for byte. 08 P2-8a (B-L15, 08 4.4): the four integer inputs (columns, rows, Pixels X/Y) gain
 * step="1", panel height max="100000", Pixels X/Y max="65536" and the panel angle min="-180" max="180"
 * (WallSection.LIMITS). 08 P2-3a (B-M4, 08 6.5): every interpolation of a section value goes through escapeHtml
 * (legacy interpolated them raw), so imported or typed markup renders as text.
 */
import { Events } from '../core/EventBus.js';
import { byId, escapeHtml } from './dom.js';

/**
 * The 4K warning block of a freshly rendered card (multi-line markup, render only; the in-place patch inserts
 * a different, single-line markup, see SectionListPanel#patchCard).
 * The canvas size is the product of two section fields, so it is always a number (never user text); it goes through
 * escapeHtml like every other interpolation (a no-op for a number).
 * Ports: index.html@cd3fd3f lines 3904-3905, 3908-3916.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @returns {string} the warning markup, or '' when the section fits 4K
 */
function warningBlockHtml(section) {
  const canvasWidth = section.canvasWidth;
  const canvasHeight = section.canvasHeight;
  const exceeds4K = section.exceeds4K;
  const warningHTML = exceeds4K ? `
                    <div class="section-warning">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span>Canvas ${escapeHtml(canvasWidth)}×${escapeHtml(canvasHeight)} exceeds 4K</span>
                    </div>` : '';
  return warningHTML;
}

/**
 * The palette swatches of a card (06 T7, 5.7): one div per colour of `swatches`, each on its own line with the
 * template's indentation; the active one is the swatch equal to the section colour. The colours are palette
 * constants, so no escaping is needed (B-M4 does not apply).
 * Ports: index.html@cd3fd3f lines 3970-3975.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {ReadonlyArray<string>} swatches  palette.cardSwatches
 * @returns {string}
 */
function swatchesHtml(section, swatches) {
  return swatches.map((c) => `<div class="color-swatch-small ${section.color === c ? 'active' : ''}" data-color="${c}" style="background: ${c};"></div>`)
    .join('\n                                    ');
}

/**
 * The card's inner markup. Every interpolation of a section value goes through escapeHtml() (B-M4 fixed in 08 P2-3a):
 * name (title and input), colour (dot and colour input), id, the eight numeric field values (validated numbers since
 * 08 P2-3b), summary and hint. The swatches come from the palette (06 T7).
 * Ports: index.html@cd3fd3f lines 3898, 3906, 3908, 3920-3980.
 * Side effects: none.
 * @param {import('../domain/WallSection.js').WallSection} section
 * @param {boolean} showDelete  legacy `wallSections.length > 1`
 * @param {ReadonlyArray<string>} swatches  palette.cardSwatches
 * @returns {string}
 */
function cardHtml(section, showDelete, swatches) {
  const summary = section.summary;
  const exceeds4K = section.exceeds4K;
  const warningHTML = warningBlockHtml(section);
  const hint = section.curveHint;
  return `
                    <div class="section-header">
                        <div class="section-header-left">
                            <div class="section-color" style="background: ${escapeHtml(section.color)}"></div>
                            <div>
                                <div class="section-title">${escapeHtml(section.name)}${exceeds4K ? ' <span class="warning-indicator">⚠</span>' : ''}</div>
                                <div class="section-summary">${escapeHtml(summary)}</div>
                            </div>
                        </div>
                        <div class="section-header-right">
                            ${showDelete ? `<button class="section-delete" data-id="${escapeHtml(section.id)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
                            <div class="section-toggle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>
                        </div>
                    </div>
                    <div class="section-content">
                        ${warningHTML}
                        <div class="section-row single">
                            <div class="input-field">
                                <label>Section Name</label>
                                <input type="text" class="section-name-input" value="${escapeHtml(section.name)}" maxlength="32">
                            </div>
                        </div>
                        <div class="section-row">
                            <div class="input-field"><label>Columns</label><input type="number" data-field="panelCols" value="${escapeHtml(section.panelCols)}" min="1" max="50" step="1"></div>
                            <div class="input-field"><label>Rows</label><input type="number" data-field="panelRows" value="${escapeHtml(section.panelRows)}" min="1" max="20" step="1"></div>
                        </div>
                        <div class="section-row">
                            <div class="input-field"><label>Width (mm)</label><input type="number" data-field="panelWidth" value="${escapeHtml(section.panelWidth)}" min="50" max="5000"></div>
                            <div class="input-field"><label>Height (mm)</label><input type="number" data-field="panelHeight" value="${escapeHtml(section.panelHeight)}" min="50" max="100000"></div>
                        </div>
                        <div class="section-row">
                            <div class="input-field"><label>Pixels X</label><input type="number" data-field="ledX" value="${escapeHtml(section.ledX)}" min="8" max="65536" step="1"></div>
                            <div class="input-field"><label>Pixels Y</label><input type="number" data-field="ledY" value="${escapeHtml(section.ledY)}" min="8" max="65536" step="1"></div>
                        </div>
                        <div class="section-row">
                            <div class="input-field">
                                <label>Panel Angle (°)</label>
                                <input type="number" data-field="curveIntensity" value="${escapeHtml(section.curveIntensity)}" min="-180" max="180" step="0.1">
                                <div class="curve-hint">${escapeHtml(hint)}</div>
                            </div>
                            <div class="input-field">
                                <label>Section Offset (°)</label>
                                <input type="number" data-field="angleOffset" value="${escapeHtml(section.angleOffset || 0)}" min="-180" max="180" step="1">
                                <div class="curve-hint curve-hint--small">Rotation before section</div>
                            </div>
                        </div>
                        <div class="section-row single">
                            <div class="input-field">
                                <label>Panel Colour</label>
                                <div class="section-color-picker">
                                    ${swatchesHtml(section, swatches)}
                                    <input type="color" class="color-input-custom" value="${escapeHtml(section.color)}" title="Custom colour">
                                </div>
                            </div>
                        </div>
                    </div>`;
}

/**
 * The section card list.
 */
export class SectionListPanel {
  /** @type {Document} */
  #doc;
  /** @type {import('../domain/Project.js').Project} */
  #project;
  /** @type {import('../app/WallController.js').WallController} */
  #wallController;
  /** @type {{cardSwatches: ReadonlyArray<string>}} the theme palette (06 T7) */
  #palette;
  /** @type {HTMLElement} #wall-sections */
  #container;
  /** @type {HTMLElement} #add-section-btn */
  #addButton;
  /**
   * The section list as of the last render() (a copy): the collapse snapshot maps the still-unchanged cards to
   * these ids (PR2: the snapshot runs after the model change, inside the WALL_SECTIONS_CHANGED mirror).
   * @type {import('../domain/WallSection.js').WallSection[]}
   */
  #renderedSections = [];

  /**
   * Looks up #wall-sections and #add-section-btn and subscribes WALL_SECTIONS_CHANGED:
   *  'import' -> render(); expandFirst()   (4998-5001)
   *  'add' / 'delete' -> snapshot the collapse states -> render() -> restore them (expanding the added card on 'add')
   * Side effects: DOM lookups (no mutation); one bus subscription.
   * @param {{doc: Document, project: import('../domain/Project.js').Project,
   *          wallController: import('../app/WallController.js').WallController,
   *          bus: import('../core/EventBus.js').EventBus,
   *          palette: {cardSwatches: ReadonlyArray<string>}}} deps
   *   palette: theme.palette (06 T7: the card swatches)
   */
  constructor({ doc, project, wallController, bus, palette }) {
    this.#doc = doc;
    this.#palette = palette;
    this.#project = project;
    this.#wallController = wallController;
    this.#container = byId(doc, 'wall-sections');
    this.#addButton = byId(doc, 'add-section-btn');

    bus.on(Events.WALL_SECTIONS_CHANGED, (payload) => this.#onSectionsChanged(payload));
  }

  /**
   * #add-section-btn click -> wallController.addSection().
   * Ports: index.html@cd3fd3f line 4154.
   * Side effects: adds one click listener.
   */
  bindAddButton() {
    this.#addButton.addEventListener('click', () => this.#wallController.addSection());
  }

  /**
   * Re-renders every card (all collapsed) and wires each card's listeners right after appending it.
   * section.ensureName(index) is the one declared domain write inside a subscriber (R3 / bus rule 5): it is
   * idempotent and never writes in practice.
   * Ports: index.html@cd3fd3f lines 3892-4079.
   * Side effects: replaces the content of #wall-sections; adds the card listeners; may fill a missing name.
   */
  render() {
    const container = this.#container;
    container.innerHTML = '';

    const wall = this.#project.wall;
    this.#renderedSections = wall.sections.slice();

    wall.sections.forEach((section, index) => {
      // Ensure section has a name
      section.ensureName(index);

      const sectionEl = this.#doc.createElement('div');
      sectionEl.className = 'wall-section collapsed';
      // Every section value in the template is escaped (B-M4 fixed in 08 P2-3a): a name such as `<img onerror=...>`
      // renders as text.
      sectionEl.innerHTML = cardHtml(section, wall.count > 1, this.#palette.cardSwatches);

      container.appendChild(sectionEl);

      this.#bindCard(sectionEl, section, index);
    });
  }

  /**
   * Expands the first card in the document.
   * Ports: index.html@cd3fd3f lines 4150-4152 (setupUI) and 4999-5001 (import).
   * Side effects: removes 'collapsed' from the first `.wall-section`, if any.
   */
  expandFirst() {
    const firstSection = this.#doc.querySelector('.wall-section');
    if (firstSection) firstSection.classList.remove('collapsed');
  }

  /**
   * The card listeners, registered in legacy order: header toggle, delete, swatches, custom colour, name input,
   * name click, number inputs (change + click).
   * Ports: index.html@cd3fd3f lines 3984-4077.
   * Side effects: adds listeners to the card's elements.
   * @param {HTMLElement} sectionEl
   * @param {import('../domain/WallSection.js').WallSection} section
   * @param {number} index  the card index at render time (captured, as legacy)
   */
  #bindCard(sectionEl, section, index) {
    const wallController = this.#wallController;

    sectionEl.querySelector('.section-header').addEventListener('click', (e) => {
      if (!e.target.closest('.section-delete')) sectionEl.classList.toggle('collapsed');
    });

    const deleteBtn = sectionEl.querySelector('.section-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); wallController.deleteSection(section.id); });

    // Color swatches
    sectionEl.querySelectorAll('.color-swatch-small').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        sectionEl.querySelectorAll('.color-swatch-small').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = swatch.dataset.color;
        sectionEl.querySelector('.section-color').style.background = color;
        sectionEl.querySelector('.color-input-custom').value = color;
        wallController.setSectionColor(section, color);
      });
    });

    // Custom color input
    sectionEl.querySelector('.color-input-custom').addEventListener('input', (e) => {
      e.stopPropagation();
      const color = e.target.value;
      sectionEl.querySelectorAll('.color-swatch-small').forEach(s => s.classList.remove('active'));
      sectionEl.querySelector('.section-color').style.background = color;
      wallController.setSectionColor(section, color);
    });

    // Section name input
    sectionEl.querySelector('.section-name-input').addEventListener('input', (e) => {
      e.stopPropagation();
      const name = wallController.renameSection(section, e.target.value, index);
      sectionEl.querySelector('.section-title').innerHTML = escapeHtml(name) +
          (sectionEl.querySelector('.warning-indicator') ? ' <span class="warning-indicator">⚠</span>' : '');
      wallController.commitRename();
    });
    sectionEl.querySelector('.section-name-input').addEventListener('click', (e) => e.stopPropagation());

    sectionEl.querySelectorAll('input[type="number"]').forEach(input => {
      input.addEventListener('change', (e) => {
        const field = e.target.dataset.field;
        const value = wallController.setSectionField(section, field, e.target.value);
        e.target.value = value;
        this.#patchCard(sectionEl, section, field);
        wallController.commitSectionEdit();
      });
      input.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  /**
   * Patches one card in place after a number edit: curve hint (the card's FIRST .curve-hint, only for
   * curveIntensity), summary, the 4K warning box (single-line markup, distinct from the render template) and
   * the title ⚠.
   * Ports: index.html@cd3fd3f lines 4040-4071.
   * Side effects: writes the card's hint, summary, warning box and title.
   * @param {HTMLElement} sectionEl
   * @param {import('../domain/WallSection.js').WallSection} section  already holds the new value
   * @param {string} field
   */
  #patchCard(sectionEl, section, field) {
    // Update curve hint
    if (field === 'curveIntensity') {
      const hint = sectionEl.querySelector('.curve-hint');
      hint.textContent = section.curveHint;
    }

    // Update summary with pixel dimensions
    const canvasWidth = section.canvasWidth;
    const canvasHeight = section.canvasHeight;
    sectionEl.querySelector('.section-summary').textContent = section.summary;

    // Update 4K warning
    const exceeds4K = section.exceeds4K;
    const existingWarning = sectionEl.querySelector('.section-warning');
    const titleEl = sectionEl.querySelector('.section-title');

    if (exceeds4K && !existingWarning) {
      const warningEl = this.#doc.createElement('div');
      warningEl.className = 'section-warning';
      warningEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>Canvas ${escapeHtml(canvasWidth)}×${escapeHtml(canvasHeight)} exceeds 4K</span>`;
      sectionEl.querySelector('.section-content').insertBefore(warningEl, sectionEl.querySelector('.section-content').firstChild);
      if (!titleEl.innerHTML.includes('warning-indicator')) {
        // LEGACY(B-L16): the ⚠ is inserted after the first "Wall <digits>" match, so a renamed section gets none
        // and a name like "Wall 2B" gets it in the middle.
        titleEl.innerHTML = titleEl.innerHTML.replace(/Wall \d+/, `$& <span class="warning-indicator">⚠</span>`);
      }
    } else if (!exceeds4K && existingWarning) {
      existingWarning.remove();
      titleEl.innerHTML = titleEl.innerHTML.replace(/ <span class="warning-indicator">⚠<\/span>/, '');
    } else if (exceeds4K && existingWarning) {
      existingWarning.querySelector('span').textContent = `Canvas ${canvasWidth}×${canvasHeight} exceeds 4K`;
    }
  }

  /**
   * WALL_SECTIONS_CHANGED mirror.
   * Ports: index.html@cd3fd3f lines 4083-4086 + 4105 + 4109-4116 (add), 4125-4128 + 4134 + 4138-4143 (delete),
   * 4998-5001 (import).
   * Side effects: re-renders the cards; writes their 'collapsed' classes.
   * @param {{reason: 'add'|'delete'|'import', addedId?: *}} payload
   */
  #onSectionsChanged({ reason, addedId }) {
    if (reason === 'import') {
      this.render();
      this.expandFirst();
    } else if (reason === 'add' || reason === 'delete') {
      const collapsedStates = this.#snapshotCollapsed();
      this.render();
      this.#restoreCollapsed(collapsedStates, reason === 'add', addedId);
    }
  }

  /**
   * Save collapsed states of the still-unchanged cards, keyed by the ids of the list rendered last (PR2).
   * Ports: index.html@cd3fd3f lines 4083-4086 (== 4125-4128).
   * Side effects: none.
   * @returns {Record<PropertyKey, boolean>} plain-object keys, exactly like legacy `collapsedStates[id]`
   */
  #snapshotCollapsed() {
    const collapsedStates = {};
    this.#doc.querySelectorAll('.wall-section').forEach((el, idx) => {
      collapsedStates[this.#renderedSections[idx].id] = el.classList.contains('collapsed');
    });
    return collapsedStates;
  }

  /**
   * Restore collapsed states over the new cards; on add, the new card is expanded (strict id equality, so a
   * NaN id never matches, exactly like legacy).
   * Ports: index.html@cd3fd3f lines 4109-4116 (add) and 4138-4143 (delete, no expand branch).
   * Side effects: writes the cards' 'collapsed' classes.
   * @param {Record<PropertyKey, boolean>} collapsedStates
   * @param {boolean} expandNew  true for 'add'
   * @param {*} addedId          the new section's id (add only)
   */
  #restoreCollapsed(collapsedStates, expandNew, addedId) {
    const sections = this.#project.wall.sections;
    this.#doc.querySelectorAll('.wall-section').forEach((el, idx) => {
      const section = sections[idx];
      if (expandNew && section.id === addedId) {
        el.classList.remove('collapsed'); // New section expanded
      } else if (collapsedStates[section.id] !== undefined) {
        el.classList.toggle('collapsed', collapsedStates[section.id]);
      }
    });
  }
}
