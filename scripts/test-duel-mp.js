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
  assert(sa.seed === sb.seed, 'both players share mirror seed');

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

async function testSuddenDeath() {
  console.log('\nDuel variant: sudden (stuck)');
  const a = await connectClient('SuddenA');
  const b = await connectClient('SuddenB');

  const foundA = waitFor(a, 'duel_found');
  const foundB = waitFor(b, 'duel_found');
  a.emit('find_duel', { username: 'SuddenA', variant: 'sudden' }, () => {});
  b.emit('find_duel', { username: 'SuddenB', variant: 'sudden' }, () => {});
  const [fa] = await Promise.all([foundA, foundB]);

  a.emit('duel_ready', { roomId: fa.roomId });
  b.emit('duel_ready', { roomId: fa.roomId });
  await Promise.all([waitFor(a, 'duel_start'), waitFor(b, 'duel_start')]);

  const endB = waitFor(b, 'duel_end');
  a.emit('duel_stuck', { roomId: fa.roomId, score: 10 });
  const eb = await endB;

  assert(eb.winner === 'SuddenB', 'opponent wins sudden death when other stuck');
  assert(eb.reason === 'sudden', 'end reason is sudden');

  a.disconnect();
  b.disconnect();
}

async function testForfeit() {
  console.log('\nDuel forfeit');
  const a = await connectClient('ForfeitA');
  const b = await connectClient('ForfeitB');

  a.emit('find_duel', { username: 'ForfeitA', variant: 'blitz' }, () => {});
  b.emit('find_duel', { username: 'ForfeitB', variant: 'blitz' }, () => {});
  const [fa] = await Promise.all([waitFor(a, 'duel_found'), waitFor(b, 'duel_found')]);

  a.emit('duel_ready', { roomId: fa.roomId });
  b.emit('duel_ready', { roomId: fa.roomId });
  await Promise.all([waitFor(a, 'duel_start'), waitFor(b, 'duel_start')]);

  const endB = waitFor(b, 'duel_end');
  a.emit('duel_forfeit', { roomId: fa.roomId });
  const eb = await endB;

  assert(eb.winner === 'ForfeitB', 'remaining player wins on forfeit');
  assert(eb.reason === 'forfeit', 'end reason is forfeit');

  a.disconnect();
  b.disconnect();
}

async function testRejoin() {
  console.log('\nDuel rejoin after disconnect');
  const a = await connectClient('RejoinA');
  const b = await connectClient('RejoinB');

  a.emit('find_duel', { username: 'RejoinA', variant: 'blitz' }, () => {});
  b.emit('find_duel', { username: 'RejoinB', variant: 'blitz' }, () => {});
  const [fa] = await Promise.all([waitFor(a, 'duel_found'), waitFor(b, 'duel_found')]);

  a.emit('duel_ready', { roomId: fa.roomId });
  b.emit('duel_ready', { roomId: fa.roomId });
  await Promise.all([waitFor(a, 'duel_start'), waitFor(b, 'duel_start')]);

  a.emit('duel_score', { roomId: fa.roomId, score: 42 });
  a.disconnect();

  await new Promise(r => setTimeout(r, 300));

  const a2 = await connectClient('RejoinA');
  a2.emit('auth', { username: 'RejoinA', userId: null });

  const rejoinStart = waitFor(a2, 'duel_start');
  const rejoinAck = await new Promise(resolve => {
    a2.emit('rejoin_duel', { roomId: fa.roomId, username: 'RejoinA' }, ack => resolve(ack));
  });
  assert(rejoinAck?.ok === true, 'rejoin ack ok');

  const rs = await rejoinStart;
  assert(rs.rejoin === true, 'rejoin flag on duel_start');
  assert(rs.roomId === fa.roomId, 'rejoin same room');
  assert(typeof rs.duration === 'number' && rs.duration > 0, 'rejoin has remaining duration');

  a2.disconnect();
  b.disconnect();
}

