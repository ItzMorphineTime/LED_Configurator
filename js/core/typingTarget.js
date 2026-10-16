/**
 * @module core/typingTarget
 * The one typing guard of the app: whether a keydown target is a place where the user types, so that a
 * viewport shortcut must leave the key to it. The single definition (07 C18); created by 08 P2-9b (B-L11),
 * its one named owner (07 C52). 01 T7 consumes it and 07 I1 extends it (isMovementBlockedTarget).
 * interaction/InputState.js re-exports it (isShortcutIgnoredTarget until 07 I1 deletes that name).
 * Legacy source: index.html@cd3fd3f 4411 (the INPUT/TEXTAREA shortcut guard it replaces).
 * Layer: core (imports no other directory of js/). DOM-free: it reads only properties of the target it is
 * given (tagName, type, isContentEditable, closest), so it is Node-tested with plain objects.
 */

/** INPUT types that take no text, so a focused one is not a typing target (07 3.8). */
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'range']);

/**
 * The open dialog that contains `t` (or is `t`), or null: the nearest `[role="dialog"]` or `<dialog>`
 * ancestor that is not `hidden` (a `<dialog>` element must also be `open`).
 * Side effects: none.
 * @param {{closest?: (selector: string) => any}} t
 * @returns {object|null}
 */
function openDialogOf(t) {
  if (typeof t.closest !== 'function') return null;
  const d = t.closest('[role="dialog"], dialog');
  if (!d || d.hidden === true) return null;
  if (String(d.tagName).toUpperCase() === 'DIALOG' && d.open !== true) return null;
  return d;
}

/**
 * The typing-guard truth table of 07 3.8 (01 3.4): a target counts as typing when it is
 *   - an INPUT, except the types checkbox, radio, button, submit, reset, color, file and range;
 *   - a SELECT or a TEXTAREA;
 *   - an element whose isContentEditable is true;
 *   - any element inside an open [role=dialog] (modal or not).
 * Everything else, including BODY, the document, the toolbar buttons and a null target, is not typing.
 * Escape never reaches the dialog row: a dialog's own Escape handling (01 3.2, 07 3.8 widget scopes) runs first.
 * Ports: index.html@cd3fd3f line 4411 (which ignored only INPUT of every type and TEXTAREA; B-L11).
 * Side effects: none.
 * @param {EventTarget|null|undefined} t  the keydown event target
 * @returns {boolean} true when a shortcut must ignore the key
 */
export function isTypingTarget(t) {
  if (!t || typeof t !== 'object') return false;
  const tag = typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
  if (tag === 'INPUT' && !NON_TEXT_INPUT_TYPES.has(String(t.type || 'text').toLowerCase())) return true;
  if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (t.isContentEditable === true) return true;
  return openDialogOf(t) !== null;
}
