/**
 * A mocked AI provider for the tour's screenshots. No real key is ever used:
 * the "key" is a placeholder typed into the bring-your-own-key dialog, every
 * request to a provider is intercepted in the browser context, and the reply
 * is written here.
 *
 * The mocked reply to the tour's example scenario is MOCK_PROPOSAL, which
 * passes the schema and the reference-table checks (src/lib/showcase.test.ts),
 * and its rationale starts with MOCK_ANSWER_PREFIX, so nothing in a screenshot
 * can be mistaken for a real model's output. It reports zero tokens: the mock
 * has no usage to report.
 */
import type { BrowserContext, Request } from "@playwright/test";
import { MOCK_ANSWER_PREFIX, MOCK_PROPOSAL, MOCK_SCENARIO } from "../src/lib/showcase";

/** Not a credential: an obviously fake placeholder typed into the BYOK dialog. */
export const PLACEHOLDER_KEY = "placeholder-not-a-real-key";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

/** The structured reply (the shape of ProposalSchema in src/lib/ai/scenario-config.ts). */
export function mockProposal(userMessage: string) {
  let scenario = "";
  try {
    scenario = (JSON.parse(userMessage) as { scenario?: string }).scenario ?? "";
  } catch {
    // not the tour's request; fall through to the generic reply
  }
  if (scenario === MOCK_SCENARIO) return MOCK_PROPOSAL;
  return {
    ...MOCK_PROPOSAL,
    rationale: `${MOCK_ANSWER_PREFIX} The mock only answers the tour's example scenario; this is that reply.`,
  };
}

export interface MockAi {
  /** Requests that reached the mock (each one an AI call the app made). */
  calls: number;
  /** Requests to anything else that carried the placeholder key (must stay empty). */
  leaks: string[];
}

export async function mockAiProviders(
  context: BrowserContext,
  { latencyMs = 900 }: { latencyMs?: number } = {},
): Promise<MockAi> {
  const state: MockAi = { calls: 0, leaks: [] };

  await context.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    state.calls += 1;
    const body = JSON.parse(req.postData() ?? "{}") as {
      model?: string;
      messages?: { role: string; content: string }[];
    };
    const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    await route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({
        id: `msg_mock_${state.calls}`,
        type: "message",
        role: "assistant",
        model: body.model ?? "unknown",
        content: [{ type: "text", text: JSON.stringify(mockProposal(user)) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    });
  });

  // The tour never uses OpenAI; block it so nothing can leave the browser.
  await context.route("https://api.openai.com/**", (route) =>
    route.abort("blockedbyclient"),
  );

  context.on("request", (req: Request) => {
    if (req.url().startsWith("https://api.anthropic.com/")) return;
    const headers = JSON.stringify(req.headers());
    const data = req.postData() ?? "";
    if (
      headers.includes(PLACEHOLDER_KEY) ||
      data.includes(PLACEHOLDER_KEY) ||
      req.url().includes(PLACEHOLDER_KEY)
    ) {
      state.leaks.push(req.url());
    }
  });

  return state;
}
