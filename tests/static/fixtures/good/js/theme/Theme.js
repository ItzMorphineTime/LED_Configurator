/**
 * @module theme/Theme
 * Fixture (good): THREE-free. This comment mentions THREE, window and document without counting.
 */
export const Theme = Object.freeze({
    label: 'THREE window document',                  // string text never counts
    font: (px) => `bold ${px}px 'JetBrains Mono'`,    // template text never counts
    note: `window ${'document'} THREE`,
});
