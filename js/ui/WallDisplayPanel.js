/**
 * @module ui/WallDisplayPanel
 * The wall display controls: mesh-mode labels, wireframe and frame toggles, LED simulation (+ layout), panel IDs
 * (+ styling inputs). Commands go down to WallController; the label highlight, the option blocks and the
 * forced-off toggles are mirrors of WALL_MESH_MODE_CHANGED and DISPLAY_CONTENT_CHANGED.
 * Owns the .mesh-mode-option labels, #toggle-wireframe, #toggle-frame, #toggle-led-sim, #led-sim-options,
 * #led-layout, #toggle-panel-ids, #panel-id-options, #panel-border-thickness, #panel-font-size, #panel-font-color,
 * #toggle-section-labels, #section-label-size and #section-label-color.
 * Spec 04 (UV-14, docs/improvements/04-uvs-uv-editor.md 3.3): the UV Mapping block of Mesh Options, #uv-options with
 * #uv-combined-layout, #uv-panel-mode, #uv-gltf-uv1 and #uv-atlas-note; commands go to UvController, and the values and
 * the atlas note mirror UV_SETTINGS_CHANGED. A page without the block (the legacy parity fixtures) skips it.
 * Legacy source: index.html@cd3fd3f 4156-4227 (setupUI display handlers), 4993-4995 (import label sync).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */
import { Events } from '../core/EventBus.js';
import { byId, flipToggle, setDisplay } from './dom.js';

/** The thousands separator of the atlas note (no Intl, like NormalLines.formatCount). */
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * The lines of the atlas note (04 3.3): the atlas size in LED px, the PNG size, then the notes and warnings, each on
 * its own line.
 * Side effects: none.
 * @param {{combinedLayout: string, atlas: object|null, sectionTextures: {reduced: boolean, pxPerLed: number|null}|null}} s
 * @returns {{text: string, warn: boolean}[]}
 */
export function atlasNoteLines({ atlas, sectionTextures }) {
  if (!atlas) return [];
  const lines = [
    { text: `ⓘ Atlas ${group(atlas.widthLed)} × ${group(atlas.heightLed)} LED px`, warn: false },
    { text: `  PNG ${group(atlas.pngWidth)} × ${group(atlas.pngHeight)} (${atlas.pngPxPerLed} px/LED)`, warn: false },
  ];
  if (sectionTextures && sectionTextures.reduced) {
    const p = Number(Number(sectionTextures.pxPerLed).toFixed(2));
    lines.push({ text: `ⓘ Viewport section textures at ${p} px/LED (16 MP budget)`, warn: false });
  }
  if (atlas.larger4K) lines.push({ text: '⚠ Larger than 4K', warn: true });
  if (atlas.overTexture) {
    lines.push({ text: `⚠ Over the GPU texture limit (${group(atlas.maxTextureSize)} px): the Atlas layout is downscaled in the viewport`, warn: true });
  }
  if (!atlas.fitsCanvas) {
    lines.push({ text: '⚠ Exceeds the browser canvas limit: Export Panel IDs and the ZIP atlas will be skipped', warn: true });
  }
  return lines;
}

/**
 * Mesh-mode, wireframe/frame, LED-sim and panel-ID controls.
 */
export class WallDisplayPanel {
  /** @type {Document} */
  #doc;
  /** @type {import('../app/WallController.js').WallController} */
  #wallController;
  /** @type {HTMLElement} */ #toggleWireframe;
  /** @type {HTMLElement} */ #toggleFrame;
  /** @type {HTMLElement} */ #toggleLedSim;
  /** @type {HTMLElement} */ #ledSimOptions;
  /** @type {HTMLSelectElement} */ #ledLayout;
  /** @type {HTMLElement} */ #togglePanelIds;
  /** @type {HTMLElement} */ #panelIdOptions;
  /** @type {HTMLInputElement} */ #panelBorderThickness;
  /** @type {HTMLInputElement} */ #panelFontSize;
  /** @type {HTMLInputElement} */ #panelFontColor;
  /** @type {HTMLElement} */ #toggleSectionLabels;
  /** @type {HTMLInputElement} */ #sectionLabelSize;
  /** @type {HTMLInputElement} */ #sectionLabelColor;
  /** @type {import('../app/UvController.js').UvController|null} */ #uvController;
  /** @type {HTMLSelectElement|null} */ #uvCombinedLayout;
  /** @type {HTMLSelectElement|null} */ #uvPanelMode;
  /** @type {HTMLInputElement|null} */ #uvGltfUv1;
  /** @type {HTMLElement|null} */ #uvAtlasNote;

