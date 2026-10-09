/**
 * Anthropic Messages API adapter, called directly from the visitor's browser
 * with their own key (`anthropic-dangerous-direct-browser-access: true` enables
 * CORS for this). Plain `fetch` keeps the bundle small and lets the tests mock
 * the network; the request follows the Messages API: POST /v1/messages with
 * structured output through `output_config.format` (JSON schema).
 */
import { AiError, kindFromStatus, readErrorBody } from "./errors";
import { anthropicSupportsEffort, anthropicUsesFallback } from "./models";
import { redactSecrets } from "./redact";
import type { ProviderResponse, StructuredRequest } from "./types";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
/** beta that enables `fallbacks: "default"` (server-side refusal fallback) */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function buildAnthropicBody(req: StructuredRequest): Record<string, unknown> {
  const outputConfig: Record<string, unknown> = {
    format: { type: "json_schema", schema: req.schema },
  };
  // a short explanation grounded in given numbers does not need deep reasoning
  if (anthropicSupportsEffort(req.model)) outputConfig.effort = "low";
  return {
    model: req.model,
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    output_config: outputConfig,
    // if a safety classifier declines, Anthropic re-runs the request on the
    // model it recommends for that category, inside the same call
    ...(anthropicUsesFallback(req.model) ? { fallbacks: "default" } : {}),
  };
}

export function buildAnthropicHeaders(req: StructuredRequest): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": req.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
    ...(anthropicUsesFallback(req.model) ? { "anthropic-beta": FALLBACK_BETA } : {}),
  };
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessage {
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  stop_details?: { category?: string | null } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function callAnthropic(req: StructuredRequest): Promise<ProviderResponse> {
  const doFetch = req.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: buildAnthropicHeaders(req),
      body: JSON.stringify(buildAnthropicBody(req)),
      signal: req.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new AiError("aborted", "Request cancelled");
    // fetch rejects on network failure and on CORS rejection alike
    throw new AiError("network", "Network or CORS error while calling api.anthropic.com");
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new AiError(
      kindFromStatus(res.status, body.type),
      redactSecrets(body.message ?? res.statusText ?? "Request failed", req.apiKey),
      res.status,
    );
  }

  const msg = (await res.json()) as AnthropicMessage;
  // thinking and fallback blocks (if any) are skipped; the answer is in the text blocks
  const text = (msg.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  const model = msg.model ?? req.model;
  const usage =
    msg.usage && typeof msg.usage.input_tokens === "number"
      ? {
          input_tokens: msg.usage.input_tokens,
          output_tokens: msg.usage.output_tokens ?? 0,
        }
      : null;
  // these calls still cost tokens, so the reply and usage travel with the error
  const details = { raw: text, usage, model };
  if (msg.stop_reason === "refusal") {
    const category = msg.stop_details?.category;
    throw new AiError(
      "refusal",
      `The model declined to answer${category ? ` (category: ${category})` : ""}`,
      undefined,
      details,
    );
  }
  if (msg.stop_reason === "max_tokens")
    throw new AiError("truncated", "The answer hit the token limit", undefined, details);
  return { text, model, stopReason: msg.stop_reason ?? null, usage };
}
