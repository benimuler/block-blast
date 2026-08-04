import {
  createEmptyBoard, canPlace, placePiece, findClears, applyClears,
  hasAnyValidMove, boardFillPercent, createPiece, randomShapeKey,
  findRescueShape, rotateShape, cloneShape, SHAPES, generateId
} from '../game/board.js';
import { getLoadoutEffects } from '../systems/cards.js';
import { AdaptiveEngine } from '../systems/adaptive.js';
import { shouldSpawnEventBlock } from '../systems/events.js';
import { isBoardEmpty } from '../systems/puzzles.js';

export class GameEngine {
  constructor(mode = 'survival') {
    this.mode = mode;
    this.board = createEmptyBoard();
    this.pieces = [];
    this.score = 0;
    this.tokensEarned = 0;
    this.eventTokensEarned = 0;
    this.combo = 0;
    this.gameOver = false;
    this.won = false;
    this.adaptive = new AdaptiveEngine();
    this.effects = {};
    this.abilities = { rotationUsed: false, undoUsed: false, firstClearDone: false };
    this.history = [];
    this.puzzleMoveIndex = 0;
    this.puzzleTotalMoves = 0;
    this.linesClearedTotal = 0;
    this.onUpdate = null;
    this.onGameOver = null;
    this.onWin = null;
    this.onPuzzleFail = null;
  }

  initSurvival(loadout) {
    this.mode = 'survival';
    this.board = createEmptyBoard();
    this.score = 0;
    this.tokensEarned = 0;
    this.eventTokensEarned = 0;
    this.combo = 0;
    this.gameOver = false;
    this.won = false;
    this.adaptive.reset();
    this.effects = getLoadoutEffects(loadout);
    this.abilities = { rotationUsed: false, undoUsed: false, firstClearDone: false };
    this.history = [];
    this.linesClearedTotal = 0;
    this.generateTray();
    this.notify();
  }

  initPuzzle(puzzle) {
    this.mode = 'puzzle';
    this.board = puzzle.board.map(r => r.map(c => ({ ...c })));
    this.pieces = puzzle.pieces.map(p => ({ ...p, used: false }));
    this.puzzleMoveIndex = 0;
    this.puzzleTotalMoves = puzzle.totalMoves;
    this.score = 0;
    this.tokensEarned = 0;
    this.eventTokensEarned = 0;
    this.combo = 0;
    this.gameOver = false;
    this.won = false;
    this.effects = {};
    this.abilities = { rotationUsed: false, undoUsed: false, firstClearDone: false };
    this.history = [];
    this.linesClearedTotal = 0;
    this.notify();
  }

  generateTray() {
    const fillPercent = boardFillPercent(this.board);
    const weights = this.adaptive.getShapeWeights(this.board, fillPercent);
    const pieces = [];

    for (let i = 0; i < 3; i++) {
      let shapeKey, shape;

      if (this.adaptive.shouldInjectRescue(fillPercent)) {
        const rescue = findRescueShape(this.board, this.adaptive.getHeatmap());
        if (rescue) {
          shapeKey = rescue.shapeKey;
          shape = rescue.shape;
        }
      }

      if (!shapeKey) {
        shapeKey = randomShapeKey(this.effects.favorColor, weights);
        shape = cloneShape(SHAPES[shapeKey]);
      }

      let color = this.effects.favorColor !== null && Math.random() < 0.4
        ? this.effects.favorColor
        : Math.floor(Math.random() * 6);

      const isEvent = shouldSpawnEventBlock();
      pieces.push({
        id: generateId(),
        shapeKey,
        shape,
        color,
        isEvent,
        used: false,
        rotated: false
      });
      shapeKey = null;
    }

    if (this.effects.extraDot) {
      pieces.push(createPiece('dot', Math.floor(Math.random() * 6)));
    }

    this.pieces = pieces;
  }

  checkSurvivalEnd() {
    if (this.mode !== 'survival' || this.gameOver || this.won) return;
    if (!hasAnyValidMove(this.board, this.pieces)) {
      this.gameOver = true;
      this.onGameOver?.();
    }
  }

