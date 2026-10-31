// The collapsible sidebar cards (ui/Collapsible.js; Mesh Options, Wall Pivot, Panel IDs and Camera Frustum Preview): the
// markup starts collapsed, a click on the native toggle button flips the class, aria-expanded and the body's hidden flag
// together.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bindCollapsibles, setCollapsibleExpanded } from '../../js/ui/Collapsible.js';

/** A fake card: .collapsible with a toggle button and a body. */
function card(collapsed = true) {
  const classes = new Set(['collapsible', ...(collapsed ? ['collapsed'] : [])]);
  const toggle = {
    attrs: { 'aria-expanded': String(!collapsed) }, listeners: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    click() { for (const l of this.listeners) if (l.type === 'click') l.fn(); },
  };
  const body = { hidden: collapsed };
  const el = {
    classList: { contains: (c) => classes.has(c), toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); } },
    querySelector: (sel) => (sel === '.collapsible-toggle' ? toggle : sel === '.collapsible-body' ? body : null),
  };
  return { el, toggle, body };
}

describe('ui/Collapsible', () => {
  test('a click expands, a second collapses; class, aria-expanded and hidden move together', () => {
    const c = card();
    assert.equal(bindCollapsibles({ querySelectorAll: () => [c.el] }), 1);
    c.toggle.click();
    assert.equal(c.el.classList.contains('collapsed'), false);
    assert.equal(c.toggle.attrs['aria-expanded'], 'true');
    assert.equal(c.body.hidden, false);
    c.toggle.click();
    assert.equal(c.el.classList.contains('collapsed'), true);
    assert.equal(c.toggle.attrs['aria-expanded'], 'false');
    assert.equal(c.body.hidden, true);
    setCollapsibleExpanded(c.el, true);
    assert.equal(c.body.hidden, false);
  });

  test('index.html: Mesh Options, Wall Pivot, Panel IDs and Camera Frustum Preview are collapsed cards with a button header naming its body', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    for (const [id, title, body] of [['mesh-options-section', 'Mesh Options', 'mesh-options-body'], ['pivot-section', 'Wall Pivot', 'pivot-section-body'],
      ['panel-ids-section', 'Panel IDs', 'panel-ids-body'], ['camera-frustum-section', 'Camera Frustum Preview', 'camera-frustum-body']]) {
      const re = new RegExp(`<div class="global-section[^"]* collapsible collapsed" id="${id}">\\s*`
        + `<button type="button" class="global-section-title collapsible-toggle" aria-expanded="false" aria-controls="${body}">\\s*`
        + `<span class="collapsible-title">${title}</span>[\\s\\S]*?</button>\\s*<div class="collapsible-body" id="${body}" hidden>`);
      assert.match(html, re, title);
    }
  });
});
