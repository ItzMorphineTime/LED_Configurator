/**
 * @module domain/rules
 * The shared numeric rules of the UI rule tables and (from 08 P2-3b) the import validator, so the app's own inputs and
 * its import can never disagree (docs/improvements/08-bugfix-roadmap.md 4.4; spec 07 C22). 08 P2-8a: `clamp`,
 * `roundInt`, `deepFreeze`. 08 P2-11c: `finiteOr` and `wrapDeg` (4.4, ahead of P2-8b/c). 08 P2-3b: `sanitizeText`
 * (with `stripControls`, `truncateUnits`), the section-id allocator of 07 6.8 (`MAX_SECTION_ID`, `createIdAllocator`)
 * and the size limits (`MAX_IMPORT_BYTES` and its parts; the logo limits are used from 08 P2-13a). 03 T1:
 * `STAGE_POSITION_LIMIT_M`, the +-100,000 m stage-position bound of 07 C22.
 * Legacy source: none (new in Phase 2); `deepFreeze` is a verbatim copy of the module-private helper of
 * js/legacy/LegacyCompat.js, which keeps its own copy because legacy/ may not import domain/ (ARCHITECTURE.md 1.3).
 * Layer: domain (may import legacy; THREE-free and DOM-free; this module imports nothing).
 */

/**
 * Clamps `v` into [lo, hi]. For every number that is not NaN this equals the legacy `Math.max(lo, Math.min(hi, v))`.
 * Side effects: none.
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number} Math.min(hi, Math.max(lo, v))
 */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Rounds to the nearest integer, halves up (`Math.round`): the rounding of the integer fields (B-L15).
 * Side effects: none.
 * @param {number} v
 * @returns {number} Math.round(v)
 */
export const roundInt = (v) => Math.round(v);

/**
 * `v` when it is a finite number, else `d` (08 4.4; delivered by 08 P2-11c for the camera Z rule, Q13, ahead of P2-8b,
 * which swaps every other `orDefault` rule for it, B-L9). Unlike `orDefault`, 0 is kept.
 * Side effects: none.
 * @param {number} v
 * @param {number} d
 * @returns {number}
 */
export const finiteOr = (v, d) => (Number.isFinite(v) ? v : d);

/**
 * An angle in degrees wrapped into (-180, 180] (08 4.4; delivered by 08 P2-11c for Reset's pan, ahead of P2-8c):
 * wrapDeg(-180) = 180, wrapDeg(190) = -170, wrapDeg(+0) = wrapDeg(-0) = +0.
 * Side effects: none.
 * @param {number} v
 * @returns {number}
 */
export const wrapDeg = (v) => 180 - ((((180 - v) % 360) + 360) % 360);

/**
 * The (cos, sin) of an angle in degrees, exact at multiples of 90 (geometry/WallOrientation's yawTrig; the domain may
 * not import geometry): CineCamera's aligned Reset and Prop.placeInFront read it (03 12.7, 12.16).
 * Side effects: none.
 * @param {number} deg
 * @returns {{cos: number, sin: number}}
 */
export function quarterExactTrig(deg) {
  const q = deg / 90;
  if (Number.isInteger(q)) {
    const k = ((q % 4) + 4) % 4;
    return { cos: [1, 0, -1, 0][k], sin: [0, 1, 0, -1][k] };
  }
  const r = deg * Math.PI / 180;
  return { cos: Math.cos(r), sin: Math.sin(r) };
}

/**
 * The characters `sanitizeText` strips (spec 07 C28 and 4.7): the C0 controls U+0000-U+001F, DEL and the C1 controls
 * U+007F-U+009F, and the bidi embedding / override / isolate controls U+202A-U+202E and U+2066-U+2069.
 */
