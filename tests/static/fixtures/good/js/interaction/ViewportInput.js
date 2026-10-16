/**
 * @module interaction/ViewportInput
 * Fixture (good): interaction -> interaction, vendor/three.js, core, legacy and render/ResourceTracker.js.
 */
import THREE from '../vendor/three.js';
import { InteractionState } from './InputState.js';
import { disposeObject3D } from '../render/ResourceTracker.js';
import { Events } from '../core/EventBus.js';
import { Strategies } from '../legacy/LegacyCompat.js';

export class ViewportInput {
    #bus;
    #win;

    constructor({ bus, win }) {
        this.#bus = bus;
        this.#win = win;
        this.state = new InteractionState();
    }

    attachPointer(canvas) {
        canvas.addEventListener('mousedown', () => this.#bus.emit(Events.SELECTION_CHANGED, { id: null, label: null }));
        this.#win.addEventListener('mouseup', () => {});
        if (Strategies.dispose.gizmo) disposeObject3D(new THREE.Group());
    }
}
