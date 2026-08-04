export const ACHIEVEMENTS = [
  { id: 'first_game', icon: '🎮', xp: 50 },
  { id: 'score_1000', icon: '⭐', xp: 100 },
  { id: 'score_5000', icon: '🏆', xp: 250 },
  { id: 'daily_7', icon: '🔥', xp: 200 },
  { id: 'pack_10', icon: '📦', xp: 150 },
  { id: 'duel_win', icon: '⚔️', xp: 300 },
  { id: 'legendary', icon: '👑', xp: 500 }
];

const STORAGE_KEY = 'blockblast_achievements';

export function getLocalAchievements() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function unlockLocal(id) {
  const list = getLocalAchievements();
  if (list.includes(id)) return false;
  list.push(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return true;
}

export function mergeAchievements(ids) {
  if (!ids?.length) return getLocalAchievements();
  const list = getLocalAchievements();
  let changed = false;
  for (const id of ids) {
    if (!list.includes(id)) { list.push(id); changed = true; }
  }
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function checkAchievements(save, event, extra = {}) {
  const unlocked = [];

  if (event === 'game_over') {
    if (save.stats.gamesPlayed >= 1 && unlockLocal('first_game')) unlocked.push('first_game');
    if (extra.score >= 1000 && unlockLocal('score_1000')) unlocked.push('score_1000');
    if (extra.score >= 5000 && unlockLocal('score_5000')) unlocked.push('score_5000');
  }
  if (event === 'daily_complete') {
    if (save.dailyStreak >= 7 && unlockLocal('daily_7')) unlocked.push('daily_7');
  }
  if (event === 'pack_open') {
    const opens = (save.stats.packsOpened || 0);
    if (opens >= 10 && unlockLocal('pack_10')) unlocked.push('pack_10');
  }
  if (event === 'duel_win') {
    if (unlockLocal('duel_win')) unlocked.push('duel_win');
  }
  if (event === 'legendary_card') {
    if (unlockLocal('legendary')) unlocked.push('legendary');
  }

  return unlocked;
}
