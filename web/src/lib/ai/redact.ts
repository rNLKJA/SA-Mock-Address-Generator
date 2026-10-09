/**
 * Defence in depth: nothing that looks like an API key may reach the audit log
 * or the screen. Provider error messages sometimes echo part of a key
 * ("Incorrect API key provided: sk-abc...wxyz"), so every string that is stored
 * or shown passes through `redactSecrets`.
 */

const REDACTED = "[redacted key]";

const KEY_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{4,}/g, // Anthropic
  /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_*.-]{8,}/g, // OpenAI (also masked forms)
  // A header value, unless it is already redacted (otherwise "x-api-key: [redacted
  // key]" would become "[redacted key] key]", and redaction would not be idempotent).
  /\b(?:x-api-key|authorization)\s*[:=]\s*(?!(?:Bearer\s+)?\[redacted key\])(?:Bearer\s+)?\S+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/g,
];

export function redactSecrets(text: string, knownKey?: string | null): string {
  let out = text;
  if (knownKey && knownKey.length >= 8) out = out.split(knownKey).join(REDACTED);
  for (const re of KEY_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/** True if `value` (any JSON-serialisable data) contains the key or a key-like token. */
export function containsSecret(value: unknown, knownKey?: string | null): boolean {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return redactSecrets(s, knownKey) !== s;
}
