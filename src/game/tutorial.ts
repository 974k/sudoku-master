// Interactive tutorial lessons. Each lesson board is a known solution with
// some cells blanked; tests verify every task is deducible exactly as taught.

const SOLUTION = '483921657967345821251876493548132976729564138136798245372689514814253769695417382';

const rc = (r: number, c: number): number => (r - 1) * 9 + (c - 1);

function board(blanks: readonly number[]): string {
  const cells = SOLUTION.split('');
  for (const i of blanks) cells[i] = '0';
  return cells.join('');
}

export interface Highlight {
  cells?: number[];
  units?: number[];
}

export type LessonTask =
  | { kind: 'read'; text: string; highlight?: Highlight }
  | { kind: 'place'; cell: number; digit: number; text: string; success: string; highlight?: Highlight }
  | { kind: 'notes'; cell: number; digits: number[]; text: string; success: string; highlight?: Highlight };

export interface Lesson {
  id: string;
  title: string;
  givens: string;
  solution: string;
  tasks: LessonTask[];
}

const DECOR = [rc(2, 2), rc(2, 4), rc(2, 6), rc(3, 2), rc(3, 4), rc(3, 9), rc(4, 3), rc(4, 5), rc(4, 7), rc(5, 3), rc(5, 5), rc(6, 3), rc(6, 7), rc(7, 5), rc(7, 7), rc(8, 4), rc(8, 6), rc(9, 5), rc(9, 7)];

const HIDDEN_BLANKS = [
  rc(1, 1), rc(1, 2), rc(1, 4), rc(1, 6),
  rc(2, 2), rc(3, 1), rc(3, 3),
  rc(4, 1), rc(5, 1), rc(6, 1), rc(8, 1),
  rc(5, 5), rc(6, 6), rc(7, 7), rc(9, 9), rc(8, 5), rc(4, 8),
];

export const LESSONS: readonly Lesson[] = [
  {
    id: 'rules',
    title: 'Rows, columns and boxes',
    givens: board([rc(1, 5), rc(6, 8), rc(8, 2), ...DECOR]),
    solution: SOLUTION,
    tasks: [
      {
        kind: 'read',
        text: 'Sudoku has one rule: every row, every column and every 3×3 box must contain the digits 1 to 9 exactly once. The grey digits are given; you fill in the rest.',
      },
      {
        kind: 'place',
        cell: rc(1, 5),
        digit: 2,
        text: 'Row 1 is missing just one digit. Select the empty cell and enter the digit that is missing from the row.',
        success: 'Right! Row 1 already had every digit except 2.',
        highlight: { units: [0] },
      },
      {
        kind: 'place',
        cell: rc(6, 8),
        digit: 4,
        text: 'Column 8 has one empty cell. Which digit is missing from the column?',
        success: 'Exactly — 4 was the only digit column 8 was missing.',
        highlight: { units: [9 + 7] },
      },
      {
        kind: 'place',
        cell: rc(8, 2),
        digit: 1,
        text: 'The bottom-left box has one empty cell. Fill it in.',
        success: 'Perfect. When a row, column or box has one gap left, it is called a Full House.',
        highlight: { units: [18 + 6] },
      },
    ],
  },
  {
    id: 'naked-single',
    title: 'Naked Single',
    givens: board([
      rc(5, 5),
      rc(5, 2), rc(5, 3), rc(5, 4), rc(5, 6), rc(5, 7),
      rc(3, 5), rc(4, 5), rc(7, 5),
      rc(4, 4), rc(4, 6), rc(6, 4), rc(6, 6),
      rc(1, 1), rc(2, 8), rc(3, 3), rc(7, 1), rc(8, 8), rc(9, 3), rc(1, 9), rc(9, 7),
    ]),
    solution: SOLUTION,
    tasks: [
      {
        kind: 'read',
        text: 'A cell "sees" every other cell in its row, column and box. If a cell sees eight different digits, only one digit is left for it. That is a Naked Single.',
        highlight: { cells: [rc(5, 5)], units: [4, 9 + 4, 18 + 4] },
      },
      {
        kind: 'place',
        cell: rc(5, 5),
        digit: 6,
        text: 'Look at the highlighted cell. Its row has 7, 3 and 8; its column has 2, 4, 9, 5 and 1. Which digit is left?',
        success: 'Yes! 1, 2, 3, 4, 5, 7, 8 and 9 were all taken, so this cell must be 6.',
        highlight: { cells: [rc(5, 5)], units: [4, 9 + 4, 18 + 4] },
      },
    ],
  },
  {
    id: 'notes',
    title: 'Pencil notes',
    givens: board(HIDDEN_BLANKS),
    solution: SOLUTION,
    tasks: [
      {
        kind: 'read',
        text: 'When a cell could hold several digits, you can jot them down as notes (pencil marks). Tap the pencil button (or press N) to switch to notes mode; digits you enter become small notes.',
      },
      {
        kind: 'notes',
        cell: rc(1, 1),
        digits: [1, 4, 8],
        text: 'Turn on notes mode and add every digit that could go in the highlighted cell: check what its row, column and box already contain.',
        success: 'Great notes! The row, column and box rule out everything except 1, 4 and 8.',
        highlight: { cells: [rc(1, 1)], units: [0, 9, 18] },
      },
    ],
  },
  {
    id: 'hidden-single',
    title: 'Hidden Single',
    givens: board(HIDDEN_BLANKS),
    solution: SOLUTION,
    tasks: [
      {
        kind: 'read',
        text: 'Sometimes a cell has several candidates, but one digit has only one possible place in a row, column or box. That digit must go there — a Hidden Single.',
        highlight: { units: [18] },
      },
      {
        kind: 'place',
        cell: rc(1, 1),
        digit: 4,
        text: 'Where can the 4 go in the top-left box? The other empty cells there already see a 4 in their row or column (look at the highlighted 4s). Place the 4.',
        success: 'Well spotted! The 4 had only one home in that box.',
        highlight: { cells: [rc(2, 5), rc(3, 7), rc(4, 2)], units: [18] },
      },
    ],
  },
  {
    id: 'wrap-up',
    title: 'You are ready',
    givens: board(DECOR),
    solution: SOLUTION,
    tasks: [
      {
        kind: 'read',
        text: 'Singles solve every Beginner and Easy puzzle. Harder levels need techniques that remove candidates from your notes — the Techniques guide explains each one with real examples.',
      },
      {
        kind: 'read',
        text: 'Stuck? The Hint button points you to the next logical step and explains why it works, one level at a time. You can turn hints off in Settings to play on your own. Have fun!',
      },
    ],
  },
];
