/**
 * Bug-hunt agent loop — runs until 01:00 IDT OR cumulativeFixed >= 10,000.
 * Each failure from explore/tests must be fixed + test added + registered.
 *
 * Run: node scripts/bug-hunt-loop.js
 * Cloud agent: follow .cursor/BUG-HUNT-AGENT.md and call this between fix cycles.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import {
  loadRegistry, saveRegistry, shouldStop, getIdtNow, msUntilStop, TARGET_FIXES
} from './bug-registry.js';

const TARGET_HOUR = parseInt(process.env.LOOP_UNTIL_HOUR || '1', 10);
const TARGET_MINUTE = parseInt(process.env.LOOP_UNTIL_MINUTE || '0', 10);
const REPORT_PATH = 'data/bug-hunt-status.json';

function run(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...env }
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

function writeStatus(reg, batch, phase, extra = {}) {
  mkdirSync('data', { recursive: true });
  const status = {
    at: new Date().toISOString(),
    idt: getIdtNow().toISOString(),
    batch,
    phase,
    cumulativeFixed: reg.cumulativeFixed,
    target: reg.target,
    remainingFixes: Math.max(0, reg.target - reg.cumulativeFixed),
    msUntilStop: msUntilStop(TARGET_HOUR, TARGET_MINUTE),
    stopAt: `${TARGET_HOUR}:${String(TARGET_MINUTE).padStart(2, '0')} IDT`,
    ...extra
  };
  writeFileSync(REPORT_PATH, JSON.stringify(status, null, 2));
  return status;
}

async function ensureServer() {
  try {
    const res = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) return true;
  } catch { /* start server */ }

  console.log('Starting server on :3001...');
  spawn('npm', ['start'], { stdio: 'ignore', shell: true, detached: true });
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch { /* retry */ }
  }
  return false;
}

let batch = 0;
const reg = loadRegistry();
if (!reg.sessionStarted) {
  reg.sessionStarted = new Date().toISOString();
  saveRegistry(reg);
}

console.log(`\n🐛 Bug Hunt Agent Loop`);
console.log(`   Target: ${TARGET_FIXES} cumulative fixes (current: ${reg.cumulativeFixed})`);
console.log(`   Stop at: ${TARGET_HOUR}:${String(TARGET_MINUTE).padStart(2, '0')} IDT`);
console.log(`   Time left: ${Math.round(msUntilStop(TARGET_HOUR, TARGET_MINUTE) / 60000)} min\n`);

while (true) {
  const stopCheck = shouldStop(reg, TARGET_HOUR, TARGET_MINUTE);
  if (stopCheck.stop) {
    console.log(`\nStopping: ${stopCheck.reason} (fixed ${reg.cumulativeFixed}/${reg.target})`);
    writeStatus(loadRegistry(), batch, 'stopped', { reason: stopCheck.reason });
    break;
  }

  batch++;
  const fresh = loadRegistry();
  Object.assign(reg, fresh);

  const idt = getIdtNow();
  console.log(`\n========== Bug Hunt Batch ${batch} @ ${idt.toISOString().slice(11, 19)} IDT ==========`);
  console.log(`   Fixed so far: ${reg.cumulativeFixed}/${reg.target}\n`);

  writeStatus(reg, batch, 'starting');

  const serverOk = await ensureServer();
  if (!serverOk) {
    console.error('Server failed to start — retrying in 10s');
    writeStatus(reg, batch, 'server_failed');
    await new Promise(r => setTimeout(r, 10000));
    continue;
  }

  const results = { explore: null, ci: null };

  console.log('→ explore-all-screens');
  results.explore = await run('node', ['scripts/explore-all-screens.js']);
  writeStatus(loadRegistry(), batch, 'explore_done', { exploreExit: results.explore });

  if (results.explore !== 0) {
    console.error('\n⚠ Exploration found failures — AGENT MUST FIX before next batch.');
    console.error('   Read data/bug-hunt-last-explore.json');
    console.error('   Fix bug → add test → registerFix in data/bug-registry.json → commit\n');
    writeStatus(loadRegistry(), batch, 'needs_agent_fix', {
      exploreExit: results.explore,
      hint: 'Fix failures in data/bug-hunt-last-explore.json, add tests, register in bug-registry'
    });
    break;
  }

  console.log('→ test:ci');
  results.ci = await run('npm', ['run', 'test:ci']);
  writeStatus(loadRegistry(), batch, 'ci_done', { ciExit: results.ci });

  if (results.ci !== 0) {
    console.error('\n⚠ test:ci failed — AGENT MUST FIX before next batch.');
    writeStatus(loadRegistry(), batch, 'needs_agent_fix', { ciExit: results.ci });
    break;
  }

  console.log(`\nBatch ${batch} OK — no new failures detected`);
  writeStatus(loadRegistry(), batch, 'batch_ok', results);

  if (msUntilStop(TARGET_HOUR, TARGET_MINUTE) <= 5000) break;
  await new Promise(r => setTimeout(r, 8000));
}

const final = loadRegistry();
console.log(`\nFinal: ${final.cumulativeFixed}/${final.target} bugs fixed`);
console.log(`Report: ${REPORT_PATH}`);

if (existsSync('data/bug-hunt-last-explore.json')) {
  const explore = JSON.parse(readFileSync('data/bug-hunt-last-explore.json', 'utf8'));
  if (explore.failures?.length) {
    process.exit(2);
  }
}
process.exit(final.cumulativeFixed >= final.target ? 0 : 0);
