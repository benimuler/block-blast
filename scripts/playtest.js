/**
 * Programmatic gameplay logic tests.
 * Run: node scripts/playtest.js
 */
import { GameEngine } from '../js/game/engine.js';
import {
  createEmptyBoard, hasAnyValidMove, canPlace, cloneShape, SHAPES, createPiece,
  findClears, applyClears, applyShrinkRing, injectGarbageRows, boardFromMatrix,
  boardCellIndex, isCellInBounds, GRID_SIZE
} from '../js/game/board.js';
import { getTodayKey, addXP, completeDailyPuzzle, getSave, saveGame, createDefaultSave } from '../js/systems/storage.js';
import { getDailyPuzzle } from '../js/systems/puzzles.js';

const UNDO_LOADOUT = ['legendary_undo'];
const ROTATION_LOADOUT = ['gold_rotation'];

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function fillBoardExcept(board, emptyCells) {
  const empty = new Set(emptyCells.map(([r, c]) => `${r},${c}`));
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (!empty.has(`${r},${c}`)) {
        board[r][c] = { filled: true, color: 0, event: false };
      }
    }
  }
}

function withMockDate(isoUtc, fn) {
  const RealDate = globalThis.Date;
  const fixed = new RealDate(isoUtc);
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return fixed;
      return new RealDate(...args);
    }
    static now() { return fixed.getTime(); }
  }
  globalThis.Date = MockDate;
  try { fn(fixed); } finally { globalThis.Date = RealDate; }
}

// ── hasAnyValidMove edge cases ──────────────────────────────────────────────

function testHasAnyValidMove() {
  console.log('\nhasAnyValidMove edge cases');
  const board = createEmptyBoard();
  assert(hasAnyValidMove(board, []) === false, 'empty pieces → false');

  const usedPiece = { ...createPiece('dot', 0), used: true };
  assert(hasAnyValidMove(board, [usedPiece]) === false, 'all pieces used → false');

  const dot = createPiece('dot', 0);
  fillBoardExcept(board, []);
  assert(hasAnyValidMove(board, [dot]) === false, 'full board → false');

  const board2 = createEmptyBoard();
  fillBoardExcept(board2, [[7, 7]]);
  assert(hasAnyValidMove(board2, [dot]) === true, 'single empty cell + dot → true');

  const big = createPiece('line5_h', 0);
  fillBoardExcept(board2, [[7, 7], [7, 6], [7, 5], [7, 4], [7, 3]]);
  assert(hasAnyValidMove(board2, [big]) === false, 'line5_h cannot fit in 5 cells with gaps → false');

  const board3 = createEmptyBoard();
  fillBoardExcept(board3, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
  assert(hasAnyValidMove(board3, [big]) === true, 'line5_h fits in row gap → true');
}

// ── Survival game over mid-tray ───────────────────────────────────────────

function testSurvivalEndMidTray() {
  console.log('\nSurvival game over mid-tray (checkSurvivalEnd)');
  const engine = new GameEngine('survival');
  engine.initSurvival([]);

  // Almost-full board; tray has large pieces that cannot fit anywhere
  fillBoardExcept(engine.board, [[7, 7]]);
  engine.pieces = [
    { id: 'p1', shapeKey: 'square', shape: cloneShape(SHAPES.square), color: 0, isEvent: false, used: false, rotated: false },
    { id: 'p2', shapeKey: 'line4_h', shape: cloneShape(SHAPES.line4_h), color: 1, isEvent: false, used: false, rotated: false },
    { id: 'p3', shapeKey: 'plus', shape: cloneShape(SHAPES.plus), color: 2, isEvent: false, used: false, rotated: false },
  ];

  assert(!hasAnyValidMove(engine.board, engine.pieces), 'setup: no valid moves');
  assert(engine.pieces.some(p => !p.used), 'setup: tray not fully used');

  let gameOverCalled = false;
  engine.onGameOver = () => { gameOverCalled = true; };
  engine.checkSurvivalEnd();

  assert(engine.gameOver === true, 'checkSurvivalEnd sets gameOver');
  assert(gameOverCalled === true, 'checkSurvivalEnd fires onGameOver callback');

  // Puzzle mode should NOT trigger survival end
  const puzzle = new GameEngine('puzzle');
  puzzle.initSurvival([]);
  puzzle.mode = 'puzzle';
  puzzle.gameOver = false;
  fillBoardExcept(puzzle.board, [[7, 7]]);
  puzzle.pieces = engine.pieces.map(p => ({ ...p }));
  puzzle.checkSurvivalEnd();
  assert(puzzle.gameOver === false, 'checkSurvivalEnd ignored in puzzle mode');
}

// ── Undo resets gameOver ────────────────────────────────────────────────────

function testUndoResetsGameOver() {
  console.log('\nUndo resets gameOver');
  const engine = new GameEngine('survival');
  engine.initSurvival(UNDO_LOADOUT);
  engine.effects = { ...engine.effects, undo: true };
  engine.board = createEmptyBoard();
  engine.pieces = [
    { id: 'dot1', shapeKey: 'dot', shape: cloneShape(SHAPES.dot), color: 0, isEvent: false, used: false, rotated: false },
    { id: 'dot2', shapeKey: 'dot', shape: cloneShape(SHAPES.dot), color: 1, isEvent: false, used: false, rotated: false },
    { id: 'dot3', shapeKey: 'dot', shape: cloneShape(SHAPES.dot), color: 2, isEvent: false, used: false, rotated: false },
  ];

  const prevBoard = engine.board.map(r => r.map(c => ({ ...c })));
  const prevPieces = engine.pieces.map(p => ({ ...p, shape: p.shape.map(r => [...r]) }));
  engine.history.push({ board: prevBoard, pieces: prevPieces, score: 0, combo: 0 });

  fillBoardExcept(engine.board, [[7, 7]]);
  engine.gameOver = true;
  assert(engine.gameOver === true, 'setup: gameOver set');

  const undone = engine.undo();
  assert(undone === true, 'undo succeeds');
  assert(engine.gameOver === false, 'undo resets gameOver');
  assert(hasAnyValidMove(engine.board, engine.pieces), 'valid moves exist after undo');
}

// ── Attack mode garbage rows ────────────────────────────────────────────────

function testGarbageAttack() {
  console.log('\nAttack mode garbage injection');
  const engine = new GameEngine('survival');
  engine.initDuel([], { variant: 'attack', seed: 99 });
  const before = engine.board[7].filter(c => c.filled).length;
  engine.applyGarbageAttack(2);
  const after = engine.board[7].filter(c => c.filled).length;
  assert(after >= before, 'garbage adds filled cells at bottom');
  assert(engine.board.length === 8, 'board stays 8x8 after garbage');
  const emptyCells = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!engine.board[r][c].filled) emptyCells.push([r, c]);
    }
  }
  assert(emptyCells.length > 0, 'garbage rows leave holes');
}

