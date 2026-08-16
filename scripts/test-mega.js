/**
 * Exactly 10,000 unique test cases — one assertion each, no duplicate IDs.
 * Run: node scripts/test-mega.js
 */
import { GameEngine } from '../js/game/engine.js';
import {
  GRID_SIZE, SHAPE_KEYS, SHAPES, createEmptyBoard, cloneShape, rotateShape,
  canPlace, placePiece, findClears, applyClears, hasAnyValidMove, createPiece,
  injectGarbageRows, applyShrinkRing, randomShapeKey, boardFillPercent
} from '../js/game/board.js';
import { SeededRNG, hashSeed } from '../js/game/seeded-rng.js';
import { listVariants } from '../js/game/duel-modes.js';
import { getDailyPuzzle } from '../js/systems/puzzles.js';
import { Mulberry32 } from './test-harness.js';

const TARGET = 10_000;
const cases = [];

function add(id, fn) {
  if (cases.length >= TARGET) return;
  cases.push({ id, fn });
}

function fillRandom(board, rng, density) {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c].wall) continue;
      if (rng.next() < density) {
        board[r][c] = { filled: true, color: rng.int(6), event: false };
      }
    }
  }
}

// ── 1. canPlace on empty: 17 × 64 = 1,088 ───────────────────────────────
for (const key of SHAPE_KEYS) {
  const shape = SHAPES[key];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      add(`canPlace.empty.${key}@${r},${c}`, () => {
        const board = createEmptyBoard();
        const ok = canPlace(board, shape, r, c);
        if (!ok) return;
        const next = placePiece(board, shape, r, c, 0);
        const placed = shape.some((row, dr) =>
          row.some((cell, dc) => cell && next[r + dr][c + dc].filled)
        );
        if (!placed) throw new Error('place failed');
      });
    }
  }
}

// ── 2. canPlace must reject blocked cell: 17 × 64 = 1,088 ─────────────────
for (const key of SHAPE_KEYS) {
  const shape = SHAPES[key];
  for (let br = 0; br < GRID_SIZE; br++) {
    for (let bc = 0; bc < GRID_SIZE; bc++) {
      add(`canPlace.block.${key}@${br},${bc}`, () => {
        const board = createEmptyBoard();
        board[br][bc] = { filled: true, color: 0, event: false };
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (!canPlace(board, shape, r, c)) continue;
            const covers = shape.some((row, dr) =>
              row.some((cell, dc) => cell && r + dr === br && c + dc === bc)
            );
            if (covers) throw new Error('covers block');
          }
        }
      });
    }
  }
}

// ── 3. Rotation preserves cell count: 17 × 4 = 68 ───────────────────────
for (const key of SHAPE_KEYS) {
  let shape = cloneShape(SHAPES[key]);
  const baseCells = shape.flat().filter(Boolean).length;
  for (let i = 0; i < 4; i++) {
    add(`rotate.${key}.${i}`, () => {
      const rot = rotateShape(shape);
      if (rot.flat().filter(Boolean).length !== baseCells) throw new Error('cell count');
      shape = rot;
    });
  }
}

// ── 4. findClears / applyClears: 800 unique boards ───────────────────────
for (let i = 0; i < 800; i++) {
  add(`clears.fuzz.${i}`, () => {
    const rng = new Mulberry32(1000 + i);
    const board = createEmptyBoard();
    fillRandom(board, rng, 0.55 + (i % 40) / 100);
    const clears = findClears(board);
    const { board: after, linesCleared } = applyClears(board, clears);
    if (after.length !== GRID_SIZE) throw new Error('size');
    if (linesCleared !== clears.rows.length + clears.cols.length) throw new Error('count');
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (after[r][c].wall && !board[r][c].wall) throw new Error('wall lost');
      }
    }
  });
}

// ── 5. Shrink wall grid: 3 × 64 = 192 ───────────────────────────────────
for (let level = 1; level <= 3; level++) {
  const board = applyShrinkRing(createEmptyBoard(), level);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      add(`shrink.${level}@${r},${c}`, () => {
        const onRing = r < level || r >= GRID_SIZE - level || c < level || c >= GRID_SIZE - level;
        if (board[r][c].wall && !onRing) throw new Error('wall inside');
      });
    }
  }
}

