/**
 * Continuous test loop until target time (default: 01:00 IDT).
 * Run: node scripts/overnight-loop.js
 */
import { spawn } from 'node:child_process';

const TARGET_HOUR = parseInt(process.env.LOOP_UNTIL_HOUR || '1', 10);
const TARGET_MINUTE = parseInt(process.env.LOOP_UNTIL_MINUTE || '0', 10);
const TZ_OFFSET_HOURS = parseInt(process.env.LOOP_TZ_OFFSET || '3', 10);

function getIdtNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + TZ_OFFSET_HOURS * 3600000);
}

function msUntilStop() {
  const now = getIdtNow();
  const stop = new Date(now);
  stop.setHours(TARGET_HOUR, TARGET_MINUTE, 0, 0);
  if (stop <= now) stop.setDate(stop.getDate() + 1);
  return stop - now;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
    child.on('close', code => resolve(code ?? 1));
  });
}

let batch = 0;
while (msUntilStop() > 0) {
  batch++;
  const idt = getIdtNow();
  console.log(`\n========== Batch ${batch} @ ${idt.toISOString().slice(11, 19)} IDT ==========\n`);
  const code = await run('npm', ['run', 'test:ci']);
  if (code !== 0) {
    console.error(`\nBatch ${batch} FAILED (exit ${code}). Continuing loop...\n`);
  } else {
    console.log(`\nBatch ${batch} OK\n`);
  }
  if (msUntilStop() <= 0) break;
  await new Promise(r => setTimeout(r, 5000));
}

console.log(`\nStopped at ${getIdtNow().toISOString()} IDT (target ${TARGET_HOUR}:${String(TARGET_MINUTE).padStart(2, '0')}).`);
