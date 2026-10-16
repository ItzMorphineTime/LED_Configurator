/**
 * @module render/PreviewWindow
 * Fixture (good): a `windowEl` key and `.window` / `?.window` properties are not the window global.
 */
import { Strategies } from '../legacy/LegacyCompat.js';

export class PreviewWindow {
    #el;

    constructor({ elements, opener }) {
        this.#el = { windowEl: elements.windowEl, canvas: elements.canvas };
        this.opener = opener?.window ?? elements.window;
    }

    init() {
        const [w, h] = Strategies.previewRendererSize;
        this.#el.windowEl.style.display = 'block';
        this.#el.canvas.style.width = `${w}px`;
        return h;
    }
}
