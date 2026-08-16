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
  if (amount <= 0) return getSave();
  const save = getSave();
  if (type === 'basic') save.basicTokens += amount;
  else if (type === 'premium') save.premiumTokens += amount;
  else if (type === 'event') save.eventTokens += amount;
  saveGame(save);
  return save;
}

export function spendTokens(amount, type = 'basic') {
  if (amount <= 0) return false;
  const save = getSave();
  const key = type === 'basic' ? 'basicTokens' : type === 'premium' ? 'premiumTokens' : 'eventTokens';
  if (save[key] < amount) return false;
  save[key] -= amount;
  saveGame(save);
  return true;
}

export function addCardToInventory(cardId) {
  const save = getSave();
  save.inventory.push(cardId);
  saveGame(save);
  return save;
}

export function addXP(amount) {
  if (amount <= 0) return { save: getSave(), leveledUp: false, newLevel: getSave().level };
  const save = getSave();
  const prevLevel = save.level;
  save.xp += amount;
  while (save.xp >= save.level * 100) {
    save.xp -= save.level * 100;
    save.level++;
    save.basicTokens += 25;
  }
  saveGame(save);
  return { save, leveledUp: save.level > prevLevel, newLevel: save.level };
}

export function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(fromKey, toKey) {
  const from = parseLocalDateKey(fromKey);
  const to = parseLocalDateKey(toKey);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function checkDailyStreak() {
  const save = getSave();
  const today = getTodayKey();
  if (save.lastDailyDate && save.lastDailyDate !== today) {
    const diff = daysBetween(save.lastDailyDate, today);
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

  if (save.dailyCompleted && save.lastDailyDate === today) {
    return save;
  }

  if (save.lastDailyDate !== today) {
    if (save.lastDailyDate) {
      const diff = daysBetween(save.lastDailyDate, today);
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
