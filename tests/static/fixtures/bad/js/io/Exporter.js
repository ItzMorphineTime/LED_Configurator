/**
 * @module io/Exporter
 * Fixture (bad): rules 3 and 9 (window in a pure layer, through a spread).
 */
export const exporterOptions = () => ({ ...window.exportDefaults, ...window });
