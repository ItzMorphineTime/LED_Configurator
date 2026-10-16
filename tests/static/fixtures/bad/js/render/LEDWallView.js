/**
 * @module render/LEDWallView
 * Fixture (bad): rule 1 (render/ may import only vendor/three.js), rule 4 (a lookup outside ui/),
 * rule 5 (module-level let and var).
 */
import JSZip from '../vendor/jszip.js';

let cache = new Map();
var counter = 0;

export class LEDWallView {
    constructor({ doc }) {
        this.canvas = doc.getElementById('three-canvas');
        this.zip = JSZip;
        counter += cache.size;
    }
}
