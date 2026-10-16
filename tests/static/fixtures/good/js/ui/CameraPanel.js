/**
 * @module ui/CameraPanel
 * Fixture (good): ui -> ui/dom.js, core, legacy, domain; owns its ids (byId, '#id' selectors and
 * getElementById); CSS style writes such as `statusEl.style.color` are not domain writes.
 */
import { byId, flipToggle } from './dom.js';
import { Events } from '../core/EventBus.js';
import { orDefault } from '../legacy/LegacyCompat.js';
import { WallSection } from '../domain/WallSection.js';

export class CameraPanel {
    #els;

    constructor({ doc, bus, theme }) {
        this.#els = {
            options: byId(doc, 'camera-preview-options'),
            status: byId(doc, 'frustum-status-text'),
            hfov: doc.querySelector('#camera-hfov'),
            vfov: doc.getElementById('camera-vfov'),
            title: doc.querySelector('.section-title'),
        };
        bus.on(Events.WALL_STATS_CHANGED, () => this.#onCoverage(theme));
        bus.on(Events.SELECTION_CHANGED, ({ id }) => { this.#els.options.style.display = id ? 'block' : 'none'; });
    }

    #onCoverage(theme) {
        const statusEl = this.#els.status;
        statusEl.textContent = 'Within bounds';
        statusEl.style.color = theme.ui.status.within;
        this.#els.hfov.style.color = orDefault(theme.ui.status.within, WallSection.name);
        flipToggle(this.#els.vfov);
    }
}
