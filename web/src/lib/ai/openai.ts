/**
 * OpenAI Chat Completions adapter, called directly from the visitor's browser
 * with their own key. `response_format: json_schema` (strict) makes the reply a
 * JSON object matching the same schema as the Anthropic path.
 */
import { AiError, kindFromStatus, readErrorBody } from "./errors";
import { redactSecrets } from "./redact";
import type { ProviderResponse, StructuredRequest } from "./types";

export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export function buildOpenAiBody(req: StructuredRequest): Record<string, unknown> {
  return {
    model: req.model,
    max_completion_tokens: req.maxTokens ?? 16000,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.schema },
    },
  };
}

interface OpenAiCompletion {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function callOpenAi(req: StructuredRequest): Promise<ProviderResponse> {
  const doFetch = req.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(buildOpenAiBody(req)),
      signal: req.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new AiError("aborted", "Request cancelled");
    throw new AiError("network", "Network or CORS error while calling api.openai.com");
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new AiError(
      kindFromStatus(res.status, body.type),
      redactSecrets(body.message ?? res.statusText ?? "Request failed", req.apiKey),
      res.status,
    );
  }

  const data = (await res.json()) as OpenAiCompletion;
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";
  const model = data.model ?? req.model;
  const usage =
    data.usage && typeof data.usage.prompt_tokens === "number"
      ? {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens ?? 0,
        }
      : null;
  // these calls still cost tokens, so the reply and usage travel with the error
  if (choice?.message?.refusal)
    throw new AiError("refusal", "The model declined to answer", undefined, {
      raw: choice.message.refusal,
      usage,
      model,
    });
  if (choice?.finish_reason === "length")
    throw new AiError("truncated", "The answer hit the token limit", undefined, {
      raw: text,
      usage,
      model,
    });
  return { text, model, stopReason: choice?.finish_reason ?? null, usage };
}