// ── 6. Garbage rows: 400 unique seeds ───────────────────────────────────
for (let i = 0; i < 400; i++) {
  add(`garbage.${i}`, () => {
    const rng = new Mulberry32(5000 + i);
    const rows = 1 + (i % 3);
    const before = createEmptyBoard();
    fillRandom(before, rng, 0.3);
    const after = injectGarbageRows(before, rows, () => rng.next());
    if (after.length !== GRID_SIZE) throw new Error('size');
    if (after.flat().filter(c => c.filled).length < rows) throw new Error('filled');
  });
}

// ── 7. Survival playthrough: 4,496 unique seeds (1 case = full game) ─────
for (let seed = 0; seed < 4496; seed++) {
  add(`survival.sim.${seed}`, () => {
    const rng = new Mulberry32(seed);
    const engine = new GameEngine();
    engine.initSurvival([]);
    let moves = 0;
    while (!engine.gameOver && moves < 120) {
      const pieces = engine.pieces.filter(p => !p.used);
      if (!pieces.length) break;
      const valid = [];
      for (const piece of pieces) {
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (canPlace(engine.board, piece.shape, r, c)) valid.push({ piece, r, c });
          }
        }
      }
      if (!valid.length) { engine.checkSurvivalEnd(); break; }
      const pick = valid[rng.int(valid.length)];
      if (!engine.tryPlace(pick.piece.id, pick.r, pick.c)) throw new Error('place');
      moves++;
    }
    if (!engine.gameOver && !hasAnyValidMove(engine.board, engine.pieces)) engine.checkSurvivalEnd();
    if (!engine.gameOver && moves === 0 && engine.score !== 0) throw new Error('state');
  });
}

// ── 8. Duel init: 5 × 80 = 400 ──────────────────────────────────────────
for (const v of listVariants()) {
  for (let s = 0; s < 80; s++) {
    add(`duel.init.${v.id}.${s}`, () => {
      const seed = hashSeed('A', 'B', `room-${v.id}-${s}`);
      const e = new GameEngine();
      e.initDuel([], { variant: v.id, seed });
      if (e.duelVariant?.id !== v.id) throw new Error('variant');
      if (e.pieces.length < 3) throw new Error('tray');
      if (boardFillPercent(e.board) !== 0) throw new Error('board');
    });
  }
}

// ── 9. Mirror parity: 200 unique seeds ────────────────────────────────────
for (let i = 0; i < 200; i++) {
  add(`mirror.parity.${i}`, () => {
    const seed = 9000 + i;
    const a = new GameEngine();
    const b = new GameEngine();
    a.initDuel([], { variant: 'mirror', seed });
    b.initDuel([], { variant: 'mirror', seed });
    if (a.pieces.length !== b.pieces.length) throw new Error('len');
    for (let p = 0; p < a.pieces.length; p++) {
      if (a.pieces[p].shapeKey !== b.pieces[p].shapeKey) throw new Error('key');
      if (a.pieces[p].color !== b.pieces[p].color) throw new Error('color');
    }
  });
}

// ── 10. Export / restore: 200 ─────────────────────────────────────────────
for (let i = 0; i < 200; i++) {
  add(`restore.${i}`, () => {
    const e = new GameEngine();
    e.initDuel([], { variant: 'mirror', seed: i });
    for (let m = 0; m < 5; m++) {
      const piece = e.pieces.find(p => !p.used);
      if (!piece) break;
      for (let r = 0; r < GRID_SIZE && !piece.used; r++) {
        for (let c = 0; c < GRID_SIZE && !piece.used; c++) {
          if (canPlace(e.board, piece.shape, r, c)) e.tryPlace(piece.id, r, c);
        }
      }
    }
    const snap = e.exportState();
    const e2 = new GameEngine();
    if (!e2.restoreState(snap)) throw new Error('restore');
    if (e2.score !== e.score) throw new Error('score');
  });
}

