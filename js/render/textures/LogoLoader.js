/**
 * @module render/textures/LogoLoader
 * The one logo loader (08 6.16, P2-13a; B-L35 fixed), for the upload of a file and (08 P2-13e) the logo assets of an
 * imported project file. It keeps only what the project file can hold (07 4.5): a PNG, JPEG or WebP file is stored
 * verbatim, an SVG is parsed, sanitised (no script, foreignObject, iframe, object, embed, audio or video element, no
 * on* attribute, no href other than a fragment or an inline PNG/JPEG/WebP, no @import or url() other than url(#...))
 * and given a size when its root has none, and any other image the browser decodes (GIF, BMP, AVIF, ...) is re-encoded
 * as PNG, downscaled up to three times when the PNG is larger than MAX_LOGO_BYTES. Every result is decode-checked
 * (an image of 0 x 0 px is refused), so nothing the panel-ID canvas draws can be broken, remote or active. The upload
 * also refuses a file over 2 MB (M-LOGO-2) and a 65th distinct image (M-LOGO-3). Since 08 P2-13e every stored logo
 * carries the SHA-256 of its bytes and its asset id (07 6.13).
 * Legacy source: index.html@cd3fd3f 2256-2278 (the upload handler: readAsDataURL, then new Image(); no error handling,
 * B-L35).
 * Layer: render (imports core, domain; the window is injected: FileReader, Image, DOMParser, XMLSerializer, the canvas
 * and crypto.subtle are looked up on it at call time).
 */

import { sha256Hex } from '../../core/sha256.js';
import { MAX_LOGO_ASSETS, MAX_LOGO_BYTES } from '../../domain/rules.js';
import { LOGO_MIMES, base64ToBytes, bytesToBase64, logoAssetId, logoAssetName, parseLogoDataUri } from '../../domain/LogoRules.js';

/** The logo messages of 08 3.3 (exact texts). */
export const LogoMessages = Object.freeze({
  /** M-LOGO-1 @param {string} name @returns {string} */
  unreadable: (name) => `Could not load the logo image "${name}". Use a PNG, JPEG, WebP or SVG file.`,
  /** M-LOGO-2 @param {string} name @returns {string} */
  tooLarge: (name) => `The logo "${name}" is larger than 2 MB. Use a smaller PNG, JPEG, WebP or SVG file.`,
  /** M-LOGO-3 @returns {string} */
  tooMany: () => `This project already uses ${MAX_LOGO_ASSETS} different logo images, the maximum. Reuse one of them or remove a logo first.`,
});

/** The size an SVG without its own width and height is given (08 6.16 "SVG sizing"). */
export const SVG_DEFAULT_SIZE = 1024;

/** How often a converted raster is downscaled before M-LOGO-2 (08 6.16 step 6). */
export const MAX_DOWNSCALES = 3;

/** The elements an SVG logo may not contain (08 6.16), lower-cased local names. */
const REMOVED_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video']);

