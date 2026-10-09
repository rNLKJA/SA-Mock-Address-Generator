/**
 * Bring-your-own-key AI: shared types.
 *
 * The site has no API key of its own and never proxies AI calls: the visitor's
 * key stays in their browser and requests go straight from the browser to the
 * provider. Every AI output is optional, labelled and written to a local audit log.
 */

export type Provider = "anthropic" | "openai";

export interface AiSettings {
  provider: Provider;
  /** model id used for Anthropic calls (one of ANTHROPIC_MODELS) */
  anthropicModel: string;
  /** model id used for OpenAI calls (free text, visitor-editable) */
  openaiModel: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

/** What a provider adapter returns: raw text plus metadata. */
export interface ProviderResponse {
  text: string;
  /** model id reported by the provider (falls back to the requested id) */
  model: string;
  usage: TokenUsage | null;
  stopReason: string | null;
}

/** A provider-agnostic request for one JSON object matching `schema`. */
export interface StructuredRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** JSON Schema the reply must follow (provider structured-output mode) */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}
