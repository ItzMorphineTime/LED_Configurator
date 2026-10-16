/**
 * @module domain/Project
 * The project aggregate: the wall, the mesh mode, the display settings, the panel-ID styling, the section logos,
 * the film camera and the two props. Also the display-content enum that replaces the legacy `ledSimEnabled` /
 * `panelIdsEnabled` pair, and the panel-ID style rules.
 * Legacy source: index.html@cd3fd3f 1279-1296, 1387-1390 (state), 4165-4227 (display toggles and panel-ID
 * style inputs).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { orDefault } from '../legacy/LegacyCompat.js';
import { Wall } from './Wall.js';
import { WallSection } from './WallSection.js';
import { LogoLibrary } from './LogoLibrary.js';
import { CineCamera } from './CineCamera.js';
import { PersonProp, CarProp } from './Prop.js';

/** What the wall shows (Feature 5 adds 'hdri'). */
export const ContentMode = Object.freeze({ COLOR: 'color', LED_SIM: 'ledSim', PANEL_IDS: 'panelIds' });

/** Viewport display flags (legacy globals 1279-1294). */
export class DisplaySettings {
  /** legacy wireframeEnabled */
  wireframe = false;
  /** legacy showFrame */
  showFrame = false;
  /** replaces ledSimEnabled + panelIdsEnabled (they are never both true) */
  content = ContentMode.COLOR;
  /** legacy ledLayout: single-dot, rgb-triangle, rgb-stripe, rgb-horizontal, square */
  ledLayout = 'single-dot';
  /** legacy showGrid */
  showGrid = true;
  /** legacy safeDistanceEnabled */
  showSafeDistance = false;

  /**
   * Side effects: none.
   * @returns {boolean} legacy ledSimEnabled: content === 'ledSim'
   */
  get ledSimEnabled() {
    return this.content === ContentMode.LED_SIM;
  }

  /**
   * Side effects: none.
   * @returns {boolean} legacy panelIdsEnabled: content === 'panelIds'
   */
  get panelIdsEnabled() {
    return this.content === ContentMode.PANEL_IDS;
  }

  /**
   * LED simulation toggle. On: panel IDs are forced off. Off: back to colour (if LED sim was on).
   * Ports: index.html@cd3fd3f lines 4169, 4172-4176.
   * Side effects: writes content.
   * @param {boolean} on  the toggle's new state
   * @returns {boolean} true if panel IDs were forced off
   */
  setLedSim(on) {
    if (on) {
      const forced = this.content === ContentMode.PANEL_IDS;
      this.content = ContentMode.LED_SIM;
      return forced;
    }
    if (this.content === ContentMode.LED_SIM) this.content = ContentMode.COLOR;
    return false;
  }

  /**
   * Panel-ID toggle, the mirror image of setLedSim.
   * Ports: index.html@cd3fd3f lines 4189, 4192-4196.
   * Side effects: writes content.
   * @param {boolean} on  the toggle's new state
   * @returns {boolean} true if LED sim was forced off
   */
  setPanelIds(on) {
    if (on) {
      const forced = this.content === ContentMode.LED_SIM;
      this.content = ContentMode.PANEL_IDS;
      return forced;
    }
    if (this.content === ContentMode.PANEL_IDS) this.content = ContentMode.COLOR;
    return false;
  }
}

/** Panel-ID texture styling (legacy globals 1295-1296, 1387-1390). */
export class PanelIdStyle {
  /** legacy panelBorderThickness */
  borderThickness = 8;
  /** legacy panelFontSize (0 = auto) */
  fontSize = 0;
  /** legacy panelIdFontColor */
  fontColor = '#ffffff';
  /** legacy sectionLabelEnabled */
  sectionLabelEnabled = true;
  /** legacy sectionLabelFontSize (0 = auto) */
  sectionLabelFontSize = 0;
  /** legacy sectionLabelColor */
  sectionLabelColor = '#888888';

  /**
   * Numeric style input rules (parseInt WITHOUT radix, as legacy; B-L9 via orDefault).
   * Ports: index.html@cd3fd3f lines 4201, 4206, 4220.
   * @type {Readonly<Record<string, (raw: string) => number>>}
   */
  static RULES = Object.freeze({
    borderThickness: (raw) => Math.max(1, Math.min(32, orDefault(parseInt(raw), 8))),
    fontSize: (raw) => Math.max(0, Math.min(200, orDefault(parseInt(raw), 0))),
    sectionLabelFontSize: (raw) => Math.max(0, Math.min(400, orDefault(parseInt(raw), 0))),
  });

  /**
   * Numeric keys go through RULES; fontColor, sectionLabelColor and sectionLabelEnabled are stored as given.
   * Ports: index.html@cd3fd3f lines 4201, 4206, 4211, 4216, 4220, 4225.
   * Side effects: writes this[key].
   * @param {'borderThickness'|'fontSize'|'fontColor'|'sectionLabelEnabled'|'sectionLabelFontSize'|'sectionLabelColor'} key
   * @param {*} rawOrValue  the input's value (or the toggle state for sectionLabelEnabled)
   * @returns {*} the stored value
   */
  set(key, rawOrValue) {
    // Own-key lookup with hasOwnProperty.call, not Object.hasOwn (minimum browsers: ARCHITECTURE.md 1.2).
    this[key] = Object.prototype.hasOwnProperty.call(PanelIdStyle.RULES, key) ? PanelIdStyle.RULES[key](rawOrValue) : rawOrValue;
    return this[key];
  }
}

/** The whole configurable state of one LED wall project. */
export class Project {
  /** @type {Wall} */
  wall;
  /** @type {*} 'combined' | 'section' | 'panel' | any imported string (B-L8: unknown renders as panels; tagged at LEDWallView.rebuild) */
  meshMode;
  /** @type {DisplaySettings} */
  display;
  /** @type {PanelIdStyle} */
  panelIdStyle;
  /** @type {LogoLibrary} */
  logos;
  /** @type {CineCamera} */
  camera;
  /** @type {PersonProp} */
  person;
  /** @type {CarProp} */
  car;

  /**
   * Side effects: none.
   * @param {{wall: Wall, meshMode?: string, display: DisplaySettings, panelIdStyle: PanelIdStyle, logos: LogoLibrary,
   *          camera: CineCamera, person: PersonProp, car: CarProp}} parts
   */
  constructor({ wall, meshMode = 'combined', display, panelIdStyle, logos, camera, person, car }) {
    this.wall = wall;
    this.meshMode = meshMode;
    this.display = display;
    this.panelIdStyle = panelIdStyle;
    this.logos = logos;
    this.camera = camera;
    this.person = person;
    this.car = car;
  }

  /**
   * The legacy start-up state; the first section's colour is injected (06 T7, 4.1).
   * Ports: index.html@cd3fd3f lines 1279-1409.
   * Side effects: none.
   * @param {{defaultSectionColor?: string}} [options]  the first section's colour (Theme.palette.defaultSectionColor);
   *   undefined: WallSection.createDefault's default
   * @returns {Project}
   */
  static createDefault({ defaultSectionColor } = {}) {
    return new Project({
      wall: new Wall({ sections: [WallSection.createDefault({ color: defaultSectionColor })] }),
      display: new DisplaySettings(),
      panelIdStyle: new PanelIdStyle(),
      logos: new LogoLibrary(),
      camera: new CineCamera(),
      person: new PersonProp(),
      car: new CarProp(),
    });
  }
}
