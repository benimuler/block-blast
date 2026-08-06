export const GRID_SIZE = 8;

export const COLORS = [
  '#7c3aed', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#ef4444'
];

/** Works on HTTP/LAN — crypto.randomUUID needs secure context (localhost only) */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch { /* non-secure context (phone on LAN IP) */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const SHAPES = {
  dot: [[1]],
  domino_h: [[1, 1]],
  domino_v: [[1], [1]],
  line3_h: [[1, 1, 1]],
  line3_v: [[1], [1], [1]],
  line4_h: [[1, 1, 1, 1]],
  line4_v: [[1], [1], [1], [1]],
  line5_h: [[1, 1, 1, 1, 1]],
  line5_v: [[1], [1], [1], [1], [1]],
  square: [[1, 1], [1, 1]],
  L: [[1, 0], [1, 0], [1, 1]],
  L_mirror: [[0, 1], [0, 1], [1, 1]],
  L_small: [[1, 0], [1, 1]],
  T: [[1, 1, 1], [0, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  plus: [[0, 1, 0], [1, 1, 1], [0, 1, 0]],
};

export const SHAPE_KEYS = Object.keys(SHAPES);

export function rotateShape(shape) {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = shape[r][c];
    }
  }
  return rotated;
}

export function cloneShape(shape) {
  return shape.map(row => [...row]);
}

export function createEmptyBoard(size = GRID_SIZE) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ filled: false, color: 0, event: false }))
  );
}

export function boardFromMatrix(matrix) {
  const board = createEmptyBoard(matrix.length);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        board[r][c] = { filled: true, color: matrix[r][c] - 1, event: false };
      }
    }
  }
  return board;
}

export function canPlace(board, shape, row, col) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = row + r;
      const bc = col + c;
      if (br < 0 || br >= board.length || bc < 0 || bc >= board[0].length) return false;
      const cell = board[br][bc];
      if (cell.filled || cell.wall) return false;
    }
  }
  return true;
}

export function placePiece(board, shape, row, col, color, isEvent = false) {
  const newBoard = board.map(r => r.map(cell => ({ ...cell })));
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      newBoard[row + r][col + c] = { filled: true, color, event: isEvent };
    }
  }
  return newBoard;
}

export function findClears(board) {
  const size = board.length;
  const clearRows = [];
  const clearCols = [];

  for (let r = 0; r < size; r++) {
    if (board[r].every(cell => cell.filled)) clearRows.push(r);
  }
  for (let c = 0; c < size; c++) {
    if (board.every(row => row[c].filled)) clearCols.push(c);
  }
  return { rows: clearRows, cols: clearCols };
}

export function applyClears(board, clears) {
  const newBoard = board.map(r => r.map(cell => ({ ...cell })));
  const cleared = new Set();
  let eventTokens = 0;

  for (const r of clears.rows) {
    for (let c = 0; c < newBoard[0].length; c++) {
      if (newBoard[r][c].event) eventTokens++;
      cleared.add(`${r},${c}`);
    }
  }
  for (const c of clears.cols) {
    for (let r = 0; r < newBoard.length; r++) {
      if (newBoard[r][c].event) eventTokens++;
      cleared.add(`${r},${c}`);
    }
  }

  for (const key of cleared) {
    const [r, c] = key.split(',').map(Number);
    newBoard[r][c] = { filled: false, color: 0, event: false };
  }

  return { board: newBoard, linesCleared: clears.rows.length + clears.cols.length, eventTokens };
}

export function boardFillPercent(board) {
  let filled = 0;
  const total = board.length * board[0].length;
  for (const row of board) {
    for (const cell of row) {
      if (cell.filled) filled++;
    }
  }
  return filled / total;
}

export function hasAnyValidMove(board, pieces) {
  for (const piece of pieces) {
    if (piece.used) continue;
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        if (canPlace(board, piece.shape, r, c)) return true;
      }
    }
  }
  return false;
}

export function findRescueShape(board, heatmap) {
  const emptyCells = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (!board[r][c].filled) emptyCells.push({ r, c });
    }
  }
  if (emptyCells.length === 0) return null;

  emptyCells.sort((a, b) => (heatmap[b.r]?.[b.c] || 0) - (heatmap[a.r]?.[a.c] || 0));

  for (const shapeKey of ['dot', 'domino_h', 'domino_v', 'L_small']) {
    const shape = SHAPES[shapeKey];
    for (const { r, c } of emptyCells.slice(0, 5)) {
      if (canPlace(board, shape, r, c)) {
        return { shapeKey, shape: cloneShape(shape) };
      }
    }
  }
  return { shapeKey: 'dot', shape: cloneShape(SHAPES.dot) };
}

export function randomShapeKey(favoredColor = null, weights = {}, rng = Math.random) {
  const roll = typeof rng === 'function' ? rng : Math.random;
  const pool = SHAPE_KEYS.filter(k => k !== 'line5_h' && k !== 'line5_v' || roll() < 0.15);
  const weighted = pool.map(key => ({
    key,
    weight: weights[key] ?? 1
  }));
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let r = roll() * total;
  for (const { key, weight } of weighted) {
    r -= weight;
    if (r <= 0) return key;
  }
  return pool[Math.floor(roll() * pool.length)];
}

/** Push garbage rows from the bottom (line-attack mode). */
export function injectGarbageRows(board, rowCount, rng = Math.random) {
  if (rowCount <= 0) return board;
  const size = board.length;
  let rows = board.map(r => r.map(c => ({ ...c })));
  const roll = typeof rng === 'function' ? rng : Math.random;

  for (let g = 0; g < rowCount; g++) {
    rows.shift();
    const holes = 2 + Math.floor(roll() * 2);
    const row = Array.from({ length: size }, () => ({ filled: false, color: 0, event: false }));
    const filled = new Set();
    while (filled.size < size - holes) {
      filled.add(Math.floor(roll() * size));
    }
    for (const c of filled) {
      row[c] = { filled: true, color: Math.floor(roll() * COLORS.length), event: false, garbage: true };
    }
    rows.push(row);
  }
  return rows;
}

/** Block outer rings — shrink arena mode. */
export function applyShrinkRing(board, level) {
  if (level <= 0) return board;
  const size = board.length;
  const next = board.map(r => r.map(c => ({ ...c })));
  for (let ring = 0; ring < level; ring++) {
    for (let c = ring; c < size - ring; c++) {
      next[ring][c] = { filled: true, color: 0, event: false, wall: true };
      next[size - 1 - ring][c] = { filled: true, color: 0, event: false, wall: true };
    }
    for (let r = ring + 1; r < size - 1 - ring; r++) {
      next[r][ring] = { filled: true, color: 0, event: false, wall: true };
      next[r][size - 1 - ring] = { filled: true, color: 0, event: false, wall: true };
    }
  }
  return next;
}

export function createPiece(shapeKey, color = null, isEvent = false) {
  return {
    id: generateId(),
    shapeKey,
    shape: cloneShape(SHAPES[shapeKey]),
    color: color ?? Math.floor(Math.random() * COLORS.length),
    isEvent,
    used: false,
    rotated: false
  };
}
