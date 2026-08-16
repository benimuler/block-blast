/**
 * Headless multiplayer duel smoke test (2 clients, all 5 variants).
 * Run: node scripts/test-duel-mp.js  (server must be on :3001)
 */
import { io } from 'socket.io-client';

const SERVER = process.env.SERVER_URL || 'http://localhost:3001';
const VARIANTS = ['blitz', 'mirror', 'attack', 'shrink', 'sudden'];

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function connectClient(name) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, { transports: ['polling'], timeout: 10000 });
    const timer = setTimeout(() => reject(new Error(`${name} connect timeout`)), 12000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.emit('auth', { username: name, userId: null });
      resolve(socket);
    });
    socket.once('connect_error', e => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function waitFor(socket, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, data => { clearTimeout(t); resolve(data); });
  });
}

async function testVariant(variant) {
  console.log(`\nDuel variant: ${variant}`);
  const a = await connectClient(`TestA_${variant}`);
  const b = await connectClient(`TestB_${variant}`);

  const foundA = waitFor(a, 'duel_found');
  const foundB = waitFor(b, 'duel_found');

  a.emit('find_duel', { username: `TestA_${variant}`, variant }, () => {});
  b.emit('find_duel', { username: `TestB_${variant}`, variant }, () => {});

  const [fa, fb] = await Promise.all([foundA, foundB]);
  assert(fa.roomId === fb.roomId, 'both matched same room');
  assert(fa.variant === variant || fb.variant === variant, `variant is ${variant}`);

  a.emit('duel_ready', { roomId: fa.roomId });
  b.emit('duel_ready', { roomId: fb.roomId });

  const startA = waitFor(a, 'duel_start');
  const startB = waitFor(b, 'duel_start');
  const [sa, sb] = await Promise.all([startA, startB]);

  assert(sa.roomId === fa.roomId, 'player A got duel_start');
  assert(sb.roomId === fb.roomId, 'player B got duel_start');
  assert(sa.variant === variant, 'start payload has correct variant');
  assert(typeof sa.seed === 'number', 'mirror seed present');

  a.emit('duel_finished', { roomId: fa.roomId, score: 100 });
  b.emit('duel_finished', { roomId: fb.roomId, score: 50 });

  const endA = waitFor(a, 'duel_end');
  const endB = waitFor(b, 'duel_end');
  const [ea, eb] = await Promise.all([endA, endB]);

  assert(ea.winner === `TestA_${variant}`, 'winner is higher score');
  assert(Array.isArray(ea.scores) && ea.scores.length === 2, 'end has 2 scores');

  a.disconnect();
  b.disconnect();
}

async function main() {
  console.log(`Multiplayer duel smoke test → ${SERVER}`);
  try {
    const res = await fetch(`${SERVER}/api/health`);
    const health = await res.json();
    assert(health.status === 'ok', 'server health ok');
  } catch (e) {
    console.error('Server not reachable:', e.message);
    process.exit(1);
  }

  for (const v of VARIANTS) {
    try {
      await testVariant(v);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${v} failed: ${e.message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
