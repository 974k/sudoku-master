// Written guide for every technique the solver (and the hints) use.

import type { TechniqueId } from '../engine/logic.ts';

export interface GuideEntry {
  id: TechniqueId;
  name: string;
  level: 'Basics' | 'Medium' | 'Hard' | 'Expert';
  summary: string;
  body: string[];
}

export const GUIDE: readonly GuideEntry[] = [
  {
    id: 'fullHouse',
    name: 'Full House',
    level: 'Basics',
    summary: 'A row, column or box with one empty cell left.',
    body: ['When eight digits of a row, column or box are filled in, the last cell must hold the one digit that is missing. Scan for nearly complete units first — they are free moves.'],
  },
  {
    id: 'nakedSingle',
    name: 'Naked Single',
    level: 'Basics',
    summary: 'A cell that has only one possible digit.',
    body: [
      'Look at everything a cell can see: its row, its column and its box. If those already contain eight different digits, the ninth is the only one that fits.',
      'With notes, a naked single is a cell with a single pencil mark.',
    ],
  },
  {
    id: 'hiddenSingleBox',
    name: 'Hidden Single',
    level: 'Basics',
    summary: 'A digit that has only one possible place in a row, column or box.',
    body: [
      'Pick a digit and a box. Every copy of that digit elsewhere rules out the cells in its row and column. If only one cell in the box is left, the digit goes there — even if that cell could hold other digits.',
      'The same works for rows and columns. Scanning each digit across the boxes is the fastest way to start most puzzles.',
    ],
  },
  {
    id: 'pointing',
    name: 'Pointing Pair',
    level: 'Medium',
    summary: 'A digit confined to one line inside a box.',
    body: [
      'If, inside a box, all the candidates for a digit lie in the same row (or column), then that digit must be placed in that row inside this box.',
      'So the digit can be removed from the rest of that row outside the box. With three cells it is called a pointing triple. These are also known as locked candidates.',
    ],
  },
  {
    id: 'claiming',
    name: 'Box/Line Reduction',
    level: 'Medium',
    summary: 'A digit in a row or column confined to one box.',
    body: [
      'The reverse of a pointing pair: if all the candidates for a digit in a row (or column) sit inside one box, the box’s copy of the digit must be in that row.',
      'Remove the digit from the other cells of the box.',
    ],
  },
  {
    id: 'nakedPair',
    name: 'Naked Pair',
    level: 'Medium',
    summary: 'Two cells in a unit that share the same two candidates.',
    body: [
      'If two cells in a row, column or box can only hold the same two digits, those digits must go in those two cells — in some order.',
      'No other cell in that unit can contain either digit, so remove them from the rest of the unit.',
    ],
  },
  {
    id: 'hiddenPair',
    name: 'Hidden Pair',
    level: 'Medium',
    summary: 'Two digits that can only go in the same two cells of a unit.',
    body: [
      'If two digits each have exactly the same two possible cells in a unit, those cells must hold those two digits.',
      'Any other candidates in those two cells can be removed, which often reveals a naked pair.',
    ],
  },
  {
    id: 'nakedTriple',
    name: 'Naked Triple',
    level: 'Medium',
    summary: 'Three cells in a unit that only hold three digits between them.',
    body: [
      'Like a naked pair, but with three cells whose candidates together are just three digits (each cell need not hold all three).',
      'Those three digits are used up by the three cells, so remove them from the rest of the unit.',
    ],
  },
  {
    id: 'hiddenTriple',
    name: 'Hidden Triple',
    level: 'Hard',
    summary: 'Three digits confined to the same three cells of a unit.',
    body: ['If three digits can only appear in the same three cells of a unit, those cells must hold exactly those digits, and every other candidate in them can go.'],
  },
  {
    id: 'nakedQuad',
    name: 'Naked Quad',
    level: 'Hard',
    summary: 'Four cells sharing four candidates.',
    body: ['The four-cell version of naked pairs and triples: four cells in a unit whose candidates together are only four digits. Remove those digits from the rest of the unit.'],
  },
  {
    id: 'hiddenQuad',
    name: 'Hidden Quad',
    level: 'Hard',
    summary: 'Four digits confined to four cells.',
    body: ['Four digits that only fit in the same four cells of a unit claim those cells; remove all other candidates from them.'],
  },
  {
    id: 'xWing',
    name: 'X-Wing',
    level: 'Hard',
    summary: 'A digit forming a rectangle across two rows and two columns.',
    body: [
      'Suppose a digit can only go in two cells in each of two rows, and those cells line up in the same two columns. Whichever way the digit is placed, it takes one cell in each of those columns.',
      'So the digit can be removed from every other cell in those two columns. The same works with rows and columns swapped.',
    ],
  },
  {
    id: 'swordfish',
    name: 'Swordfish',
    level: 'Expert',
    summary: 'An X-Wing stretched across three rows and three columns.',
    body: ['If in three rows a digit is confined to the same three columns, the three rows must use up the digit in those columns. Remove the digit from the rest of those columns (or rows, swapping roles).'],
  },
  {
    id: 'jellyfish',
    name: 'Jellyfish',
    level: 'Expert',
    summary: 'The four-line version of X-Wing and Swordfish.',
    body: ['Four rows whose candidates for a digit lie in just four columns claim the digit in those columns. Remove it elsewhere in those columns.'],
  },
  {
    id: 'skyscraper',
    name: 'Skyscraper',
    level: 'Hard',
    summary: 'Two strong links on one digit that share a base.',
    body: [
      'Find two rows where a digit has exactly two places. If one end of each lines up in the same column, those two ends cannot both be the digit — so at least one of the other two ends must be.',
      'Any cell that sees both of those other ends cannot hold the digit.',
    ],
  },
  {
    id: 'twoStringKite',
    name: '2-String Kite',
    level: 'Hard',
    summary: 'A row link and a column link joined through a box.',
    body: [
      'Take a row and a column where a digit has exactly two places each. If one end of the row pair and one end of the column pair share a box, they cannot both hold the digit.',
      'So one of the two far ends must, and any cell seeing both far ends loses that digit.',
    ],
  },
  {
    id: 'xyWing',
    name: 'XY-Wing',
    level: 'Hard',
    summary: 'A pivot cell with two wings that force a digit.',
    body: [
      'Find a cell with two candidates XY (the pivot). It sees two other two-candidate cells: XZ and YZ (the wings).',
      'If the pivot is X, the XZ wing must be Z; if it is Y, the YZ wing must be Z. Either way one wing is Z, so any cell that sees both wings cannot be Z.',
    ],
  },
  {
    id: 'xyzWing',
    name: 'XYZ-Wing',
    level: 'Hard',
    summary: 'Like an XY-Wing, with a three-candidate pivot.',
    body: ['A pivot with candidates XYZ sees wings XZ and YZ. One of the three cells must be Z, so a cell that sees the pivot and both wings cannot be Z.'],
  },
  {
    id: 'wWing',
    name: 'W-Wing',
    level: 'Hard',
    summary: 'Two matching pairs joined by a strong link.',
    body: [
      'Two cells far apart both hold the same pair XY. If somewhere a unit has only two places for X, and each of those places sees one of the pair cells, then the two pair cells cannot both be X.',
      'So one of them is Y, and any cell that sees both can lose Y.',
    ],
  },
  {
    id: 'simpleColoring',
    name: 'Simple Coloring',
    level: 'Expert',
    summary: 'Following chains of a single digit in two colours.',
    body: [
      'Join every pair of cells that are the only two places for a digit in some unit. Colour the chain alternately: exactly one colour holds the real digits.',
      'If two cells of the same colour see each other, that colour is false. If a cell sees both colours, it cannot hold the digit.',
    ],
  },
  {
    id: 'xyChain',
    name: 'XY-Chain',
    level: 'Expert',
    summary: 'A chain of two-candidate cells that forces a digit at one end.',
    body: [
      'Start at a two-candidate cell and assume it is not Z. That forces its other digit, which forces the next linked cell, and so on along the chain. If the last cell is forced to be Z, then either the first or the last cell is Z.',
      'Any cell that sees both ends cannot be Z. An XY-Wing is the shortest XY-Chain.',
    ],
  },
];

export const GUIDE_BY_ID: Readonly<Partial<Record<TechniqueId, GuideEntry>>> = Object.fromEntries(GUIDE.map((g) => [g.id, g]));
