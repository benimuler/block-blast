/**
 * Automated gameplay simulation — survival + duel logic
 * Run: node scripts/sim-play.js [--loops N]
 */
import { GameEngine } from '../js/game/engine.js';
import { hasAnyValidMove, canPlace, SHAPES, cloneShape } from '../js/game/board.js';

const LOOPS = parseInt(process.argv.find(a => a.startsWith('--loops='))?.split('=')[1] || '50', 10);

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  ✗ FAIL: ${name}`);
}

function randomPlace(engine) {
  const pieces = engine.pieces.filter(p => !p.used);
  if (!pieces.length) return false;
  const piece = pieces[Math.floor(Math.random() * pieces.length)];
  const positions = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (canPlace(engine.board, piece.shape, r, c)) positions.push({ r, c });
    }
  }
  if (!positions.length) return false;
  const { r, c } = positions[Math.floor(Math.random() * positions.length)];
  return engine.tryPlace(piece.id, r, c);
}

function playSurvivalUntilEnd(seed = 0) {
  const engine = new GameEngine('survival');
  engine.initSurvival([]);
  let moves = 0;
  let maxMoves = 500;

  while (!engine.gameOver && !engine.won && moves < maxMoves) {
    if (!hasAnyValidMove(engine.board, engine.pieces)) {
      engine.checkSurvivalEnd();
      break;
    }
    if (!randomPlace(engine)) {
      engine.checkSurvivalEnd();
      break;
    }
    moves++;
  }

  if (!engine.gameOver && moves >= maxMoves) {
    return { ok: false, reason: 'infinite_loop', moves };
  }
  if (!engine.gameOver && !hasAnyValidMove(engine.board, engine.pieces)) {
    return { ok: false, reason: 'stuck_no_gameover', moves };
  }
  return { ok: true, moves, score: engine.score, gameOver: engine.gameOver };
}

function simulateDuelBoardStuck() {
  const engine = new GameEngine('survival');
  engine.initSurvival([]);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      engine.board[r][c] = { filled: true, color: 0, event: false };
    }
  }
  engine.board[7][7] = { filled: false, color: 0, event: false };
  engine.pieces = [
    { id: '1', shapeKey: 'line4_h', shape: cloneShape(SHAPES.line4_h), color: 0, used: false, isEvent: false },
    { id: '2', shapeKey: 'square', shape: cloneShape(SHAPES.square), color: 1, used: false, isEvent: false },
    { id: '3', shapeKey: 'L', shape: cloneShape(SHAPES.L), color: 2, used: false, isEvent: false }
  ];
  let fired = false;
  engine.onGameOver = () => { fired = true; };
  engine.checkSurvivalEnd();
  return { gameOver: engine.gameOver, fired, hasMove: hasAnyValidMove(engine.board, engine.pieces) };
}

function simulateMidTrayStuck() {
  const engine = new GameEngine('survival');
  engine.initSurvival([]);
  // Fill most of board leaving fragmented gaps
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) engine.board[r][c] = { filled: true, color: 0, event: false };
    }
  }
  engine.pieces = [
    { id: '1', shapeKey: 'line5_h', shape: cloneShape(SHAPES.line5_h), color: 0, used: false, isEvent: false },
    { id: '2', shapeKey: 'line5_v', shape: cloneShape(SHAPES.line5_v), color: 1, used: false, isEvent: false },
    { id: '3', shapeKey: 'plus', shape: cloneShape(SHAPES.plus), color: 2, used: false, isEvent: false }
  ];
  if (hasAnyValidMove(engine.board, engine.pieces)) return { skipped: true };
  let fired = false;
  engine.onGameOver = () => { fired = true; };
  engine.checkSurvivalEnd();
  return { gameOver: engine.gameOver, fired };
}

console.log(`\n=== Block Blast Sim-Play (${LOOPS} loops) ===\n`);

// Duel stuck scenarios
const duelStuck = simulateDuelBoardStuck();
assert('duel board stuck → gameOver', duelStuck.gameOver && duelStuck.fired);

const midTray = simulateMidTrayStuck();
if (!midTray.skipped) {
  assert('mid-tray stuck → gameOver', midTray.gameOver && midTray.fired);
}

// Random survival games
let stuckCount = 0;
for (let i = 0; i < LOOPS; i++) {
  const result = playSurvivalUntilEnd(i);
  if (!result.ok) {
    if (result.reason === 'stuck_no_gameover') stuckCount++;
    assert(`survival loop ${i + 1} (${result.reason})`, false);
  }
}
assert(`no stuck games in ${LOOPS} loops`, stuckCount === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All simulations OK.\n');
