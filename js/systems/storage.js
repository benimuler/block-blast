const STORAGE_KEY = 'blockblast_save';

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export function saveGame(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createDefaultSave() {
  return {
    basicTokens: 100,
    premiumTokens: 0,
    eventTokens: 0,
    score: 0,
    highScore: 0,
    xp: 0,
    level: 1,
    inventory: ['bronze_row', 'bronze_combo'],
    loadout: ['bronze_row'],
    dailyStreak: 0,
    lastDailyDate: null,
    dailyCompleted: false,
    ownedCosmetics: [],
    stats: {
      gamesPlayed: 0,
      linesCleared: 0,
      puzzlesSolved: 0,
      packsOpened: 0,
      duelsWon: 0,
      duelsLost: 0,
      duelsDraw: 0,
      duelsPlayed: 0,
      duelWinStreak: 0,
      bestDuelWinStreak: 0,
      bestDuelScore: 0,
      bestTournamentScore: 0
    },
    records: {
      survival: 0,
      duel: 0,
      tournament: 0
    },
    trophies: []
  };
}

function normalizeSave(save) {
  if (!save.stats) save.stats = {};
  const s = save.stats;
  s.duelsLost = s.duelsLost || 0;
  s.duelsDraw = s.duelsDraw || 0;
  s.duelsPlayed = s.duelsPlayed || 0;
  s.duelWinStreak = s.duelWinStreak || 0;
  s.bestDuelWinStreak = s.bestDuelWinStreak || 0;
  s.bestDuelScore = s.bestDuelScore || 0;
  s.bestTournamentScore = s.bestTournamentScore || 0;
  if (!save.records) {
    save.records = { survival: save.highScore || 0, duel: 0, tournament: 0 };
  }
  save.trophies = save.trophies || [];
  return save;
}

export function getSave() {
  const save = loadSave() || createDefaultSave();
  return normalizeSave(save);
}

export function updateSave(partial) {
  const save = getSave();
  Object.assign(save, partial);
  saveGame(save);
  return save;
}

export function addTokens(amount, type = 'basic') {
  const save = getSave();
  if (type === 'basic') save.basicTokens += amount;
  else if (type === 'premium') save.premiumTokens += amount;
  else if (type === 'event') save.eventTokens += amount;
  saveGame(save);
  return save;
}

export function spendTokens(amount, type = 'basic') {
  const save = getSave();
  const key = type === 'basic' ? 'basicTokens' : type === 'premium' ? 'premiumTokens' : 'eventTokens';
  if (save[key] < amount) return false;
  save[key] -= amount;
  saveGame(save);
  return true;
}

export function addCardToInventory(cardId) {
  const save = getSave();
  if (!save.inventory.includes(cardId)) {
    save.inventory.push(cardId);
    saveGame(save);
  }
  return save;
}

export function addXP(amount) {
  const save = getSave();
  save.xp += amount;
  while (save.xp >= save.level * 100) {
    save.xp -= save.level * 100;
    save.level++;
    save.basicTokens += 25;
  }
  saveGame(save);
  return save;
}

export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function checkDailyStreak() {
  const save = getSave();
  const today = getTodayKey();
  if (save.lastDailyDate && save.lastDailyDate !== today) {
    const last = new Date(save.lastDailyDate);
    const now = new Date(today);
    const diff = (now - last) / (1000 * 60 * 60 * 24);
    if (diff > 1) {
      save.dailyStreak = 0;
    }
    save.dailyCompleted = false;
    saveGame(save);
  }
  return save;
}

export function completeDailyPuzzle() {
  const save = getSave();
  const today = getTodayKey();

  if (save.lastDailyDate !== today) {
    const last = save.lastDailyDate ? new Date(save.lastDailyDate) : null;
    const now = new Date(today);
    if (last) {
      const diff = (now - last) / (1000 * 60 * 60 * 24);
      save.dailyStreak = diff === 1 ? save.dailyStreak + 1 : 1;
    } else {
      save.dailyStreak = 1;
    }
    save.lastDailyDate = today;
  }

  save.dailyCompleted = true;
  save.premiumTokens += 5;
  save.stats.puzzlesSolved++;

  if (save.dailyStreak >= 7 && save.dailyStreak % 7 === 0) {
    save.premiumTokens += 20;
  }

  saveGame(save);
  return save;
}
