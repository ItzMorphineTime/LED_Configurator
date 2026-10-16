/**
 * @module app/App
 * Fixture (bad), rule 4: only one of the eight canvas, preview and stats ids, plus an id that belongs to a panel.
 */
import { byId } from '../ui/dom.js';

export class App {
    constructor({ doc }) {
        this.canvas = byId(doc, 'three-canvas');
        this.extra = byId(doc, 'extra-id');
    }

    start() {
        return this.canvas;
    }
}
