import { GRID_SIZE, COLORS } from '../game/board.js';
import { getCardName, getCardDesc, getRarityLabel } from '../systems/cards.js';

export class Renderer {
  constructor() {
    this.boardEl = document.getElementById('board');
    this.trayEl = document.getElementById('tray');
    this.scoreEl = document.getElementById('score-display');
    this.tokensEl = document.getElementById('tokens-earned');
    this.comboBar = document.getElementById('combo-bar');
    this.comboCount = document.getElementById('combo-count');
    this.abilitiesEl = document.getElementById('game-abilities');
    this.puzzleInfo = document.getElementById('puzzle-info');
    this.puzzleProgress = document.getElementById('puzzle-progress');
    this.overlay = document.getElementById('game-overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlayMessage = document.getElementById('overlay-message');
    this.overlayActions = document.getElementById('overlay-actions');
    this.modeLabel = document.getElementById('game-mode-label');

    this.dragPiece = null;
    this.dragGhost = null;
    this.dragSourceEl = null;
    this.previewCells = [];
    this.pendingMove = null;
    this._rafId = null;
    this.grabOffsetX = 0;
    this.grabOffsetY = 0;
    this.inputLocked = false;
    this.onPlace = null;
    this.onRotate = null;
    this.onUndo = null;
    this.onAbilityRotate = null;

    this.buildBoard();
    this.setupBoardEvents();
    this.setupDragGhost();
  }

  setupDragGhost() {
    this.dragGhost = document.createElement('div');
    this.dragGhost.className = 'drag-ghost hidden';
    document.body.appendChild(this.dragGhost);
  }

  buildBoard() {
    this.boardEl.innerHTML = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        this.boardEl.appendChild(cell);
      }
    }
  }

  getBoardMetrics() {
    const rect = this.boardEl.getBoundingClientRect();
    const padding = 6;
    const gap = 3;
    const innerW = rect.width - padding * 2;
    const cellSize = (innerW - gap * (GRID_SIZE - 1)) / GRID_SIZE;
    return { rect, padding, gap, cellSize };
  }

  getCellFromPoint(clientX, clientY) {
    const { rect, padding, gap, cellSize } = this.getBoardMetrics();
    const x = clientX - rect.left - padding;
    const y = clientY - rect.top - padding;
    const step = cellSize + gap;
    const col = Math.floor((x + step * 0.5) / step);
    const row = Math.floor((y + step * 0.5) / step);
    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
      return { row, col };
    }
    return null;
  }

  /** Top-left of shape on board — derived from grab point under finger */
  getPlacementFromPoint(clientX, clientY) {
    if (!this.dragPiece) return null;
    const { rect, padding, gap, cellSize } = this.getBoardMetrics();
    const ghostLeft = clientX - this.grabOffsetX;
    const ghostTop = clientY - this.grabOffsetY;
    const x = ghostLeft - rect.left - padding;
    const y = ghostTop - rect.top - padding;
    const step = cellSize + gap;
    const col = Math.round(x / step);
    const row = Math.round(y / step);
    return { row, col };
  }

  setupBoardEvents() {
    const handleMove = (clientX, clientY) => {
      if (!this.dragPiece) return;
      this.pendingMove = { clientX, clientY };
      if (!this._rafId) {
        this._rafId = requestAnimationFrame(() => {
          this._rafId = null;
          if (!this.pendingMove || !this.dragPiece) return;
          const { clientX: x, clientY: y } = this.pendingMove;
          this.moveDragGhost(x, y);
          const placement = this.getPlacementFromPoint(x, y);
          this.clearPreview();
          if (placement) {
            this.previewCells = this.dragPiece.previewFn(placement.row, placement.col);
            this.showPreview(this.previewCells);
          }
        });
      }
    };

    const handleEnd = (clientX, clientY) => {
      if (!this.dragPiece) return;
      const placement = this.getPlacementFromPoint(clientX, clientY);
      const pieceId = this.dragPiece.id;
      this.endDrag();
      if (placement) {
        this.onPlace?.(pieceId, placement.row, placement.col);
      }
    };

    this._onMouseMove = e => handleMove(e.clientX, e.clientY);
    this._onMouseUp = e => handleEnd(e.clientX, e.clientY);
    this._onTouchMove = e => {
      e.preventDefault();
      const t = e.touches[0];
      handleMove(t.clientX, t.clientY);
    };
    this._onTouchEnd = e => {
      const t = e.changedTouches[0];
      if (t) handleEnd(t.clientX, t.clientY);
    };
    this._onTouchCancel = () => this.endDrag();
    this._onDragBlur = () => {
      if (this.dragPiece) this.endDrag();
    };
  }

  attachDragListeners() {
    document.addEventListener('mousemove', this._onMouseMove, { passive: true });
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('touchmove', this._onTouchMove, { passive: false });
    document.addEventListener('touchend', this._onTouchEnd);
    document.addEventListener('touchcancel', this._onTouchCancel);
    window.addEventListener('blur', this._onDragBlur);
  }

  cleanupDragListeners() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('touchmove', this._onTouchMove);
    document.removeEventListener('touchend', this._onTouchEnd);
    document.removeEventListener('touchcancel', this._onTouchCancel);
    window.removeEventListener('blur', this._onDragBlur);
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  startDrag(piece, sourceEl, clientX, clientY, trayGrabX, trayGrabY) {
    if (this.inputLocked) return;
    this.cleanupDragListeners();
    this.endDrag();

    this.dragPiece = {
      id: piece.id,
      shape: piece.shape,
      previewFn: sourceEl._previewFn
    };
    this.dragSourceEl = sourceEl;
    sourceEl.classList.add('dragging');

    const { cellSize, gap } = this.getBoardMetrics();
    const ghostCell = cellSize;
    const gridEl = sourceEl.querySelector('.piece-grid');
    const sampleCell = gridEl?.querySelector('.piece-cell');
    const trayCell = sampleCell
      ? sampleCell.getBoundingClientRect().width
      : this.getTrayCellSize();
    const scale = ghostCell / trayCell;

    if (trayGrabX != null && trayGrabY != null) {
      this.grabOffsetX = trayGrabX * scale;
      this.grabOffsetY = trayGrabY * scale;
    } else if (gridEl) {
      const gridRect = gridEl.getBoundingClientRect();
      this.grabOffsetX = (clientX - gridRect.left) * scale;
      this.grabOffsetY = (clientY - gridRect.top) * scale;
    } else {
      const cols = piece.shape[0].length;
      const rows = piece.shape.length;
      this.grabOffsetX = (cols * ghostCell + (cols - 1) * gap) / 2;
      this.grabOffsetY = (rows * ghostCell + (rows - 1) * gap) / 2;
    }

    this.dragGhost.innerHTML = '';
    this.dragGhost.appendChild(this.createPieceGrid(piece, ghostCell, gap));
    this.dragGhost.classList.remove('hidden');
    this.moveDragGhost(clientX, clientY);
    this.attachDragListeners();
  }

  moveDragGhost(clientX, clientY) {
    if (!this.dragGhost) return;
    const x = clientX - this.grabOffsetX;
    const y = clientY - this.grabOffsetY;
    this.dragGhost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  endDrag() {
    this.cleanupDragListeners();
    this.clearPreview();
    this.dragPiece = null;
    if (this.dragSourceEl) {
      this.dragSourceEl.classList.remove('dragging');
      this.dragSourceEl = null;
    }
    if (this.dragGhost) {
      this.dragGhost.classList.add('hidden');
      this.dragGhost.innerHTML = '';
    }
    this.pendingMove = null;
    this.grabOffsetX = 0;
    this.grabOffsetY = 0;
  }

  showPreview(cells) {
    for (const { row, col, valid } of cells) {
      const idx = row * GRID_SIZE + col;
      const el = this.boardEl.children[idx];
      if (el) el.classList.add(valid ? 'preview-valid' : 'preview-invalid');
    }
  }

  clearPreview() {
    this.boardEl.querySelectorAll('.preview-valid, .preview-invalid').forEach(el => {
      el.classList.remove('preview-valid', 'preview-invalid');
    });
    this.previewCells = [];
  }

  renderBoard(board, clearingCells = []) {
    const cells = this.boardEl.children;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const idx = r * GRID_SIZE + c;
        const el = cells[idx];
        const data = board[r][c];
        el.className = 'cell';
        if (data.filled) {
          el.classList.add('filled');
          if (data.event) {
            el.classList.add('color-event', 'event-block');
          } else {
            el.classList.add(`color-${data.color}`);
          }
        }
        if (clearingCells.some(cc => cc.row === r && cc.col === c)) {
          el.classList.add('clearing');
        }
      }
    }
  }

  getTrayCellSize() {
    return window.matchMedia('(hover: none)').matches ? 24 : 18;
  }

  renderTray(pieces, getPreviewForPiece) {
    if (!this.trayEl) return;
    this.endDrag();
    this.trayEl.innerHTML = '';
    const cellPx = this.getTrayCellSize();
    for (const piece of pieces) {
      if (piece.used) {
        const empty = document.createElement('div');
        empty.className = 'tray-slot-empty';
        this.trayEl.appendChild(empty);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'tray-piece';
      el.dataset.id = piece.id;

      el.appendChild(this.createPieceGrid(piece, cellPx));
      el._previewFn = (row, col) => getPreviewForPiece(piece, row, col);

      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const gridEl = el.querySelector('.piece-grid');
        const gridRect = gridEl?.getBoundingClientRect();
        const grabX = gridRect ? e.clientX - gridRect.left : null;
        const grabY = gridRect ? e.clientY - gridRect.top : null;
        this.startDrag(piece, el, e.clientX, e.clientY, grabX, grabY);
      });

      el.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        if (!t) return;
        const gridEl = el.querySelector('.piece-grid');
        const gridRect = gridEl?.getBoundingClientRect();
        const grabX = gridRect ? t.clientX - gridRect.left : null;
        const grabY = gridRect ? t.clientY - gridRect.top : null;
        const startX = t.clientX;
        const startY = t.clientY;
        let started = false;

        const onMove = (ev) => {
          const touch = ev.touches[0];
          if (!touch || started) return;
          if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 8) {
            started = true;
            cleanup();
            this.startDrag(piece, el, touch.clientX, touch.clientY, grabX, grabY);
          }
        };
        const onEnd = () => cleanup();
        const cleanup = () => {
          document.removeEventListener('touchmove', onMove);
          document.removeEventListener('touchend', onEnd);
          document.removeEventListener('touchcancel', onEnd);
        };

        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('touchcancel', onEnd);
      }, { passive: false });

      el.addEventListener('dblclick', () => {
        this.onRotate?.(piece.id);
      });

      this.trayEl.appendChild(el);
    }
  }

  createPieceGrid(piece, cellPx = 18, gapPx = 3) {
    const grid = document.createElement('div');
    grid.className = 'piece-grid';
    const cols = piece.shape[0].length;
    grid.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
    grid.style.gap = `${gapPx}px`;

    for (const row of piece.shape) {
      for (const cell of row) {
        const cellEl = document.createElement('div');
        cellEl.className = 'piece-cell';
        cellEl.style.width = `${cellPx}px`;
        cellEl.style.height = `${cellPx}px`;
        if (cell) {
          cellEl.classList.add('filled');
          if (piece.isEvent) {
            cellEl.classList.add('color-event');
          } else {
            cellEl.classList.add(`color-${piece.color}`);
          }
        }
        grid.appendChild(cellEl);
      }
    }
    return grid;
  }

  renderStats(state) {
    this.scoreEl.textContent = state.score;
    this.tokensEl.textContent = state.tokensEarned;

    if (state.combo > 1) {
      this.comboBar.classList.remove('hidden');
      this.comboCount.textContent = `x${state.combo}`;
    } else {
      this.comboBar.classList.add('hidden');
    }
  }

  renderAbilities(effects, abilities, mode) {
    this.abilitiesEl.innerHTML = '';
    if (mode !== 'survival') return;

    if (effects.rotation) {
      const btn = document.createElement('button');
      btn.className = 'ability-btn' + (abilities.rotationUsed ? ' used' : '');
      btn.textContent = '🔄 ' + (typeof window !== 'undefined' && window.__t ? window.__t('game.abilityRotate') : 'Rotate');
      btn.disabled = abilities.rotationUsed;
      btn.addEventListener('click', () => this.onAbilityRotate?.());
      this.abilitiesEl.appendChild(btn);
    }

    if (effects.undo) {
      const btn = document.createElement('button');
      btn.className = 'ability-btn' + (abilities.undoUsed ? ' used' : '');
      btn.textContent = '⏪ ' + (typeof window !== 'undefined' && window.__t ? window.__t('game.abilityUndo') : 'Undo');
      btn.disabled = abilities.undoUsed;
      btn.addEventListener('click', () => this.onUndo?.());
      this.abilitiesEl.appendChild(btn);
    }
  }

  renderPuzzleInfo(state, mode) {
    if (mode === 'puzzle') {
      this.puzzleInfo.classList.remove('hidden');
      const tr = typeof window !== 'undefined' && window.__t ? window.__t : null;
      this.puzzleProgress.textContent = tr
        ? tr('game.move', { current: state.puzzleMoveIndex, total: state.puzzleTotalMoves })
        : `${state.puzzleMoveIndex} / ${state.puzzleTotalMoves}`;
    } else {
      this.puzzleInfo.classList.add('hidden');
    }
  }

  setModeLabel(text) {
    this.modeLabel.textContent = text;
  }

  showOverlay(title, message, actions = []) {
    this.overlayTitle.textContent = title;
    this.overlayMessage.textContent = message;
    this.overlayActions.innerHTML = '';
    for (const { label, action, primary } of actions) {
      const btn = document.createElement('button');
      btn.className = primary ? 'btn btn-primary' : 'btn btn-secondary';
      btn.textContent = label;
      btn.addEventListener('click', action);
      this.overlayActions.appendChild(btn);
    }
    this.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
  }

  renderCard(card, options = {}) {
    const t = options.t;
    const el = document.createElement('div');
    el.className = `game-card rarity-${card.rarity}`;
    if (options.selected) el.classList.add('selected');
    if (options.equipped) el.classList.add('equipped');
    el.innerHTML = `
      <div class="card-rarity">${getRarityLabel(card.rarity, t)}</div>
      <div class="card-name">${getCardName(card, t)}</div>
      <div class="card-ovr">OVR ${card.ovr}</div>
      <div class="card-desc">${getCardDesc(card, t)}</div>
    `;
    return el;
  }

  animateClear(callback) {
    setTimeout(callback, 220);
  }
}

