import { MT19937 } from "./mt19937";

/**
 * The subset of CPython's `random.Random` the original tool relies on:
 * `seed(int)`, `getrandbits(k <= 32)`, `randint`, `randrange`, `choice` and
 * `random()`. Outputs match CPython 3.x exactly for the same integer seed.
 */
export class PythonRandom {
  private readonly mt = new MT19937();

  constructor(seed: number | bigint = 0) {
    this.seed(seed);
  }

  /** `random.seed(n)`: init_by_array over the 32-bit words of |n|. */
  seed(seed: number | bigint): void {
    let n = BigInt(seed);
    if (n < BigInt(0)) n = -n;
    const key: number[] = [];
    const mask = BigInt(0xffffffff);
    const shift = BigInt(32);
    if (n === BigInt(0)) key.push(0);
    while (n > BigInt(0)) {
      key.push(Number(n & mask));
      n >>= shift;
    }
    this.mt.initByArray(key);
  }

  getrandbits(k: number): number {
    if (k <= 0 || k > 32) throw new RangeError("getrandbits supports 1..32 bits here");
    return this.mt.nextUint32() >>> (32 - k);
  }

  /** `_randbelow_with_getrandbits(n)`. */
  randbelow(n: number): number {
    if (n <= 0) throw new RangeError("randbelow needs n > 0");
    const k = 32 - Math.clz32(n); // n.bit_length()
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  randrange(start: number, stop: number): number {
    return start + this.randbelow(stop - start);
  }

  /** Inclusive on both ends, like Python's `random.randint(a, b)`. */
  randint(a: number, b: number): number {
    return this.randrange(a, b + 1);
  }

  choice<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Cannot choose from an empty sequence");
    return items[this.randbelow(items.length)];
  }

  /** 53-bit float in [0, 1), identical to `random.random()`. */
  random(): number {
    const a = this.mt.nextUint32() >>> 5;
    const b = this.mt.nextUint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }
}
