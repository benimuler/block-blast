import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const DB_FILE = join(DATA_DIR, 'db.json');

const defaultDb = {
  users: [],
  saves: {},
  tournament_scores: [],
  duel_results: [],
  achievements: []
};

function loadDb() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
    return structuredClone(defaultDb);
  }
  return JSON.parse(readFileSync(DB_FILE, 'utf8'));
}

function saveDb(db) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const dbApi = {
  createUser(user) {
    const db = loadDb();
    db.users.push(user);
    saveDb(db);
  },

  findByEmail(email) {
    return loadDb().users.find(u => u.email === email.toLowerCase()) || null;
  },

  findByUsername(username) {
    return loadDb().users.find(u => u.username === username) || null;
  },

  findById(id) {
    const u = loadDb().users.find(u => u.id === id);
    if (!u) return null;
    const { password_hash, ...safe } = u;
    return safe;
  },

  updateLogin(id) {
    const db = loadDb();
    const u = db.users.find(u => u.id === id);
    if (u) u.last_login = new Date().toISOString();
    saveDb(db);
  },

  updateProfile(id, displayName, avatar) {
    const db = loadDb();
    const u = db.users.find(u => u.id === id);
    if (u) {
      if (displayName) u.display_name = displayName;
      if (avatar) u.avatar = avatar;
    }
    saveDb(db);
  },

  upsertSave(userId, data) {
    const db = loadDb();
    db.saves[userId] = { data, updated_at: new Date().toISOString() };
    saveDb(db);
  },

  getSave(userId) {
    return loadDb().saves[userId] || null;
  },

  upsertTournament(userId, username, score, weekKey) {
    const db = loadDb();
    const existing = db.tournament_scores.find(t => t.user_id === userId && t.week_key === weekKey);
    if (existing) {
      if (score > existing.score) {
        existing.score = score;
        existing.submitted_at = new Date().toISOString();
      }
    } else {
      db.tournament_scores.push({
        user_id: userId, username, score, week_key: weekKey,
        submitted_at: new Date().toISOString()
      });
    }
    saveDb(db);
  },

  getLeaderboard(weekKey, limit = 100) {
    return loadDb().tournament_scores
      .filter(t => t.week_key === weekKey)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ username, score, submitted_at }) => ({ username, score, submitted_at }));
  },

  getUserRank(userId, weekKey) {
    const board = loadDb().tournament_scores
      .filter(t => t.week_key === weekKey)
      .sort((a, b) => b.score - a.score);
    const userScore = board.find(t => t.user_id === userId)?.score || 0;
    const rank = board.filter(t => t.score > userScore).length + 1;
    return rank;
  },

  unlockAchievement(userId, achievementId) {
    const db = loadDb();
    if (!db.achievements.find(a => a.user_id === userId && a.achievement_id === achievementId)) {
      db.achievements.push({ user_id: userId, achievement_id: achievementId, unlocked_at: new Date().toISOString() });
      saveDb(db);
    }
  },

  getAchievements(userId) {
    return loadDb().achievements.filter(a => a.user_id === userId);
  },

  saveDuel(roomId, winnerId, p1, p2, s1, s2) {
    const db = loadDb();
    db.duel_results.push({
      room_id: roomId, winner_id: winnerId,
      player1_id: p1, player2_id: p2,
      player1_score: s1, player2_score: s2,
      played_at: new Date().toISOString()
    });
    saveDb(db);
  },

  getTotalUsers() {
    return loadDb().users.length;
  },

  getUserWithPassword(email) {
    return loadDb().users.find(u => u.email === email.toLowerCase()) || null;
  }
};

export default dbApi;
