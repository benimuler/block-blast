/** Shared harness for mega / property tests */
export function createHarness(targetCount = null) {
  let passed = 0;
  let failed = 0;
  const failures = [];

  function assert(cond, id) {
    if (targetCount != null && passed + failed >= targetCount) return;
    if (cond) {
      passed++;
    } else {
      failed++;
      if (failures.length < 30) failures.push(id);
    }
  }

  function assertEq(a, b, id) {
    assert(a === b, id);
  }

  function summary(label) {
    console.log(`\n${label}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failures.length) {
      console.error('  First failures:', failures.slice(0, 10).join('\n    '));
    }
    if (targetCount != null && passed + failed !== targetCount) {
      console.error(`  Expected exactly ${targetCount} tests, ran ${passed + failed}`);
      return 1;
    }
    return failed > 0 ? 1 : 0;
  }

  function progress(every = 1000) {
    const total = passed + failed;
    if (total > 0 && total % every === 0) {
      process.stdout.write(`\r  … ${total} tests run (${passed} ok)`);
    }
  }

  return { assert, assertEq, get passed() { return passed; }, get failed() { return failed; }, get total() { return passed + failed; }, failures, summary, progress };
}

export class Mulberry32 {
  constructor(seed) {
    this.state = (Number(seed) >>> 0) || 1;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
}
