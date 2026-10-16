/**
 * @module ui/dom
 * Small DOM helpers shared by the ui panels: id lookup on an injected document, the legacy `.toggle` idiom,
 * block/none display switching and the dialogs facade over an injected window.
 * Legacy source: index.html@cd3fd3f 4165-4169 (toggle idiom), 4170 / 4190 / 4233 / 4325 / 4335 / 4366
 * (display switching), 2788 / 3479 / 5005 (alert).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

/**
 * @typedef {object} Dialogs
 * @property {(msg: string) => void} alert  shows a blocking message (window.alert, looked up at call time)
 */

/**
 * Looks up an element by id on the injected document.
 * Side effects: none.
 * @param {Document} doc
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export const byId = (doc, id) => doc.getElementById(id);

/**
 * The legacy toggle idiom: flip the element's `active` class and read the new state back from the DOM.
 * Ports: index.html@cd3fd3f lines 4165, 4167-4169 (and the other 7 `div.toggle` handlers).
 * Side effects: toggles el's `active` class.
 * @param {Element} el
 * @returns {boolean} whether `active` is now set
 */
export function flipToggle(el) {
  el.classList.toggle('active');
  return el.classList.contains('active');
}

/**
 * Shows or hides an element the legacy way.
 * Ports: index.html@cd3fd3f e.g. line 4170 (`style.display = enabled ? 'block' : 'none'`).
 * Side effects: writes el.style.display.
 * @param {HTMLElement} el
 * @param {boolean} visible
 */
export function setDisplay(el, visible) {
  el.style.display = visible ? 'block' : 'none';
}

/**
 * The dialogs facade injected into controllers. `alert` looks `win.alert` up at call time (never cached),
 * which is the legacy semantics of calling the global `alert`.
 * Side effects: none at creation; `alert` calls win.alert(msg).
 * @param {Window} win
 * @returns {Dialogs}
 */
export function createDialogs(win) {
  return {
    alert: (msg) => {
      win.alert(msg);
    },
  };
}
