/**
 * Bug registry — tracks cumulative fixes with unique testIds.
 * Run: node scripts/bug-registry.js status|register
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const REGISTRY_PATH = join(ROOT, 'data', 'bug-registry.json');
const BUGS_MD = join(ROOT, 'BUGS.md');

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return { cumulativeFixed: 0, fixes: [] };
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

function saveRegistry(reg) {
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + '\n');
}

function nextBugId(reg) {
  const n = reg.cumulativeFixed + 1;
  return `BUG-${String(n).padStart(5, '0')}`;
}

/**
 * Register a fix. Rejects duplicate testIds.
 * @returns {{ bugId: string, cumulativeFixed: number }}
 */
export function registerFix({ title, testId, files = [], notes = '' }) {
  const reg = loadRegistry();
  if (reg.fixes.some(f => f.testId === testId)) {
    throw new Error(`Duplicate testId rejected: ${testId}`);
  }
  const bugId = nextBugId(reg);
  const entry = {
    bugId,
    title,
    testId,
    files,
    notes,
    fixedAt: new Date().toISOString()
  };
  reg.fixes.push(entry);
  reg.cumulativeFixed = reg.fixes.length;
  saveRegistry(reg);

  const line = `- **${bugId}** (${testId}): ${title}${notes ? ` — ${notes}` : ''}\n`;
  if (existsSync(BUGS_MD)) {
    writeFileSync(BUGS_MD, readFileSync(BUGS_MD, 'utf8') + line);
  } else {
    writeFileSync(BUGS_MD, `# Block Blast Bug Log\n\n${line}`);
  }

  console.log(`Registered ${bugId}: ${title} [${testId}] (${reg.cumulativeFixed}/10000)`);
  return { bugId, cumulativeFixed: reg.cumulativeFixed };
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

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export function printStatus() {
  const reg = loadRegistry();
  const remaining = msUntilStop();
  const idt = getIdtNow();
  console.log(`Bug Hunt Status @ ${idt.toISOString()} IDT`);
  console.log(`  Time until 01:00 IDT: ${formatDuration(remaining)}`);
  console.log(`  cumulativeFixed: ${reg.cumulativeFixed}/10000`);
  if (reg.fixes.length) {
    const last = reg.fixes[reg.fixes.length - 1];
    console.log(`  Last fix: ${last.bugId} — ${last.title}`);
  }
}

const cmd = process.argv[2];
if (process.argv[1]?.endsWith('bug-registry.js')) {
  if (cmd === 'register') {
    const title = process.argv[3];
    const testId = process.argv[4];
    const files = process.argv[5]?.split(',').filter(Boolean) ?? [];
    if (!title || !testId) {
      console.error('Usage: node scripts/bug-registry.js register "title" testId [files]');
      process.exit(1);
    }
    registerFix({ title, testId, files });
  } else {
    printStatus();
  }
}
