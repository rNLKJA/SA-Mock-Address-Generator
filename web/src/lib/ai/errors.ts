/**
 * Errors from AI calls, classified so the UI can say something useful (invalid
 * key, rate limit, browser/CORS failure, ...) without ever echoing the key.
 */

import type { TokenUsage } from "./types";

export type AiErrorKind =
  | "no_key"
  | "invalid_key"
  | "permission"
  | "billing"
  | "not_found"
  | "bad_request"
  | "rate_limited"
  | "overloaded"
  | "server"
  | "network"
  | "aborted"
  | "refusal"
  | "truncated"
  | "invalid_output";

/**
 * What the provider sent back on a call that still failed (a refusal, a reply
 * cut off at the token limit, or one that did not match the schema). Those calls
 * spent the visitor's tokens, so the audit log keeps the reply and the usage.
 */
export interface AiErrorDetails {
  /** the raw reply text, as received */
  raw?: string;
  usage?: TokenUsage | null;
  /** model id reported by the provider */
  model?: string;
}

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
  readonly raw?: string;
  readonly usage?: TokenUsage | null;
  readonly model?: string;

  constructor(
    kind: AiErrorKind,
    message: string,
    status?: number,
    details: AiErrorDetails = {},
  ) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = status;
    this.raw = details.raw;
    this.usage = details.usage;
    this.model = details.model;
  }

  /** The same error with the provider's reply attached. */
  withDetails(details: AiErrorDetails): AiError {
    return new AiError(this.kind, this.message, this.status, {
      raw: details.raw ?? this.raw,
      usage: details.usage ?? this.usage,
      model: details.model ?? this.model,
    });
  }

  get retryable(): boolean {
    return (
      this.kind === "rate_limited" ||
      this.kind === "overloaded" ||
      this.kind === "server" ||
      this.kind === "network"
    );
  }
}

/** Map an HTTP status (and the provider's error type, when given) to a kind. */
export function kindFromStatus(status: number, providerType?: string): AiErrorKind {
  if (
    status === 401 ||
    providerType === "authentication_error" ||
    providerType === "invalid_api_key"
  )
    return "invalid_key";
  if (
    status === 402 ||
    providerType === "billing_error" ||
    providerType === "insufficient_quota"
  )
    return "billing";
  if (status === 403 || providerType === "permission_error") return "permission";
  if (
    status === 404 ||
    providerType === "not_found_error" ||
    providerType === "model_not_found"
  )
    return "not_found";
  if (status === 429 || providerType === "rate_limit_error") return "rate_limited";
  if (status === 529 || providerType === "overloaded_error") return "overloaded";
  if (status >= 500) return "server";
  return "bad_request";
}

/** Plain-language explanation for visitors. */
export function describeAiError(e: unknown): string {
  if (!(e instanceof AiError))
    return "Something went wrong while contacting the AI provider.";
  switch (e.kind) {
    case "no_key":
      return "Add your own API key in AI settings to use this optional feature.";
    case "invalid_key":
      return "The provider rejected the API key (401). Check that you pasted the whole key for the selected provider.";
    case "permission":
      return "The key is valid but not allowed to use this model (403).";
    case "billing":
      return "The provider reports a billing or quota problem on this key.";
    case "not_found":
      return "The provider does not recognise this model id. Choose another model in AI settings.";
    case "rate_limited":
      return "Rate limited by the provider (429). Wait a little and try again.";
    case "overloaded":
      return "The provider is temporarily overloaded. Try again in a minute.";
    case "server":
      return "The provider returned a server error. Try again later.";
    case "network":
      return "The browser could not reach the provider. This is usually a network, ad-blocker or CORS problem; nothing was sent to this site.";
    case "aborted":
      return "The request was cancelled.";
    case "refusal":
      return "The model declined to answer this request.";
    case "truncated":
      return "The answer was cut off before it was complete, so it was discarded.";
    case "invalid_output":
      return "The model's answer did not match the expected structure, so it was discarded.";
    case "bad_request":
    default:
      return `The provider rejected the request${e.status ? ` (${e.status})` : ""}: ${e.message}`;
  }
}

/** Read `{ error: { type, message } }` style bodies without trusting their shape. */
export async function readErrorBody(
  res: Response,
): Promise<{ type?: string; message?: string }> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body) {
      const err = (body as { error: unknown }).error;
      if (err && typeof err === "object") {
        const o = err as Record<string, unknown>;
        return {
          type:
            typeof o.type === "string"
              ? o.type
              : typeof o.code === "string"
                ? o.code
                : undefined,
          message: typeof o.message === "string" ? o.message : undefined,
        };
      }
    }
  } catch {
    // not JSON
  }
  return {};
}
