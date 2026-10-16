/**
 * @module main
 * Fixture (good): the entry may use window/document and import App.js.
 */
import { App } from './app/App.js';

new App({ doc: document, win: window }).start();