export function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screenId}`)?.classList.add('active');
  onScreenChange?.(screenId);
}

let onScreenChange = null;
export function setScreenChangeHandler(fn) {
  onScreenChange = fn;
}

export function renderMenuStats(save, t = (k) => k) {
  const el = document.getElementById('menu-stats');
  el.innerHTML = `
    <div class="menu-stat"><div class="value">${save.basicTokens}</div><div class="label">🪙 ${t('stat.basic')}</div></div>
    <div class="menu-stat"><div class="value">${save.premiumTokens}</div><div class="label">💎 ${t('stat.premium')}</div></div>
    <div class="menu-stat"><div class="value">${save.eventTokens}</div><div class="label">❄️ ${t('stat.event')}</div></div>
    <div class="menu-stat"><div class="value">${save.highScore}</div><div class="label">🏆 ${t('stat.highScore')}</div></div>
    <div class="menu-stat"><div class="value">${save.dailyStreak}</div><div class="label">🔥 ${t('stat.streak')}</div></div>
    <p class="menu-stat-hint">${t('stat.premiumHint')}</p>
  `;
}

export function renderEventBanner(t = (k) => k) {
  const el = document.getElementById('event-banner');
  import('../systems/events.js').then(({ isEventActive }) => {
    if (isEventActive()) {
      el.innerHTML = `<strong>${t('event.winter')}</strong> ${t('event.winterDesc')}`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  });
}