/** An href an SVG logo may keep: a same-document fragment or an inline PNG, JPEG or WebP. */
const SAFE_HREF_RE = /^(#|data:image\/(png|jpeg|webp);base64,)/i;

/** A length that gives an SVG an intrinsic size: a positive number with an absolute unit or none. */
const SVG_LENGTH_RE = /^\s*(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*(px|mm|cm|in|pt|pc)?\s*$/i;

/**
 * CSS without @import rules and without url(...) references other than url(#...) (08 6.16).
 * Side effects: none.
 * @param {string} css
 * @returns {string}
 */
export function sanitizeSvgCss(css) {
  return String(css).replace(/@import[^;]*;?/gi, '').replace(/url\((?!\s*['"]?\s*#)[^)]*\)/gi, 'none');
}

/**
 * Sanitises a parsed SVG in place (08 6.16): removes the REMOVED_ELEMENTS, every on* attribute, every href / xlink:href
 * that is not a fragment or an inline PNG/JPEG/WebP, and @import / url() from style attributes and <style> elements.
 * Works on any element tree with localName, children, attributes ({name, value}), removeAttribute, remove(),
 * getAttribute / setAttribute and textContent (a DOMParser document, or a test double).
 * Side effects: mutates the tree.
 * @param {Element} root  the <svg> element
 */
export function sanitizeSvgElement(root) {
  const visit = (el) => {
    for (const child of Array.from(el.children ?? [])) {
      if (REMOVED_ELEMENTS.has(String(child.localName).toLowerCase())) {
        child.remove();
      } else {
        visit(child);
      }
    }
    for (const attr of Array.from(el.attributes ?? [])) {
      const name = String(attr.name);
      const local = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
      if (/^on/i.test(local)) {
        el.removeAttribute(name);
      } else if (local.toLowerCase() === 'href' && !SAFE_HREF_RE.test(String(attr.value).trim())) {
        el.removeAttribute(name);
      } else if (local.toLowerCase() === 'style') {
        const clean = sanitizeSvgCss(attr.value);
        if (clean !== attr.value) el.setAttribute(name, clean);
      }
    }
    if (String(el.localName).toLowerCase() === 'style') {
      const css = el.textContent ?? '';
      const clean = sanitizeSvgCss(css);
      if (clean !== css) el.textContent = clean;
    }
  };
  visit(root);
}

/**
 * Gives an SVG root without a usable width or height (B-L35: such an SVG may decode at 0 x 0 px) the size
 * SVG_DEFAULT_SIZE x round(SVG_DEFAULT_SIZE * vbH / vbW) from its viewBox, or SVG_DEFAULT_SIZE square without one.
 * Side effects: may set the root's width and height.
 * @param {Element} root
 * @returns {boolean} whether the size was set
 */
export function sizeSvgElement(root) {
  const usable = (v) => typeof v === 'string' && SVG_LENGTH_RE.test(v) && parseFloat(v) > 0;
  if (usable(root.getAttribute('width')) && usable(root.getAttribute('height'))) return false;
  let vbW = SVG_DEFAULT_SIZE;
  let vbH = SVG_DEFAULT_SIZE;
  const vb = String(root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
    vbW = vb[2];
    vbH = vb[3];
  }
  root.setAttribute('width', String(SVG_DEFAULT_SIZE));
  root.setAttribute('height', String(Math.max(1, Math.round((SVG_DEFAULT_SIZE * vbH) / vbW))));
  return true;
}

/**
 * The decoded size of a base64 data URI (its payload after the first comma).
 * @param {string} dataUri
 * @returns {number}
 */
function decodedSize(dataUri) {
  const b64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * @typedef {{dataUri: string, mime: string, bytes: number, name: string, sha256: string, assetId: string}} LogoMeta
 * @typedef {{ok: true, image: *, meta: LogoMeta} | {ok: false, reason: 'unreadable'|'tooLarge'|'tooMany', message: string}} LogoLoadResult
 */

/** Loads, checks and converts logo images (08 6.16). */
export class LogoLoader {
  /** @type {Window} */
  #win;
  /** @type {import('../../domain/LogoLibrary.js').LogoLibrary} */
  #logos;

  /**
   * Side effects: none.
   * @param {{win: Window, logos: import('../../domain/LogoLibrary.js').LogoLibrary}} deps  win: FileReader, Image,
   *   DOMParser, XMLSerializer, document (the conversion canvas) and crypto.subtle (optional) are read from it at call
   *   time; logos: the project's library (distinct-image count, M-LOGO-3)
   */
  constructor({ win, logos }) {
    this.#win = win;
    this.#logos = logos;
  }

  /**
   * Loads a logo: an uploaded file for a section (08 6.16 "Upload") or, without a file, an imported data URI
   * (08 6.16 "Import"; the validator has already accepted it with parseLogoDataUri). Never rejects.
   * Side effects: reads the file; decodes images; may create a canvas.
   * @param {{file?: File, sectionId?: *, dataUri?: string, name?: string}} request
   * @returns {Promise<LogoLoadResult>}
   */
  async load({ file = null, sectionId, dataUri, name }) {
    try {
      return file ? await this.#loadFile(file, sectionId) : await this.#loadDataUri(dataUri, logoAssetName(name));
    } catch (err) {
      const shown = file ? String(file.name ?? '') : logoAssetName(name);
      return { ok: false, reason: 'unreadable', message: LogoMessages.unreadable(shown) };
    }
  }

  /**
   * The upload (08 6.16 steps 1-8).
   * @param {File} file
   * @param {*} sectionId
   * @returns {Promise<LogoLoadResult>}
   */
  async #loadFile(file, sectionId) {
    const shown = String(file.name ?? '');
    const fail = (reason) => ({ ok: false, reason, message: reason === 'tooMany' ? LogoMessages.tooMany() : LogoMessages[reason](shown) });
    // 1. the file itself
    if (!(file.size <= MAX_LOGO_BYTES)) return fail('tooLarge');
    const type = String(file.type ?? '').toLowerCase();
    let stored;
    if (type === 'image/svg+xml' || (!type && /\.svg$/i.test(shown))) {
      // 5. SVG: parse, sanitise, size, re-serialise
      const svg = this.#svgDataUri(await this.#read(file, 'text'));
      if (!svg) return fail('unreadable');
      stored = { dataUri: svg.dataUri, mime: 'image/svg+xml', bytes: svg.bytes };
    } else if (LOGO_MIMES.includes(type)) {
      // 3-4. PNG, JPEG, WebP: verbatim
      const uri = await this.#read(file, 'dataURL');
      const parsed = parseLogoDataUri(uri);
      if (!parsed || parsed.mime !== type) return fail('unreadable');
      stored = { dataUri: uri, mime: type, bytes: parsed.bytes };
    } else {
      // 3. any other type the browser decodes: PNG at its natural size, then 6. the downscale loop
      const source = await this.#decode(await this.#read(file, 'dataURL'));
      if (!source) return fail('unreadable');
      let w = source.naturalWidth;
      let h = source.naturalHeight;
      let uri = this.#toPng(source, w, h);
      let bytes = decodedSize(uri);
      for (let k = 0; k < MAX_DOWNSCALES && bytes > MAX_LOGO_BYTES; k++) {
        const s = 0.9 * Math.sqrt(MAX_LOGO_BYTES / bytes);
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
        uri = this.#toPng(source, w, h);
        bytes = decodedSize(uri);
      }
      if (!parseLogoDataUri(uri)) return bytes > MAX_LOGO_BYTES ? fail('tooLarge') : fail('unreadable');
      stored = { dataUri: uri, mime: 'image/png', bytes };
    }
    // 6. the cap on the stored bytes (an SVG is never rasterised)
    if (stored.bytes > MAX_LOGO_BYTES) return fail('tooLarge');
    // 7. the decode check
    const image = await this.#decode(stored.dataUri);
    if (!image) return fail('unreadable');
    // 2. M-LOGO-3: a new distinct image while the other sections already use MAX_LOGO_ASSETS
    const used = this.#logos.distinctDataUris(sectionId);
    if (!used.has(stored.dataUri) && used.size >= MAX_LOGO_ASSETS) return fail('tooMany');
    // 8. the entry's fields
    return { ok: true, image, meta: await this.#meta(stored, logoAssetName(shown)) };
  }

  /**
   * An imported logo asset (08 6.16 "Import"): an SVG is sanitised and sized again (it may come from anywhere), a
   * raster is kept verbatim; then the decode check.
   * @param {string} dataUri
   * @param {string} name
   * @returns {Promise<LogoLoadResult>}
   */
  async #loadDataUri(dataUri, name) {
    const fail = (reason) => ({ ok: false, reason, message: LogoMessages[reason](name) });
    const parsed = parseLogoDataUri(dataUri);
    if (!parsed) return fail('unreadable');
    let stored = { dataUri, mime: parsed.mime, bytes: parsed.bytes };
    if (parsed.mime === 'image/svg+xml') {
      const raw = base64ToBytes(parsed.base64);
      const svg = raw && this.#svgDataUri(new TextDecoder().decode(raw));
      if (!svg) return fail('unreadable');
      if (svg.bytes > MAX_LOGO_BYTES) return fail('tooLarge');
      stored = { dataUri: svg.dataUri, mime: parsed.mime, bytes: svg.bytes };
    }
    const image = await this.#decode(stored.dataUri);
    if (!image) return fail('unreadable');
    return { ok: true, image, meta: await this.#meta(stored, name) };
  }

  /**
   * The entry fields of a stored image: its SHA-256 over the stored bytes and the asset id (07 6.13).
   * @param {{dataUri: string, mime: string, bytes: number}} stored
   * @param {string} name
   * @returns {Promise<LogoMeta>}
   */
  async #meta(stored, name) {
    const bytes = base64ToBytes(stored.dataUri.slice(stored.dataUri.indexOf(',') + 1)) ?? new Uint8Array(0);
    const sha256 = await sha256Hex(bytes, { subtle: this.#win.crypto?.subtle ?? null });
    return { dataUri: stored.dataUri, mime: stored.mime, bytes: bytes.length, name, sha256, assetId: logoAssetId(sha256) };
  }

  /**
   * The sanitised, sized SVG as a base64 data URI, or null when the text is not an SVG document (a parsererror).
   * @param {string} text
   * @returns {{dataUri: string, bytes: number}|null}
   */
  #svgDataUri(text) {
    const win = this.#win;
    const doc = new win.DOMParser().parseFromString(String(text), 'image/svg+xml');
    const root = doc?.documentElement;
    if (!root || String(root.localName).toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) return null;
    sanitizeSvgElement(root);
    sizeSvgElement(root);
    const bytes = new TextEncoder().encode(new win.XMLSerializer().serializeToString(root));
    return { dataUri: `data:image/svg+xml;base64,${bytesToBase64(bytes)}`, bytes: bytes.length };
  }

  /**
   * Reads a file as text or as a data URL.
   * @param {File} file
   * @param {'text'|'dataURL'} as
   * @returns {Promise<string>}  rejects on a read error
   */
  #read(file, as) {
    return new Promise((resolve, reject) => {
      const reader = new this.#win.FileReader();
      reader.onload = (event) => resolve(String(event.target.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      if (as === 'text') reader.readAsText(file);
      else reader.readAsDataURL(file);
    });
  }

  /**
   * Decodes an image URL (08 6.16 step 7): the loaded Image, or null on an error or a 0 x 0 px result.
   * @param {string} url  a data URI
   * @returns {Promise<*>}
   */
  #decode(url) {
    return new Promise((resolve) => {
      const img = new this.#win.Image();
      img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  /**
   * The PNG data URI of an image drawn at w x h px.
   * @param {*} img
   * @param {number} w
   * @param {number} h
   * @returns {string}
   */
  #toPng(img, w, h) {
    const canvas = this.#win.document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  }
}
