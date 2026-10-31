/**
 * @module app/AssetStore
 * The session's logo images by asset id (spec 07 5.5.3, D5): every image an applied project file brought is loaded
 * through the one logo loader (08 P2-13a's render/textures/LogoLoader: allowlist, 2 MB cap, SVG sanitising and sizing,
 * decode check, SHA-256 and the asset id `'a_' + sha256.slice(0, 16)`, 07 6.13) and kept here, so ProjectSession.apply
 * hydrates the logo library from ids synchronously. Assets are never evicted during a session (07 5.5.3: a later
 * snapshot may still reference them).
 * Legacy source: none (new in 07 D5).
 * Layer: app (may import core, legacy, domain, geometry; the loader is injected, app/ may not import render/).
 */

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
   * An imported inline logo (07 5.5.3 addFromDataUri): LogoLoader.load({dataUri, name}), which sanitises an SVG again and
   * decode-checks every image; a loaded image is stored under the asset id of its stored bytes (a sanitised SVG gets a new
   * id). Never rejects.
   * Side effects: stores the loaded asset.
   * @param {{name?: string}} meta  the file's asset entry
   * @param {string} dataUri
   * @returns {Promise<AssetLoadResult>}
   */
  async addFromDataUri(meta, dataUri) {
    const res = await this.#loader.load({ dataUri, name: meta?.name });
    if (res.ok) this.#assets.set(res.meta.assetId, { image: res.image, meta: res.meta });
    return res;
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
