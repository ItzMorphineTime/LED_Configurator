/**
 * @module ui/PanelB
 * Fixture (bad), rule 4: the same id as PanelA, and #camera-preview-options, which belongs to CameraPanel.
 */
export class PanelB {
    constructor({ doc }) {
        this.el = doc.querySelector('#shared-id');
        this.options = doc.getElementById('camera-preview-options');
    }
}
