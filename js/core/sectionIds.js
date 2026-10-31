/**
 * @module core/sectionIds
 * The selection ids of wall sections (docs/improvements/02-section-editing-offsets.md 5.2, `sectionIdOf`; the owner's
 * request of 2026-10-31): a section is selected as `'section:' + String(section.id)`, so it never collides with the
 * legacy ids 'camera', 'person', 'car' or 'pivot'. Ids are compared as plain-object keys (String(id), ARCHITECTURE R12),
 * so a numeric id and its imported string form name the same section.
 * Legacy source: none (new feature).
 * Layer: core (imports no other directory of js/).
 */

/** The prefix of every section selection id. */
export const SECTION_ID_PREFIX = 'section:';

/**
 * Side effects: none.
 * @param {*} sectionId  a WallSection id
 * @returns {string} its selection id
 */
export function sectionSelectionId(sectionId) {
  return SECTION_ID_PREFIX + String(sectionId);
}

/**
 * Side effects: none.
 * @param {*} selectionId  any selection id (or null)
 * @returns {string|null} the section key (String(section.id)) of a section selection id, else null
 */
export function sectionKeyOf(selectionId) {
  return typeof selectionId === 'string' && selectionId.startsWith(SECTION_ID_PREFIX)
    ? selectionId.slice(SECTION_ID_PREFIX.length) : null;
}

/**
 * Side effects: none.
 * @param {{id: *}} section
 * @param {string|null} key  a section key (sectionKeyOf)
 * @returns {boolean} the section is the one the key names
 */
export function isSectionKey(section, key) {
  return key !== null && String(section.id) === key;
}
