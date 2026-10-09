/**
 * Provider-agnostic entry point: send one structured request with the visitor's
 * own key, validate the JSON reply with zod and time the call.
 */
import type { z } from "zod";
import { callAnthropic } from "./anthropic";
import { AiError } from "./errors";
import { callOpenAi } from "./openai";
import type { Provider, ProviderResponse, StructuredRequest, TokenUsage } from "./types";

export interface StructuredCall<T> {
  provider: Provider;
  apiKey: string | null;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  validator: z.ZodType<T>;
  maxTokens?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** injected clock for tests */
  now?: () => number;
}

export interface StructuredResult<T> {
  data: T;
  raw: string;
  model: string;
  usage: TokenUsage | null;
  latencyMs: number;
}

export function parseStructured<T>(raw: string, validator: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiError("invalid_output", "The reply was not valid JSON");
  }
  const parsed = validator.safeParse(json);
  if (!parsed.success)
    throw new AiError(
      "invalid_output",
      `The reply did not match the schema: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  return parsed.data;
}

/**
 * Throws `AiError` on every failure path. On success the latency covers the
 * network round trip (from just before `fetch` to the parsed reply).
 */
export async function generateStructured<T>(
  call: StructuredCall<T>,
): Promise<StructuredResult<T>> {
  if (!call.apiKey) throw new AiError("no_key", "No API key set for this provider");
  const now = call.now ?? (() => performance.now());
  const req: StructuredRequest = {
    apiKey: call.apiKey,
    model: call.model,
    system: call.system,
    user: call.user,
    schema: call.jsonSchema,
    schemaName: call.schemaName,
    maxTokens: call.maxTokens,
    signal: call.signal,
    fetchImpl: call.fetchImpl,
  };
  const t0 = now();
  const res: ProviderResponse =
    call.provider === "anthropic" ? await callAnthropic(req) : await callOpenAi(req);
  const latencyMs = Math.round(now() - t0);
  let data: T;
  try {
    data = parseStructured(res.text, call.validator);
  } catch (e) {
    // the reply arrived and cost tokens: keep it for the audit log
    if (e instanceof AiError)
      throw e.withDetails({ raw: res.text, usage: res.usage, model: res.model });
    throw e;
  }
  return { data, raw: res.text, model: res.model, usage: res.usage, latencyMs };
}