const STRIP_RE = /[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/**
 * `s` without the characters of the 07 strip set (C0, C1 and the bidi controls).
 * Side effects: none.
 * @param {string} s
 * @returns {string}
 */
export const stripControls = (s) => s.replace(STRIP_RE, '');

/**
 * `s` cut to at most `maxLength` UTF-16 code units, never between the two halves of a surrogate pair (a pair that
 * would be split is dropped whole).
 * Side effects: none.
 * @param {string} s
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateUnits(s, maxLength) {
  if (s.length <= maxLength) return s;
  let cut = maxLength;
  const last = s.charCodeAt(cut - 1);
  if (cut > 0 && last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return s.slice(0, cut);
}

/**
 * The one text rule of section names (08 P2-3b; spec 07 C28, 08 amendment A3): strip the 07 strip set, then truncate
 * to `maxLength` UTF-16 code units without splitting a surrogate pair. **No trim**: the UI rename never trimmed, so a
 * trim on read would alter files the app writes. `WallSection.setName` and the validator both call it, so Save then
 * Open never changes a name.
 * Side effects: none.
 * @param {string} s
 * @param {number} maxLength
 * @returns {string}
 */
export const sanitizeText = (s, maxLength) => truncateUnits(stripControls(s), maxLength);

/** The largest section id (2^31 - 1, spec 07 6.8). */
export const MAX_SECTION_ID = 2147483647;

/**
 * Is `x` a valid section id (spec 07 6.8): an integer in [0, MAX_SECTION_ID]?
 * Side effects: none.
 * @param {*} x
 * @returns {boolean}
 */
export const isValidSectionId = (x) => Number.isInteger(x) && x >= 0 && x <= MAX_SECTION_ID;

/**
 * The section-id allocator of spec 07 6.8 over the ids already in use: `next()` returns `max(used) + 1` and upward,
 * skipping used ids, and, once that would pass MAX_SECTION_ID, the smallest unused id >= 0, so every id it hands out
 * is a valid id and re-validation never renumbers again. Each returned id is added to `used`.
 * Side effects: none at creation; next() adds to `used`.
 * @param {Set<number>} used  the valid ids in use (integers in [0, MAX_SECTION_ID]); kept and extended
 * @returns {{next: () => number}}
 */
export function createIdAllocator(used) {
  let next = 0;
  for (const id of used) if (id + 1 > next) next = id + 1;
  return {
    next() {
      while (next <= MAX_SECTION_ID && used.has(next)) next++;
      if (next <= MAX_SECTION_ID) {
        const id = next++;
        used.add(id);
        return id;
      }
      let n = 0;
      while (used.has(n)) n++;
      used.add(n);
      return n;
    },
  };
}

/**
 * The writer bound of every stage-frame position, in metres (spec 07 C22, 4.3: camera and prop x/z within
 * +-100,000 m). Read through `CineCamera.LIMITS` and `Prop.LIMITS`; since 03 T1 every `translateStage` (the pivot
 * re-expression, 03 6.5, 07 C45) clamps through them, so a re-expressed pose is always one the validator accepts.
 */
export const STAGE_POSITION_LIMIT_M = 100000;

/** The largest logo, in stored (decoded) bytes after conversion (spec 07 4.5; enforced from 08 P2-13a). */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** The most distinct logo images one project may use (spec 07 4.3 `assets[] <= 64`; enforced from 08 P2-13a). */
export const MAX_LOGO_ASSETS = 64;
/** The longest logo data URI: the prefix allowance plus the base64 of MAX_LOGO_BYTES (2,796,236). */
export const MAX_LOGO_DATAURI_CHARS = 32 + 4 * Math.ceil(MAX_LOGO_BYTES / 3);
/** The structure allowance of a project file (8 MiB: 200 sections and the derived keys many times over). */
export const MAX_STRUCTURE_BYTES = 8 * 1024 * 1024;
/**
 * The largest project file the import reads (08 4.3, amendment A1): MAX_STRUCTURE_BYTES plus 64 inline logos at the
 * cap, 187,347,712 bytes (about 179 MB), so every file the app can write opens again.
 */
export const MAX_IMPORT_BYTES = MAX_STRUCTURE_BYTES + MAX_LOGO_ASSETS * MAX_LOGO_DATAURI_CHARS;

/**
 * Recursively freezes plain objects and arrays (the `LIMITS` tables; P2-13g's MeshProfiles and FramingPolicy).
 * Side effects: freezes `value` and every object reachable from it.
 * @template T
 * @param {T} value
 * @returns {T} the same value, frozen
 */
export function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}