async function testScoreUpdate() {
  console.log('\nDuel live score update');
  const a = await connectClient('ScoreA');
  const b = await connectClient('ScoreB');

  a.emit('find_duel', { username: 'ScoreA', variant: 'blitz' }, () => {});
  b.emit('find_duel', { username: 'ScoreB', variant: 'blitz' }, () => {});
  const [fa] = await Promise.all([waitFor(a, 'duel_found'), waitFor(b, 'duel_found')]);

  a.emit('duel_ready', { roomId: fa.roomId });
  b.emit('duel_ready', { roomId: fa.roomId });
  await Promise.all([waitFor(a, 'duel_start'), waitFor(b, 'duel_start')]);

  const updateB = waitFor(b, 'duel_update');
  a.emit('duel_score', { roomId: fa.roomId, score: 120 });
  const upd = await updateB;
  const scoreA = upd.scores.find(s => s.username === 'ScoreA');
  assert(scoreA?.score === 120, 'opponent receives live score update');

  a.emit('duel_forfeit', { roomId: fa.roomId });
  await waitFor(b, 'duel_end');
  a.disconnect();
  b.disconnect();
}

async function testAttackEvent() {
  console.log('\nDuel attack garbage event');
  const a = await connectClient('AttackA');
  const b = await connectClient('AttackB');

  a.emit('find_duel', { username: 'AttackA', variant: 'attack' }, () => {});
  b.emit('find_duel', { username: 'AttackB', variant: 'attack' }, () => {});
  const [fa] = await Promise.all([waitFor(a, 'duel_found'), waitFor(b, 'duel_found')]);

  a.emit('duel_ready', { roomId: fa.roomId });
  b.emit('duel_ready', { roomId: fa.roomId });
  await Promise.all([waitFor(a, 'duel_start'), waitFor(b, 'duel_start')]);

  const incoming = waitFor(b, 'duel_incoming_attack');
  a.emit('duel_attack', { roomId: fa.roomId, lines: 2 });
  const evt = await incoming;
  assert(evt.rows >= 1 && evt.rows <= 3, 'attack sends garbage rows to opponent');

  a.emit('duel_forfeit', { roomId: fa.roomId });
  await waitFor(b, 'duel_end');
  a.disconnect();
  b.disconnect();
}

async function testDraw() {
  console.log('\nDuel draw (tie score)');
  const a = await connectClient('DrawA');
  const b = await connectClient('DrawB');

  a.emit('find_duel', { username: 'DrawA', variant: 'blitz' }, () => {});
  b.emit('find_duel', { username: 'DrawB', variant: 'blitz' }, () => {});
  const [fa] = await Promise.all([waitFor(a, 'duel_found'), waitFor(b, 'duel_found')]);

  a.emit('duel_ready', { roomId: fa.roomId });
  b.emit('duel_ready', { roomId: fa.roomId });
  await Promise.all([waitFor(a, 'duel_start'), waitFor(b, 'duel_start')]);

  a.emit('duel_finished', { roomId: fa.roomId, score: 75 });
  b.emit('duel_finished', { roomId: fa.roomId, score: 75 });

  const [ea, eb] = await Promise.all([waitFor(a, 'duel_end'), waitFor(b, 'duel_end')]);
  assert(ea.draw === true, 'duel ends in draw');
  assert(eb.draw === true, 'both clients see draw');
  assert(!ea.winner, 'no winner on tie');

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

  try {
    await testSuddenDeath();
  } catch (e) {
    failed++;
    console.error(`  ✗ sudden stuck failed: ${e.message}`);
  }

  try {
    await testForfeit();
  } catch (e) {
    failed++;
    console.error(`  ✗ forfeit failed: ${e.message}`);
  }

  try {
    await testRejoin();
  } catch (e) {
    failed++;
    console.error(`  ✗ rejoin failed: ${e.message}`);
  }

  try {
    await testDraw();
  } catch (e) {
    failed++;
    console.error(`  ✗ draw failed: ${e.message}`);
  }

  try {
    await testAttackEvent();
  } catch (e) {
    failed++;
    console.error(`  ✗ attack event failed: ${e.message}`);
  }

  try {
    await testScoreUpdate();
  } catch (e) {
    failed++;
    console.error(`  ✗ score update failed: ${e.message}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
