import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import tournamentRoutes from './routes/tournament.js';
import { setupMultiplayer, getOnlineCount, getQueueSize } from './socket/multiplayer.js';
import dbApi from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'blockblast-dev-secret-change-in-production')) {
  console.warn('⚠️  WARNING: Set a strong JWT_SECRET in production!');
}

if (IS_PROD) {
  app.set('trust proxy', 1);
}

function getLocalIPs() {
  const ips = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) ips.push(cfg.address);
    }
  }
  return ips;
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, '..')));

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/tournament', tournamentRoutes);

app.get('/api/stats', (_req, res) => {
  res.json({ totalUsers: dbApi.getTotalUsers(), online: getOnlineCount(io) });
});

app.get('/api/mp/status', (_req, res) => {
  res.json({ online: getOnlineCount(io), queue: getQueueSize() });
});

app.get('/api/health', (req, res) => {
  const ips = getLocalIPs();
  let publicUrl = PUBLIC_URL || null;
  if (!publicUrl && req.headers.host) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    publicUrl = `${proto}://${req.headers.host}`;
  }
  res.json({
    status: 'ok',
    version: '3.0.0',
    online: getOnlineCount(io),
    queue: getQueueSize(),
    phoneUrl: publicUrl || (ips.length ? `http://${ips[0]}:${PORT}` : null),
    publicUrl,
    ips
  });
});

app.get('/api/lan', (_req, res) => {
  const ips = getLocalIPs();
  res.json({
    port: PORT,
    ips,
    phoneUrl: ips.length ? `http://${ips[0]}:${PORT}` : null
  });
});

setupMultiplayer(io);

httpServer.listen(PORT, HOST, () => {
  const ips = getLocalIPs();
  console.log('\n========================================');
  console.log('  Block Blast server is running!');
  console.log('========================================');
  console.log(`  PC:     http://localhost:${PORT}`);
  if (ips.length) {
    console.log('  Phone:  (same WiFi network)');
    for (const ip of ips) {
      console.log(`          http://${ip}:${PORT}`);
    }
  } else {
    console.log('  Phone:  connect PC to WiFi, then use PC local IP');
  }
  console.log('========================================\n');
});