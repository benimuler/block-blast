/**
 * Persistent bug fix counter across agent runs.
 * Each fixed bug MUST get a unique test in scripts/ or js/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = join(__dir, '..', 'data', 'bug-registry.json');
export const BUGS_MD_PATH = join(__dir, '..', 'BUGS.md');
export const TARGET_FIXES = 10_000;

const DEFAULT = {
  target: TARGET_FIXES,
  cumulativeFixed: 0,
  sessionStarted: null,
  lastUpdated: null,
  bugs: []
};

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { ...DEFAULT, bugs: [] };
  try {
    const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
    return { ...DEFAULT, ...data, bugs: data.bugs || [] };
  } catch {
    return { ...DEFAULT, bugs: [] };
  }
}

export function saveRegistry(reg) {
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  reg.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
}

export function nextBugId(reg) {
  return `BUG-${String(reg.bugs.length + 1).padStart(5, '0')}`;
}

/** Record a fixed bug. Returns false if duplicate testId. */
export function registerFix(reg, entry) {
  const { testId, title, area, filesChanged, testFile, description } = entry;
  if (reg.bugs.some(b => b.testId === testId)) return false;
  const id = nextBugId(reg);
  reg.bugs.push({
    id,
    testId,
    title,
    area: area || 'general',
    description: description || title,
    filesChanged: filesChanged || [],
    testFile: testFile || '',
    fixedAt: new Date().toISOString()
  });
  reg.cumulativeFixed = reg.bugs.length;
  saveRegistry(reg);
  appendBugsMd(reg.bugs[reg.bugs.length - 1]);
  return true;
}

function appendBugsMd(bug) {
  const line = `- **${bug.id}** (${bug.area}) — ${bug.title} → test \`${bug.testId}\` in \`${bug.testFile}\`\n`;
  if (!existsSync(BUGS_MD_PATH)) {
    writeFileSync(BUGS_MD_PATH, `# Bug Registry\n\nCumulative fixes tracked in \`data/bug-registry.json\`.\n\n`, 'utf8');
  }
  writeFileSync(BUGS_MD_PATH, readFileSync(BUGS_MD_PATH, 'utf8') + line, 'utf8');
}

export function getIdtNow(tzOffsetHours = 3) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + tzOffsetHours * 3600000);
}

export function msUntilStop(hour = 1, minute = 0, tzOffsetHours = 3) {
  const now = getIdtNow(tzOffsetHours);
  const stop = new Date(now);
  stop.setHours(hour, minute, 0, 0);
  if (stop <= now) stop.setDate(stop.getDate() + 1);
  return stop - now;
}

export function shouldStop(reg, hour = 1, minute = 0) {
  if (reg.cumulativeFixed >= reg.target) return { stop: true, reason: 'target_reached' };
  if (msUntilStop(hour, minute) <= 0) return { stop: true, reason: 'time_reached' };
  return { stop: false };
}
