// What the `ui_visual` scenario records with getComputedStyle(), as plain data (like configs.mjs).
//
// UI_ELEMENTS: one entry per probed element: { group, label, sel, index?, pseudo?, layout? }
//   * sel      CSS selector; the probe uses querySelectorAll(sel)[index || 0] and also records how many
//              elements matched, so structural changes show up as well as style changes.
//   * pseudo   '::before' / '::after' to read a pseudo-element's computed style instead.
//   * group    each captured state picks the groups it records (see uiVisualScenario in scenarios.mjs).
//   * layout   true = also recorded in the narrow-viewport (@media max-width: 900px) state.
// Labels are the keys of the recorded JSON, so renaming one shows up as a missing/extra key.

/** Computed properties recorded for every element (longhands, so values are unambiguous). */
export const STYLE_PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'box-sizing',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'outline-style', 'outline-width', 'outline-color',
    'color', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform',
    'text-align', 'text-decoration-line', 'text-shadow', 'white-space', 'vertical-align',
    'opacity', 'visibility', 'box-shadow', 'filter', 'transform', 'transform-origin', 'pointer-events', 'cursor',
    'overflow-x', 'overflow-y',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'order',
    'align-items', 'align-self', 'align-content', 'justify-content', 'justify-items', 'justify-self',
    'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
    'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
    'fill', 'stroke', 'stroke-width',
];

/**
 * :root custom properties (design tokens) recorded with every style snapshot: the semantic UI roles of
 * css/02-tokens.css layer 3 (docs/improvements/06-morph-branding.md 5.1), which every component references since 06 T4a.
 */
export const CSS_TOKENS = [
    '--color-bg-app', '--color-surface-1', '--color-surface-2', '--color-surface-hover', '--color-surface-overlay',
    '--color-scrim', '--color-border-subtle', '--color-border-strong',
    '--color-text-primary', '--color-text-secondary', '--color-text-disabled',
    '--color-accent', '--color-on-accent', '--color-accent-text', '--cta-background', '--color-on-cta',
    '--color-control-active-bg', '--color-on-control-active', '--color-focus-ring',
    '--color-success', '--color-warning', '--color-warning-bg', '--color-warning-border', '--color-danger', '--color-danger-bg',
    '--color-swatch-ring', '--shadow-overlay', '--font-ui', '--font-mono',
];

const E = (group, label, sel, opts = {}) => ({ group, label, sel, ...opts });

const TOGGLE_IDS = [
    'toggle-wireframe', 'toggle-frame', 'toggle-led-sim', 'toggle-panel-ids', 'toggle-section-labels',
    'toggle-camera-preview', 'toggle-safe-distance', 'toggle-person', 'toggle-car',
];

/** Elements of the i-th section card (direct child of #wall-sections). */
function cardEntries(i) {
    const c = `#wall-sections > :nth-child(${i + 1})`;
    const g = `card${i}`;
    const s = (label, sel, opts) => E(g, `${g}/${label}`, `${c} ${sel}`, opts);
    return [
        E(g, g, c),
        s('header', '.section-header'),
        s('header-left', '.section-header-left'),
        s('color', '.section-color'),
        s('title', '.section-title'),
        s('warning-indicator', '.section-title .warning-indicator'),
        s('summary', '.section-summary'),
        s('header-right', '.section-header-right'),
        s('delete', '.section-delete'),
        s('delete-svg', '.section-delete svg'),
        s('chevron', '.section-toggle'),
        s('chevron-svg', '.section-toggle svg'),
        s('content', '.section-content'),
        s('warning', '.section-warning'),
        s('warning-svg', '.section-warning svg'),
        s('warning-text', '.section-warning span'),
        s('row-single', '.section-row.single'),
        s('row', '.section-row:not(.single)'),
        s('input-field', '.input-field'),
        s('label', '.input-field label'),
        s('name-input', '.section-name-input'),
        s('number-input', 'input[data-field="panelCols"]'),
        s('curve-hint', '.curve-hint'),
        s('offset-hint', '.curve-hint', { index: 1 }),
        s('color-picker', '.section-color-picker'),
        s('swatch-active', '.color-swatch-small.active'),
        s('swatch-inactive', '.color-swatch-small:not(.active)'),
        s('color-custom', '.color-input-custom'),
    ];
}

