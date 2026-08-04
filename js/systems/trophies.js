/** Trophy definitions — unlocked ids stored in save.trophies[] */

export const TROPHIES = [
  { id: 'record_500', icon: '🥉', tier: 'bronze' },
  { id: 'record_1000', icon: '🥈', tier: 'silver' },
  { id: 'record_5000', icon: '🥇', tier: 'gold' },
  { id: 'record_10000', icon: '💎', tier: 'legendary' },
  { id: 'duel_first_win', icon: '⚔️', tier: 'bronze' },
  { id: 'duel_wins_5', icon: '🗡️', tier: 'silver' },
  { id: 'duel_wins_25', icon: '🏅', tier: 'gold' },
  { id: 'duel_streak_3', icon: '🔥', tier: 'silver' },
  { id: 'duel_streak_5', icon: '💥', tier: 'gold' },
  { id: 'duel_score_500', icon: '🎯', tier: 'silver' },
  { id: 'duel_score_1000', icon: '🎖️', tier: 'gold' },
  { id: 'games_25', icon: '🎮', tier: 'bronze' },
  { id: 'games_100', icon: '👾', tier: 'gold' },
  { id: 'puzzle_10', icon: '🧩', tier: 'silver' },
  { id: 'puzzle_30', icon: '🌟', tier: 'gold' },
  { id: 'tournament_1000', icon: '🏆', tier: 'gold' },
  { id: 'lines_100', icon: '📊', tier: 'bronze' },
  { id: 'lines_500', icon: '📈', tier: 'gold' },
];

export function getTrophyById(id) {
  return TROPHIES.find(t => t.id === id);
}

export function ensureTrophyData(save) {
  if (!save.stats) save.stats = {};
  const s = save.stats;
  s.duelsWon = s.duelsWon || 0;
  s.duelsLost = s.duelsLost || 0;
  s.duelsDraw = s.duelsDraw || 0;
  s.duelsPlayed = s.duelsPlayed || 0;
  s.duelWinStreak = s.duelWinStreak || 0;
  s.bestDuelWinStreak = s.bestDuelWinStreak || 0;
  s.bestDuelScore = s.bestDuelScore || 0;
  s.bestTournamentScore = s.bestTournamentScore || 0;
  s.linesCleared = s.linesCleared || 0;
  s.gamesPlayed = s.gamesPlayed || 0;
  s.puzzlesSolved = s.puzzlesSolved || 0;

  if (!save.records) {
    save.records = {
      survival: save.highScore || 0,
      duel: s.bestDuelScore,
      tournament: s.bestTournamentScore,
    };
  }
  save.trophies = save.trophies || [];
  return save;
}

function tryUnlock(save, id) {
  ensureTrophyData(save);
  if (save.trophies.includes(id)) return false;
  save.trophies.push(id);
  return true;
}

export function checkTrophies(save, event, extra = {}) {
  ensureTrophyData(save);
  const unlocked = [];
  const s = save.stats;
  const hs = save.highScore || 0;
  const rec = save.records;

  const tryId = (id) => {
    if (tryUnlock(save, id)) unlocked.push(id);
  };

  if (event === 'game_over') {
    rec.survival = Math.max(rec.survival || 0, hs);
    if (hs >= 500) tryId('record_500');
    if (hs >= 1000) tryId('record_1000');
    if (hs >= 5000) tryId('record_5000');
    if (hs >= 10000) tryId('record_10000');
    if (s.gamesPlayed >= 25) tryId('games_25');
    if (s.gamesPlayed >= 100) tryId('games_100');
    if (s.linesCleared >= 100) tryId('lines_100');
    if (s.linesCleared >= 500) tryId('lines_500');
    if (extra.mode === 'tournament' && (s.bestTournamentScore || 0) >= 1000) {
      tryId('tournament_1000');
    }
  }

  if (event === 'duel_end') {
    rec.duel = Math.max(rec.duel || 0, extra.myScore || 0);
    if (extra.won) {
      if (s.duelsWon === 1) tryId('duel_first_win');
      if (s.duelsWon >= 5) tryId('duel_wins_5');
      if (s.duelsWon >= 25) tryId('duel_wins_25');
      if (s.duelWinStreak >= 3) tryId('duel_streak_3');
      if (s.duelWinStreak >= 5) tryId('duel_streak_5');
    }
    if ((s.bestDuelScore || 0) >= 500) tryId('duel_score_500');
    if ((s.bestDuelScore || 0) >= 1000) tryId('duel_score_1000');
  }

  if (event === 'daily_complete') {
    if (s.puzzlesSolved >= 10) tryId('puzzle_10');
    if (s.puzzlesSolved >= 30) tryId('puzzle_30');
  }

  return unlocked;
}

/** Update duel W/L/D stats — call before checkTrophies('duel_end') */
export function recordDuelResult(save, { won, draw, myScore }) {
  ensureTrophyData(save);
  const s = save.stats;
  s.duelsPlayed++;
  if (draw) {
    s.duelsDraw++;
    s.duelWinStreak = 0;
  } else if (won) {
    s.duelsWon++;
    s.duelWinStreak++;
    s.bestDuelWinStreak = Math.max(s.bestDuelWinStreak, s.duelWinStreak);
  } else {
    s.duelsLost++;
    s.duelWinStreak = 0;
  }
  if (myScore > s.bestDuelScore) s.bestDuelScore = myScore;
  save.records.duel = Math.max(save.records.duel || 0, myScore);
  return save;
}

export function getWinRate(save) {
  ensureTrophyData(save);
  const { duelsWon, duelsLost, duelsDraw } = save.stats;
  const total = duelsWon + duelsLost + duelsDraw;
  if (!total) return 0;
  return Math.round((duelsWon / total) * 100);
}
