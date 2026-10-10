/**
 * Holm's step-down adjustment for a family of p-values (Holm 1979), as R's
 * p.adjust(p, "holm"): the i-th smallest of m p-values is multiplied by
 * (m - i + 1), and the results are made monotone. Rejecting where the
 * adjusted p-value is below α keeps the chance of any false alarm across the
 * family at or below α, with no assumption about how the tests depend on
 * each other.
 */
export function holmAdjust(pValues: readonly number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((_, i) => i).sort((a, b) => pValues[a] - pValues[b]);
  const adjusted = new Array<number>(m);
  let running = 0;
  order.forEach((i, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * pValues[i]));
    adjusted[i] = running;
  });
  return adjusted;
}
