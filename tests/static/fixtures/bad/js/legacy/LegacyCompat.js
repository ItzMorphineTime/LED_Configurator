/**
 * @module legacy/LegacyCompat
 * Fixture (bad): rule 6 (the orDefault row has no tag; a site names a missing file) and rule 8
 * (two leaves are never referenced).
 */
export const Strategies = Object.freeze({
    used: 'x',
    unused: 'y',
    mesh: Object.freeze({ gltf: Object.freeze({ attributes: Object.freeze(['POSITION']) }) }),
});

/** `v || d`: the tag of this row is missing (B-L9 written without the prefix is not a tag). */
export const orDefault = (v, d) => v || d;

export const LEGACY_SITES = Object.freeze([
    { id: 'B-L9', site: 'js/legacy/LegacyCompat.js#orDefault', behaviour: '|| default', fix: 'per rule' },
    { id: 'B-M1', site: 'js/app/Gone.js#exportSafeDistanceOBJ', behaviour: 'ReferenceError', fix: 'saveBlob' },
    { id: 'B-L24', site: 'css/07-viewport.css (header comment; documentation-only)', behaviour: 'css', fix: 'css' },
]);
