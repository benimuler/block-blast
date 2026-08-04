/**
 * Brute-force solvability check for daily puzzle templates.
 * Run: node scripts/test-puzzles.js
 */
import { SHAPES, cloneShape, canPlace, placePiece, findClears, applyClears, createEmptyBoard } from '../js/game/board.js';
import { isBoardEmpty } from '../js/systems/puzzles.js';

const PUZZLE_TEMPLATES = [
  { board: [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]], pieces: ['dot'] },
  { board: [[1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1]], pieces: ['dot','dot'] },
  { board: [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,1,1,1,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]], pieces: ['domino_h'] },
  { board: [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,1,1,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]], pieces: ['line3_h'] },
  { board: [[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]], pieces: ['domino_v'] },
  { board: [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,1,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]], pieces: ['domino_h','dot','dot'] },
  { board: [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,1,1,1,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,1,1,1,1,1,1],[0,0,0,0,0,0,0,0]], pieces: ['domino_h','domino_h'] },
];

function boardFromMatrix(matrix) {
  const board = createEmptyBoard(matrix.length);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) board[r][c] = { filled: true, color: matrix[r][c] - 1, event: false };
    }
  }
  return board;
}

function trySolve(board, pieceKeys, depth = 0) {
  if (depth === pieceKeys.length) return isBoardEmpty(board);

  const shape = cloneShape(SHAPES[pieceKeys[depth]]);
  const size = board.length;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!canPlace(board, shape, r, c)) continue;
      let next = placePiece(board, shape, r, c, 0, false);
      const clears = findClears(next);
      if (clears.rows.length || clears.cols.length) {
        next = applyClears(next, clears).board;
      }
      if (trySolve(next, pieceKeys, depth + 1)) return true;
    }
  }
  return false;
}

let failed = 0;
PUZZLE_TEMPLATES.forEach((tpl, i) => {
  const board = boardFromMatrix(tpl.board);
  const ok = trySolve(board, tpl.pieces);
  console.log(`Puzzle #${i + 1} (${tpl.pieces.join(', ')}): ${ok ? 'SOLVABLE' : 'UNSOLVABLE'}`);
  if (!ok) failed++;
});

if (failed) {
  console.error(`\n${failed} puzzle(s) failed solvability check`);
  process.exit(1);
}
console.log('\nAll puzzles solvable.');
