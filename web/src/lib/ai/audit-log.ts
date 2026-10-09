/**
 * Audit log of every AI call made from this browser.
 *
 * The site is static, so the log lives in the visitor's IndexedDB (database
 * `salab-ai-audit`). Each entry records what was sent (system prompt, the
 * scenario and the current settings, never the key), what came back, which provider and model
 * answered, how long it took, the token usage the provider reported, and the
 * human decision taken afterwards (accepted / edited / rejected). Entries can
 * be exported as JSON or CSV from /ai-log.
 */
import { redactSecrets } from "./redact";
import type { Provider, TokenUsage } from "./types";

export type HumanDecision =
  "pending" | "accepted" | "edited" | "rejected" | "not_applicable";

export interface AuditEntry {
  id: string;
  /** ISO 8601 time the call started. */
  timestamp: string;
  feature: string;
  provider: Provider;
  model: string;
  input: { system: string; user: string };
  /** Raw model output (null when the call failed before a reply arrived). */
  output: string | null;
  status: "ok" | "error";
  error?: { kind: string; message: string };
  latency_ms: number;
  usage: TokenUsage | null;
  decision: HumanDecision;
  decided_at?: string;
  /** The visitor's edited version, when decision = "edited". */
  edited_output?: string;
  /** Automatic checks run on the output (e.g. names not found in the reference table). */
  checks?: Record<string, unknown>;
}

export interface AuditStore {
  add(entry: AuditEntry): Promise<void>;
  update(id: string, patch: Partial<AuditEntry>): Promise<AuditEntry | null>;
  list(): Promise<AuditEntry[]>;
  clear(): Promise<void>;
}

export function newEntryId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Redact every string inside a JSON-like value (used for the `checks` record). */
function redactDeep(value: unknown, knownKey?: string | null): unknown {
  if (typeof value === "string") return redactSecrets(value, knownKey);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, knownKey));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        redactSecrets(k, knownKey),
        redactDeep(v, knownKey),
      ]),
    );
  return value;
}

/**
 * Strip anything key-like from every string field before it is stored: the
 * free text (input, output, error, edit) and also the short fields (model,
 * feature, checks), because a key pasted into the wrong box can end up anywhere.
 */
export function sanitiseEntry(entry: AuditEntry, knownKey?: string | null): AuditEntry {
  const r = (s: string) => redactSecrets(s, knownKey);
  return {
    ...entry,
    feature: r(entry.feature),
    model: r(entry.model),
    input: { system: r(entry.input.system), user: r(entry.input.user) },
    output: entry.output === null ? null : r(entry.output),
    error: entry.error
      ? { kind: r(entry.error.kind), message: r(entry.error.message) }
      : undefined,
    edited_output: entry.edited_output === undefined ? undefined : r(entry.edited_output),
    checks:
      entry.checks === undefined
        ? undefined
        : (redactDeep(entry.checks, knownKey) as Record<string, unknown>),
  };
}

/** Strip anything key-like from every string field an update carries (e.g. the human edit). */
export function sanitisePatch(
  patch: Partial<AuditEntry>,
  knownKey?: string | null,
): Partial<AuditEntry> {
  return redactDeep(patch, knownKey) as Partial<AuditEntry>;
}

/** Newest first. */
export function sortEntries(entries: AuditEntry[]): AuditEntry[] {
  return [...entries].sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
  );
}

/* ---------------------------------------------------------------------------
 * Export
 * ------------------------------------------------------------------------- */

export const CSV_COLUMNS = [
  "id",
  "timestamp",
  "feature",
  "provider",
  "model",
  "status",
  "latency_ms",
  "input_tokens",
  "output_tokens",
  "decision",
  "decided_at",
  "error_kind",
  "error_message",
  "input_system",
  "input_user",
  "output",
  "edited_output",
  "checks",
] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s =
    typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v);
  // neutralise spreadsheet formula injection, then quote
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(entries: AuditEntry[]): string {
  const rows = entries.map((e) =>
    [
      e.id,
      e.timestamp,
      e.feature,
      e.provider,
      e.model,
      e.status,
      e.latency_ms,
      e.usage?.input_tokens,
      e.usage?.output_tokens,
      e.decision,
      e.decided_at,
      e.error?.kind,
      e.error?.message,
      e.input.system,
      e.input.user,
      e.output,
      e.edited_output,
      e.checks,
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function toJson(entries: AuditEntry[]): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), schema: "salab-ai-audit/v1", entries },
    null,
    2,
  );
}

/* ---------------------------------------------------------------------------
 * Stores
 * ------------------------------------------------------------------------- */

