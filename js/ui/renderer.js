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
    this._activePointerId = null;
    this._isTouch = window.matchMedia('(hover: none)').matches;
    this._iosFixed = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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

  /** iOS Safari: fixed coords need visualViewport offset; Android/desktop use clientX/Y as-is. */
  pointerToFixed(clientX, clientY) {
    if (!this._iosFixed) return { x: clientX, y: clientY };
    const vv = window.visualViewport;
    if (!vv) return { x: clientX, y: clientY };
    return { x: clientX + vv.offsetLeft, y: clientY + vv.offsetTop };
  }

  getBoardMetrics() {
    const rect = this.boardEl.getBoundingClientRect();
    const style = getComputedStyle(this.boardEl);
    const padding = parseFloat(style.paddingLeft) || 6;
    const gap = parseFloat(style.gap) || parseFloat(style.rowGap) || 3;
    const sample = this.boardEl.querySelector('.cell');
    let cellSize;
    if (sample) {
      cellSize = sample.getBoundingClientRect().width;
    } else {
      const inner = Math.min(rect.width, rect.height) - padding * 2;
      cellSize = (inner - gap * (GRID_SIZE - 1)) / GRID_SIZE;
    }
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
    const { x, y } = this.pointerToFixed(clientX, clientY);
    const { rect, padding, gap, cellSize } = this.getBoardMetrics();
    const ghostLeft = x - this.grabOffsetX;
    const ghostTop = y - this.grabOffsetY;
    const boardX = ghostLeft - rect.left - padding;
    const boardY = ghostTop - rect.top - padding;
    const step = cellSize + gap;
    const col = Math.round(boardX / step);
    const row = Math.round(boardY / step);
    // Off-board anchor — prevents preview wrap onto opposite grid cells (BUG-00001)
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
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

    this._onPointerMove = e => {
      if (this._activePointerId != null && e.pointerId !== this._activePointerId) return;
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };
    this._onPointerUp = e => {
      if (this._activePointerId != null && e.pointerId !== this._activePointerId) return;
      handleEnd(e.clientX, e.clientY);
    };
    this._onPointerCancel = () => this.endDrag();
    this._onDragBlur = () => {
      if (this.dragPiece) this.endDrag();
    };
  }

  attachDragListeners() {
    document.addEventListener('pointermove', this._onPointerMove, { passive: false });
    document.addEventListener('pointerup', this._onPointerUp);
    document.addEventListener('pointercancel', this._onPointerCancel);
    window.addEventListener('blur', this._onDragBlur);
    if (this._iosFixed && window.visualViewport) {
      this._onVvChange = () => {
        if (this.pendingMove) {
          const { clientX, clientY } = this.pendingMove;
          this.moveDragGhost(clientX, clientY);
        }
      };
      window.visualViewport.addEventListener('scroll', this._onVvChange);
      window.visualViewport.addEventListener('resize', this._onVvChange);
    }
  }

  cleanupDragListeners() {
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('pointercancel', this._onPointerCancel);
    window.removeEventListener('blur', this._onDragBlur);
    if (this._onVvChange && window.visualViewport) {
      window.visualViewport.removeEventListener('scroll', this._onVvChange);
      window.visualViewport.removeEventListener('resize', this._onVvChange);
      this._onVvChange = null;
    }
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
    document.body.classList.add('dragging-piece');
    this.moveDragGhost(clientX, clientY);
    if (this._activePointerId != null && sourceEl?.setPointerCapture) {
      try { sourceEl.setPointerCapture(this._activePointerId); } catch { /* already captured */ }
    }
    this.attachDragListeners();
  }

  moveDragGhost(clientX, clientY) {
    if (!this.dragGhost) return;
    const { x, y } = this.pointerToFixed(clientX, clientY);
    this.dragGhost.style.left = `${x - this.grabOffsetX}px`;
    this.dragGhost.style.top = `${y - this.grabOffsetY}px`;
  }

  endDrag() {
    this.cleanupDragListeners();
    this.clearPreview();
    this.dragPiece = null;
    if (this.dragSourceEl) {
      if (this._activePointerId != null && this.dragSourceEl.releasePointerCapture) {
        try { this.dragSourceEl.releasePointerCapture(this._activePointerId); } catch { /* ok */ }
      }
      this.dragSourceEl.classList.remove('dragging');
      this.dragSourceEl = null;
    }
    this._activePointerId = null;
    document.body.classList.remove('dragging-piece');
    if (this.dragGhost) {
      this.dragGhost.classList.add('hidden');
      this.dragGhost.innerHTML = '';
      this.dragGhost.style.left = '';
      this.dragGhost.style.top = '';
    }
    this.pendingMove = null;
    this.grabOffsetX = 0;
    this.grabOffsetY = 0;
  }

  showPreview(cells) {
    for (const { row, col, valid } of cells) {
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) continue;
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
          if (data.wall) {
            el.classList.add('wall');
          } else if (data.event) {
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

      el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || this.inputLocked) return;
        e.preventDefault();
        const pointerId = e.pointerId;
        try { el.setPointerCapture(pointerId); } catch { /* ok */ }

        const gridEl = el.querySelector('.piece-grid');
        const gridRect = gridEl?.getBoundingClientRect();
        const grabX = gridRect ? e.clientX - gridRect.left : null;
        const grabY = gridRect ? e.clientY - gridRect.top : null;

        if (this._isTouch) {
          this._activePointerId = pointerId;
          this.startDrag(piece, el, e.clientX, e.clientY, grabX, grabY);
          return;
        }

        const startX = e.clientX;
        const startY = e.clientY;
        let started = false;

        const cleanup = () => {
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onEnd);
        };

        const onMove = (ev) => {
          if (ev.pointerId !== pointerId || started) return;
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
            started = true;
            cleanup();
            this._activePointerId = pointerId;
            this.startDrag(piece, el, ev.clientX, ev.clientY, grabX, grabY);
          }
        };

        const onEnd = (ev) => {
          if (ev.pointerId !== pointerId) return;
          cleanup();
          try { el.releasePointerCapture(pointerId); } catch { /* ok */ }
        };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onEnd);
        el.addEventListener('pointercancel', onEnd);
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