function testWallsBlockPlacement() {
  console.log('\nShrink walls block placement');
  let board = createEmptyBoard();
  board = applyShrinkRing(board, 1);
  const dot = createPiece('dot', 0);
  assert(!canPlace(board, dot.shape, 0, 0), 'cannot place on wall corner');
  assert(canPlace(board, dot.shape, 1, 1), 'can place in playable area');
  for (let r = 1; r <= 6; r++) {
    for (let c = 1; c <= 6; c++) {
      board[r][c] = { filled: true, color: 0, event: false };
    }
  }
  assert(!hasAnyValidMove(board, [dot]), 'no moves when playable area full');
}

// ── Shrink arena walls survive line clears ──────────────────────────────────

function testShrinkWallsNotCleared() {
  console.log('\nShrink arena walls survive line clears');
  let board = createEmptyBoard();
  board = applyShrinkRing(board, 1);
  // Fill inner row 1 (columns 1-6 only — 0 and 7 are walls)
  for (let c = 1; c < 7; c++) {
    board[1][c] = { filled: true, color: 2, event: false };
  }
  const clears = findClears(board);
  assert(clears.rows.includes(1), 'inner row clears when full');
  const result = applyClears(board, clears);
  board = result.board;
  assert(board[0][0].wall && board[0][0].filled, 'corner wall remains after clear');
  assert(!board[1][1].filled, 'playable cells in cleared row emptied');
}

// ── Duel state export/restore ───────────────────────────────────────────────

function testDuelStateRestore() {
  console.log('\nDuel state export/restore (mirror RNG)');
  const engine = new GameEngine('survival');
  engine.initDuel([], { variant: 'mirror', seed: 12345 });
  engine.score = 250;
  engine.trayGeneration = 2;
  engine.duelRng.next();
  engine.duelRng.next();
  const exported = engine.exportState();
  const expectedNext = engine.duelRng.next();
  assert(exported.duelSeed === 12345, 'export includes duel seed');
  assert(exported.duelRngState != null, 'export includes RNG state');

  const engine2 = new GameEngine('survival');
  engine2.restoreState(exported);
  assert(engine2.score === 250, 'restore preserves score');
  assert(engine2.duelSeed === 12345, 'restore preserves seed');
  assert(engine2.duelRng.next() === expectedNext, 'restore preserves RNG stream');
}

