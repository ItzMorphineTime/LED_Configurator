/**
 * @module render/SceneManager
 * Fixture (good): render -> render, vendor/three.js, core, legacy, domain, geometry; the
 * allow-listed `this.#display.showGrid` write; rule 11: renderOrder through the registry, small literals, and
 * literals of 900 and above only inside comments and strings.
 */
import THREE from '../vendor/three.js';
import { disposeObject3D } from './ResourceTracker.js';
import { Events } from '../core/EventBus.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { Wall } from '../domain/Wall.js';
import { framingBounds } from '../geometry/WallLayout.js';
import { RENDER_ORDER } from '../core/renderOrder.js';

export class SceneManager {
    #display;

    constructor({ display }) {
        this.#display = display;
        this.helpers = [];
    }

    order(obj, onTop) {
        obj.renderOrder = RENDER_ORDER.GIZMO;   // not renderOrder = 999
        obj.renderOrder = onTop ? RENDER_ORDER.NORMAL_LINES_ON_TOP : 1;
        const backdrop = { renderOrder: -1e6, note: "renderOrder: 999" };
        return [backdrop, obj.renderOrder === 999];
    }

    toggleGrid() {
        this.#display.showGrid = !this.#display.showGrid;
        return this.#display.showGrid;
    }

    /** LEGACY(B-M11): helpers stay on layer 0, so the preview renders them. */
    addHelper(obj) {
        this.helpers.push(obj);
        return disposeObject3D(new THREE.Group()) && Events.WALL_REBUILT && Strategies.dispose && new Wall() && framingBounds();
    }
}
