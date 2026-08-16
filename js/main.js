import { GameEngine } from './game/engine.js';
import {
  Renderer, showScreen, showToast, renderMenuStats, renderEventBanner, setScreenChangeHandler
} from './ui/renderer.js';
import {
  getSave, updateSave, addTokens, spendTokens, addCardToInventory,
  addXP, checkDailyStreak, completeDailyPuzzle, getTodayKey, saveGame
} from './systems/storage.js';
import { getCardById, rollCard, getCardName, getRarityLabel } from './systems/cards.js';
import { getDailyPuzzle } from './systems/puzzles.js';
import { EVENT_SHOP_ITEMS } from './systems/events.js';
import { initI18n, t, setLang, getLang, getLanguages, applyI18nToDOM, onLangChange } from './i18n/index.js';
import {
  register, login, logout, isLoggedIn, getUser, syncSave, loadCloudSave,
  submitTournamentScore, getLeaderboard, getServerStats, unlockAchievement,
  getAchievements
} from './systems/auth.js';
import { MultiplayerClient } from './systems/multiplayer.js';
import { getPlayerName, getServerOrigin, saveServerOrigin, isMobileDevice, testServerConnection, fetchLanUrls, isPhoneOnLocalhost, isWrongPort, isServerV3 } from './systems/network.js';
import { ACHIEVEMENTS, checkAchievements, getLocalAchievements, mergeAchievements } from './systems/achievements.js';
import { TROPHIES, checkTrophies, recordDuelResult, getWinRate } from './systems/trophies.js';
import { loadSettings, getSettings, updateSettings, playSound, shouldShowTutorial, markTutorialSeen } from './systems/settings.js';
import { initAds, showBanner, hideBanner, showInterstitialAfterGame, isNativeApp } from './systems/ads.js';
import { listVariants, getVariant } from './game/duel-modes.js';

class App {
  constructor() {
    initI18n();
    window.__t = t;
    loadSettings();
    this.save = checkDailyStreak();
    this.engine = new GameEngine();
    this.renderer = new Renderer();
    this.mp = new MultiplayerClient();
    this.currentMode = null;
    this.isTournament = false;
    this.isDuel = false;
    this.duelFinished = false;
    this.duelResultShown = false;
    this.duelVariant = 'blitz';
    this.shrinkTimer = null;
    this.duelState = 'idle'; // idle | searching | matched | playing
    this.duelTimer = null;
    this.duelEndTime = 0;
    this.inputLocked = false;
    this.serverOnline = false;

    this.setupRenderer();
    this.setupAuth();
    this.setupMenu();
    this.setupGameControls();
    this.setupInventory();
    this.setupLoadout();
    this.setupPack();
    this.setupEventShop();
    this.setupSettings();
    this.setupMultiplayer();
    this.setupProfile();
    this.setupTutorial();
    this.setupNavigation();
    this.setupAds();

    onLangChange(() => this.onLanguageChange());
    this.checkServer();
    this.refreshMenu();
    applyI18nToDOM();
    this.initMobileAds();

    if (shouldShowTutorial()) this.showTutorial();
  }

  setupAds() {
    setScreenChangeHandler((screenId) => {
      if (!isNativeApp()) return;
      if (screenId === 'game') hideBanner();
      else showBanner();
    });
  }

  async initMobileAds() {
    if (!isNativeApp()) return;
    await initAds();
    showBanner();
  }

  async checkServer() {
    const health = await testServerConnection();
    this.serverOnline = health.ok && isServerV3(health);
    const statusEl = document.getElementById('online-status');
    if (statusEl) {
      statusEl.textContent = this.serverOnline
        ? `🟢 ${t('settings.online')}: ...`
        : t('common.offline');
      statusEl.classList.toggle('online', this.serverOnline);
      if (this.serverOnline) {
        const stats = await getServerStats();
        statusEl.textContent = `🟢 ${t('settings.online')}: ${stats.online} | ${stats.totalUsers} ${t('menu.register').toLowerCase()}`;
      }
    }
  }

  awardXP(amount) {
    const { leveledUp, newLevel } = addXP(amount);
    if (leveledUp) showToast(t('game.levelUp', { level: newLevel }));
  }

  onLanguageChange() {
    applyI18nToDOM();
    this.refreshMenu();
    this.updateUserBadge();
    if (document.getElementById('screen-multiplayer')?.classList.contains('active')) {
      this.renderDuelModePicker();
    }
  }

  updateUserBadge() {
    const user = getUser();
    document.getElementById('user-name').textContent = user?.displayName || user?.username || t('menu.guest');
    document.getElementById('user-avatar').textContent = user?.avatar || '👤';
  }

  refreshMenu() {
    this.save = getSave();
    renderMenuStats(this.save, t);
    renderEventBanner(t);
    this.updateUserBadge();
  }