  rotatePiece(pieceId) {
    if (!this.effects.rotation || this.abilities.rotationUsed) return false;
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!piece || piece.used) return false;
    piece.shape = rotateShape(piece.shape);
    piece.rotated = true;
    this.abilities.rotationUsed = true;
    if (this.mode === 'survival') this.checkSurvivalEnd();
    this.notify();
    return true;
  }

  undo() {
    if (!this.effects.undo || this.abilities.undoUsed || this.history.length === 0) return false;
    const prev = this.history.pop();
    this.board = prev.board;
    this.pieces = prev.pieces;
    this.score = prev.score;
    this.combo = prev.combo;
    this.abilities.undoUsed = true;
    this.gameOver = false;
    this.notify();
    return true;
  }

  tryPlace(pieceId, row, col) {
    if (this.gameOver || this.won) return false;

    const pieceIndex = this.pieces.findIndex(p => p.id === pieceId);
    if (pieceIndex === -1) return false;
    const piece = this.pieces[pieceIndex];
    if (piece.used) return false;
    if (!canPlace(this.board, piece.shape, row, col)) return false;

    if (this.mode === 'survival') {
      this.history.push({
        board: this.board.map(r => r.map(c => ({ ...c }))),
        pieces: this.pieces.map(p => ({ ...p, shape: p.shape.map(r => [...r]) })),
        score: this.score,
        combo: this.combo
      });
      if (this.history.length > 5) this.history.shift();
    }

    this.adaptive.recordPlacement(row, col, piece.shape);

    let newBoard = placePiece(this.board, piece.shape, row, col, piece.color, piece.isEvent);
    piece.used = true;

    const clears = findClears(newBoard);
    let linesCleared = 0;
    let eventTokens = 0;

    if (clears.rows.length > 0 || clears.cols.length > 0) {
      const result = applyClears(newBoard, clears);
      newBoard = result.board;
      linesCleared = result.linesCleared;
      eventTokens = result.eventTokens;
      this.linesClearedTotal += linesCleared;
      this.combo++;
      this.adaptive.recordClear(linesCleared);
    } else {
      this.combo = 0;
      this.adaptive.recordClear(0);
    }

    this.board = newBoard;

    let points = piece.shape.flat().filter(Boolean).length * 10;
    if (linesCleared > 0) {
      points += linesCleared * 100;
      if (clears.rows.length > 0) points *= (1 + this.effects.rowBonus);
      if (this.combo > 1) points *= (1 + this.effects.comboBonus * this.combo);
      if (this.effects.firstClearDouble && !this.abilities.firstClearDone) {
        points *= 2;
        this.abilities.firstClearDone = true;
      }
    }
    this.score += Math.round(points);

    if (this.mode === 'survival') {
      this.tokensEarned += Math.floor(points / 50);
      this.eventTokensEarned += eventTokens;
    }

    if (this.mode === 'puzzle') {
      this.puzzleMoveIndex++;
      if (this.pieces.every(p => p.used)) {
        if (isBoardEmpty(this.board)) {
          this.won = true;
          this.onWin?.();
        } else {
          this.gameOver = true;
          this.onPuzzleFail?.();
        }
      }
    } else if (this.pieces.every(p => p.used) && this.mode === 'survival') {
      this.generateTray();
    }

    if (this.mode === 'survival') {
      this.checkSurvivalEnd();
    }

    this.notify();
    return true;
  }

  getPreviewCells(piece, row, col) {
    const cells = [];
    if (!piece) return cells;
    const valid = canPlace(this.board, piece.shape, row, col);
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        cells.push({
          row: row + r,
          col: col + c,
          valid
        });
      }
    }
    return cells;
  }

  notify() {
    this.onUpdate?.({
      board: this.board,
      pieces: this.pieces,
      score: this.score,
      tokensEarned: this.tokensEarned,
      eventTokensEarned: this.eventTokensEarned,
      combo: this.combo,
      gameOver: this.gameOver,
      won: this.won,
      abilities: this.abilities,
      effects: this.effects,
      puzzleMoveIndex: this.puzzleMoveIndex,
      puzzleTotalMoves: this.puzzleTotalMoves
    });
  }
}
