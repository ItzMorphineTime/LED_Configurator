/**
 * @module app/App
 * Fixture (good): the composition root imports anything, may use window/document and looks up
 * exactly its eight ids (the canvas, the six preview-window ids and the normal-line stats element).
 */
import { EventBus } from '../core/EventBus.js';
import { Theme } from '../theme/Theme.js';
import JSZip from '../vendor/jszip.js';
import { byId } from '../ui/dom.js';
import { CameraPanel } from '../ui/CameraPanel.js';
import { PropControls } from '../ui/PropsPanel.js';
import { SceneManager } from '../render/SceneManager.js';
import { PreviewWindow } from '../render/PreviewWindow.js';
import { PanelIdRenderer } from '../render/textures/PanelIdRenderer.js';
import { ViewportInput } from '../interaction/ViewportInput.js';
import { ObjExporter } from '../io/ObjExporter.js';
import { WallMeshBuilder } from '../geometry/WallMeshBuilder.js';
import { Strategies } from '../legacy/LegacyCompat.js';
import { WallController } from './WallController.js';

export class App {
    constructor({ doc, win }) {
        this.bus = new EventBus();
        this.canvas = byId(doc, 'three-canvas');
        this.preview = new PreviewWindow({
            elements: {
                windowEl: byId(doc, 'camera-preview-window'),
                canvas: byId(doc, 'camera-preview-canvas'),
                resizeHandle: byId(doc, 'camera-preview-resize'),
                info: byId(doc, 'camera-preview-info'),
                fov: byId(doc, 'camera-preview-fov'),
                res: byId(doc, 'camera-preview-res'),
            },
        });
        this.stats = byId(doc, 'debug-normals-stats');
        this.parts = [Theme, JSZip, CameraPanel, PropControls, SceneManager, PanelIdRenderer, ViewportInput, ObjExporter,
            new WallMeshBuilder(Strategies.mesh.viewport), WallController, win, window.devicePixelRatio, document.title];
    }

    start() {
        return this.parts.length;
    }
}
