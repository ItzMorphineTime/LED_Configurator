/**
 * @module core/renderOrder
 * Fixture (good): rule 11 allows renderOrder literals of 900 and above only in this registry.
 */
export const RENDER_ORDER = Object.freeze({ DEFAULT: 0, NORMAL_LINES_ON_TOP: 995, GIZMO: 999 });

export const registryGroup = (group) => {
    group.renderOrder = 999;
    return { renderOrder: 0x3e3, group };
};
