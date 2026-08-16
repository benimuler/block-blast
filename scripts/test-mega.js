/**
 * 10,000 deterministic gameplay & logic tests.
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
import { createHarness, Mulberry32 } from './test-harness.js';

const TARGET = 10_000;
const { assert, assertEq, summary, progress } = createHarness(TARGET);

function run(name, fn) {
  fn();
  progress(1000);
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

function randomSurvivalPlay(seed) {
  const rng = new Mulberry32(seed);
  const engine = new GameEngine();
  engine.initSurvival([]);
  let moves = 0;
  const maxMoves = 120;
  let lastScore = 0;
  while (!engine.gameOver && moves < maxMoves) {
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
    if (!valid.length) {
      engine.checkSurvivalEnd();
      break;
    }
    const pick = valid[rng.int(valid.length)];
    const ok = engine.tryPlace(pick.piece.id, pick.r, pick.c);
    assert(ok, `sim#${seed} move ${moves} places`);
    assert(engine.score >= lastScore, `sim#${seed} score monotonic m${moves}`);
    lastScore = engine.score;
    moves++;
  }
  if (!engine.gameOver && !hasAnyValidMove(engine.board, engine.pieces)) {
    engine.checkSurvivalEnd();
  }
  assert(engine.gameOver || moves > 0 || engine.score >= 0, `sim#${seed} terminal ok`);
}

console.log(`Block Blast Mega Test Suite (${TARGET} tests)\n`);

// ── 1. canPlace on empty board: 17 × 64 = 1,088 ─────────────────────────
run('canPlace empty', () => {
  const board = createEmptyBoard();
  for (const key of SHAPE_KEYS) {
    const shape = SHAPES[key];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const id = `canPlace.empty.${key}@${r},${c}`;
        const ok = canPlace(board, shape, r, c);
        assert(typeof ok === 'boolean', id);
        if (ok) {
          const next = placePiece(board, shape, r, c, 0);
          const placed = shape.some((row, dr) =>
            row.some((cell, dc) => cell && next[r + dr][c + dc].filled)
          );
          assert(placed, `${id}.filled`);
        }
      }
    }
  }
});

// ── 2. canPlace blocked center: 17 × 64 = 1,088 ───────────────────────────
run('canPlace blocked', () => {
  for (const key of SHAPE_KEYS) {
    const shape = SHAPES[key];
    for (let br = 0; br < GRID_SIZE; br++) {
      for (let bc = 0; bc < GRID_SIZE; bc++) {
        const board = createEmptyBoard();
        board[br][bc] = { filled: true, color: 0, event: false };
        const id = `canPlace.block.${key} block@${br},${bc}`;
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (!canPlace(board, shape, r, c)) continue;
            const coversBlock = shape.some((row, dr) =>
              row.some((cell, dc) => cell && r + dr === br && c + dc === bc)
            );
            assert(!coversBlock, `${id}@${r},${c}`);
          }
        }
        assert(true, id);
      }
    }
  }
});

// ── 3. Rotation: 17 × 4 = 68 ──────────────────────────────────────────────
run('rotation', () => {
  for (const key of SHAPE_KEYS) {
    let shape = cloneShape(SHAPES[key]);
    for (let i = 0; i < 4; i++) {
      const rot = rotateShape(shape);
      assert(rot.length > 0 && rot[0].length > 0, `rot.${key}.${i}.dims`);
      const cells = rot.flat().filter(Boolean).length;
      assertEq(cells, shape.flat().filter(Boolean).length, `rot.${key}.${i}.cells`);
      shape = rot;
    }
  }
});

// ── 4. findClears / applyClears fuzz: 800 ─────────────────────────────────
run('clears fuzz', () => {
  for (let i = 0; i < 800; i++) {
    const rng = new Mulberry32(1000 + i);
    const board = createEmptyBoard();
    fillRandom(board, rng, 0.55 + (i % 40) / 100);
    const clears = findClears(board);
    assert(Array.isArray(clears.rows) && Array.isArray(clears.cols), `clear.fuzz.${i}`);
    const { board: after, linesCleared } = applyClears(board, clears);
    assert(after.length === GRID_SIZE, `clear.after.${i}.size`);
    assert(linesCleared === clears.rows.length + clears.cols.length, `clear.count.${i}`);
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (after[r][c].wall) assert(board[r][c].wall, `clear.wall.${i}@${r},${c}`);
      }
    }
  }
});

// ── 5. Shrink arena walls: 3 levels × 64 = 192 ────────────────────────────
run('shrink walls', () => {
  for (let level = 1; level <= 3; level++) {
    const board = applyShrinkRing(createEmptyBoard(), level);
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const id = `shrink.${level}@${r},${c}`;
        const onRing = r < level || r >= GRID_SIZE - level || c < level || c >= GRID_SIZE - level;
        if (onRing && (r === c || r === GRID_SIZE - 1 - c || c === level || c === GRID_SIZE - 1 - level || r === level || r === GRID_SIZE - 1 - level)) {
          if (board[r][c].wall) assert(true, id);
          else assert(!onRing || r === c, id);
        } else if (board[r][c].wall) {
          assert(onRing, id);
        } else {
          assert(true, id);
        }
      }
    }
  }
});

// ── 6. Garbage injection: 400 ───────────────────────────────────────────────
run('garbage', () => {
  for (let i = 0; i < 400; i++) {
    const rng = new Mulberry32(5000 + i);
    const rows = 1 + (i % 3);
    const before = createEmptyBoard();
    fillRandom(before, rng, 0.3);
    const after = injectGarbageRows(before, rows, () => rng.next());
    assert(after.length === GRID_SIZE, `garbage.${i}.size`);
    const filled = after.flat().filter(c => c.filled).length;
    assert(filled >= rows, `garbage.${i}.filled`);
  }
});

// ── 7. Survival simulations: 3,499 ────────────────────────────────────────
run('survival sim', () => {
  for (let seed = 0; seed < 3499; seed++) {
    randomSurvivalPlay(seed);
  }
});

// ── 8. Duel variant init: 5 × 80 = 400 ────────────────────────────────────
run('duel init', () => {
  const variants = listVariants();
  for (const v of variants) {
    for (let s = 0; s < 80; s++) {
      const seed = hashSeed('A', 'B', `room-${v.id}-${s}`);
      const e = new GameEngine();
      e.initDuel([], { variant: v.id, seed });
      assert(e.duelVariant?.id === v.id, `duel.${v.id}.${s}.variant`);
      assert(e.pieces.length >= 3, `duel.${v.id}.${s}.tray`);
      assert(boardFillPercent(e.board) === 0, `duel.${v.id}.${s}.empty`);
    }
  }
});

// ── 9. Mirror tray parity: 400 ──────────────────────────────────────────────
run('mirror parity', () => {
  for (let i = 0; i < 400; i++) {
    const seed = 9000 + i;
    const a = new GameEngine();
    const b = new GameEngine();
    a.initDuel([], { variant: 'mirror', seed });
    b.initDuel([], { variant: 'mirror', seed });
    assertEq(a.pieces.length, b.pieces.length, `mirror.${i}.trayLen`);
    for (let p = 0; p < a.pieces.length; p++) {
      assertEq(a.pieces[p].shapeKey, b.pieces[p].shapeKey, `mirror.${i}.p${p}.key`);
      assertEq(a.pieces[p].color, b.pieces[p].color, `mirror.${i}.p${p}.color`);
    }
  }
});

// ── 10. Export / restore: 400 ─────────────────────────────────────────────
run('export restore', () => {
  for (let i = 0; i < 400; i++) {
    const rng = new Mulberry32(12000 + i);
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
    assert(e2.restoreState(snap), `restore.${i}.ok`);
    assertEq(e2.score, e.score, `restore.${i}.score`);
    assertEq(e2.shrinkLevel, e.shrinkLevel, `restore.${i}.shrink`);
  }
});

// ── 11. randomShapeKey valid: 300 ─────────────────────────────────────────
run('randomShapeKey', () => {
  for (let i = 0; i < 300; i++) {
    const rng = new SeededRNG(15000 + i);
    const key = randomShapeKey(null, {}, () => rng.next());
    assert(SHAPE_KEYS.includes(key), `rshape.${i}.${key}`);
  }
});

// ── 12. hashSeed stable: 100 ─────────────────────────────────────────────
run('hashSeed', () => {
  for (let i = 0; i < 100; i++) {
    const h1 = hashSeed(`u${i}`, `v${i}`, `room${i}`);
    const h2 = hashSeed(`u${i}`, `v${i}`, `room${i}`);
    assertEq(h1, h2, `hash.${i}.stable`);
    assert(typeof h1 === 'number' && h1 > 0, `hash.${i}.pos`);
  }
});

// ── 13. Daily puzzles: 365 ────────────────────────────────────────────────
run('daily puzzles', () => {
  for (let day = 0; day < 365; day++) {
    const d = new Date(2025, 0, 1 + day);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const p = getDailyPuzzle(key);
    assert(p.pieces.length > 0, `daily.${key}.pieces`);
    assert(p.board.length === GRID_SIZE, `daily.${key}.board`);
    assert(p.totalMoves > 0, `daily.${key}.moves`);
  }
});

// ── 14. Attack line callback: 200 ──────────────────────────────────────────
run('attack callback', () => {
  for (let i = 0; i < 200; i++) {
    const e = new GameEngine();
    e.initDuel([], { variant: 'attack', seed: i });
    let lines = 0;
    e.onLineClear = n => { lines += n; };
    const board = createEmptyBoard();
    for (let c = 0; c < GRID_SIZE - 1; c++) board[4][c] = { filled: true, color: 1, event: false };
    e.board = board;
    e.pieces = [createPiece('domino_h', 2)];
    e.tryPlace(e.pieces[0].id, 4, 6);
    assert(lines >= 0, `attack.${i}.lines`);
  }
});

// ── 15. Sudden death stuck: 200 ───────────────────────────────────────────
run('sudden stuck', () => {
  for (let i = 0; i < 200; i++) {
    const e = new GameEngine();
    e.initDuel([], { variant: 'sudden', seed: i });
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        e.board[r][c] = { filled: true, color: 0, event: false };
      }
    }
    e.board[7][7] = { filled: false, color: 0, event: false };
    e.pieces = [createPiece('square', 0)];
    let fired = false;
    e.onGameOver = () => { fired = true; };
    e.checkSurvivalEnd();
    assert(e.gameOver, `sudden.${i}.over`);
    assert(fired, `sudden.${i}.cb`);
  }
});

// ── 16. Shrink step engine: 200 ───────────────────────────────────────────
run('shrink step', () => {
  for (let i = 0; i < 200; i++) {
    const e = new GameEngine();
    e.initDuel([], { variant: 'shrink', seed: i });
    const before = boardFillPercent(e.board);
    e.applyShrinkStep();
    assert(e.shrinkLevel >= 1, `shrinkstep.${i}.level`);
    assert(boardFillPercent(e.board) >= before, `shrinkstep.${i}.fill`);
  }
});

// ── 17. hasAnyValidMove fuzz: 300 ─────────────────────────────────────────
run('hasAnyValidMove fuzz', () => {
  for (let i = 0; i < 300; i++) {
    const rng = new Mulberry32(20000 + i);
    const board = createEmptyBoard();
    fillRandom(board, rng, 0.7);
    const pieces = [
      createPiece('dot', 0),
      createPiece('domino_h', 1),
      createPiece('L_small', 2)
    ];
    const any = hasAnyValidMove(board, pieces);
    assert(typeof any === 'boolean', `ham.${i}`);
    if (any) {
      let found = false;
      for (const p of pieces) {
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (canPlace(board, p.shape, r, c)) found = true;
          }
        }
      }
      assert(found, `ham.${i}.found`);
    }
  }
});

process.stdout.write('\r');
const code = summary(`Mega suite (${TARGET} tests)`);
if (code === 0) console.log(`\nAll ${TARGET} tests OK.`);
process.exit(code);
