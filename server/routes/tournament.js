import { Router } from 'express';
import dbApi, { getWeekKey } from '../db.js';
import { authMiddleware, optionalAuth, ah } from '../middleware.js';

const router = Router();

router.get('/leaderboard', optionalAuth, ah(async (req, res) => {
  const weekKey = req.query.week || getWeekKey();
  const leaderboard = await dbApi.getLeaderboard(weekKey);
  let myRank = null;

  if (req.user) {
    myRank = await dbApi.getUserRank(req.user.id, weekKey);
  }

  res.json({ weekKey, leaderboard, myRank });
}));

router.post('/submit', authMiddleware, ah(async (req, res) => {
  const { score } = req.body;
  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'invalid_score' });
  }

  const weekKey = getWeekKey();
  const user = await dbApi.findById(req.user.id);
  await dbApi.upsertTournament(req.user.id, user.username, score, weekKey);
  const rank = await dbApi.getUserRank(req.user.id, weekKey);

  res.json({ ok: true, weekKey, rank });
}));

router.get('/week', (_req, res) => {
  res.json({ weekKey: getWeekKey() });
});

export default router;
