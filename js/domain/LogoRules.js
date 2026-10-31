/**
 * @module domain/LogoRules
 * The pure logo rules shared by the upload (render/textures/LogoLoader, 08 P2-13a) and the project file's logo assets
 * (io/ProjectValidator, 08 P2-13e): the MIME allowlist (07 4.5), the logo positions (07 4.3), the asset name rule, the
 * asset id of a digest (07 6.13) and the strict data-URI parser of 08 6.16, with a dependency-free base64 codec, so
 * no logo the app stores or reads can name a URL, carry markup or exceed the size cap.
 * Legacy source: none (new in Phase 2; legacy accepted any image and validated nothing, B-L35).
 * Layer: domain (THREE-free and DOM-free; imports only domain/rules.js).
 */

import { MAX_LOGO_BYTES, MAX_LOGO_DATAURI_CHARS, sanitizeText } from './rules.js';

/** The logo MIME types a project stores (07 4.5); anything else is re-encoded as PNG at upload (08 6.16 step 3). */
export const LOGO_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

/** The logo positions (the logo row's select values; 07 4.3). */
export const LOGO_POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'center-left', 'center',
  'center-right', 'bottom-left', 'bottom-center', 'bottom-right']);

/** The logo scale range (a fraction of the section; the UI's 5-100 %, 07 4.3). */
export const LOGO_SCALE = Object.freeze({ min: 0.05, max: 1, default: 0.3 });

/** The longest asset name (07 4.5: the original file name, sanitised, at most 128 UTF-16 code units). */
export const LOGO_NAME_MAX_LENGTH = 128;

/** The base64 alphabet (RFC 4648 section 4). */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** char code -> 6-bit value (255: not in the alphabet). */
const B64_INDEX = (() => {
  const t = new Uint8Array(128).fill(255);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** 08 6.16: an allowlisted MIME, `;base64,` and canonical-alphabet base64 with at most two `=`. */
const DATA_URI_RE = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]*={0,2})$/;

/**
 * Standard base64 (with padding) of a byte array.
 * Side effects: none.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  const parts = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    chunk += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/**
 * The bytes of standard base64 text, or null when it is not canonical-alphabet base64 whose length is a multiple of 4
 * with at most two trailing `=`.
 * Side effects: none.
 * @param {string} b64
 * @returns {Uint8Array|null}
 */
export function base64ToBytes(b64) {
  if (typeof b64 !== 'string' || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((b64.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const c0 = B64_INDEX[b64.charCodeAt(i)];
    const c1 = B64_INDEX[b64.charCodeAt(i + 1)];
    const ch2 = b64.charCodeAt(i + 2);
    const ch3 = b64.charCodeAt(i + 3);
    const c2 = ch2 === 61 ? 0 : B64_INDEX[ch2];
    const c3 = ch3 === 61 ? 0 : B64_INDEX[ch3];
    if (c0 === 255 || c1 === 255 || c2 === 255 || c3 === 255) return null;
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/**
 * The strict logo data-URI parser of 08 6.16: `data:<allowlisted mime>;base64,<base64>` with a base64 length that is a
 * multiple of 4, at most MAX_LOGO_DATAURI_CHARS characters and at most MAX_LOGO_BYTES decoded bytes. An http(s), blob
 * or javascript URL, a data:text/html URI, malformed base64 or an oversize image gives null, so no logo can name a
 * resource to fetch.
 * Side effects: none.
 * @param {*} s
 * @returns {{mime: string, base64: string, bytes: number}|null}  bytes: the decoded length
 */
export function parseLogoDataUri(s) {
  if (typeof s !== 'string' || s.length > MAX_LOGO_DATAURI_CHARS) return null;
  const m = DATA_URI_RE.exec(s);
  if (!m) return null;
  const base64 = m[2];
  if (base64.length % 4 !== 0) return null;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = (3 * base64.length) / 4 - padding;
  if (bytes > MAX_LOGO_BYTES) return null;
  return { mime: m[1], base64, bytes };
}

/**
 * The stored name of a logo asset (07 4.5): the file name with the 07 strip set removed, at most LOGO_NAME_MAX_LENGTH
 * code units, never trimmed; a non-string gives ''.
 * Side effects: none.
 * @param {*} name
 * @returns {string}
 */
export function logoAssetName(name) {
  return typeof name === 'string' ? sanitizeText(name, LOGO_NAME_MAX_LENGTH) : '';
}

/**
 * The asset id of a logo (07 6.13): 'a_' + the first 16 hex characters of its SHA-256.
 * Side effects: none.
 * @param {string} sha256  64 lowercase hex characters
 * @returns {string}
 */
export const logoAssetId = (sha256) => `a_${sha256.slice(0, 16)}`;
