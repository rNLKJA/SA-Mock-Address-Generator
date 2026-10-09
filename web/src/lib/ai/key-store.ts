/**
 * Where the visitor's API key lives: in THIS browser only.
 *
 * - By default the key is kept in `sessionStorage` (gone when the tab closes).
 * - "Remember on this device" moves it to `localStorage`.
 * - "Forget key" removes it from both.
 *
 * The key is read only at the moment of a call and passed straight to the
 * provider adapter; it is never sent to this site (which has no server for AI),
 * never logged and never put in the audit log. Non-secret preferences (provider,
 * model ids) are kept in `localStorage`.
 */
import { ANTHROPIC_MODELS, DEFAULT_SETTINGS, isValidModelId } from "./models";
import { containsSecret } from "./redact";
import type { AiSettings, Provider } from "./types";

const KEY_PREFIX = "salab.ai.key.";
const SETTINGS_KEY = "salab.ai.settings";
const CHANGE_EVENT = "salab:ai-settings-changed";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface KeyStoreBackends {
  session: StorageLike | null;
  local: StorageLike | null;
}

function browserBackends(): KeyStoreBackends {
  if (typeof window === "undefined") return { session: null, local: null };
  const safe = (get: () => Storage): StorageLike | null => {
    try {
      return get();
    } catch {
      return null; // storage disabled (privacy mode, blocked cookies)
    }
  };
  return {
    session: safe(() => window.sessionStorage),
    local: safe(() => window.localStorage),
  };
}

export interface KeyStore {
  getKey(provider: Provider): string | null;
  /** where the key for `provider` is stored, if anywhere */
  keyLocation(provider: Provider): "session" | "device" | null;
  setKey(provider: Provider, key: string, remember: boolean): void;
  forgetKey(provider: Provider): void;
  forgetAll(): void;
  getSettings(): AiSettings;
  setSettings(next: AiSettings): void;
}

/**
 * Only known, non-secret values survive: an unknown Anthropic id falls back to
 * the default, and an OpenAI "model" that is not a plausible id (for example a
 * key pasted into the wrong box) falls back to the default OpenAI model.
 */
export function normaliseSettings(v: Partial<AiSettings> | null | undefined): AiSettings {
  return {
    provider: v?.provider === "openai" ? "openai" : "anthropic",
    anthropicModel: ANTHROPIC_MODELS.some((m) => m.id === v?.anthropicModel)
      ? (v?.anthropicModel as string)
      : DEFAULT_SETTINGS.anthropicModel,
    openaiModel:
      typeof v?.openaiModel === "string" && isValidModelId(v.openaiModel)
        ? v.openaiModel.trim()
        : DEFAULT_SETTINGS.openaiModel,
  };
}

export function createKeyStore(
  backends: () => KeyStoreBackends = browserBackends,
  notify: () => void = () => {},
): KeyStore {
  const name = (p: Provider) => `${KEY_PREFIX}${p}`;
  /** settings written by an older version could hold a key-like "model": rewrite them */
  const scrubSettings = () => {
    const local = backends().local;
    const raw = local?.getItem(SETTINGS_KEY);
    if (!local || !raw || !containsSecret(raw)) return;
    try {
      local.setItem(SETTINGS_KEY, JSON.stringify(normaliseSettings(JSON.parse(raw))));
    } catch {
      local.removeItem(SETTINGS_KEY);
    }
  };
  const remove = (p: Provider) => {
    const { session, local } = backends();
    session?.removeItem(name(p));
    local?.removeItem(name(p));
  };
  return {
    getKey(p) {
      const { session, local } = backends();
      return session?.getItem(name(p)) || local?.getItem(name(p)) || null;
    },
    keyLocation(p) {
      const { session, local } = backends();
      if (session?.getItem(name(p))) return "session";
      if (local?.getItem(name(p))) return "device";
      return null;
    },
    setKey(p, key, remember) {
      const { session, local } = backends();
      const k = key.trim();
      remove(p);
      if (k) (remember ? local : session)?.setItem(name(p), k);
      notify();
    },
    forgetKey(p) {
      remove(p);
      scrubSettings();
      notify();
    },
    forgetAll() {
      remove("anthropic");
      remove("openai");
      scrubSettings();
      notify();
    },
    getSettings() {
      const raw = backends().local?.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      try {
        return normaliseSettings(JSON.parse(raw) as Partial<AiSettings>);
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
    setSettings(next) {
      backends().local?.setItem(SETTINGS_KEY, JSON.stringify(normaliseSettings(next)));
      notify();
    },
  };
}

/* ---------------------------------------------------------------------------
 * Browser singleton and subscription for useSyncExternalStore
 * ------------------------------------------------------------------------- */

let version = 0;
function emit() {
  version++;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const keyStore = createKeyStore(browserBackends, emit);

export function subscribeAiSettings(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("salab.ai.")) {
      version++;
      cb();
    }
  };
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** A number that changes whenever keys or settings change (snapshot for useSyncExternalStore). */
export function aiSettingsVersion(): number {
  return version;
}