function testMirrorIdenticalTrays() {
  console.log('\nMirror duel identical trays');
  const seed = 99991;
  const a = new GameEngine('survival');
  const b = new GameEngine('survival');
  a.initDuel([], { variant: 'mirror', seed });
  b.initDuel([], { variant: 'mirror', seed });

  const traySig = (e) => e.pieces.map(p => `${p.shapeKey}:${p.color}:${p.isEvent}`).join('|');
  assert(traySig(a) === traySig(b), 'mirror seed → identical first tray');

  // Mark all pieces used and regenerate — RNG stream must stay in sync
  a.pieces.forEach(p => { p.used = true; });
  b.pieces.forEach(p => { p.used = true; });
  a.generateTray();
  b.generateTray();
  assert(traySig(a) === traySig(b), 'mirror seed → identical second tray');
}

function testAttackLineClearCallback() {
  console.log('\nAttack mode line clear callback');
  const engine = new GameEngine('survival');
  engine.initDuel([], { variant: 'attack', seed: 42 });
  let attackRows = 0;
  engine.onLineClear = (rows) => { attackRows += rows; };

  // Fill row 0 except one gap, place domino to complete row
  for (let c = 0; c < 6; c++) {
    engine.board[0][c] = { filled: true, color: 0, event: false };
  }
  engine.pieces = [
    { id: 'd1', shapeKey: 'domino_h', shape: cloneShape(SHAPES.domino_h), color: 1, isEvent: false, used: false, rotated: false },
    { id: 'd2', shapeKey: 'dot', shape: cloneShape(SHAPES.dot), color: 2, isEvent: false, used: false, rotated: false },
    { id: 'd3', shapeKey: 'dot', shape: cloneShape(SHAPES.dot), color: 3, isEvent: false, used: false, rotated: false },
  ];
  const placed = engine.tryPlace('d1', 0, 6);
  assert(placed, 'domino placed to complete row');
  assert(attackRows >= 1, 'attack onLineClear fires on row clear');
}

function testShrinkStep() {
  console.log('\nShrink duel arena step');
  const engine = new GameEngine('survival');
  engine.initDuel([], { variant: 'shrink', seed: 7 });
  assert(engine.shrinkLevel === 0, 'starts at shrink level 0');
  const playableBefore = engine.board.flat().filter(c => !c.wall).length;
  engine.applyShrinkStep();
  assert(engine.shrinkLevel === 1, 'shrink level increments');
  const playableAfter = engine.board.flat().filter(c => !c.wall).length;
  assert(playableAfter < playableBefore, 'shrink reduces playable cells');
  assert(engine.board[0][0].wall, 'corner becomes wall after shrink');
}

function testSuddenDeathStuck() {
  console.log('\nSudden death stuck detection');
  const engine = new GameEngine('survival');
  engine.initDuel([], { variant: 'sudden', seed: 1 });
  fillBoardExcept(engine.board, [[7, 7]]);
  engine.pieces = [
    { id: 's1', shapeKey: 'square', shape: cloneShape(SHAPES.square), color: 0, isEvent: false, used: false, rotated: false },
    { id: 's2', shapeKey: 'line4_h', shape: cloneShape(SHAPES.line4_h), color: 1, isEvent: false, used: false, rotated: false },
    { id: 's3', shapeKey: 'plus', shape: cloneShape(SHAPES.plus), color: 2, isEvent: false, used: false, rotated: false },
  ];
  let ended = false;
  engine.onGameOver = () => { ended = true; };
  engine.checkSurvivalEnd();
  assert(engine.gameOver, 'sudden duel stuck → gameOver');
  assert(ended, 'sudden duel stuck fires onGameOver');
}

function testPuzzleWin() {
  console.log('\nPuzzle win detection');
  const puzzle = {
    board: boardFromMatrix([
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ]),
    pieces: [{
      id: 'p0', shapeKey: 'dot', shape: cloneShape(SHAPES.dot), color: 0,
      isEvent: false, used: false, rotated: false
    }],
    totalMoves: 1
  };
  const engine = new GameEngine('puzzle');
  engine.initPuzzle(puzzle);
  let wonCb = false;
  engine.onWin = () => { wonCb = true; };
  assert(engine.tryPlace('p0', 3, 7), 'puzzle winning placement succeeds');
  assert(engine.won, 'puzzle sets won flag');
  assert(wonCb, 'puzzle fires onWin callback');
}