export const UI_ELEMENTS = [
    // ---- page shell and header --------------------------------------------------------------
    E('page', 'html', 'html', { layout: true }),
    E('page', 'body', 'body', { layout: true }),
    E('page', 'app-container', '.app-container', { layout: true }),
    E('page', 'header', '.header', { layout: true }),
    E('page', 'brand-lockup', '.brand-lockup', { layout: true }),
    E('page', 'product-name', '.product-name'),
    E('page', 'header-stats', '.header-stats', { layout: true }),
    E('page', 'stat', '.stat'),
    E('page', 'stat-value', '.stat-value'),
    E('page', 'stat-value/arc', '#total-arc'),
    E('page', 'stat-label', '.stat-label'),

    // ---- sidebar ------------------------------------------------------------------------------
    E('sidebar', 'control-panel', '.control-panel', { layout: true }),
    E('sidebar', 'wall-sections', '#wall-sections'),
    E('sidebar', 'add-section-btn', '#add-section-btn'),
    E('sidebar', 'add-section-btn/svg', '#add-section-btn svg'),
    E('sidebar', 'global-section/mesh', '.global-section', { index: 0 }),
    E('sidebar', 'global-section/display', '.global-section', { index: 1 }),
    E('sidebar', 'global-section-title', '.global-section-title'),
    E('sidebar', 'global-section-title::before', '.global-section-title', { pseudo: '::before' }),
    E('sidebar', 'mesh-mode-select', '#mesh-mode-select'),
    E('sidebar', 'mesh-mode-option/active', '.mesh-mode-option.active'),
    E('sidebar', 'mesh-mode-option/inactive', '.mesh-mode-option:not(.active)'),
    E('sidebar', 'mesh-mode-option/input', '.mesh-mode-option input'),
    E('sidebar', 'mesh-mode-radio/active', '.mesh-mode-option.active .mesh-mode-radio'),
    E('sidebar', 'mesh-mode-radio/active::after', '.mesh-mode-option.active .mesh-mode-radio', { pseudo: '::after' }),
    E('sidebar', 'mesh-mode-radio/inactive', '.mesh-mode-option:not(.active) .mesh-mode-radio'),
    E('sidebar', 'mesh-mode-radio/inactive::after', '.mesh-mode-option:not(.active) .mesh-mode-radio', { pseudo: '::after' }),
    E('sidebar', 'mesh-mode-label', '.mesh-mode-label'),
    E('sidebar', 'toggle-container', '.toggle-container'),
    E('sidebar', 'toggle-label', '.toggle-label'),
    ...TOGGLE_IDS.flatMap((id) => [
        E('sidebar', `toggle/${id}`, `#${id}`),
        E('sidebar', `toggle/${id}::after`, `#${id}`, { pseudo: '::after' }),
    ]),
    E('sidebar', 'led-sim-options', '#led-sim-options'),
    E('sidebar', 'led-sim-options/input-field', '#led-sim-options .input-field'),
    E('sidebar', 'led-sim-options/label', '#led-sim-options label'),
    E('sidebar', 'select#led-layout', 'select#led-layout'),
    E('sidebar', 'panel-id-options', '#panel-id-options'),
    E('sidebar', 'panel-id-options/input-field', '#panel-id-options .input-field'),
    E('sidebar', 'panel-id-options/label', '#panel-id-options .input-field label'),
    E('sidebar', 'input#panel-border-thickness', '#panel-border-thickness'),
    E('sidebar', 'input#panel-font-color', '#panel-font-color'),
    E('sidebar', 'panel-id-options/toggle-container', '#panel-id-options .toggle-container'),
    E('sidebar', 'subsection-title', '.subsection-title'),
    E('sidebar', 'section-logos-container', '#section-logos-container'),
    E('sidebar', 'camera-preview-options', '#camera-preview-options'),
    E('sidebar', 'select#camera-filmback', 'select#camera-filmback'),
    E('sidebar', 'custom-filmback', '#custom-filmback'),
    E('sidebar', 'custom-filmback/row', '#custom-filmback .section-row'),
    E('sidebar', 'input#filmback-width', '#filmback-width'),
    E('sidebar', 'input#camera-focal-length', '#camera-focal-length'),
    E('sidebar', 'camera-info', '.camera-info'),
    E('sidebar', 'camera-info/row', '.camera-info > div'),
    E('sidebar', 'camera-info/row-last', '.camera-info > div', { index: 2 }),
    E('sidebar', 'camera-info/key', '.camera-info span'),
    E('sidebar', 'camera-info/value', '#camera-hfov'),
    E('sidebar', 'camera-options/subsection-title', '#camera-preview-options .subsection-title'),
    E('sidebar', 'camera-options/row', '#camera-preview-options .section-row', { index: 1 }),
    E('sidebar', 'camera-options/row-single', '#camera-preview-options .section-row.single'),
    E('sidebar', 'input#camera-pos-x', '#camera-pos-x'),
    E('sidebar', 'frustum-status', '.frustum-status'),
    E('sidebar', 'frustum-status/row', '.frustum-status > div'),
    E('sidebar', 'frustum-status/status-text', '#frustum-status-text'),
    E('sidebar', 'frustum-status/safe-distance', '#safe-distance'),
    E('sidebar', 'camera-options/toggle-container', '#camera-preview-options .toggle-container'),
    E('sidebar', 'button#reset-camera', '#reset-camera'),
    E('sidebar', 'button#export-safe-distance', '#export-safe-distance'),
    E('sidebar', 'person-options', '#person-options'),
    E('sidebar', 'person-options/row', '#person-options .section-row'),
    E('sidebar', 'input#person-pos-x', '#person-pos-x'),
    E('sidebar', 'car-options', '#car-options'),
    E('sidebar', 'car/toggle-container', '.toggle-container:has(#toggle-car)'),
    E('sidebar', 'export-section', '.export-section', { layout: true }),
    E('sidebar', 'export-row', '.export-row'),
    E('sidebar', 'export-btn', '#export-zip'),
    E('sidebar', 'export-btn.secondary', '#export-json'),
    E('sidebar', 'button#export-panel-ids', '#export-panel-ids'),
    E('sidebar', 'button#import-json', '#import-json'),
    E('sidebar', 'button#export-obj', '#export-obj'),
    E('sidebar', 'button#export-gltf', '#export-gltf'),
    E('sidebar', 'input#import-input', '#import-input'),

    // ---- section cards --------------------------------------------------------------------------
    ...cardEntries(0),
    ...cardEntries(1),

    // ---- section logo UI (rendered into #section-logos-container while panel IDs are on) -------
    E('logos', 'logos/item', '#section-logos-container > div'),
    E('logos', 'logos/item-name', '#section-logos-container > div > div:first-child'),
    E('logos', 'logos/upload', '.section-logo-upload'),
    E('logos', 'logos/upload-btn/has-logo', '.section-logo-upload-btn.has-logo'),
    E('logos', 'logos/upload-btn/empty', '.section-logo-upload-btn:not(.has-logo)'),
    E('logos', 'logos/file-input', '#section-logos-container input[type="file"]'),
    E('logos', 'logos/clear/visible', '.section-logo-clear.visible'),
    E('logos', 'logos/clear/hidden', '.section-logo-clear:not(.visible)'),
    E('logos', 'logos/position/visible', '.section-logo-position.visible'),
    E('logos', 'logos/position/hidden', '.section-logo-position:not(.visible)'),
    E('logos', 'logos/position/label', '.section-logo-position label'),
    E('logos', 'logos/position/select', '.section-logo-position select'),
    E('logos', 'logos/scale/visible', '.section-logo-scale.visible'),
    E('logos', 'logos/scale/input', '.section-logo-scale input'),

    // ---- viewport overlay -------------------------------------------------------------------------
    E('overlay', 'viewport', '.viewport', { layout: true }),
    E('overlay', 'three-canvas', '#three-canvas', { layout: true }),
    E('overlay', 'viewport-overlay', '.viewport-overlay', { layout: true }),
    E('overlay', 'viewport-info', '.viewport-info'),
    E('overlay', 'info-badge', '.info-badge'),
    E('overlay', 'viewport-controls', '.viewport-controls'),
    E('overlay', 'view-btn', '#view-front'),
    E('overlay', 'view-btn/svg', '#view-front svg'),
    E('overlay', 'view-btn/grid', '#toggle-grid'),
    E('overlay', 'gizmo-controls', '.gizmo-controls'),
    E('overlay', 'gizmo/translate', '#gizmo-translate'),
    E('overlay', 'gizmo/translate-svg', '#gizmo-translate svg'),
    E('overlay', 'gizmo/rotate', '#gizmo-rotate'),
    E('overlay', 'gizmo/space', '#gizmo-space'),
    E('overlay', 'gizmo/divider', '.gizmo-divider'),
    E('overlay', 'gizmo/pilot', '#gizmo-pilot'),
    E('overlay', 'selection-indicator', '#selection-indicator'),
    E('overlay', 'selection-indicator/name', '#selection-indicator .selected-name'),
    E('overlay', 'pilot-info', '#pilot-info'),

    // ---- camera preview window (inside .viewport) -------------------------------------------------
    E('camera-window', 'camera-window', '#camera-preview-window', { layout: true }),
    E('camera-window', 'camera-window/resize', '#camera-preview-resize'),
    E('camera-window', 'camera-window/resize-svg', '#camera-preview-resize svg'),
    E('camera-window', 'camera-window/top-bar', '#camera-preview-window > div', { index: 1 }),
    E('camera-window', 'camera-window/title', '#camera-preview-window span'),
    E('camera-window', 'camera-window/info', '#camera-preview-info'),
    E('camera-window', 'camera-window/canvas', '#camera-preview-canvas'),
    E('camera-window', 'camera-window/bottom-bar', '#camera-preview-window > div', { index: 2 }),
    E('camera-window', 'camera-window/fov', '#camera-preview-fov'),
    E('camera-window', 'camera-window/res', '#camera-preview-res'),
];
