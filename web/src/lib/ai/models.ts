import { containsSecret } from "./redact";
import type { AiSettings, Provider } from "./types";

/**
 * Anthropic models offered in the settings dialog. The default is the cheapest
 * current tier (Haiku); Sonnet is offered for visitors who prefer it. IDs are
 * Anthropic's exact alias strings (no date suffixes).
 */
export const ANTHROPIC_MODELS = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "default, lowest cost" },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "stronger, about 2x the price",
  },
] as const;

/** Default OpenAI model id; the field is free text so visitors can choose another. */
export const OPENAI_DEFAULT_MODEL = "gpt-5-mini";

const MODEL_ID = /^[A-Za-z0-9._:-]{1,80}$/;

/**
 * A plausible model id: short, no spaces, and nothing that looks like an API key.
 * The OpenAI model box sits right above the key box, so a key pasted into the
 * wrong field must never be saved as a "model" (settings live in localStorage and
 * the model id is written to the audit log).
 */
export function isValidModelId(id: string): boolean {
  const v = id.trim();
  return MODEL_ID.test(v) && !containsSecret(v);
}

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "anthropic",
  anthropicModel: ANTHROPIC_MODELS[0].id,
  openaiModel: OPENAI_DEFAULT_MODEL,
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/** Host each provider is called on (shown to visitors: this is where their data goes). */
export const PROVIDER_HOST: Record<Provider, string> = {
  anthropic: "api.anthropic.com",
  openai: "api.openai.com",
};

export function modelFor(settings: AiSettings): string {
  return settings.provider === "anthropic"
    ? settings.anthropicModel
    : settings.openaiModel;
}

export function modelLabel(model: string): string {
  return ANTHROPIC_MODELS.find((m) => m.id === model)?.label ?? model;
}

/**
 * The `effort` control is accepted by current Sonnet models but rejected by
 * Haiku 4.5, so it is only sent where it is accepted.
 */
export function anthropicSupportsEffort(model: string): boolean {
  return !model.includes("haiku");
}

/**
 * Claude Sonnet 5.5's safety classifiers can decline a request. With
 * `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`, Claude API
 * only) Anthropic re-runs a declined request on the model it recommends for
 * that refusal category, within the same call. Haiku 4.5 does not take it.
 */
export function anthropicUsesFallback(model: string): boolean {
  return model === "claude-sonnet-5-5";
}
