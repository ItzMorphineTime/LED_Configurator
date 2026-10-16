/**
 * @module ui/PanelB
 * Fixture (bad), rule 4: the same id as PanelA, and #camera-preview-options, which belongs to CameraPanel.
 * Rule 14: legacy identity residue in a module comment (the company-logo class).
 * Rule 17: legacy names: LED Wall Configurator, led-wall-config.json, led-wall-export.zip, textures/panel-ids.png
 * (a whole token; morph-led-wall-panel-ids.png and panel-ids.png.bak are fine).
 */
export class PanelB {
    constructor({ doc }) {
        this.el = doc.querySelector('#shared-id');
        this.options = doc.getElementById('camera-preview-options');
    }
}
