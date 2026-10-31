/**
 * @module app/AssetStore
 * The session's logo images by asset id (spec 07 5.5.3, D5, D6): every logo image the app holds, an upload (D6: the
 * Section Logos panel loads through load(), the LogoLoader contract) or an image an applied project file brought
 * (inline: addFromDataUri; a ZIP entry: addFromBytes), is loaded through the one logo loader (08 P2-13a's
 * render/textures/LogoLoader: allowlist and PNG conversion, the 2 MB cap, the 64-distinct-image cap of an upload, SVG
 * sanitising and sizing, decode check, SHA-256 and the asset id `'a_' + sha256.slice(0, 16)`, 07 6.13) and kept here
 * by id, so ProjectSession.apply hydrates the logo library synchronously and every held logo has a data URI the
 * writer can inline. Assets are never evicted during a session (07 5.5.3: a later snapshot may still reference them).
 * Legacy source: none (new in 07 D5).
 * Layer: app (may import core, legacy, domain, geometry; the loader is injected, app/ may not import render/).
 */

import { bytesToBase64 } from '../domain/LogoRules.js';

/**
 * @typedef {{dataUri: string, mime: string, bytes: number, name: string, sha256: string, assetId: string}} AssetMeta
 *   the LogoLoader's LogoMeta
 * @typedef {{ok: true, image: *, meta: AssetMeta} | {ok: false, reason: string, message: string}} AssetLoadResult
 */

/** Logo images by asset id. */
export class AssetStore {
  /** @type {{load(request: object): Promise<AssetLoadResult>}} */
  #loader;
  /** @type {Map<string, {image: *, meta: AssetMeta}>} */
  #assets = new Map();

  /**
   * Side effects: none.
   * @param {{logoLoader: {load(request: object): Promise<AssetLoadResult>}}} deps  the LogoLoader (or its contract)
   */
  constructor({ logoLoader }) {
    this.#loader = logoLoader;
  }

  /**
   * The LogoLoader contract (07 5.5.3 addFile; D6): an upload ({file, sectionId}: the allowlist, the 2 MB and
   * 64-image caps, M-LOGO-1..3) or an imported data URI; a loaded image is stored under its asset id. A refusal stores
   * nothing and resolves with the loader's message. Never rejects.
   * Side effects: reads and decodes the image; stores it.
   * @param {{file?: File, sectionId?: *, dataUri?: string, name?: string}} request
   * @returns {Promise<AssetLoadResult>}
   */
  async load(request) {
    const res = await this.#loader.load(request);
    if (res.ok) this.#assets.set(res.meta.assetId, { image: res.image, meta: res.meta });
    return res;
  }

  /**
   * An imported inline logo (07 5.5.3 addFromDataUri): LogoLoader.load({dataUri, name}), which sanitises an SVG again and
   * decode-checks every image; a loaded image is stored under the asset id of its stored bytes (a sanitised SVG gets a new
   * id). Never rejects.
   * Side effects: stores the loaded asset.
   * @param {{name?: string}} meta  the file's asset entry
   * @param {string} dataUri
   * @returns {Promise<AssetLoadResult>}
   */
  async addFromDataUri(meta, dataUri) {
    return this.load({ dataUri, name: meta?.name });
  }

  /**
   * A logo stored as a ZIP entry (07 5.5.3 addFromBlob; D6): the entry's bytes as a `data:<meta.mime>;base64,` URI
   * (the validator allowed only the four logo MIME types), then addFromDataUri. Never rejects.
   * Side effects: see addFromDataUri.
   * @param {{name?: string, mime: string}} meta  the file's asset entry
   * @param {Uint8Array} bytes
   * @returns {Promise<AssetLoadResult & {dataUri?: string}>} also the data URI the bytes gave (so the caller can tell a
   *   sanitised SVG from the given bytes)
   */
  async addFromBytes(meta, bytes) {
    const dataUri = `data:${meta.mime};base64,${bytesToBase64(bytes)}`;
    return { ...(await this.addFromDataUri(meta, dataUri)), dataUri };
  }

  /**
   * Side effects: none.
   * @param {string} id  an asset id
   * @returns {{image: *, meta: AssetMeta}|null}
   */
  get(id) {
    return this.#assets.get(id) ?? null;
  }

  /**
   * Side effects: none.
   * @returns {string[]} the stored asset ids, in insertion order
   */
  list() {
    return [...this.#assets.keys()];
  }
}
