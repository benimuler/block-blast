import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import dbApi from '../db.js';
import { JWT_SECRET, authMiddleware, ah } from '../middleware.js';

const router = Router();

router.post('/register', ah(async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'validation_failed' });
  }
  if (await dbApi.findByEmail(email)) {
    return res.status(409).json({ error: 'email_exists' });
  }
  if (await dbApi.findByUsername(username)) {
    return res.status(409).json({ error: 'username_exists' });
  }

  const id = uuid();
  const hash = await bcrypt.hash(password, 10);
  await dbApi.createUser({
    id, username, email: email.toLowerCase(), password_hash: hash,
    display_name: displayName || username, avatar: '🎮', level: 1, xp: 0,
    created_at: new Date().toISOString()
  });

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    user: { id, username, email: email.toLowerCase(), displayName: displayName || username, avatar: '🎮', level: 1, xp: 0 }
  });
}));

router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const user = await dbApi.getUserWithPassword(email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  await dbApi.updateLogin(user.id);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id: user.id, username: user.username, email: user.email,
      displayName: user.display_name, avatar: user.avatar, level: user.level, xp: user.xp
    }
  });
}));

router.get('/me', authMiddleware, ah(async (req, res) => {
  const user = await dbApi.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user });
}));

router.put('/profile', authMiddleware, ah(async (req, res) => {
  const { displayName, avatar } = req.body;
  await dbApi.updateProfile(req.user.id, displayName, avatar);
  const user = await dbApi.findById(req.user.id);
  res.json({ user });
}));

router.delete('/account', authMiddleware, ah(async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'missing_fields' });

  const me = await dbApi.findById(req.user.id);
  if (!me) return res.status(404).json({ error: 'not_found' });
  const user = await dbApi.getUserWithPassword(me.email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  await dbApi.deleteUser(req.user.id);
  res.json({ ok: true });
}));

export default router;
