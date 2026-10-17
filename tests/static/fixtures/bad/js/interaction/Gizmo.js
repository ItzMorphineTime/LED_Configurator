/**
 * @module interaction/Gizmo
 * Fixture (bad): rule 1 (interaction/ may import only render/ResourceTracker.js from render/),
 * rule 3 (window and document instead of the injected win/doc), rule 11 (renderOrder literals >= 900),
 * rule 20 (the interaction state written outside TransformGizmo).
 */
import { LEDWallView } from '../render/LEDWallView.js';

export class Gizmo {
    attach() {
        window.addEventListener('mouseup', () => {});
        const group = {};
        group.renderOrder = 999;
        const lines = { renderOrder: 9.95e2 };
        lines.renderOrder = group ? 0x3e3 : 0;
        return [LEDWallView, document?.body, lines];
    }
    drag(interaction) {
        interaction.gestureCancelled = true;
        interaction.isDraggingGizmo = false;
        interaction.snap.pivotM = 1;
        Object.assign(interaction.snap, { pivotM: 2 });
    }
}
