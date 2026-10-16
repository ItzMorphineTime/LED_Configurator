/**
 * @module vendor/jszip
 * Shim for JSZip 3.10.1, which index.html loads as a classic <script> from cdnjs in <head>.
 * The only way any module reaches JSZip: `import JSZip from '../vendor/jszip.js';`.
 * Legacy source: index.html@cd3fd3f <head> (classic JSZip 3.10.1 script tag).
 * Layer: vendor (imports nothing; reads window.JSZip).
 */

/** The global JSZip 3.10.1 constructor. */
const JSZip = window.JSZip;   // JSZip 3.10.1, loaded by a classic <script> in <head>
export default JSZip;
export { JSZip };