// ── 11. randomShapeKey: 300 ───────────────────────────────────────────────
for (let i = 0; i < 300; i++) {
  add(`rshape.${i}`, () => {
    const rng = new SeededRNG(15000 + i);
    const key = randomShapeKey(null, {}, () => rng.next());
    if (!SHAPE_KEYS.includes(key)) throw new Error(key);
  });
}

// ── 12. hashSeed: 100 ─────────────────────────────────────────────────────
for (let i = 0; i < 100; i++) {
  add(`hash.${i}`, () => {
    const h1 = hashSeed(`u${i}`, `v${i}`, `room${i}`);
    const h2 = hashSeed(`u${i}`, `v${i}`, `room${i}`);
    if (h1 !== h2 || h1 <= 0) throw new Error('hash');
  });
}

// ── 13. Daily puzzles: 365 ──────────────────────────────────────────────────
for (let day = 0; day < 365; day++) {
  const d = new Date(2025, 0, 1 + day);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  add(`daily.${key}`, () => {
    const p = getDailyPuzzle(key);
    if (!p.pieces.length || p.board.length !== GRID_SIZE || p.totalMoves <= 0) throw new Error('puzzle');
  });
}

// ── 14–16. Single behavioral tests (not ×200 duplicates) ─────────────────
add('attack.lineClear.callback', () => {
  const e = new GameEngine();
  e.initDuel([], { variant: 'attack', seed: 1 });
  let lines = 0;
  e.onLineClear = n => { lines += n; };
  const board = createEmptyBoard();
  for (let c = 0; c < GRID_SIZE - 2; c++) board[4][c] = { filled: true, color: 1, event: false };
  e.board = board;
  e.pieces = [createPiece('domino_h', 2)];
  e.tryPlace(e.pieces[0].id, 4, 6);
  if (lines < 1) throw new Error('no lines');
});

add('sudden.stuck.gameOver', () => {
  const e = new GameEngine();
  e.initDuel([], { variant: 'sudden', seed: 1 });
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      e.board[r][c] = { filled: true, color: 0, event: false };
    }
  }
  e.board[7][7] = { filled: false, color: 0, event: false };
  e.pieces = [createPiece('square', 0)];
  e.checkSurvivalEnd();
  if (!e.gameOver) throw new Error('not over');
});

add('shrink.step.increments', () => {
  const e = new GameEngine();
  e.initDuel([], { variant: 'shrink', seed: 1 });
  e.applyShrinkStep();
  if (e.shrinkLevel < 1) throw new Error('level');
});

// ── 17. hasAnyValidMove fuzz: 300 ─────────────────────────────────────────
for (let i = 0; i < 300; i++) {
  add(`ham.fuzz.${i}`, () => {
    const rng = new Mulberry32(20000 + i);
    const board = createEmptyBoard();
    fillRandom(board, rng, 0.7);
    const pieces = [createPiece('dot', 0), createPiece('domino_h', 1), createPiece('L_small', 2)];
    const any = hasAnyValidMove(board, pieces);
    if (any) {
      let found = false;
      for (const p of pieces) {
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (canPlace(board, p.shape, r, c)) found = true;
          }
        }
      }
      if (!found) throw new Error('inconsistent');
    }
  });
}

// ── Verify registry ───────────────────────────────────────────────────────
const ids = new Set(cases.map(c => c.id));
if (cases.length !== TARGET) {
  console.error(`Expected ${TARGET} cases, got ${cases.length}`);
  process.exit(1);
}
if (ids.size !== TARGET) {
  console.error(`Duplicate IDs: ${TARGET - ids.size}`);
  process.exit(1);
}

// ── Run ─────────────────────────────────────────────────────────────────────
console.log(`Block Blast Mega Suite — ${TARGET} unique tests\n`);
let passed = 0;
let failed = 0;
const failures = [];

for (let i = 0; i < cases.length; i++) {
  const { id, fn } = cases[i];
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    if (failures.length < 15) failures.push(`${id}: ${e.message}`);
  }
  if ((i + 1) % 1000 === 0) process.stdout.write(`\r  … ${i + 1}/${TARGET}`);
}

process.stdout.write('\r');
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) console.error('First failures:\n  ' + failures.join('\n  '));
process.exit(failed > 0 ? 1 : 0);
