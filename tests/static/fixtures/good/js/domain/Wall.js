/**
 * @module domain/Wall
 * Fixture (good): domain -> domain and domain -> legacy imports. No THREE import (pure layer).
 */
import { WallSection } from './WallSection.js';
import { orDefault } from '../legacy/LegacyCompat.js';

export class Wall {
    constructor() {
        this.sections = [];
        this.nextSectionId = 1;
    }

    /** Appends a copy of the last section. */
    appendLikeLast(colors) {
        // LEGACY(B-L8): the id is allocated before `last` is read, so an empty wall throws after nextSectionId++.
        const id = this.nextSectionId++;
        const last = this.sections[this.sections.length - 1];
        const s = new WallSection({ id, name: `Wall ${this.sections.length + 1}`, panelCols: last.panelCols, color: orDefault(colors[0], '#00f0ff') });
        this.sections.push(s);
        this.sections[0].name = this.sections[0].name;   // domain/ may write domain fields
        return s;
    }
}