  /**
   * Looks up the owned elements and subscribes the three mirrors:
   *  WALL_MESH_MODE_CHANGED({mode}): each .mesh-mode-option gets 'active' iff its data-mode === mode (4993-4995);
   *    the radio `checked` state is NOT touched (V-2).
   *  DISPLAY_CONTENT_CHANGED({toggled, on, forcedOff}): the option blocks, the toggled control's 'active' (idempotent
   *    after its own click; 04 3.7's [Show Panel IDs] chip turns panel IDs on without a click) and the forced-off toggle
   *    (4170-4176, 4190-4196).
   *  UV_SETTINGS_CHANGED (04 UV-14): the UV selects, the glTF option (enabled for the per-section layout only) and the
   *    atlas note.
   * Side effects: DOM lookups (no mutation); three bus subscriptions.
   * @param {{doc: Document, wallController: import('../app/WallController.js').WallController,
   *          bus: import('../core/EventBus.js').EventBus,
   *          uvController?: import('../app/UvController.js').UvController|null}} deps
   */
  constructor({ doc, wallController, bus, uvController = null }) {
    this.#doc = doc;
    this.#wallController = wallController;
    this.#uvController = uvController;
    this.#uvCombinedLayout = byId(doc, 'uv-combined-layout');
    this.#uvPanelMode = byId(doc, 'uv-panel-mode');
    this.#uvGltfUv1 = byId(doc, 'uv-gltf-uv1');
    this.#uvAtlasNote = byId(doc, 'uv-atlas-note');

    this.#toggleWireframe = byId(doc, 'toggle-wireframe');
    this.#toggleFrame = byId(doc, 'toggle-frame');
    this.#toggleLedSim = byId(doc, 'toggle-led-sim');
    this.#ledSimOptions = byId(doc, 'led-sim-options');
    this.#ledLayout = byId(doc, 'led-layout');
    this.#togglePanelIds = byId(doc, 'toggle-panel-ids');
    this.#panelIdOptions = byId(doc, 'panel-id-options');
    this.#panelBorderThickness = byId(doc, 'panel-border-thickness');
    this.#panelFontSize = byId(doc, 'panel-font-size');
    this.#panelFontColor = byId(doc, 'panel-font-color');
    this.#toggleSectionLabels = byId(doc, 'toggle-section-labels');
    this.#sectionLabelSize = byId(doc, 'section-label-size');
    this.#sectionLabelColor = byId(doc, 'section-label-color');

    bus.on(Events.WALL_MESH_MODE_CHANGED, (payload) => this.#mirrorMeshMode(payload));
    bus.on(Events.DISPLAY_CONTENT_CHANGED, (payload) => this.#mirrorDisplayContent(payload));
    bus.on(Events.UV_SETTINGS_CHANGED, (payload) => this.#mirrorUvSettings(payload));
  }

  /**
   * Registers the display listeners in legacy order: mesh-mode labels, wireframe, frame, LED sim, LED layout,
   * panel IDs, border thickness, font size, font colour, section labels, section label size, section label colour.
   * Ports: index.html@cd3fd3f lines 4156-4227.
   * Side effects: adds 14 listeners (one per label, plus 11 controls).
   */
  bind() {
    const wallController = this.#wallController;

    // LEGACY(B-L13): the listener stays on the .mesh-mode-option LABEL 'click'; each label wraps a hidden radio
    // whose synthetic click bubbles back to the label, so the handler (and the wall rebuild) runs twice per click.
    // WARNING: never move this to the radio 'change' event. An import updates the label classes but leaves the
    // radio `checked` state stale, and a click on the stale-checked option must still switch modes (a radio
    // 'change' would not fire there; see the convex import scenario).
    this.#meshModeOptions().forEach(opt => {
      opt.addEventListener('click', () => {
        this.#meshModeOptions().forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        wallController.setMeshMode(opt.dataset.mode);
      });
    });

    const toggleWireframe = this.#toggleWireframe;
    toggleWireframe.addEventListener('click', () => wallController.setWireframe(flipToggle(toggleWireframe)));
    const toggleFrame = this.#toggleFrame;
    toggleFrame.addEventListener('click', () => wallController.setShowFrame(flipToggle(toggleFrame)));
    const toggleLedSim = this.#toggleLedSim;
    toggleLedSim.addEventListener('click', () => wallController.setLedSim(flipToggle(toggleLedSim)));
    const ledLayout = this.#ledLayout;
    ledLayout.addEventListener('change', () => wallController.setLedLayout(ledLayout.value));

    // Panel ID handlers
    const togglePanelIds = this.#togglePanelIds;
    togglePanelIds.addEventListener('click', () => wallController.setPanelIds(flipToggle(togglePanelIds)));
    this.#bindNumericStyleInput(this.#panelBorderThickness, 'borderThickness');
    this.#bindNumericStyleInput(this.#panelFontSize, 'fontSize');
    this.#bindColorStyleInput(this.#panelFontColor, 'fontColor');
    const toggleSectionLabels = this.#toggleSectionLabels;
    toggleSectionLabels.addEventListener('click', () => {
      wallController.setPanelIdStyle('sectionLabelEnabled', flipToggle(toggleSectionLabels));
      wallController.rebuildIfPanelIds();
    });
    this.#bindNumericStyleInput(this.#sectionLabelSize, 'sectionLabelFontSize');
    this.#bindColorStyleInput(this.#sectionLabelColor, 'sectionLabelColor');

    // 04 UV-14: the UV Mapping block (after every legacy listener; absent from the legacy parity fixtures)
    const uv = this.#uvController;
    if (uv && this.#uvCombinedLayout && this.#uvPanelMode && this.#uvGltfUv1) {
      const layout = this.#uvCombinedLayout;
      layout.addEventListener('change', () => uv.setCombinedLayout(layout.value));
      const panelMode = this.#uvPanelMode;
      panelMode.addEventListener('change', () => uv.setPanelUvs(panelMode.value));
      const gltf = this.#uvGltfUv1;
      gltf.addEventListener('change', () => uv.setGltfAtlasTexcoord1(gltf.checked));
    }
  }

  /**
   * UV_SETTINGS_CHANGED mirror (04 UV-14): the select values, the glTF option (checked; enabled only for the
   * per-section layout) and the atlas note lines.
   * Side effects: writes the UV block's values and the note's children.
   * @param {object} s  the UV_SETTINGS_CHANGED payload
   */
  #mirrorUvSettings(s) {
    if (this.#uvCombinedLayout) this.#uvCombinedLayout.value = s.combinedLayout;
    if (this.#uvPanelMode) this.#uvPanelMode.value = s.panelUvs;
    if (this.#uvGltfUv1) {
      this.#uvGltfUv1.checked = !!s.gltfAtlasTexcoord1;
      this.#uvGltfUv1.disabled = s.combinedLayout !== 'per-section';
    }
    const note = this.#uvAtlasNote;
    if (!note) return;
    note.textContent = '';
    for (const line of atlasNoteLines(s)) {
      const div = this.#doc.createElement('div');
      if (line.warn) div.className = 'uv-note--warn';
      div.textContent = line.text;
      note.appendChild(div);
    }
  }

  /**
   * The mesh-mode labels, looked up at call time like legacy `document.querySelectorAll('.mesh-mode-option')`.
   * Side effects: none.
   * @returns {NodeListOf<HTMLElement>}
   */
  #meshModeOptions() {
    return this.#doc.querySelectorAll('.mesh-mode-option');
  }

  /**
   * A numeric style input `change`: parse through PanelIdStyle.RULES (via the controller), write the stored value
   * back, rebuild iff panel IDs.
   * Ports: index.html@cd3fd3f lines 4200-4204, 4205-4209, 4219-4223.
   * Side effects: adds one change listener.
   * @param {HTMLInputElement} input
   * @param {'borderThickness'|'fontSize'|'sectionLabelFontSize'} key
   */
  #bindNumericStyleInput(input, key) {
    input.addEventListener('change', () => {
      const value = this.#wallController.setPanelIdStyle(key, input.value);
      input.value = value;
      this.#wallController.rebuildIfPanelIds();
    });
  }

