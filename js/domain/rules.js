/**
 * @module domain/rules
 * The shared numeric rules of the UI rule tables and (from 08 P2-3b) the import validator, so the app's own inputs and
 * its import can never disagree (docs/improvements/08-bugfix-roadmap.md 4.4; spec 07 C22). 08 P2-8a: `clamp`,
 * `roundInt`, `deepFreeze`.
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
