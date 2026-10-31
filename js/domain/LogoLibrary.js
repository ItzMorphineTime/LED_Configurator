/**
 * @module domain/LogoLibrary
 * Section logos keyed by section id (legacy `sectionLogos`). Logos are deliberately not stored on WallSection:
 * legacy keys them by id across deletes (and, until 08 P2-3d, across imports, B-L21), so they outlive section objects.
 * The store is a plain object indexed with the given key unchanged, so keys follow JS property-key coercion
 * exactly like legacy `sectionLogos[id]` (UI handlers pass parseInt(dataset.sectionId), the renderer and delete
 * pass section.id). Since 08 P2-13a (B-L35) an entry also keeps what render/textures/LogoLoader stored: the sanitised,
 * possibly converted data URI with its MIME, decoded size and file name, and (from 08 P2-13e) its SHA-256 and asset id,
 * so the project file v2 writer can save the logo and the upload can refuse a 65th distinct image (M-LOGO-3).
 * Legacy source: index.html@cd3fd3f 1392-1393 (state), 2116 / 2196-2197 (reads), 2256-2305 (handlers), 4131 (delete).
 * Layer: domain (may import legacy; THREE-free and DOM-free).
 */

import { finiteOr } from './rules.js';

/**
 * @typedef {object} LogoEntry
 * @property {*} [image]          the loaded HTMLImageElement (absent until an upload finished)
 * @property {string} position    'center' | 'top-left' | ... (the select's value)
 * @property {number} scale       fraction of the section (0.05 .. 1)
 * @property {string} [dataUri]   the stored image: `data:<LOGO_MIMES entry>;base64,...` (08 P2-13a)
 * @property {string} [mime]      one of domain/LogoRules LOGO_MIMES
 * @property {number} [bytes]     the decoded size of dataUri (at most MAX_LOGO_BYTES)
 * @property {string} [name]      the uploaded file name (sanitised, at most 128 code units)
 * @property {string} [sha256]    64 hex characters of the stored bytes (08 P2-13e)
 * @property {string} [assetId]   'a_' + sha256.slice(0, 16), the project file's asset id (07 6.13)
 */

/**
 * The stored-image fields of an entry, in this order (LogoLoader's result; 08 4.5).
 * @type {ReadonlyArray<string>}
 */
export const LOGO_META_FIELDS = Object.freeze(['dataUri', 'mime', 'bytes', 'name', 'sha256', 'assetId']);

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
    // Plain-object key coercion (R12). The UI handlers key by parseInt(dataset.sectionId) and the renderers by the raw
    // id; since 08 P2-3b (B-L8 fixed) every id is a validated integer, for which both give the same key.
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
   * Stores a loaded image and (08 P2-13a) its stored-image fields; a meta field that is absent is left as it was.
   * Ports: index.html@cd3fd3f lines 2266-2269.
   * Side effects: creates the entry if needed; writes its image and the given LOGO_META_FIELDS.
   * @param {*} sectionId
   * @param {*} image  the loaded HTMLImageElement
   * @param {{dataUri?: string, mime?: string, bytes?: number, name?: string, sha256?: string, assetId?: string}} [meta]
   */
  setImage(sectionId, image, meta = {}) {
    const entry = this.ensure(sectionId);
    entry.image = image;
    for (const key of LOGO_META_FIELDS) if (meta[key] !== undefined) entry[key] = meta[key];
  }

  /**
   * The distinct stored images in use (08 P2-13a, M-LOGO-3): the dataUri of every entry with an image, except the
   * entry of `exceptSectionId` (the section an upload replaces), in key order.
   * Side effects: none.
   * @param {*} [exceptSectionId]  compared as a property key; undefined: none excluded
   * @returns {Set<string>}
   */
  distinctDataUris(exceptSectionId) {
    const except = exceptSectionId === undefined ? null : String(exceptSectionId);
    const out = new Set();
    for (const key of Object.keys(this.#entries)) {
      const e = this.#entries[key];
      if (key !== except && e && e.image && typeof e.dataUri === 'string') out.add(e.dataUri);
    }
    return out;
  }

  /**
   * Side effects: none.
   * @param {*} [exceptSectionId]
   * @returns {number} distinctDataUris(exceptSectionId).size
   */
  distinctImageCount(exceptSectionId) {
    return this.distinctDataUris(exceptSectionId).size;
  }

  /**
   * Removes every entry (08 P2-3d, B-L21 fixed: an import resets the logos; legacy kept them).
   * Side effects: replaces the store with an empty plain object.
   */
  clear() {
    this.#entries = {};
  }

  /**
   * Installs an entry as a fresh object (08 P2-3d: the logos an import restores after clear(); a v1 import has none).
   * Side effects: writes the entry for `sectionId`.
   * @param {*} sectionId  used as a property key unchanged
   * @param {LogoEntry} entry
   */
  set(sectionId, entry) {
    this.#entries[sectionId] = { ...entry };
  }

  /**
   * Replaces every entry (07 5.5.2 step 3, D5): the logos of an applied project file (none for a wall-scope import,
   * B-L21). Each entry is stored as a fresh object.
   * Side effects: replaces the store.
   * @param {Iterable<[*, LogoEntry]>} entriesBySectionId  [sectionId, entry] pairs (a Map works)
   */
  replaceAll(entriesBySectionId) {
    this.#entries = {};
    for (const [sectionId, entry] of entriesBySectionId) this.#entries[sectionId] = { ...entry };
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
   * The scale input rule (parseInt without radix, as legacy; since 08 P2-8b (B-L9 fixed) finiteOr, so 0 gives the minimum).
   * Ports: index.html@cd3fd3f line 2298.
   * Side effects: none.
   * @param {string} raw  the input's value
   * @returns {number} percent in [5, 100] (30 for '' and NaN; 5 for 0)
   */
  static parseScalePercent(raw) {
    return Math.max(5, Math.min(100, finiteOr(parseInt(raw), 30)));
  }
}
