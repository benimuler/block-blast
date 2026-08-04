import { GRID_SIZE } from '../game/board.js';

export class AdaptiveEngine {
  constructor() {
    this.heatmap = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    this.comboStreak = 0;
    this.placementHistory = [];
  }

  recordPlacement(row, col, shape) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const br = row + r;
        const bc = col + c;
        if (br >= 0 && br < GRID_SIZE && bc >= 0 && bc < GRID_SIZE) {
          this.heatmap[br][bc]++;
        }
      }
    }
    this.placementHistory.push({ row, col, shape });
    if (this.placementHistory.length > 50) {
      this.placementHistory.shift();
    }
  }

  recordClear(count) {
    if (count > 0) {
      this.comboStreak++;
    } else {
      this.comboStreak = 0;
    }
  }

  getDominantSide() {
    let left = 0, right = 0;
    const mid = GRID_SIZE / 2;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (c < mid) left += this.heatmap[r][c];
        else right += this.heatmap[r][c];
      }
    }
    return right > left * 1.3 ? 'right' : left > right * 1.3 ? 'left' : 'balanced';
  }

  getShapeWeights(board, fillPercent) {
    const weights = {};
    const side = this.getDominantSide();

    if (this.comboStreak >= 2) {
      weights.line4_h = 2.5;
      weights.line4_v = 2.5;
      weights.T = 2;
      weights.plus = 1.8;
      weights.L = 1.5;
    }

    if (fillPercent >= 0.85) {
      weights.dot = 4;
      weights.domino_h = 3;
      weights.domino_v = 3;
      weights.L_small = 2.5;
    }

    if (side === 'right') {
      weights.line5_v = 1.5;
      weights.L_mirror = 1.3;
    } else if (side === 'left') {
      weights.line5_v = 1.5;
      weights.L = 1.3;
    }

    return weights;
  }

  shouldInjectRescue(fillPercent) {
    return fillPercent >= 0.85 && Math.random() < 0.65;
  }

  reset() {
    this.heatmap = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    this.comboStreak = 0;
    this.placementHistory = [];
  }

  getHeatmap() {
    return this.heatmap;
  }
}
