/**
 * @module ui/PanelB
 * Fixture (bad), rule 4: the same id as PanelA, and #camera-preview-options, which belongs to CameraPanel.
 * Rule 14: legacy identity residue in a module comment (the company-logo class).
 */
export class PanelB {
    constructor({ doc }) {
        this.el = doc.querySelector('#shared-id');
        this.options = doc.getElementById('camera-preview-options');
    }
}
