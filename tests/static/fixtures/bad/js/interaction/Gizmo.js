/**
 * @module interaction/Gizmo
 * Fixture (bad): rule 1 (interaction/ may import only render/ResourceTracker.js from render/),
 * rule 3 (window and document instead of the injected win/doc).
 */
import { LEDWallView } from '../render/LEDWallView.js';

export class Gizmo {
    attach() {
        window.addEventListener('mouseup', () => {});
        return [LEDWallView, document?.body];
    }
}