  setupAuth() {
    let authMode = 'login';
    const form = document.getElementById('auth-form');
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');

    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        authMode = tab.dataset.tab;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === authMode));
        document.querySelectorAll('.register-only').forEach(el => el.classList.toggle('hidden', authMode !== 'register'));
        submitBtn.dataset.i18n = authMode === 'login' ? 'auth.loginBtn' : 'auth.registerBtn';
        submitBtn.textContent = t(authMode === 'login' ? 'auth.loginBtn' : 'auth.registerBtn');
        errorEl.classList.add('hidden');
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('hidden');
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;

      try {
        if (authMode === 'login') {
          const data = await login(email, password);
          showToast(t('auth.success', { name: data.user.displayName }));
        } else {
          const username = document.getElementById('auth-username').value;
          const displayName = document.getElementById('auth-displayName').value;
          const data = await register(username, email, password, displayName);
          showToast(t('auth.success', { name: data.user.displayName }));
        }
        playSound('win');
        showScreen('menu');
        this.refreshMenu();
        await this.syncFromCloud();
      } catch (err) {
        const msg = err.error === 'email_exists' ? t('auth.emailExists')
          : err.error === 'username_exists' ? t('auth.usernameExists')
          : err.error === 'invalid_credentials' ? t('auth.invalidCredentials')
          : t('auth.error');
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
      }
    });

    document.querySelector('.skip-auth')?.addEventListener('click', () => showScreen('menu'));

    document.getElementById('btn-logout')?.addEventListener('click', () => {
      logout();
      showToast(t('menu.logout'));
      this.showProfile();
      this.refreshMenu();
    });

    document.getElementById('btn-login-profile')?.addEventListener('click', () => showScreen('auth'));
  }

  async syncFromCloud() {
    if (!isLoggedIn()) return;
    try {
      const cloud = await loadCloudSave();
      if (!cloud) return;
      const local = getSave();
      const mergeNum = (a, b) => Math.max(a || 0, b || 0);
      const localStats = local.stats || {};
      const cloudStats = cloud.stats || {};
      const merged = {
        ...local,
        ...cloud,
        basicTokens: mergeNum(local.basicTokens, cloud.basicTokens),
        premiumTokens: mergeNum(local.premiumTokens, cloud.premiumTokens),
        eventTokens: mergeNum(local.eventTokens, cloud.eventTokens),
        highScore: mergeNum(local.highScore, cloud.highScore),
        xp: mergeNum(local.xp, cloud.xp),
        level: mergeNum(local.level, cloud.level),
        dailyStreak: mergeNum(local.dailyStreak, cloud.dailyStreak),
        stats: {
          gamesPlayed: mergeNum(localStats.gamesPlayed, cloudStats.gamesPlayed),
          linesCleared: mergeNum(localStats.linesCleared, cloudStats.linesCleared),
          puzzlesSolved: mergeNum(localStats.puzzlesSolved, cloudStats.puzzlesSolved),
          packsOpened: mergeNum(localStats.packsOpened, cloudStats.packsOpened),
          duelsWon: mergeNum(localStats.duelsWon, cloudStats.duelsWon),
          duelsLost: mergeNum(localStats.duelsLost, cloudStats.duelsLost),
          duelsDraw: mergeNum(localStats.duelsDraw, cloudStats.duelsDraw),
          duelsPlayed: mergeNum(localStats.duelsPlayed, cloudStats.duelsPlayed),
          duelWinStreak: mergeNum(localStats.duelWinStreak, cloudStats.duelWinStreak),
          bestDuelWinStreak: mergeNum(localStats.bestDuelWinStreak, cloudStats.bestDuelWinStreak),
          bestDuelScore: mergeNum(localStats.bestDuelScore, cloudStats.bestDuelScore),
          bestTournamentScore: mergeNum(localStats.bestTournamentScore, cloudStats.bestTournamentScore),
        },
        records: {
          survival: mergeNum(local.records?.survival, cloud.records?.survival) || mergeNum(local.highScore, cloud.highScore),
          duel: mergeNum(local.records?.duel, cloud.records?.duel),
          tournament: mergeNum(local.records?.tournament, cloud.records?.tournament),
        },
        trophies: [...new Set([...(local.trophies || []), ...(cloud.trophies || [])])],
        inventory: [...(local.inventory || []), ...(cloud.inventory || [])],
        ownedCosmetics: [...new Set([...(local.ownedCosmetics || []), ...(cloud.ownedCosmetics || [])])],
        loadout: (local.loadout?.length ? local.loadout : cloud.loadout) || local.loadout,
      };
      if (cloud.lastDailyDate && (!local.lastDailyDate || cloud.lastDailyDate >= local.lastDailyDate)) {
        merged.lastDailyDate = cloud.lastDailyDate;
        merged.dailyCompleted = cloud.dailyCompleted ?? local.dailyCompleted;
      }
      saveGame(merged);
      this.save = getSave();
      try {
        const cloudAch = await getAchievements();
        mergeAchievements(cloudAch);
      } catch { /* offline */ }
    } catch { /* offline */ }
  }

  setupRenderer() {
    this.renderer.onPlace = (pieceId, row, col) => {
      if (this.inputLocked) return;
      const placed = this.engine.tryPlace(pieceId, row, col);
      if (placed) {
        playSound(this.engine.combo > 1 ? 'combo' : 'place');
        if (this.isDuel) this.mp.sendScore(this.engine.score);
      }
    };

    this.engine.onPuzzleFail = () => {
      playSound('lose');
      this.renderer.showOverlay(
        t('game.puzzleFail'),
        '',
        [
          { label: t('game.puzzleRetry'), action: () => { this.renderer.hideOverlay(); this.startDaily(); }, primary: true },
          { label: t('game.mainMenu'), action: () => { this.renderer.hideOverlay(); showScreen('menu'); this.refreshMenu(); } }
        ]
      );
    };

    this.renderer.onAbilityRotate = () => {
      const piece = this.engine.pieces.find(p => !p.used);
      if (piece && this.engine.rotatePiece(piece.id)) {
        showToast(t('game.rotate'));
        playSound('click');
        this.updateGameUI();
      }
    };

    this.renderer.onRotate = (pieceId) => {
      if (this.engine.rotatePiece(pieceId)) {
        showToast(t('game.rotate'));
        playSound('click');
        this.updateGameUI();
      }
    };

    this.renderer.onUndo = () => {
      if (this.engine.undo()) {
        showToast(t('game.undo'));
        this.updateGameUI();
      }
    };

    this.engine.onUpdate = () => this.updateGameUI();
    this.engine.onGameOver = () => this.handleGameOver();
    this.engine.onWin = () => this.handlePuzzleWin();
  }

  updateGameUI() {
    this.applyBoardCosmetics();
    this.renderer.renderBoard(this.engine.board);
    this.renderer.renderTray(this.engine.pieces, (piece, row, col) =>
      this.engine.getPreviewCells(piece, row, col)
    );
    this.renderer.renderStats({
      score: this.engine.score,
      tokensEarned: this.engine.tokensEarned,
      combo: this.engine.combo,
      effects: this.engine.effects,
      abilities: this.engine.abilities,
      puzzleMoveIndex: this.engine.puzzleMoveIndex,
      puzzleTotalMoves: this.engine.puzzleTotalMoves
    });
    this.renderer.renderAbilities(this.engine.effects, this.engine.abilities, this.currentMode);
    this.renderer.renderPuzzleInfo({
      puzzleMoveIndex: this.engine.puzzleMoveIndex,
      puzzleTotalMoves: this.engine.puzzleTotalMoves
    }, this.currentMode);

    const progress = document.getElementById('puzzle-progress');
    if (progress) {
      progress.textContent = t('game.move', {
        current: this.engine.puzzleMoveIndex,
        total: this.engine.puzzleTotalMoves
      });
    }

    if (this.isDuel && this.duelState === 'playing') {
      this.mp.saveDuelState(this.engine.exportState());
    }

    if (this.currentMode === 'survival' && !this.engine.gameOver && !this.inputLocked) {
      this.engine.checkSurvivalEnd();
    }
  }

  setupMenu() {
    // Only menu buttons — NOT buttons inside other screens (e.g. tournament)
    document.querySelectorAll('#screen-menu [data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('click');
        const action = btn.dataset.action;
        const map = {
          survival: () => { this.isTournament = false; this.isDuel = false; this.duelState = 'idle'; this.startSurvival(); },
          daily: () => this.startDaily(),
          inventory: () => this.showInventory(),
          loadout: () => this.showLoadout(),
          pack: () => this.showPack(),
          'event-shop': () => this.showEventShop(),
          multiplayer: () => this.showMultiplayer(),
          leaderboard: () => this.showLeaderboard(),
          profile: () => this.showProfile(),
          settings: () => this.showSettings(),
          achievements: () => this.showAchievements(),
        };
        map[action]?.();
      });
    });

    // Tournament button lives inside multiplayer screen — separate handler
    document.getElementById('btn-tournament')?.addEventListener('click', () => {
      playSound('click');
      this.isTournament = true;
      this.isDuel = false;
      this.duelState = 'idle';
      this.startSurvival();
    });
  }

  setupGameControls() {
    document.getElementById('btn-back').addEventListener('click', () => {
      if (this.duelTimer) { clearInterval(this.duelTimer); this.duelTimer = null; }
      this.inputLocked = false;
      this.renderer.inputLocked = false;
      document.body.classList.remove('duel-mode');

      if (this.isDuel) {
        const wasPlaying = this.duelState === 'playing';
        this.isDuel = false;
        this.duelFinished = true;
        this.duelState = 'idle';
        if (wasPlaying && this.mp.roomId) {
          this.mp.forfeitDuel();
        }
        showScreen('multiplayer');
        this.refreshMenu();
        return;
      }

      if (this.currentMode === 'survival' && !this.engine.gameOver) {
        const earned = this.engine.tokensEarned;
        if (earned > 0 || this.engine.eventTokensEarned > 0) {
          addTokens(earned, 'basic');
          if (this.engine.eventTokensEarned > 0) addTokens(this.engine.eventTokensEarned, 'event');
          if (this.engine.score > this.save.highScore) updateSave({ highScore: this.engine.score });
          this.awardXP(Math.floor(this.engine.score / 10));
          showToast(t('game.tokensSaved', { n: earned }));
        }
      }
      this.renderer.hideOverlay();
      showScreen('menu');
      this.refreshMenu();
    });
  }

  startSurvival() {
    this.save = getSave();
    this.currentMode = 'survival';
    this.engine.initSurvival(this.save.loadout);
    if (this.isDuel) {
      this.renderer.setModeLabel(t('game.duel'));
    } else if (this.isTournament) {
      this.renderer.setModeLabel(t('game.tournament'));
    } else {
      this.renderer.setModeLabel(t('game.survival'));
    }
    this.renderer.hideOverlay();
    showScreen('game');
    this.updateGameUI();
  }

  startDaily() {
    this.save = getSave();
    const today = getTodayKey();
    if (this.save.dailyCompleted && this.save.lastDailyDate === today) {
      showToast(t('game.puzzleDone'));
      return;
    }
    this.isTournament = false;
    this.currentMode = 'puzzle';
    this.engine.initPuzzle(getDailyPuzzle(today));
    this.renderer.setModeLabel(t('game.daily'));
    this.renderer.hideOverlay();
    showScreen('game');
    this.updateGameUI();
  }

  async handleGameOver() {
    playSound('lose');
    if (isNativeApp()) hideBanner();

    if (this.isDuel) {
      if (this.duelTimer) { clearInterval(this.duelTimer); this.duelTimer = null; }
      if (this.shrinkTimer) { clearInterval(this.shrinkTimer); this.shrinkTimer = null; }
      this.inputLocked = true;
      this.renderer.inputLocked = true;
      if (!this.duelFinished) {
        this.duelFinished = true;
        const variant = getVariant(this.duelVariant);
        if (variant.sudden) {
          this.mp.reportStuck(this.engine.score);
        } else {
          this.mp.finishDuel(this.engine.score);
        }
      }
      if (!this.duelResultShown) {
        this.renderer.showOverlay(
          t('game.noMoves'),
          `${t('game.score')}: ${this.engine.score} — ${t('multiplayer.waitingForResult')}`,
          []
        );
      }
      showInterstitialAfterGame();
      return;
    }

    const earned = this.engine.tokensEarned;
    const eventEarned = this.engine.eventTokensEarned;
    addTokens(earned, 'basic');
    if (eventEarned > 0) addTokens(eventEarned, 'event');
    this.awardXP(Math.floor(this.engine.score / 10));

    const save = getSave();
    if (this.engine.score > save.highScore) save.highScore = this.engine.score;
    save.stats.gamesPlayed++;
    save.stats.linesCleared = (save.stats.linesCleared || 0) + (this.engine.linesClearedTotal || 0);
    save.records.survival = Math.max(save.records.survival || 0, save.highScore);
    if (this.isTournament) {
      save.stats.bestTournamentScore = Math.max(save.stats.bestTournamentScore || 0, this.engine.score);
      save.records.tournament = Math.max(save.records.tournament || 0, this.engine.score);
    }
    updateSave({ stats: save.stats, records: save.records, highScore: save.highScore });

    const newAch = checkAchievements(save, 'game_over', { score: this.engine.score });
    this.notifyAchievements(newAch);
    const newTrophies = checkTrophies(save, 'game_over', {
      score: this.engine.score,
      mode: this.isTournament ? 'tournament' : 'survival'
    });
    updateSave({ trophies: save.trophies });
    this.notifyTrophies(newTrophies);

    const wasTournament = this.isTournament;
    const actions = [
      {
        label: t('game.playAgain'),
        action: () => {
          this.isDuel = false;
          this.isTournament = wasTournament;
          this.renderer.hideOverlay();
          this.startSurvival();
        },
        primary: true
      },
      { label: t('game.mainMenu'), action: () => { this.isDuel = false; this.isTournament = false; this.renderer.hideOverlay(); showScreen('menu'); this.refreshMenu(); } }
    ];

    if (wasTournament && isLoggedIn() && this.serverOnline) {
      actions.unshift({
        label: t('multiplayer.submitScore'),
        action: async () => {
          try {
            const res = await submitTournamentScore(this.engine.score);
            showToast(t('multiplayer.submitted', { rank: res.rank }));
            playSound('win');
          } catch { showToast(t('common.error')); }
        }
      });
    }

    this.isTournament = false;

    this.renderer.showOverlay(
      t('game.gameOver'),
      `${t('game.score')}: ${this.engine.score} | +${earned}`,
      actions
    );

    showInterstitialAfterGame();
    if (isLoggedIn()) this.syncToCloud();
  }

  handlePuzzleWin() {
    playSound('win');
    const save = completeDailyPuzzle();
    const newAch = checkAchievements(save, 'daily_complete');
    this.notifyAchievements(newAch);
    const newTrophies = checkTrophies(save, 'daily_complete');
    updateSave({ trophies: save.trophies });
    this.notifyTrophies(newTrophies);

    this.renderer.showOverlay(
      t('game.puzzleComplete'),
      `+5 💎 | ${t('stat.streak')}: ${save.dailyStreak}`,
      [{ label: t('game.mainMenu'), action: () => { this.renderer.hideOverlay(); showScreen('menu'); this.refreshMenu(); }, primary: true }]
    );
    if (isLoggedIn()) this.syncToCloud();
  }

  notifyAchievements(ids) {
    for (const id of ids) {
      playSound('achievement');
      showToast(`🎖️ ${t(`ach.${id}`)}`);
      unlockAchievement(id);
    }
  }

  notifyTrophies(ids) {
    for (const id of ids) {
      playSound('achievement');
      showToast(`🏆 ${t(`trophy.${id}`)}`);
    }
    if (ids.length && isLoggedIn()) this.syncToCloud();
  }

  async syncToCloud() {
    try { await syncSave(getSave()); } catch { /* offline */ }
  }

  applyBoardCosmetics() {
    const board = document.getElementById('board');
    if (!board) return;
    const save = getSave();
    board.classList.toggle('skin-frost', save.ownedCosmetics?.includes('skin_frost_board'));
  }

  setupMultiplayer() {
    const statusEl = document.getElementById('duel-status');

    this.mp.onWaiting = () => {
      if (this.duelState !== 'searching') return;
      this.setDuelSearchUI(true);
      statusEl.classList.remove('hidden');
      statusEl.textContent = t('multiplayer.waiting');
    };

    this.mp.onCancelled = (reason) => {
      if (this.duelState === 'playing') return;
      const wasSearching = this.duelState === 'searching' || this.duelState === 'matched';
      this.duelState = 'idle';
      this.resetMultiplayerLobby();
      this.renderer.hideOverlay();
      if (wasSearching) {
        const msg = reason === 'ready_timeout'
          ? t('multiplayer.readyTimeout')
          : t('multiplayer.cancelled');
        showToast(msg);
      }
    };

    // Match found — wait for both players to ready up
    this.mp.onFound = (data) => {
      if (this.duelState !== 'searching' && this.duelState !== 'matched') return;
      this.duelState = 'matched';
      statusEl.textContent = t('multiplayer.waitingReady', { opponent: data.opponent });
      showToast(t('multiplayer.matchFound') + ': ' + data.opponent);
      this.startDuelStartWatchdog(data.roomId);
    };

    // Both players ready — START the game
    this.mp.onStart = (data) => {
      if (data.rejoin) {
        this.handleDuelRejoin(data);
        return;
      }
      if (this.duelState === 'playing' && this.mp.roomId === data.roomId) return;
      this.clearDuelStartWatchdog();
      this.beginDuelGame(data);
    };

    this.mp.onUpdate = (data) => {
      const me = getPlayerName();
      const opponent = data.scores.find(s => s.username !== me);
      if (opponent) document.getElementById('opponent-score').textContent = opponent.score;
    };

    this.mp.onEnd = (data) => {
      if (this.duelResultShown) return;
      this.duelResultShown = true;
      this.duelFinished = true;
      this.endDuelUI(data);
    };

    this.mp.onIncomingAttack = (data) => {
      if (!this.isDuel || this.engine.gameOver) return;
      this.engine.applyGarbageAttack(data?.rows || 1);
      showToast(t('multiplayer.incomingAttack', { rows: data?.rows || 1 }));
      playSound('click');
    };

    this.mp.onOpponentLeft = () => {
      if (!this.isDuel || this.duelResultShown) return;
      if (this.duelTimer) clearInterval(this.duelTimer);
      if (this.shrinkTimer) clearInterval(this.shrinkTimer);
      this.duelTimer = null;
      this.shrinkTimer = null;
      document.body.classList.remove('duel-mode');
      this.inputLocked = true;
      this.renderer.inputLocked = true;

      const me = getPlayerName();
      const myScore = this.engine.score;
      this.duelResultShown = true;
      this.duelFinished = true;
      this.endDuelUI({
        scores: [
          { username: me, score: myScore },
          { username: t('multiplayer.opponent'), score: 0 }
        ],
        winner: me,
        draw: false,
        reason: 'forfeit'
      });
    };

    document.getElementById('btn-find-duel')?.addEventListener('click', () => this.startDuelSearch());
    document.getElementById('btn-cancel-duel')?.addEventListener('click', () => {
      playSound('click');
      this.cancelDuelSearch();
    });
    document.getElementById('btn-copy-url')?.addEventListener('click', () => {
      const url = document.getElementById('mp-phone-url')?.textContent;
      if (url && url !== '—') navigator.clipboard?.writeText(url).then(() => showToast(t('multiplayer.copied')));
    });
    document.getElementById('btn-mp-connect')?.addEventListener('click', () => this.connectPhoneToServer());
    document.getElementById('mp-server-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.connectPhoneToServer();
    });
  }

  async connectPhoneToServer() {
    const input = document.getElementById('mp-server-input');
    const resultEl = document.getElementById('mp-test-result');
    let url = input?.value.trim();
    if (!url) { showToast(t('multiplayer.enterUrl')); return; }
    if (!url.startsWith('http')) url = 'http://' + url;

    resultEl.textContent = t('multiplayer.testing');
    const test = await testServerConnection(url);
    if (!test.ok) {
      resultEl.textContent = t('multiplayer.testFailed', { error: test.error });
      resultEl.className = 'mp-test-result error';
      return;
    }

    saveServerOrigin(test.url);
    this.mp.disconnect();
    document.getElementById('mp-phone-setup')?.classList.add('hidden');

    const ok = await this.mp.connect();
    this.updateMpConnection(ok);
    resultEl.textContent = ok ? t('multiplayer.testOk') : t('multiplayer.verifyFailed', { error: this.mp.lastError });
    resultEl.className = ok ? 'mp-test-result ok' : 'mp-test-result error';
  }

  updateMpConnection(ok) {
    const dot = document.getElementById('mp-dot');
    const text = document.getElementById('mp-connection-text');
    if (!dot || !text) return;

    testServerConnection().then(health => {
      const socketOk = ok ?? this.mp.connected;
      if (!health.ok) {
        dot.className = 'mp-dot offline';
        text.textContent = t('multiplayer.disconnected');
      } else if (!isServerV3(health)) {
        dot.className = 'mp-dot offline';
        text.textContent = t('multiplayer.oldServer');
      } else if (!socketOk) {
        dot.className = 'mp-dot offline';
        text.textContent = t('multiplayer.disconnected');
      } else {
        dot.className = 'mp-dot online';
        text.textContent = t('multiplayer.verified');
      }
    });
  }

  async startDuelSearch() {
    if (this.duelState === 'playing') return;
    playSound('click');
    const statusEl = document.getElementById('duel-status');

    if (isPhoneOnLocalhost()) {
      document.getElementById('mp-phone-setup')?.classList.remove('hidden');
      showToast(t('multiplayer.phoneSetup'));
      return;
    }

    this.duelState = 'searching';
    this.setDuelSearchUI(true);
    statusEl.textContent = t('multiplayer.connecting');
    statusEl.classList.remove('hidden');

    const connected = await this.mp.connect();
    if (!connected) {
      this.duelState = 'idle';
      this.resetMultiplayerLobby();
      this.updateMpConnection(false);
      showToast(t('multiplayer.verifyFailed', { error: this.mp.lastError || 'connect_failed' }));
      return;
    }

    this.updateMpConnection(true);
    statusEl.textContent = t('multiplayer.joiningQueue');

    const health = await testServerConnection();
    if (!health.ok) {
      this.duelState = 'idle';
      this.resetMultiplayerLobby();
      showToast(t('multiplayer.serverUnreachable'));
      return;
    }
    if (!isServerV3(health)) {
      this.duelState = 'idle';
      this.resetMultiplayerLobby();
      showToast(t('multiplayer.oldServer'));
      return;
    }

    const result = await this.mp.findDuel(this.duelVariant);
    if (!result.ok) {
      this.duelState = 'idle';
      this.resetMultiplayerLobby();
      const msg = result.error === 'timeout' || result.error === 'no_ack'
        ? t('multiplayer.oldServer')
        : result.error === 'invalid_username'
          ? t('multiplayer.invalidUsername')
          : t('multiplayer.serverNoResponse');
      showToast(msg);
      return;
    }

    if (result.status === 'matched') {
      this.duelState = 'matched';
      statusEl.textContent = t('multiplayer.waitingReady', { opponent: result.opponent });
      showToast(t('multiplayer.matchFound') + ': ' + result.opponent);
      this.mp.sendReady(result.roomId);
      this.startDuelStartWatchdog(result.roomId);
    } else if (result.status === 'queued') {
      this.mp.onWaiting?.(result);
    }
  }

  startDuelStartWatchdog(roomId) {
    this.clearDuelStartWatchdog();
    this._duelStartWatchdog = setInterval(() => {
      if (this.duelState !== 'matched' || !roomId) {
        this.clearDuelStartWatchdog();
        return;
      }
      this.mp.sendReady(roomId);
      this.mp.syncDuel(roomId);
    }, 2500);
  }

  clearDuelStartWatchdog() {
    if (this._duelStartWatchdog) {
      clearInterval(this._duelStartWatchdog);
      this._duelStartWatchdog = null;
    }
  }

  getDuelModeLabel() {
    const v = getVariant(this.duelVariant);
    return `${t('game.duel')} — ${t(`duel.${v.id}.name`)}`;
  }

  setupDuelVariantHooks(data) {
    if (this.shrinkTimer) clearInterval(this.shrinkTimer);
    this.shrinkTimer = null;

    this.engine.onLineClear = (lines) => {
      if (this.isDuel && getVariant(this.duelVariant).attack) {
        this.mp.sendAttack(lines);
      }
    };

    const interval = data?.shrinkIntervalMs;
    if (interval && getVariant(this.duelVariant).shrink) {
      this.shrinkTimer = setInterval(() => {
        if (!this.isDuel || this.engine.gameOver) return;
        this.engine.applyShrinkStep();
        showToast(t('multiplayer.arenaShrink'));
      }, interval);
    }
  }

  renderDuelModePicker() {
    const el = document.getElementById('duel-mode-picker');
    if (!el) return;
    el.innerHTML = '';
    for (const v of listVariants()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'duel-mode-btn' + (this.duelVariant === v.id ? ' selected' : '');
      btn.innerHTML = `<span class="duel-mode-icon">${v.icon}</span><span class="duel-mode-name">${t(`duel.${v.id}.name`)}</span><span class="duel-mode-desc">${t(`duel.${v.id}.desc`)}</span>`;
      btn.addEventListener('click', () => {
        playSound('click');
        this.duelVariant = v.id;
        this.mp.selectedVariant = v.id;
        this.renderDuelModePicker();
      });
      el.appendChild(btn);
    }
  }

  handleDuelRejoin(data) {
    this.clearDuelStartWatchdog();
    this.duelEndTime = Date.now() + data.duration;
    this.mp.roomId = data.roomId;
    this.duelVariant = data.variant || 'blitz';
    this.currentMode = 'survival';
    this.duelState = 'playing';
    this.isDuel = true;
    this.duelFinished = false;
    this.duelResultShown = false;
    this.isTournament = false;
    this.inputLocked = false;
    this.renderer.inputLocked = false;
    this.mp.markDuelActive();
    document.body.classList.add('duel-mode');
    document.querySelectorAll('.duel-only').forEach(el => el.classList.remove('hidden'));
    document.getElementById('duel-timer')?.classList.remove('hidden');

    const saved = this.mp.loadDuelState();
    if (saved) {
      showScreen('game');
      this.engine.restoreState(saved);
      this.renderer.setModeLabel(this.getDuelModeLabel());
      this.setupDuelVariantHooks(data);
      this.startDuelTimer();
      this.updateGameUI();
      if (saved.gameOver) {
        this.inputLocked = true;
        this.renderer.inputLocked = true;
        this.duelFinished = true;
        this.renderer.showOverlay(
          t('game.noMoves'),
          `${t('game.score')}: ${this.engine.score} — ${t('multiplayer.waitingForResult')}`,
          []
        );
      }
      showToast(t('multiplayer.reconnected'));
      return;
    }

    // Session cleared — start fresh board but skip countdown (mid-duel reconnect)
    this.beginDuelGame(data, { skipCountdown: true, rejoin: true });
    showToast(t('multiplayer.reconnected'));
  }

  beginDuelGame(data, options = {}) {
    this.clearDuelStartWatchdog();
    this.duelState = 'playing';
    this.resetMultiplayerLobby();
    this.duelFinished = false;
    this.duelResultShown = false;
    this.isDuel = true;
    this.isTournament = false;
    this.duelVariant = data.variant || 'blitz';
    this.inputLocked = true;
    this.renderer.inputLocked = true;
    this.mp.roomId = data.roomId;
    this.mp.markDuelActive();
    document.body.classList.add('duel-mode');
    this.duelEndTime = Date.now() + data.duration;

    if (!options.rejoin) {
      showToast(`${t('multiplayer.matchFound')}: ${data.opponent}`);
      playSound('win');
    }

    const oppScoreEl = document.getElementById('opponent-score');
    if (oppScoreEl) oppScoreEl.textContent = '0';
    document.querySelectorAll('.duel-only').forEach(el => el.classList.remove('hidden'));
    document.getElementById('duel-timer')?.classList.remove('hidden');

    showScreen('game');
    this.save = getSave();
    this.currentMode = 'survival';
    this.engine.initDuel(this.save.loadout, { variant: this.duelVariant, seed: data.seed });
    this.setupDuelVariantHooks(data);
    this.renderer.setModeLabel(this.getDuelModeLabel());

    if (options.skipCountdown) {
      this.inputLocked = false;
      this.renderer.inputLocked = false;
      this.renderer.hideOverlay();
      this.startDuelTimer();
      requestAnimationFrame(() => this.updateGameUI());
      return;
    }

    const variant = getVariant(this.duelVariant);
    let count = 3;
    const endAt = Date.now() + count * 800;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 800));
      if (left > 0) {
        this.renderer.showOverlay(t(`duel.${variant.id}.name`), String(left), []);
        setTimeout(tick, 120);
      } else {
        this.inputLocked = false;
        this.renderer.inputLocked = false;
        this.renderer.hideOverlay();
        this.startDuelTimer();
        requestAnimationFrame(() => this.updateGameUI());
      }
    };
    tick();
  }

  checkWrongPort() {
    const el = document.getElementById('mp-wrong-port');
    if (!el) return;
    if (isWrongPort()) {
      const correctUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
      el.innerHTML = `${t('multiplayer.wrongPort', { url: correctUrl })} <a href="${correctUrl}" class="mp-wrong-port-link">${correctUrl}</a>`;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  endDuelUI(data) {
    if (this.duelTimer) clearInterval(this.duelTimer);
    if (this.shrinkTimer) clearInterval(this.shrinkTimer);
    this.duelTimer = null;
    this.shrinkTimer = null;
    document.body.classList.remove('duel-mode');
    this.isDuel = false;
    this.duelState = 'idle';
    this.mp.clearDuelSession();
    this.renderer.hideOverlay();
    document.getElementById('duel-timer')?.classList.add('hidden');
    document.querySelectorAll('.duel-only').forEach(el => el.classList.add('hidden'));

    const me = getPlayerName();
    const myScore = data.scores.find(s => s.username === me)?.score ?? this.engine.score;
    const oppEntry = data.scores.find(s => s.username !== me);
    const oppScore = oppEntry?.score ?? 0;
    const won = data.winner === me || (!data.draw && myScore > oppScore && data.reason === 'forfeit');
    const draw = !!data.draw;

    let save = getSave();
    recordDuelResult(save, { won, draw, myScore });
    updateSave({ stats: save.stats, records: save.records });

    const newAch = won ? checkAchievements(save, 'duel_win') : [];
    if (newAch.length) this.notifyAchievements(newAch);

    const newTrophies = checkTrophies(save, 'duel_end', { won, draw, myScore });
    updateSave({ trophies: save.trophies });
    this.notifyTrophies(newTrophies);

    const scoresEl = document.getElementById('duel-scores');
    if (scoresEl) {
      scoresEl.classList.remove('hidden');
      scoresEl.innerHTML = data.scores.map(s =>
        `<div class="duel-score-row"><span>${s.username}</span><span>${s.score}</span></div>`
      ).join('');
    }

    const reasonKey = data.reason && data.reason !== 'normal' ? `multiplayer.end.${data.reason}` : null;
    const subtitle = reasonKey && t(reasonKey) !== reasonKey ? t(reasonKey) : `${t('game.score')}: ${myScore}`;

    this.renderer.showOverlay(
      draw ? t('multiplayer.draw') : won ? t('multiplayer.win') : t('multiplayer.lose'),
      subtitle,
      [{ label: t('multiplayer.backToLobby'), action: () => { this.renderer.hideOverlay(); this.showMultiplayer(); }, primary: true }]
    );
  }

  startDuelTimer() {
    const el = document.getElementById('duel-timer');
    if (this.duelTimer) clearInterval(this.duelTimer);
    this.duelTimer = setInterval(() => {
      const left = Math.max(0, this.duelEndTime - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
      if (left <= 0) {
        clearInterval(this.duelTimer);
        this.duelTimer = null;
        this.inputLocked = true;
        this.renderer.inputLocked = true;
        if (!this.duelFinished) {
          this.duelFinished = true;
          this.mp.finishDuel(this.engine.score);
        }
        if (!this.engine.gameOver) {
          this.engine.gameOver = true;
          this.handleGameOver();
        }
      }
    }, 500);
  }

  showMultiplayer() {
    this.cancelDuelSearch();
    document.getElementById('duel-scores')?.classList.add('hidden');
    showScreen('multiplayer');
    applyI18nToDOM();
    this.renderDuelModePicker();
    this.checkWrongPort();

    const isMobile = isMobileDevice();
    const phoneSetup = document.getElementById('mp-phone-setup');
    const shareBox = document.getElementById('mp-share-box');

    if (isMobile) {
      shareBox?.classList.add('hidden');
      // Show setup if not connected to a real LAN server
      const onLocalhost = isPhoneOnLocalhost();
      const saved = localStorage.getItem('blockblast_server');
      if (onLocalhost || !saved) {
        phoneSetup?.classList.remove('hidden');
        const input = document.getElementById('mp-server-input');
        if (input && !input.value) input.placeholder = 'http://192.168.1.212:3001';
      } else {
        phoneSetup?.classList.add('hidden');
      }
    } else {
      phoneSetup?.classList.add('hidden');
      shareBox?.classList.remove('hidden');
      fetchLanUrls().then(data => {
        const phoneUrlEl = document.getElementById('mp-phone-url');
        if (phoneUrlEl) phoneUrlEl.textContent = data?.phoneUrl || t('multiplayer.restartServer');
      });
    }

    this.mp.connect().then(ok => {
      this.updateMpConnection(ok);
      if (!ok && isMobile) {
        phoneSetup?.classList.remove('hidden');
        const resultEl = document.getElementById('mp-test-result');
        if (resultEl) {
          resultEl.textContent = t('multiplayer.verifyFailed', { error: this.mp.lastError || 'connect_failed' });
          resultEl.className = 'mp-test-result error';
        }
      }
    });
  }

  async showLeaderboard() {
    showScreen('leaderboard');
    const listEl = document.getElementById('leaderboard-list');
    const rankEl = document.getElementById('leaderboard-my-rank');
    rankEl.textContent = '';
    listEl.innerHTML = `<p style="text-align:center;color:var(--text-muted)">${t('common.loading')}</p>`;

    try {
      const data = await getLeaderboard();
      document.getElementById('leaderboard-week').textContent = t('leaderboard.week', { week: data.weekKey });
      if (data.myRank) {
        document.getElementById('leaderboard-my-rank').textContent = t('leaderboard.yourRank', { rank: data.myRank });
      }

      if (!data.leaderboard.length) {
        listEl.innerHTML = `<p style="text-align:center;color:var(--text-muted)">${t('leaderboard.empty')}</p>`;
        return;
      }

      listEl.innerHTML = data.leaderboard.map((row, i) => `
        <div class="leaderboard-row ${i < 3 ? 'top3' : ''}">
          <span class="lb-rank ${i === 0 ? 'gold' : ''}">#${i + 1}</span>
          <span class="lb-name">${row.username}</span>
          <span class="lb-score">${row.score.toLocaleString()}</span>
        </div>
      `).join('');
    } catch {
      listEl.innerHTML = `<p style="text-align:center;color:var(--text-muted)">${t('common.offline')}</p>`;
    }
  }

  showProfile() {
    const user = getUser();
    const save = getSave();

    document.getElementById('profile-card').innerHTML = user ? `
      <div class="profile-avatar">${user.avatar || '🎮'}</div>
      <div class="profile-name">${user.displayName || user.username}</div>
      <div class="profile-level">${t('profile.level')} ${save.level}</div>
    ` : `
      <div class="profile-avatar">👤</div>
      <div class="profile-name">${t('menu.guest')}</div>
      <div class="profile-level">${t('profile.level')} ${save.level}</div>
    `;

    document.getElementById('profile-stats').innerHTML = `
      <div class="profile-stat"><div class="val">${save.stats.gamesPlayed}</div><div class="lbl">${t('profile.gamesPlayed')}</div></div>
      <div class="profile-stat"><div class="val">${save.records.survival || save.highScore}</div><div class="lbl">${t('trophy.recordSurvival')}</div></div>
      <div class="profile-stat"><div class="val">${save.records.duel || 0}</div><div class="lbl">${t('trophy.recordDuel')}</div></div>
      <div class="profile-stat"><div class="val">${save.records.tournament || 0}</div><div class="lbl">${t('trophy.recordTournament')}</div></div>
      <div class="profile-stat win"><div class="val">${save.stats.duelsWon || 0}</div><div class="lbl">${t('profile.duelsWon')}</div></div>
      <div class="profile-stat loss"><div class="val">${save.stats.duelsLost || 0}</div><div class="lbl">${t('profile.duelsLost')}</div></div>
      <div class="profile-stat draw"><div class="val">${save.stats.duelsDraw || 0}</div><div class="lbl">${t('profile.duelsDraw')}</div></div>
      <div class="profile-stat"><div class="val">${getWinRate(save)}%</div><div class="lbl">${t('profile.winRate')}</div></div>
      <div class="profile-stat"><div class="val">${save.stats.bestDuelWinStreak || 0}</div><div class="lbl">${t('profile.bestStreak')}</div></div>
    `;

    const unlocked = new Set(save.trophies || []);
    document.getElementById('profile-trophies').innerHTML = `
      <h3 class="trophy-title">${t('trophy.title')} (${unlocked.size}/${TROPHIES.length})</h3>
      <div class="trophy-grid">
        ${TROPHIES.map(tr => {
          const has = unlocked.has(tr.id);
          return `<div class="trophy-item ${has ? 'unlocked' : 'locked'} tier-${tr.tier}" title="${t(`trophy.${tr.id}.desc`)}">
            <span class="trophy-icon">${has ? tr.icon : '🔒'}</span>
            <span class="trophy-name">${t(`trophy.${tr.id}`)}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="trophy-storage-hint">${isLoggedIn() ? t('trophy.cloudSaved') : t('trophy.localSaved')}</p>
    `;

    document.getElementById('btn-sync').classList.toggle('hidden', !isLoggedIn());
    document.getElementById('btn-logout').classList.toggle('hidden', !isLoggedIn());
    document.getElementById('btn-login-profile').classList.toggle('hidden', isLoggedIn());

    document.getElementById('btn-sync').onclick = async () => {
      await this.syncToCloud();
      showToast(t('profile.synced'));
    };

    showScreen('profile');
  }

  setupProfile() { /* in showProfile */ }

  showSettings() {
    const settings = getSettings();
    const langSelect = document.getElementById('setting-language');
    langSelect.innerHTML = getLanguages().map(l =>
      `<option value="${l.code}" ${l.code === getLang() ? 'selected' : ''}>${l.flag} ${l.name}</option>`
    ).join('');

    document.getElementById('setting-theme').value = settings.theme;
    this.updateToggle('setting-sound', settings.sound);
    this.updateToggle('setting-music', settings.music);

    const serverInput = document.getElementById('setting-server-url');
    if (serverInput) {
      serverInput.value = localStorage.getItem('blockblast_server') || '';
      serverInput.placeholder = getServerOrigin();
    }

    getServerStats().then(s => {
      document.getElementById('settings-online').textContent =
        `🟢 ${t('settings.online')}: ${s.online}`;
    }).catch(() => {});

    showScreen('settings');
  }

  updateToggle(id, val) {
    const btn = document.getElementById(id);
    btn.textContent = val ? t('common.on') : t('common.off');
    btn.classList.toggle('off', !val);
  }

  setupSettings() {
    document.getElementById('setting-language')?.addEventListener('change', e => {
      setLang(e.target.value);
      playSound('click');
    });

    ['sound', 'music'].forEach(key => {
      document.getElementById(`setting-${key}`)?.addEventListener('click', () => {
        const settings = getSettings();
        updateSettings({ [key]: !settings[key] });
        this.updateToggle(`setting-${key}`, !settings[key]);
        playSound('click');
      });
    });

    document.getElementById('setting-theme')?.addEventListener('change', e => {
      updateSettings({ theme: e.target.value });
    });

    document.getElementById('btn-save-server')?.addEventListener('click', () => {
      const val = document.getElementById('setting-server-url')?.value.trim();
      if (val) {
        saveServerOrigin(val);
        showToast(t('settings.serverSaved'));
      } else {
        localStorage.removeItem('blockblast_server');
        showToast(t('settings.serverReset'));
      }
      this.mp.disconnect();
      playSound('click');
    });

    document.getElementById('btn-show-tutorial')?.addEventListener('click', () => this.showTutorial());
  }

  showAchievements() {
    const unlocked = getLocalAchievements();
    const list = document.getElementById('achievements-list');
    list.innerHTML = ACHIEVEMENTS.map(a => {
      const isUnlocked = unlocked.includes(a.id);
      return `
        <div class="achievement-item ${isUnlocked ? '' : 'locked'}">
          <div class="achievement-icon">${a.icon}</div>
          <div class="achievement-info">
            <h4>${t(`ach.${a.id}`)}</h4>
            <p>${t(`ach.${a.id}.desc`)}</p>
          </div>
        </div>`;
    }).join('');
    showScreen('achievements');
  }

  setupTutorial() {
    document.getElementById('btn-tutorial-close')?.addEventListener('click', () => {
      document.getElementById('tutorial-modal').classList.add('hidden');
      markTutorialSeen();
    });
  }

  showTutorial() {
    document.getElementById('tutorial-modal').classList.remove('hidden');
  }

  setupNavigation() {
    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('click');
        this.cancelDuelSearch();
        showScreen('menu');
        this.refreshMenu();
      });
    });

    document.getElementById('user-badge')?.addEventListener('click', () => {
      playSound('click');
      this.showProfile();
    });

    document.getElementById('tutorial-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'tutorial-modal') {
        document.getElementById('tutorial-modal').classList.add('hidden');
        markTutorialSeen();
      }
    });
  }

  cancelDuelSearch() {
    this.clearDuelStartWatchdog();
    if (this.duelState === 'searching' || this.duelState === 'matched') {
      this.duelState = 'idle';
      this.mp.cancelDuel();
      this.resetMultiplayerLobby();
      this.renderer.hideOverlay();
    }
  }

  resetMultiplayerLobby() {
    const mpCard = document.getElementById('mp-duel-card');
    mpCard?.classList.remove('mp-searching');
    document.getElementById('duel-status')?.classList.add('hidden');
    document.getElementById('btn-find-duel')?.removeAttribute('disabled');
  }

  setDuelSearchUI(searching) {
    const mpCard = document.getElementById('mp-duel-card');
    if (searching) {
      mpCard?.classList.add('mp-searching');
      document.getElementById('duel-status')?.classList.remove('hidden');
      document.getElementById('btn-find-duel')?.setAttribute('disabled', 'true');
    } else {
      this.resetMultiplayerLobby();
    }
  }

  setupInventory() {
    /* back navigation handled in setupNavigation */
  }

  showInventory() {
    this.save = getSave();
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';
    const counts = {};
    for (const id of this.save.inventory) counts[id] = (counts[id] || 0) + 1;

    for (const [id, count] of Object.entries(counts)) {
      const card = getCardById(id);
      if (!card) continue;
      const el = this.renderer.renderCard(card, { t });
      if (count > 1) {
        const badge = document.createElement('div');
        badge.style.cssText = 'position:absolute;top:8px;left:8px;background:var(--accent);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;';
        badge.textContent = count;
        el.style.position = 'relative';
        el.appendChild(badge);
      }
      grid.appendChild(el);
    }
    if (!grid.children.length) {
      grid.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1">${t('inventory.empty')}</p>`;
    }
    showScreen('inventory');
  }

  showLoadout() {
    this.save = getSave();
    const slotsEl = document.getElementById('loadout-slots');
    const availEl = document.getElementById('loadout-available');
    slotsEl.innerHTML = '';
    availEl.innerHTML = '';
    const loadout = [...this.save.loadout];

    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'loadout-slot' + (loadout[i] ? ' filled' : '');
      if (loadout[i]) {
        const cardEl = this.renderer.renderCard(getCardById(loadout[i]), { equipped: true, t });
        cardEl.addEventListener('click', () => { loadout.splice(i, 1); updateSave({ loadout }); this.showLoadout(); });
        slot.appendChild(cardEl);
      } else {
        slot.textContent = t('loadout.slot', { n: i + 1 });
      }
      slotsEl.appendChild(slot);
    }

    for (const id of [...new Set(this.save.inventory)]) {
      const card = getCardById(id);
      if (!card) continue;
      const el = this.renderer.renderCard(card, { selected: loadout.includes(id), t });
      el.addEventListener('click', () => {
        if (loadout.includes(id)) loadout.splice(loadout.indexOf(id), 1);
        else if (loadout.length < 3) loadout.push(id);
        else { showToast(t('loadout.maxCards')); return; }
        updateSave({ loadout });
        this.showLoadout();
      });
      availEl.appendChild(el);
    }
    showScreen('loadout');
  }

  setupLoadout() {}

  showPack() {
    this.save = getSave();
    document.getElementById('pack-result').classList.add('hidden');
    const packCard = document.getElementById('pack-card');
    packCard.classList.add('hidden');
    packCard.classList.remove('flipped');
    const btn = document.getElementById('btn-open-pack');
    btn.disabled = this.save.basicTokens < 50;
    btn.textContent = this.save.basicTokens < 50 ? t('pack.notEnough') : t('pack.open');
    showScreen('pack');
  }

  setupPack() {
    document.getElementById('btn-open-pack').addEventListener('click', () => {
      if (!spendTokens(50, 'basic')) { showToast(t('pack.notEnough')); return; }

      const card = rollCard();
      addCardToInventory(card.id);
      const save = getSave();
      save.stats.packsOpened = (save.stats.packsOpened || 0) + 1;
      updateSave({ stats: save.stats });

      const newAch = checkAchievements(save, 'pack_open');
      const legendaryAch = card.rarity === 'legendary'
        ? checkAchievements(save, 'legendary_card')
        : [];
      this.notifyAchievements([...newAch, ...legendaryAch]);

      playSound('win');
      const packCard = document.getElementById('pack-card');
      packCard.classList.remove('hidden');
      packCard.querySelector('.pack-card-back').innerHTML = `
        <div class="card-rarity">${getRarityLabel(card.rarity, t)}</div>
        <div class="card-name" style="font-size:1.1rem;margin:8px 0">${getCardName(card, t)}</div>
        <div class="card-ovr">OVR ${card.ovr}</div>`;
      setTimeout(() => packCard.classList.add('flipped'), 300);

      const resultEl = document.getElementById('pack-result');
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = '';
      resultEl.appendChild(this.renderer.renderCard(card, { t }));
      showToast(t('pack.received', { name: getCardName(card, t) }));
      this.refreshMenu();
      document.getElementById('btn-open-pack').disabled = getSave().basicTokens < 50;
      if (isLoggedIn()) this.syncToCloud();
    });
  }

  showEventShop() {
    this.save = getSave();
    document.getElementById('event-token-balance').textContent = this.save.eventTokens;
    const grid = document.getElementById('event-shop-items');
    grid.innerHTML = '';

    for (const item of EVENT_SHOP_ITEMS) {
      const owned = this.save.ownedCosmetics.includes(item.id) ||
        (item.type === 'card' && this.save.inventory.includes(item.cardId));
      const itemName = t(item.nameKey);
      const itemDesc = t(item.descKey);
      const el = document.createElement('div');
      el.className = 'shop-item' + (owned ? ' owned' : '');
      el.innerHTML = `
        <div class="shop-item-info"><h3>${itemName}</h3><p>${itemDesc}</p></div>
        <button class="btn btn-secondary" ${owned ? 'disabled' : ''}>${owned ? t('shop.owned') : `${item.cost} ❄️`}</button>`;
      if (!owned) {
        el.querySelector('button').addEventListener('click', () => {
          if (!spendTokens(item.cost, 'event')) { showToast(t('shop.notEnough')); return; }
          if (item.type === 'card') addCardToInventory(item.cardId);
          else { const s = getSave(); s.ownedCosmetics.push(item.id); updateSave({ ownedCosmetics: s.ownedCosmetics }); }
          showToast(t('shop.purchased', { name: itemName }));
          this.showEventShop();
          this.refreshMenu();
        });
      }
      grid.appendChild(el);
    }
    showScreen('event-shop');
  }

  setupEventShop() {}
}

document.addEventListener('DOMContentLoaded', () => new App());