  /**
   * A colour style input `input` (every event, never debounced): store the value, rebuild iff panel IDs.
   * Ports: index.html@cd3fd3f lines 4210-4213, 4224-4227.
   * Side effects: adds one input listener.
   * @param {HTMLInputElement} input
   * @param {'fontColor'|'sectionLabelColor'} key
   */
  #bindColorStyleInput(input, key) {
    input.addEventListener('input', () => {
      this.#wallController.setPanelIdStyle(key, input.value);
      this.#wallController.rebuildIfPanelIds();
    });
  }

  /**
   * WALL_MESH_MODE_CHANGED mirror (idempotent after a label click).
   * Ports: index.html@cd3fd3f lines 4993-4995.
   * Side effects: toggles 'active' on every .mesh-mode-option.
   * @param {{mode: *}} payload
   */
  #mirrorMeshMode({ mode }) {
    this.#meshModeOptions().forEach(o => {
      o.classList.toggle('active', o.dataset.mode === mode);
    });
  }

  /**
   * DISPLAY_CONTENT_CHANGED mirror: the toggled control's option block, and when the other content mode was
   * forced off, that toggle's class and option block.
   * Ports: index.html@cd3fd3f lines 4170-4176 (LED sim) and 4190-4196 (panel IDs).
   * Side effects: writes the option blocks' style.display, the toggled control's and the forced-off toggle's 'active' class.
   * @param {{toggled: 'ledSim'|'panelIds', on: boolean, forcedOff: boolean}} payload
   */
  #mirrorDisplayContent({ toggled, on, forcedOff }) {
    if (toggled === 'ledSim') {
      this.#toggleLedSim.classList.toggle('active', on);   // idempotent after the toggle's own click
      setDisplay(this.#ledSimOptions, on);
      // Disable panel IDs if LED sim is enabled
      if (forcedOff) {
        this.#togglePanelIds.classList.remove('active');
        setDisplay(this.#panelIdOptions, false);
      }
    } else if (toggled === 'panelIds') {
      this.#togglePanelIds.classList.toggle('active', on);   // idempotent after a click; 04's [Show Panel IDs] chip
      setDisplay(this.#panelIdOptions, on);
      // Disable LED sim if panel IDs is enabled
      if (forcedOff) {
        this.#toggleLedSim.classList.remove('active');
        setDisplay(this.#ledSimOptions, false);
      }
    }
  }
}
