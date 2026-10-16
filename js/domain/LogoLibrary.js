/**
 * @module domain/LogoLibrary
 * Section logos keyed by section id (legacy `sectionLogos`). Logos are deliberately not stored on WallSection:
 * legacy keys them by id across deletes and imports (B-L21), so they outlive section objects.
 * The store is a plain object indexed with the given key unchanged, so keys follow JS property-key coercion
 * exactly like legacy `sectionLogos[id]` (UI handlers pass parseInt(dataset.sectionId), the renderer and delete
 * pass section.id).
 * Legacy source: index.html@cd3fd3f 1392-1393 (state), 2116 / 2196-2197 (reads), 2256-2305 (handlers), 4131 (delete).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { orDefault } from '../legacy/LegacyCompat.js';

/**
 * @typedef {object} LogoEntry
 * @property {*} [image]          the loaded HTMLImageElement (absent until an upload finished)
 * @property {string} position    'center' | 'top-left' | ... (the select's value)
 * @property {number} scale       fraction of the section (0.05 .. 1)
 */

/**
 * Section logos keyed like legacy `sectionLogos[id]` (plain-object property keys).
 */
export class LogoLibrary {
  /** @type {Record<PropertyKey, LogoEntry>} a plain object, exactly like legacy `sectionLogos = {}` */
  #entries = {};

  /**
   * Ports: index.html@cd3fd3f lines 2116, 2197.
   * Side effects: none.
   * @param {*} sectionId  used as a property key unchanged
   * @returns {LogoEntry|undefined}
   */
  get(sectionId) {
    // LEGACY(B-L8): plain-object key coercion. The UI handlers key by parseInt(dataset.sectionId), so an id matches
    // only when String(parseInt(String(id))) === String(id): numeric-string ids such as '7' and NaN ids match,
    // ids such as 'a', '07' or 1.5 never do.
    return this.#entries[sectionId];
  }

  /**
   * Ports: index.html@cd3fd3f line 2196 (the expression is kept, so the result is the entry's image or a
   * falsy value, not a boolean).
   * Side effects: none.
   * @param {*} sectionId
   * @returns {*} truthy when an image is loaded for that key
   */
  hasImage(sectionId) {
    return this.#entries[sectionId] && this.#entries[sectionId].image;
  }

  /**
   * Returns the entry for `sectionId`, creating a fresh `{ position: 'center', scale: 0.3 }` if there is none.
   * Ports: index.html@cd3fd3f lines 2266-2268.
   * Side effects: may create an entry.
   * @param {*} sectionId
   * @returns {LogoEntry}
   */
  ensure(sectionId) {
    if (!this.#entries[sectionId]) {
      this.#entries[sectionId] = { position: 'center', scale: 0.3 };
    }
    return this.#entries[sectionId];
  }

  /**
   * Ports: index.html@cd3fd3f lines 2266-2269.
   * Side effects: creates the entry if needed; writes its image.
   * @param {*} sectionId
   * @param {*} image  the loaded HTMLImageElement
   */
  setImage(sectionId, image) {
    this.ensure(sectionId).image = image;
  }

  /**
   * Ports: index.html@cd3fd3f lines 2282, 4131.
   * Side effects: deletes the entry (no-op when absent).
   * @param {*} sectionId
   */
  remove(sectionId) {
    delete this.#entries[sectionId];
  }

  /**
   * Ports: index.html@cd3fd3f lines 2290-2291.
   * Side effects: writes the entry's position when it exists.
   * @param {*} sectionId
   * @param {string} position
   * @returns {boolean} whether an entry existed (legacy rebuilt only then)
   */
  setPosition(sectionId, position) {
    if (this.#entries[sectionId]) {
      this.#entries[sectionId].position = position;
      return true;
    }
    return false;
  }

  /**
   * Ports: index.html@cd3fd3f lines 2301-2302.
   * Side effects: writes the entry's scale when it exists.
   * @param {*} sectionId
   * @param {number} fraction  percent / 100
   * @returns {boolean} whether an entry existed (legacy rebuilt only then)
   */
  setScale(sectionId, fraction) {
    if (this.#entries[sectionId]) {
      this.#entries[sectionId].scale = fraction;
      return true;
    }
    return false;
  }

  /**
   * The scale input rule (parseInt without radix, as legacy; B-L9 via orDefault).
   * Ports: index.html@cd3fd3f line 2298.
   * Side effects: none.
   * @param {string} raw  the input's value
   * @returns {number} percent in [5, 100] (30 for '', 0, NaN)
   */
  static parseScalePercent(raw) {
    return Math.max(5, Math.min(100, orDefault(parseInt(raw), 30)));
  }
}
