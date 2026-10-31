// A real History over a real ProjectSession (spec 07 H1) for the unit tests of the use cases that record on it. The
// session gets the given wall controller and feature hooks; everything else that apply touches is a model-level fake
// (the camera and the props write the model as the real controllers do; no pilot, selection, views or grid).
import { Project } from '../../../js/domain/Project.js';
import { ProjectSerializer } from '../../../js/io/ProjectSerializer.js';
import { sectionsFromProject, stateFromProject } from '../../../js/io/ProjectSchema.js';
import { ProjectSession } from '../../../js/app/ProjectSession.js';
import { AssetStore } from '../../../js/app/AssetStore.js';
import { History } from '../../../js/app/History.js';
import { Palette } from '../../../js/theme/Theme.js';

/** A FileReader that reads a fake file's `text` synchronously. */
class SyncFileReader {
  readAsText(file) { this.onload({ target: { result: file.text } }); }
}

/**
 * Builds the session, attaches `history` (session.attachHistory) and takes its first state (history.reset()).
 * @param {{project: object, wallController: object, bus: object, history?: History, features?: object,
 *          logoLoader?: object}} deps  history: default a History with a frozen clock (every same-key record coalesces)
 * @returns {{session: ProjectSession, history: History, alerts: string[]}}
 */
export function historySession({ project, wallController, bus, history = new History({ bus, clock: () => 0 }), features = {},
  logoLoader = { load: async () => ({ ok: false, message: 'no loader' }) } }) {
  const cine = project.camera;
  const prop = (p) => ({ applyImportedPose: (pose) => p.assign(pose), setVisible: (on) => { p.visible = on; } });
  const alerts = [];
  const session = new ProjectSession({
    project, serializer: new ProjectSerializer({ palette: Palette }), assets: new AssetStore({ logoLoader }), wallController,
    cameraController: {
      setPreviewEnabled: (on) => { cine.enabled = on; },
      applyImportedPose: ({ posX, posY, posZ, rotX, rotY, rotZ }) => cine.assign({ posX, posY, posZ, rotX, rotY, rotZ }),
      setSafeDistanceEnabled: (on) => { project.display.showSafeDistance = on; },
    },
    personController: prop(project.person), carController: prop(project.car),
    pilot: { active: false, toggle() {} }, selection: { selectedId: null, deselect() {}, find: () => null, select() {} },
    sceneManager: { toggleGrid() {} }, ledTiles: { clearCache() {} }, bus, dialogs: { alert: (m) => alerts.push(m) },
    downloader: { saveText() {} }, brand: { files: { json: 'p.json' } }, win: { FileReader: SyncFileReader },
    stateFromProject, sectionsFromProject,
    createProject: () => Project.createNew({ defaultSectionColor: Palette.defaultSectionColor }), features,
  });
  session.attachHistory(history);
  history.reset();
  return { session, history, alerts };
}
