/**
 * @module io/ObjExporter
 * Fixture (good): THREE-free; colour parsing is injected (no THREE import).
 */
import { WallSection } from '../domain/WallSection.js';
import { framingBounds } from '../geometry/WallLayout.js';

export class ObjExporter {
    #profile;

    constructor({ profile }) {
        this.#profile = profile;
    }

    stripNormalLine() {
        switch (this.#profile.stripNormals) {
            case 'constant-z': return 'vn 0 0 1\n';
            default: throw new Error(`unsupported ${WallSection.name} ${framingBounds().width}`);
        }
    }
}
