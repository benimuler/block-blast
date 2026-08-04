import { Router } from 'express';
import dbApi from '../db.js';
import { authMiddleware } from '../middleware.js';

const router = Router();

router.get('/save', authMiddleware, (req, res) => {
  const row = dbApi.getSave(req.user.id);
  res.json({ save: row ? JSON.parse(row.data) : null });
});

router.post('/save', authMiddleware, (req, res) => {
  const { save } = req.body;
  if (!save) return res.status(400).json({ error: 'missing_save' });
  dbApi.upsertSave(req.user.id, JSON.stringify(save));
  res.json({ ok: true });
});

router.get('/achievements', authMiddleware, (req, res) => {
  const rows = dbApi.getAchievements(req.user.id);
  res.json({ achievements: rows.map(r => r.achievement_id) });
});

router.post('/achievements', authMiddleware, (req, res) => {
  const { achievementId } = req.body;
  if (!achievementId) return res.status(400).json({ error: 'missing_id' });
  dbApi.unlockAchievement(req.user.id, achievementId);
  res.json({ ok: true });
});

export default router;
