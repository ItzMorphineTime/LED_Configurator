/**
 * @module app/WallController
 * Fixture (good): app -> core, legacy, domain, geometry; the allow-listed project.meshMode write.
 */
import { Events } from '../core/EventBus.js';
import { orDefault } from '../legacy/LegacyCompat.js';
import { Wall } from '../domain/Wall.js';
import { framingBounds } from '../geometry/WallLayout.js';

export class WallController {
    #project;
    #bus;

    constructor({ project, bus }) {
        this.#project = project;
        this.#bus = bus;
    }

    setMeshMode(mode) {
        this.#project.meshMode = orDefault(mode, 'combined');
        const section = this.#project.wall.sections[0];
        const label = section.name;                 // reads are fine
        if (section.panelCols === 1 || section.name == label || section.panelCols >= 2) this.rebuild();
    }

    rebuild() {
        this.#bus.emit(Events.WALL_STATS_CHANGED, { totalSections: new Wall().sections.length, bounds: framingBounds() });
        this.#bus.emit(Events.WALL_REBUILT, {});
    }
}
