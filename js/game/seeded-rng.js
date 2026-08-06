/** Deterministic PRNG (mulberry32) for mirror-duel identical piece streams */
export class SeededRNG {
  constructor(seed) {
    this.state = (Number(seed) >>> 0) || 1;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(max) {
    return Math.floor(this.next() * max);
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }
}

export function hashSeed(a, b, roomId) {
  let h = 2166136261;
  const s = `${a}|${b}|${roomId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
