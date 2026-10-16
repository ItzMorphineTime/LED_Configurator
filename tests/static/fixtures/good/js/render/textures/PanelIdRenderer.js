/** @module render/textures/PanelIdRenderer  Fixture (good): render/textures/ belongs to the render layer. */
import { disposeObject3D } from '../ResourceTracker.js';

export class PanelIdRenderer {
    constructor({ doc }) {
        this.doc = doc;
    }

    canvas() {
        const c = this.doc.createElement('canvas');
        disposeObject3D(c);
        return c;
    }
}