function testPieceRotation() {
  console.log('\nPiece rotation');
  const engine = new GameEngine('survival');
  engine.initSurvival(ROTATION_LOADOUT);
  const piece = engine.pieces[0];
  piece.shapeKey = 'domino_v';
  piece.shape = cloneShape(SHAPES.domino_v);
  const before = JSON.stringify(piece.shape);
  const ok = engine.rotatePiece(piece.id);
  assert(ok, 'rotatePiece succeeds with gold_rotation loadout');
  assert(JSON.stringify(piece.shape) !== before, 'shape changes after rotation');
  assert(!engine.rotatePiece(piece.id), 'rotation limited to once per game');
}

// ── Daily puzzle date uses local timezone ───────────────────────────────────

function testDailyTimezone() {
  console.log('\nDaily puzzle date uses local timezone');

  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert(getTodayKey() === expected, 'getTodayKey matches local date components');

  // UTC Aug 4 22:30 → in UTC+3 this is Aug 5 01:30 (local date ahead of UTC)
  withMockDate('2026-08-04T22:30:00.000Z', (fixed) => {
    const localY = fixed.getFullYear();
    const localM = String(fixed.getMonth() + 1).padStart(2, '0');
    const localD = String(fixed.getDate()).padStart(2, '0');
    const localKey = `${localY}-${localM}-${localD}`;
    const utcKey = fixed.toISOString().slice(0, 10);

    assert(getTodayKey() === localKey, 'getTodayKey uses local date, not UTC');
    if (localKey !== utcKey) {
      assert(getTodayKey() !== utcKey, 'getTodayKey differs from UTC when timezones diverge');
    }
  });

  // Puzzle selection is deterministic per date key
  const p1 = getDailyPuzzle('2026-08-04');
  const p2 = getDailyPuzzle('2026-08-04');
  const p3 = getDailyPuzzle('2026-08-05');
  assert(p1.pieces.length === p2.pieces.length, 'same date → same puzzle');
  assert(
    p1.pieces[0].shapeKey === p2.pieces[0].shapeKey,
    'same date → same shape'
  );
}

// ── addXP level-up logic ────────────────────────────────────────────────────

function withMockStorage(fn) {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
  };
  try { fn(); } finally { delete globalThis.localStorage; }
}

function testLevelUp() {
  console.log('\naddXP level-up logic');
  withMockStorage(() => {
    const def = createDefaultSave();
    def.xp = 95;
    def.level = 1;
    saveGame(def);

    const result = addXP(10);
    assert(result.leveledUp === true, 'addXP reports level-up');
    assert(result.newLevel === 2, 'addXP returns new level');
    assert(getSave().level === 2, 'level incremented after threshold');
  });
}

// ── Preview index bounds (no wrap-around) ───────────────────────────────────

function testPreviewCellIndex() {
  console.log('\nPreview cell index bounds');
  assert(boardCellIndex(0, 0) === 0, 'origin → index 0');
  assert(boardCellIndex(7, 7) === 63, 'bottom-right → index 63');
  assert(boardCellIndex(0, 8) === null, 'col 8 off-board → null (no wrap to row 1)');
  assert(boardCellIndex(1, -1) === null, 'col -1 off-board → null');
  assert(boardCellIndex(-1, 0) === null, 'row -1 off-board → null');
  assert(boardCellIndex(8, 0) === null, 'row 8 off-board → null');
  assert(!isCellInBounds(0, 8), 'col 8 not in bounds');
  assert(isCellInBounds(3, 4), 'center cell in bounds');

  const engine = new GameEngine('survival');
  const piece = engine.pieces.find(p => !p.used);
  const cells = engine.getPreviewCells(piece, 0, 8);
  const onBoard = cells.filter(c => isCellInBounds(c.row, c.col));
  assert(onBoard.length === 0, 'shape at col 8 has no on-board preview cells');
}

// ── Frontend module syntax ──────────────────────────────────────────────────

async function testFrontendModules() {
  console.log('\nFrontend module syntax');
  try {
    await import('../js/ui/renderer.js');
    assert(true, 'renderer.js imports without syntax errors');
  } catch (e) {
    assert(false, `renderer.js import failed: ${e.message}`);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

console.log('Block Blast playtest');
testHasAnyValidMove();
testSurvivalEndMidTray();
testUndoResetsGameOver();
testGarbageAttack();
testWallsBlockPlacement();
testShrinkWallsNotCleared();
testDuelStateRestore();
testMirrorIdenticalTrays();
testAttackLineClearCallback();
testShrinkStep();
testSuddenDeathStuck();
testPuzzleWin();
testPieceRotation();
testDailyTimezone();
testLevelUp();
testPreviewCellIndex();
await testFrontendModules();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
