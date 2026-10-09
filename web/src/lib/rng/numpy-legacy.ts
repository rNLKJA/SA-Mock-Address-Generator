import { MT19937 } from "./mt19937";

/**
 * The part of NumPy's legacy `RandomState` that pandas `DataFrame.sample(n=1)`
 * reaches when no `random_state` is given: `np.random.choice(len, 1,
 * replace=False)`, which is `permutation(len)[:1]`, which is a Fisher-Yates
 * shuffle driven by masked rejection sampling (`random_interval`).
 */
export class NumpyLegacyRandomState {
  private readonly mt = new MT19937();

  constructor(seed = 0) {
    this.seed(seed);
  }

  /** `np.random.seed(n)` for an integer in [0, 2**32 - 1]. */
  seed(seed: number): void {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError("Seed must be between 0 and 2**32 - 1");
    }
    this.mt.initGenrand(seed);
  }

  /** Raw 32-bit output (`bit_generator.random_raw`). */
  nextUint32(): number {
    return this.mt.nextUint32();
  }

  /** Uniform integer in [0, max] (NumPy's `random_interval`, max < 2**32). */
  randomInterval(max: number): number {
    if (max === 0) return 0;
    let mask = max;
    mask |= mask >>> 1;
    mask |= mask >>> 2;
    mask |= mask >>> 4;
    mask |= mask >>> 8;
    mask |= mask >>> 16;
    mask >>>= 0;
    let value: number;
    do {
      value = (this.mt.nextUint32() & mask) >>> 0;
    } while (value > max);
    return value;
  }

  /** `RandomState.permutation(n)` for an integer n. */
  permutation(n: number): Int32Array {
    const arr = new Int32Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    for (let i = n - 1; i >= 1; i--) {
      const j = this.randomInterval(i);
      const tmp = arr[j];
      arr[j] = arr[i];
      arr[i] = tmp;
    }
    return arr;
  }

  /** `RandomState.choice(popSize, size, replace=False)` without weights. */
  choiceWithoutReplacement(popSize: number, size: number): number[] {
    if (size > popSize) {
      throw new RangeError(
        "Cannot take a larger sample than population when 'replace=False'",
      );
    }
    return Array.from(this.permutation(popSize).subarray(0, size));
  }
}
