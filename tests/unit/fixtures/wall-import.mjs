// A wall-scope (v1) import through ProjectSession.apply (spec 07 D5, which replaced WallController.applyImport), for the
// unit tests that drive the real WallController: the session gets only what a wall-scope apply touches (no pilot, no
// selection, the pivot hook of App).
import { ProjectSession } from '../../../js/app/ProjectSession.js';

/**
 * Applies `sections` (WallSection instances) and a mesh mode (null keeps the current one) as a v1 import does.
 * Side effects: those of ProjectSession.apply with scope 'wall' (logos cleared, wall replaced, WALL_PIVOT_CHANGED
 *   {import}, WALL_MESH_MODE_CHANGED iff meshMode, one rebuild with cause 'import', PROJECT_REPLACED {import, wall}).
 * @param {{project: object, wc: object, bus: object}} world  the project, its WallController and bus
 * @param {{sections: object[], meshMode?: string|null}} wall
 */
export function wallImport({ project, wc, bus }, { sections, meshMode = null }) {
  const session = new ProjectSession({
    project, serializer: null, wallController: wc, bus, pilot: { active: false }, selection: { selectedId: null },
    sectionsFromProject: (v) => v.sections, features: { pivot: { hydrate: () => wc.applyPivot(null) } },
  });
  session.apply({ sections, mesh_mode: meshMode }, { reason: 'import', scope: 'wall' });
}
