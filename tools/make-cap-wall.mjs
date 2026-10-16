#!/usr/bin/env node
// The cap-timing fixture of the normals debug view (docs/improvements/01-normals.md 8.3, acceptance criterion 14b; 01 T1):
// the largest wall an import accepts once 08 P2-3b lands (Wall.MAX_SECTIONS = 200, 07 C22): 200 flat sections of
// 50 x 20 panels (500 x 500 mm, 32 x 32 LEDs), side by side, colours cycling through the theme palette, in combined
// mode. It is written by the app's own JSON v1 writer (io/ProjectSerializer, the Export JSON document, with the
// app's JSON.stringify(document, null, 2) text), so it imports exactly like a file the app saved.
// In combined mode it has 200 x 51 x 21 = 214,200 vertices and 200,000 quads: the vertex lines alone decimate with
// stride 2 (107,100 drawn) and both kinds with stride 3 (138,067 drawn) under the 150,000-line cap (01 6.6, 6.7.3).
//   node tools/make-cap-wall.mjs [--out <file>]   write the fixture (default tests/fixtures/normals-max-wall.json)
//   node tools/make-cap-wall.mjs --check          exit 1 if the committed fixture differs from the generator output
// Node only, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WallSection } from '../js/domain/WallSection.js';
import { Project } from '../js/domain/Project.js';
import { ProjectSerializer } from '../js/io/ProjectSerializer.js';
import { Palette } from '../js/theme/Theme.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, '..', 'tests', 'fixtures', 'normals-max-wall.json');

/** The fixture's shape (01 6.6: the largest importable wall). */
export const CAP_WALL = Object.freeze({ sections: 200, panelCols: 50, panelRows: 20, panelWidth: 500, panelHeight: 500, ledX: 32, ledY: 32 });

/** The project of the fixture: CAP_WALL.sections sections named "Wall 1".."Wall 200", ids 0..199, combined mode. */
export function capWallProject() {
  const sections = [];
  for (let i = 0; i < CAP_WALL.sections; i++) {
    sections.push(new WallSection({
      id: i,
      name: `Wall ${i + 1}`,
      panelCols: CAP_WALL.panelCols,
      panelRows: CAP_WALL.panelRows,
      panelWidth: CAP_WALL.panelWidth,
      panelHeight: CAP_WALL.panelHeight,
      ledX: CAP_WALL.ledX,
      ledY: CAP_WALL.ledY,
      curveIntensity: 0,
      angleOffset: 0,
      // The Phase-1 palette (06 T7: Palette.legacySectionColors), so the committed v1 fixture stays byte-identical
      // when the default palette changes.
      color: Palette.legacySectionColors[i % Palette.legacySectionColors.length],
    }));
  }
  const project = Project.createDefault();
  project.wall.replaceAll(sections);
  project.meshMode = 'combined';
  return project;
}

/** The fixture text: the Export JSON document of capWallProject(), as the app writes it. */
export function capWallText() {
  return JSON.stringify(new ProjectSerializer({ palette: Palette }).write(capWallProject()), null, 2);
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? path.resolve(argv[outIdx + 1] || '') : DEFAULT_OUT;
  const known = new Set(['--out', '--check']);
  const unknown = argv.filter((a, i) => a.startsWith('--') && !known.has(a) && argv[i - 1] !== '--out');
  if (unknown.length || (outIdx >= 0 && !argv[outIdx + 1])) {
    log('Usage: node tools/make-cap-wall.mjs [--out <file>] [--check]');
    return 2;
  }
  const text = capWallText();
  if (argv.includes('--check')) {
    // CRLF is normalised: a Windows checkout with core.autocrlf has CRLF line endings, which JSON does not care about.
    const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') === text;
    log(same ? `OK    ${out} equals the generator output` : `FAIL  ${out} differs from the generator output (run node tools/make-cap-wall.mjs)`);
    return same ? 0 : 1;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  log(`Wrote ${out} (${CAP_WALL.sections} sections of ${CAP_WALL.panelCols} x ${CAP_WALL.panelRows} panels, ${text.length} bytes)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
