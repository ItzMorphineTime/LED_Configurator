/**
 * @module domain/Wall
 * Fixture (bad): rule 1 (domain/ imports render/), rule 6 (tags without LEGACY_SITES entries),
 * rule 9 (THREE in a pure layer).
 */
import { LEDWallView } from '../render/LEDWallView.js';
import { Strategies } from '../legacy/LegacyCompat.js';

export class Wall {
    // LEGACY(B-L2, B-M7): neither id has a LEGACY_SITES entry for this file.
    bounds() {
        return new THREE.Box3(LEDWallView, Strategies.used);
    }
}
