// Postgres store (any Postgres, e.g. a hosted free-tier one). Enabled only when DATABASE_URL is set.
// `makePgApi(query)` takes a function (sql, params) => Promise<{rows}> so tests can use an in-process Postgres.
export async function makePgApi(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY, username text UNIQUE NOT NULL, email text UNIQUE NOT NULL,
      password_hash text NOT NULL, display_name text, avatar text,
      level integer DEFAULT 1, xp integer DEFAULT 0, created_at text, last_login text);
    CREATE TABLE IF NOT EXISTS saves (
      user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data text, updated_at text);
    CREATE TABLE IF NOT EXISTS tournament_scores (
      user_id text REFERENCES users(id) ON DELETE CASCADE, username text, score integer,
      week_key text, submitted_at text, PRIMARY KEY (user_id, week_key));
    CREATE TABLE IF NOT EXISTS achievements (
      user_id text REFERENCES users(id) ON DELETE CASCADE, achievement_id text, unlocked_at text,
      PRIMARY KEY (user_id, achievement_id));
    CREATE TABLE IF NOT EXISTS duel_results (
      room_id text, winner_id text, player1_id text, player2_id text,
      player1_score integer, player2_score integer, played_at text);
  `);
  const one = async (sql, p) => (await query(sql, p)).rows[0] || null;
  const now = () => new Date().toISOString();
  const SAFE = 'id, username, email, display_name, avatar, level, xp, created_at, last_login';
  return {
    async createUser(u) {
      await query(`INSERT INTO users (id, username, email, password_hash, display_name, avatar, level, xp, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [u.id, u.username, u.email, u.password_hash, u.display_name, u.avatar, u.level, u.xp, u.created_at]);
    },
    findByEmail: (email) => one('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]),
    findByUsername: (username) => one('SELECT * FROM users WHERE username = $1', [username]),
    findById: (id) => one(`SELECT ${SAFE} FROM users WHERE id = $1`, [id]),
    async updateLogin(id) { await query('UPDATE users SET last_login = $2 WHERE id = $1', [id, now()]); },
    async updateProfile(id, displayName, avatar) {
      await query('UPDATE users SET display_name = COALESCE($2, display_name), avatar = COALESCE($3, avatar) WHERE id = $1',
        [id, displayName || null, avatar || null]);
    },
    async upsertSave(userId, data) {
      await query(`INSERT INTO saves (user_id, data, updated_at) VALUES ($1,$2,$3)
        ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [userId, data, now()]);
    },
    getSave: (userId) => one('SELECT data, updated_at FROM saves WHERE user_id = $1', [userId]),
    async upsertTournament(userId, username, score, weekKey) {
      await query(`INSERT INTO tournament_scores (user_id, username, score, week_key, submitted_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id, week_key) DO UPDATE SET score = EXCLUDED.score, submitted_at = EXCLUDED.submitted_at
        WHERE EXCLUDED.score > tournament_scores.score`, [userId, username, score, weekKey, now()]);
    },
    async getLeaderboard(weekKey, limit = 100) {
      return (await query('SELECT username, score, submitted_at FROM tournament_scores WHERE week_key = $1 ORDER BY score DESC LIMIT $2',
        [weekKey, limit])).rows;
    },
    async getUserRank(userId, weekKey) {
      const mine = await one('SELECT score FROM tournament_scores WHERE user_id = $1 AND week_key = $2', [userId, weekKey]);
      const s = mine ? mine.score : 0;
      const r = await one('SELECT count(*)::int AS n FROM tournament_scores WHERE week_key = $1 AND score > $2', [weekKey, s]);
      return r.n + 1;
    },
    async unlockAchievement(userId, achievementId) {
      await query('INSERT INTO achievements (user_id, achievement_id, unlocked_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [userId, achievementId, now()]);
    },
    async getAchievements(userId) {
      return (await query('SELECT user_id, achievement_id, unlocked_at FROM achievements WHERE user_id = $1', [userId])).rows;
    },
    async saveDuel(roomId, winnerId, p1, p2, s1, s2) {
      await query(`INSERT INTO duel_results (room_id, winner_id, player1_id, player2_id, player1_score, player2_score, played_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [roomId, winnerId, p1, p2, s1, s2, now()]);
    },
    async getTotalUsers() { return (await one('SELECT count(*)::int AS n FROM users')).n; },
    getUserWithPassword: (email) => one('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]),
    async deleteUser(id) {
      // saves, scores and achievements cascade; duel history keeps the other player's row without this id.
      await query(`UPDATE duel_results SET winner_id = CASE WHEN winner_id = $1 THEN NULL ELSE winner_id END,
        player1_id = CASE WHEN player1_id = $1 THEN NULL ELSE player1_id END,
        player2_id = CASE WHEN player2_id = $1 THEN NULL ELSE player2_id END
        WHERE winner_id = $1 OR player1_id = $1 OR player2_id = $1`, [id]);
      const r = await query('DELETE FROM users WHERE id = $1', [id]);
      return (r.affectedRows ?? r.rowCount ?? 0) > 0;
    }
  };
}

export async function createPgApiFromEnv(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: true }, max: 5 });
  return makePgApi((sql, params) => pool.query(sql, params));
}
