import "server-only";

/**
 * A small in-memory sliding-window limiter, so this proxy stays a polite
 * Photon citizen. Per serverless instance only, which is enough for a demo.
 */
const hits = new Map<string, number[]>();

export function allowRequest(
  key: string,
  limit = 30,
  windowMs = 60_000,
  now = Date.now(),
): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}
