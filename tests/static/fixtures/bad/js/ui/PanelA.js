/**
 * @module ui/PanelA
 * Fixture (bad): rule 4 (an id shared with PanelB), rule 10 (PanelIdStyle fields written through a
 * bare `style` and through `this.style`).
 */
import { byId } from './dom.js';
import { Events } from '../core/EventBus.js';

export class PanelA {
    constructor({ doc, bus, style }) {
        this.el = byId(doc, 'shared-id');
        this.style = style;
        style.fontSize = 3;
        this.style.borderThickness = 2;
        bus.on(Events.USED, () => {});
        bus.on(Events.NEVER_EMITTED, () => {});
    }
}
