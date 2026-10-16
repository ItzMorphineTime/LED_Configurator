/** @module ui/dom  Fixture (good): ui/dom.js may use document and window. */
export const byId = (doc, id) => doc.getElementById(id);

export function flipToggle(el) {
    el.classList.toggle('active');
    return el.classList.contains('active');
}

export const defaultDoc = () => document;
export const defaultWin = () => window;
