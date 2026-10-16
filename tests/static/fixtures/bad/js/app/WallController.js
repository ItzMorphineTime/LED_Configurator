/**
 * @module app/WallController
 * Fixture (bad): rule 1 (only main.js may import App.js), rule 7 (an unknown Events key),
 * rule 10 (domain fields written outside js/domain/ without an ALLOWLIST entry, DebugViewSettings included).
 */
import { App } from './App.js';
import { Events } from '../core/EventBus.js';

export class WallController {
    #display;
    #bus;

    constructor({ display, bus }) {
        this.#display = display;
        this.#bus = bus;
    }

    rename(section, wall, sections, cine, settings) {
        settings.normals.onTop = true;
        settings.shading = 'faceOrientation';
        section.name = 'x';
        ++wall.nextSectionId;
        sections[0].panelCols = 1;
        this.#display.showGrid = true;
        cine.posX += 1;
        this.#bus.emit(Events.USED, App);
        this.#bus.emit(Events.NEVER_SUBSCRIBED, {});
        this.#bus.emit(Events.WALL_REBUILT, {});
        return Events.TYPO;
    }
}
