/**
 * @module legacy/LegacyCompat
 * Fixture (good). Tags look like `LEGACY(B-xx): ...` or `LEGACY(<ids>): ...`; neither placeholder is a tag.
 * A cross-reference without the prefix (B-M2, tagged at PanelNaming.mtlTextureFile) is not a tag either.
 */
const deepFreeze = (o) => {
    Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
    return Object.freeze(o);
};

export const Strategies = deepFreeze({
    mesh: {
        viewport: { winding: 'legacy-cw' },
        obj: { stripNormals: 'constant-z' },
    },
    framingBounds: 'flat',
    previewRendererSize: [320, 180],
    dispose: { gizmo: false },
});

/** LEGACY(B-L9): `v || d` (0, '', NaN fall back to the default). */
export const orDefault = (v, d) => v || d;

export const LEGACY_SITES = deepFreeze([
    { id: 'B-L9', site: 'js/legacy/LegacyCompat.js#orDefault', behaviour: '|| default', fix: 'per rule' },
    { id: 'B-L8', site: 'js/domain/Wall.js#appendLikeLast', behaviour: 'no validation', fix: 'validator' },
    { id: 'B-H1', site: 'js/geometry/WallMeshBuilder.js#quadIndices', behaviour: 'viewport winding', fix: 'ccw' },
    { id: 'B-H2', site: 'js/geometry/WallMeshBuilder.js#quadIndices', behaviour: 'export winding', fix: 'ccw' },
    { id: 'B-M11', site: 'js/render/SceneManager.js#addHelper', behaviour: 'helpers in the preview', fix: 'helpers layer' },
    { id: 'B-L24', site: 'css/07-viewport.css (header comment; documentation-only)', behaviour: 'badge overlap', fix: 'css' },
    { id: 'B-L36', site: 'index.html (markup, untagged; documentation-only)', behaviour: 'toggles', fix: 'markup' },
]);
