/**
 * @module main
 * Entry point (loaded by index.html as `<script type="module" src="js/main.js">` at the end of <body>).
 * Installs the canvas polyfills (the legacy top-level `roundRect` polyfill ran before init()) and starts the app.
 * Legacy source: index.html@cd3fd3f 1411-1424 (polyfill), 5093-5095 (bootstrap).
 * Layer: main (may import everything).
 */
import { installCanvasPolyfills } from './render/textures/LEDPixelTextureFactory.js';
import { App } from './app/App.js';

installCanvasPolyfills();
new App({ doc: document, win: window }).start();
