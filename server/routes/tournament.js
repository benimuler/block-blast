import { Router } from 'express';
import dbApi, { getWeekKey } from '../db.js';
import { authMiddleware, optionalAuth } from '../middleware.js';

const router = Router();

router.get('/leaderboard', optionalAuth, (req, res) => {
  const weekKey = req.query.week || getWeekKey();
  const leaderboard = dbApi.getLeaderboard(weekKey);
  let myRank = null;

  if (req.user) {
    myRank = dbApi.getUserRank(req.user.id, weekKey);
  }

  res.json({ weekKey, leaderboard, myRank });
});

router.post('/submit', authMiddleware, (req, res) => {
  const { score } = req.body;
  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'invalid_score' });
  }

  const weekKey = getWeekKey();
  const user = dbApi.findById(req.user.id);
  dbApi.upsertTournament(req.user.id, user.username, score, weekKey);
  const rank = dbApi.getUserRank(req.user.id, weekKey);

  res.json({ ok: true, weekKey, rank });
});

router.get('/week', (_req, res) => {
  res.json({ weekKey: getWeekKey() });
});

export default router;
