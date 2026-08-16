/**
 * Bug hunt loop: explore + test:ci until failure or batch OK.
 * Exit 0 = batch OK, exit 2 = explore/CI failed (fix needed).
 */
import { spawn } from 'node:child_process';
import { printStatus } from './bug-registry.js';

function run(cmd, args) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', code => resolve(code ?? 1));
  });
}

function getIdtNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 3 * 3600000);
}

function msUntilStop() {
  const now = getIdtNow();
  const stop = new Date(now);
  stop.setHours(1, 0, 0, 0);
  if (stop <= now) stop.setDate(stop.getDate() + 1);
  return stop - now;
}

printStatus();

if (msUntilStop() <= 0) {
  console.log('Past 01:00 IDT — stopping.');
  process.exit(0);
}

console.log('\n--- explore-all-screens ---\n');
const exploreCode = await run('node', ['scripts/explore-all-screens.js']);
if (exploreCode !== 0) {
  console.error(`\nExplore FAILED (exit ${exploreCode}). Fix bugs and re-run.\n`);
  process.exit(2);
}

console.log('\n--- test:ci ---\n');
const ciCode = await run('npm', ['run', 'test:ci']);
if (ciCode !== 0) {
  console.error(`\ntest:ci FAILED (exit ${ciCode}). Fix bugs and re-run.\n`);
  process.exit(2);
}

console.log('\nBatch OK.\n');
process.exit(0);
