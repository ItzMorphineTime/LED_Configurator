/**
 * @module ui/Collapsible
 * The collapsible sidebar cards ("Mesh Options" and "Wall Pivot", the owner's request of 2026-10-17): a
 * `.global-section.collapsible` card whose title is a native `<button class="collapsible-toggle">` (aria-expanded,
 * aria-controls naming its `.collapsible-body`; Enter and Space come with the button, and its :focus-visible ring with
 * 03-layout.css) followed by that body. The markup starts collapsed (`.collapsed`, aria-expanded="false", the body
 * `hidden`); a click flips the three together. View-only and session-only: no model state, no events.
 * Legacy source: none (new feature).
 * Layer: ui (may import core, legacy, domain static rule tables and ui/dom.js).
 */

/**
 * Shows or hides one collapsible card: the card's `.collapsed` class, the toggle's aria-expanded and the body's
 * `hidden` move together.
 * Side effects: DOM writes on the card, its toggle and its body.
 * @param {HTMLElement} card  a `.collapsible` card
 * @param {boolean} expanded
 */
export function setCollapsibleExpanded(card, expanded) {
  card.classList.toggle('collapsed', !expanded);
  const toggle = card.querySelector('.collapsible-toggle');
  const body = card.querySelector('.collapsible-body');
  if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
  if (body) body.hidden = !expanded;
}

/**
 * Binds every `.collapsible` card under `root`: its toggle's click flips the card (a native button also clicks on
 * Enter and Space).
 * Side effects: one click listener per card toggle.
 * @param {Document|HTMLElement} root
 * @returns {number} the number of cards bound
 */
export function bindCollapsibles(root) {
  let n = 0;
  for (const card of root.querySelectorAll('.collapsible')) {
    const toggle = card.querySelector('.collapsible-toggle');
    if (!toggle) continue;
    toggle.addEventListener('click', () => setCollapsibleExpanded(card, card.classList.contains('collapsed')));
    n++;
  }
  return n;
}
