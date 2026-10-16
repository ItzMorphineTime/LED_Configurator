/**
 * @module geometry/WallLayout
 * Fixture (good): geometry -> domain, geometry -> legacy; reads Strategies.framingBounds (switch-and-throw).
 */
import { Wall } from '../domain/Wall.js';
import { Strategies } from '../legacy/LegacyCompat.js';

export function framingBounds(wall = new Wall()) {
    switch (Strategies.framingBounds) {
        case 'flat': return { width: wall.sections.length };
        default: throw new Error('unsupported');
    }
}