/** In-memory store (tests, and the fallback when IndexedDB is unavailable). */
export function createMemoryAuditStore(): AuditStore {
  const rows = new Map<string, AuditEntry>();
  return {
    async add(entry) {
      rows.set(entry.id, entry);
    },
    async update(id, patch) {
      const cur = rows.get(id);
      if (!cur) return null;
      const next = { ...cur, ...sanitisePatch(patch), id: cur.id };
      rows.set(id, next);
      return next;
    },
    async list() {
      return sortEntries([...rows.values()]);
    },
    async clear() {
      rows.clear();
    },
  };
}

const DB_NAME = "salab-ai-audit";
const DB_VERSION = 1;
const STORE = "calls";

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB-backed store. `factory` is injectable for tests (fake-indexeddb). */
export function createIndexedDbAuditStore(factory?: IDBFactory): AuditStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!dbPromise) {
      const idb = factory ?? globalThis.indexedDB;
      if (!idb)
        return Promise.reject(new Error("IndexedDB is not available in this browser"));
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, { keyPath: "id" });
            os.createIndex("timestamp", "timestamp");
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  };
  const tx = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    async add(entry) {
      await promisify((await tx("readwrite")).put(entry));
    },
    async update(id, patch) {
      const os = await tx("readwrite");
      // read-modify-write inside request callbacks so the transaction stays active
      return new Promise<AuditEntry | null>((resolve, reject) => {
        const get = os.get(id);
        get.onerror = () => reject(get.error);
        get.onsuccess = () => {
          const cur = get.result as AuditEntry | undefined;
          if (!cur) return resolve(null);
          const next = { ...cur, ...sanitisePatch(patch), id: cur.id };
          const put = os.put(next);
          put.onerror = () => reject(put.error);
          put.onsuccess = () => resolve(next);
        };
      });
    },
    async list() {
      const rows = (await promisify((await tx("readonly")).getAll())) as AuditEntry[];
      return sortEntries(rows);
    },
    async clear() {
      await promisify((await tx("readwrite")).clear());
    },
  };
}

/** Where the audit log is actually being kept. */
export type AuditPersistence = "indexeddb" | "memory";

export interface BrowserAuditStore extends AuditStore {
  persistence(): AuditPersistence;
}

/**
 * IndexedDB when it works, memory when it does not. `indexedDB` can be missing,
 * `null` (Firefox with IndexedDB disabled) or fail to open (quota, some private
 * modes); the first failure switches the store to memory for the rest of the
 * session, so a call is never left without an audit record. Callers read
 * `persistence()` to tell the visitor when the log is for this tab only.
 */
export function createBrowserAuditStore(
  idb: IDBFactory | null | undefined,
): BrowserAuditStore {
  const memory = createMemoryAuditStore();
  const primary = idb ? createIndexedDbAuditStore(idb) : null;
  let mode: AuditPersistence = primary ? "indexeddb" : "memory";
  const run = async <T>(op: (s: AuditStore) => Promise<T>): Promise<T> => {
    if (mode === "indexeddb" && primary) {
      try {
        return await op(primary);
      } catch {
        mode = "memory";
      }
    }
    return op(memory);
  };
  return {
    // defence in depth: callers sanitise with the known key; patterns are applied again here
    add: (e) => run((s) => s.add(sanitiseEntry(e))),
    update: (id, patch) => run((s) => s.update(id, patch)),
    list: () => run((s) => s.list()),
    clear: () => run((s) => s.clear()),
    persistence: () => mode,
  };
}

function browserIndexedDb(): IDBFactory | null {
  try {
    return typeof indexedDB === "undefined" ? null : (indexedDB ?? null);
  } catch {
    return null; // some browsers throw on access when storage is blocked
  }
}

let browserStore: BrowserAuditStore | null = null;
const LOG_EVENT = "salab:ai-log-changed";

/** The shared store used by the UI (IndexedDB, or memory if IndexedDB is unavailable). */
export function auditStore(): BrowserAuditStore {
  if (!browserStore) {
    const base = createBrowserAuditStore(browserIndexedDb());
    const notify = () => {
      if (typeof window !== "undefined") window.dispatchEvent(new Event(LOG_EVENT));
    };
    browserStore = {
      add: async (e) => {
        await base.add(e);
        notify();
      },
      update: async (id, patch) => {
        const r = await base.update(id, patch);
        notify();
        return r;
      },
      list: () => base.list(),
      clear: async () => {
        await base.clear();
        notify();
      },
      persistence: () => base.persistence(),
    };
  }
  return browserStore;
}

export function onAuditLogChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LOG_EVENT, cb);
  return () => window.removeEventListener(LOG_EVENT, cb);
}
