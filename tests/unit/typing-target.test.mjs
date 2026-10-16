// Unit tests for the one typing guard, js/core/typingTarget.js (08 P2-9b, B-L11; 07 section 3.8, C18, C52; 01 3.4):
// 1. isTypingTarget follows the 07 3.8 truth table on plain objects (core is DOM-free): text-like INPUT types,
//    SELECT, TEXTAREA, contenteditable and anything inside an open [role=dialog] are typing; null, BODY, the
//    document, buttons and the excluded INPUT types (checkbox, radio, button, submit, reset, color, file, range) are
//    not, unless they sit inside an open dialog;
// 2. interaction/InputState.js re-exports it, as isTypingTarget and as isShortcutIgnoredTarget (until 07 I1), and
//    defines no table of its own (01 CR-9). InputState imports js/vendor/three.js, which reads window.THREE when it
//    is evaluated, so an empty fake is installed first.
// Run: node --test tests/unit/typing-target.test.mjs   (zero dependencies)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isTypingTarget } from '../../js/core/typingTarget.js';

globalThis.window = { THREE: {} };
const InputState = await import('../../js/interaction/InputState.js');

/**
 * A plain element stand-in: `tagName`, optional `type` and `isContentEditable`, and `closest(selector)` over an
 * explicit ancestor chain (the element itself first), matching the two selector parts the guard uses.
 */
function el(tagName, { type, editable = false, role = null, hidden = false, open, parent = null } = {}) {
  const node = { tagName, isContentEditable: editable, hidden, parent, role };
  if (type !== undefined) node.type = type;
  if (open !== undefined) node.open = open;
  node.closest = (selector) => {
    assert.equal(selector, '[role="dialog"], dialog');
    for (let n = node; n; n = n.parent) if (n.role === 'dialog' || n.tagName === 'DIALOG') return n;
    return null;
  };
  return node;
}

const EXCLUDED = ['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'range'];
const TEXT_LIKE = ['text', 'number', 'search', 'email', 'password', 'tel', 'url', 'date', 'time', 'datetime-local', 'month',
  'week', 'hidden'];

describe('isTypingTarget (07 3.8 truth table)', () => {
  test('null, undefined and non-objects are not typing targets', () => {
    for (const t of [null, undefined, 0, '', 'INPUT', true]) assert.equal(isTypingTarget(t), false, String(t));
  });

  test('TEXTAREA and SELECT are typing targets', () => {
    assert.equal(isTypingTarget(el('TEXTAREA')), true);
    assert.equal(isTypingTarget(el('SELECT')), true);
  });

  test('INPUT of a text-like type is a typing target, and an INPUT without a type counts as text', () => {
    for (const type of TEXT_LIKE) assert.equal(isTypingTarget(el('INPUT', { type })), true, type);
    assert.equal(isTypingTarget(el('INPUT')), true, 'no type property (defaults to text)');
    assert.equal(isTypingTarget(el('INPUT', { type: 'TEXT' })), true, 'type compared case-insensitively');
  });

  test('INPUT of the excluded types is NOT a typing target (legacy ignored every INPUT, B-L11)', () => {
    for (const type of EXCLUDED) assert.equal(isTypingTarget(el('INPUT', { type })), false, type);
    assert.equal(isTypingTarget(el('INPUT', { type: 'Checkbox' })), false, 'type compared case-insensitively');
  });

  test('contenteditable elements are typing targets; BODY, buttons and plain elements are not', () => {
    assert.equal(isTypingTarget(el('DIV', { editable: true })), true);
    assert.equal(isTypingTarget(el('BODY')), false);
    assert.equal(isTypingTarget(el('BUTTON')), false);
    assert.equal(isTypingTarget(el('DIV')), false);
    assert.equal(isTypingTarget(el('CANVAS')), false);
  });

  test('a lower-case tagName (an XHTML-style document) gives the same result', () => {
    assert.equal(isTypingTarget(el('select')), true);
    assert.equal(isTypingTarget(el('input', { type: 'range' })), false);
  });

  test('anything inside an open [role=dialog] is a typing target, modal or not, excluded input types included', () => {
    const dialog = el('DIV', { role: 'dialog' });
    assert.equal(isTypingTarget(dialog), true, 'the dialog element itself');
    for (const type of EXCLUDED) assert.equal(isTypingTarget(el('INPUT', { type, parent: dialog })), true, type);
    assert.equal(isTypingTarget(el('BUTTON', { parent: dialog })), true);
    const deep = el('SPAN', { parent: el('LABEL', { parent: dialog }) });
    assert.equal(isTypingTarget(deep), true, 'a nested descendant');
  });

  test('a hidden [role=dialog] and a closed <dialog> do not count; an open <dialog> does', () => {
    const hiddenDialog = el('DIV', { role: 'dialog', hidden: true });
    assert.equal(isTypingTarget(el('BUTTON', { parent: hiddenDialog })), false);
    assert.equal(isTypingTarget(el('INPUT', { type: 'radio', parent: el('DIALOG', { open: false }) })), false);
    assert.equal(isTypingTarget(el('INPUT', { type: 'radio', parent: el('DIALOG', { open: true }) })), true);
  });

  test('objects without closest (the document, the window) are not typing targets', () => {
    assert.equal(isTypingTarget({ nodeName: '#document' }), false);
    assert.equal(isTypingTarget({ tagName: undefined, isContentEditable: false }), false);
  });
});

describe('interaction/InputState re-exports the guard (01 CR-9, 07 C18)', () => {
  test('isTypingTarget and isShortcutIgnoredTarget are the core function itself', () => {
    assert.equal(InputState.isTypingTarget, isTypingTarget);
    assert.equal(InputState.isShortcutIgnoredTarget, isTypingTarget);
  });

  test('the movement guard (KeyboardState) keeps the legacy table: INPUT of every type, SELECT, TEXTAREA', () => {
    const { isKeyStateIgnoredTarget } = InputState;
    for (const type of [...EXCLUDED, ...TEXT_LIKE]) assert.equal(isKeyStateIgnoredTarget(el('INPUT', { type })), true, type);
    assert.equal(isKeyStateIgnoredTarget(el('SELECT')), true);
    assert.equal(isKeyStateIgnoredTarget(el('TEXTAREA')), true);
    assert.equal(isKeyStateIgnoredTarget(el('BODY')), false);
  });
});
