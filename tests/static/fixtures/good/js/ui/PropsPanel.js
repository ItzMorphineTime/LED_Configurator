/** @module ui/PropsPanel  Fixture (good): template-built ids are not checked; input writes are DOM writes. */
import { byId } from './dom.js';

export class PropControls {
    constructor({ doc, prefix, prop }) {
        this.posX = byId(doc, `${prefix}-pos-x`);
        this.scale = byId(doc, `${prefix}-scale`);
        this.prop = prop;
    }

    bind() {
        this.posX.value = this.prop.posX.toFixed(2);
        this.scale.value = String(this.prop.scale);
    }
}
