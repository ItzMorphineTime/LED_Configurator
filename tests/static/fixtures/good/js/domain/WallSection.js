/**
 * @module domain/WallSection
 * Fixture (good): domain modules write their own fields; no THREE import here.
 * Import defaults follow B-L8 (tagged at Wall.appendLikeLast), mentioned without the tag prefix.
 */
export class WallSection {
    constructor(fields) {
        this.name = fields.name;
        this.panelCols = fields.panelCols;
        this.color = fields.color;
    }

    /** Render-time name fill. */
    ensureName(index) {
        if (!this.name) this.name = `Wall ${index + 1}`;
    }
}
