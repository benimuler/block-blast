import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import dbApi from '../db.js';
import { JWT_SECRET, authMiddleware } from '../middleware.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'validation_failed' });
  }
  if (dbApi.findByEmail(email)) {
    return res.status(409).json({ error: 'email_exists' });
  }
  if (dbApi.findByUsername(username)) {
    return res.status(409).json({ error: 'username_exists' });
  }

  const id = uuid();
  const hash = await bcrypt.hash(password, 10);
  dbApi.createUser({
    id, username, email: email.toLowerCase(), password_hash: hash,
    display_name: displayName || username, avatar: '🎮', level: 1, xp: 0,
    created_at: new Date().toISOString()
  });

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    user: { id, username, email: email.toLowerCase(), displayName: displayName || username, avatar: '🎮', level: 1, xp: 0 }
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const user = dbApi.getUserWithPassword(email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  dbApi.updateLogin(user.id);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id: user.id, username: user.username, email: user.email,
      displayName: user.display_name, avatar: user.avatar, level: user.level, xp: user.xp
    }
  });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = dbApi.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user });
});

router.put('/profile', authMiddleware, (req, res) => {
  const { displayName, avatar } = req.body;
  dbApi.updateProfile(req.user.id, displayName, avatar);
  const user = dbApi.findById(req.user.id);
  res.json({ user });
});

export default router;
