/**
 * @module domain/Thing
 * Fixture (bad), rule 2: a bare specifier, a missing extension, a case mismatch and a missing file;
 * rule 1: a path that leaves js/.
 */
import { a } from 'three';
import { b } from './Wall';
import { c } from './wall.js';
import { d } from './Missing.js';
import { e } from '../../outside.js';

export const things = [a, b, c, d, e];
