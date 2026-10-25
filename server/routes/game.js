import { Router } from 'express';
import dbApi from '../db.js';
import { authMiddleware, ah } from '../middleware.js';

const router = Router();

router.get('/save', authMiddleware, ah(async (req, res) => {
  const row = await dbApi.getSave(req.user.id);
  res.json({ save: row ? JSON.parse(row.data) : null });
}));

router.post('/save', authMiddleware, ah(async (req, res) => {
  const { save } = req.body;
  if (!save) return res.status(400).json({ error: 'missing_save' });
  await dbApi.upsertSave(req.user.id, JSON.stringify(save));
  res.json({ ok: true });
}));

router.get('/achievements', authMiddleware, ah(async (req, res) => {
  const rows = await dbApi.getAchievements(req.user.id);
  res.json({ achievements: rows.map(r => r.achievement_id) });
}));

router.post('/achievements', authMiddleware, ah(async (req, res) => {
  const { achievementId } = req.body;
  if (!achievementId) return res.status(400).json({ error: 'missing_id' });
  await dbApi.unlockAchievement(req.user.id, achievementId);
  res.json({ ok: true });
}));

export default router;
