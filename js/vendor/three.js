/**
 * @module vendor/three
 * Shim for three.js r128, which index.html loads as a classic <script> from cdnjs in <head>.
 * The only way any module reaches THREE: `import THREE from '../vendor/three.js';`.
 * Switching to an ES-module build later is a change to this file plus one <script type="importmap">.
 * Legacy source: index.html@cd3fd3f <head> (classic three.js r128 script tag).
 * Layer: vendor (imports nothing; reads window.THREE).
 */

/** The global three.js r128 namespace object. */
const THREE = window.THREE;   // three.js r128, loaded by a classic <script> in <head>
export default THREE;
export { THREE };
