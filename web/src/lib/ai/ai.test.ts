/**
 * Bring-your-own-key AI: every network call is mocked. The tests pin the
 * request shape (and that the key only ever travels in a header), the error
 * mapping, zod validation, key storage, the audit log, and the review of a
 * proposed generator configuration against the reference table.
 */
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_URL,
  buildAnthropicBody,
  buildAnthropicHeaders,
  callAnthropic,
  FALLBACK_BETA,
} from "./anthropic";
import {
  createBrowserAuditStore,
  createIndexedDbAuditStore,
  createMemoryAuditStore,
  sanitiseEntry,
  toCsv,
  toJson,
  type AuditEntry,
} from "./audit-log";
import { generateStructured, parseStructured } from "./client";
import { AiError, describeAiError, kindFromStatus } from "./errors";
import {
  applyFields,
  roundWeights,
  buildSystemPrompt,
  buildUserMessage,
  decisionFor,
  ProposalSchema,
  reviewProposal,
  SCENARIO_JSON_SCHEMA,
  type FieldKey,
  type GeneratorSettings,
  type Proposal,
  type ScenarioCatalogue,
} from "./scenario-config";
import { createKeyStore, normaliseSettings, type StorageLike } from "./key-store";
import { anthropicSupportsEffort, DEFAULT_SETTINGS, isValidModelId } from "./models";
import { buildOpenAiBody, callOpenAi, OPENAI_URL } from "./openai";
import { containsSecret, redactSecrets } from "./redact";
import type { StructuredRequest } from "./types";

const KEY = "sk-ant-api03-TESTKEY-abcdefghijklmnop";
const OPENAI_KEY = "sk-proj-TESTKEY1234567890abcdef";

const proposal: Proposal = {
  count: 500,
  seed: null,
  mode: "stratified",
  remoteness_weights: [0.2, 0.2, 0.2, 0.2, 0.2],
  decile_weights: null,
  filters: { suburb: null, council: null, remoteness_area: null, seifa_decile: null },
  coordinates: true,
  output_format: "csv",
  rationale: "Equal quotas put 100 addresses in every remoteness area.",
  assumptions: ["Any seed is fine."],
  unsupported: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseReq = (over: Partial<StructuredRequest> = {}): StructuredRequest => ({
  apiKey: KEY,
  model: "claude-haiku-4-5",
  system: "sys",
  user: "user",
  schema: SCENARIO_JSON_SCHEMA,
  schemaName: "generator_config",
  ...over,
});

describe("Anthropic adapter", () => {
  it("calls the Messages API from the browser with the key only in a header", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        model: "claude-haiku-4-5",
        content: [{ type: "text", text: JSON.stringify(proposal) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 812, output_tokens: 190 },
      }),
    );
    const res = await callAnthropic(
      baseReq({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(String(init.body)).not.toContain(KEY);
    const body = JSON.parse(String(init.body));
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.effort).toBeUndefined(); // Haiku rejects effort
    expect(res.usage).toEqual({ input_tokens: 812, output_tokens: 190 });
  });

  it("sends low effort to Sonnet and maps refusal, truncation and HTTP errors", async () => {
    expect(
      buildAnthropicBody(baseReq({ model: "claude-sonnet-5-5" })).output_config,
    ).toMatchObject({
      effort: "low",
    });
    expect(anthropicSupportsEffort("claude-haiku-4-5")).toBe(false);
    const call = (res: Response) =>
      callAnthropic(baseReq({ fetchImpl: (async () => res) as unknown as typeof fetch }));
    await expect(
      call(jsonResponse({ stop_reason: "refusal", content: [] })),
    ).rejects.toMatchObject({
      kind: "refusal",
    });
    await expect(
      call(jsonResponse({ stop_reason: "max_tokens", content: [] })),
    ).rejects.toMatchObject({ kind: "truncated" });
    const err = await call(
      jsonResponse(
        { error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } },
        401,
      ),
    ).catch((e: AiError) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe("invalid_key");
    expect((err as AiError).message).not.toContain(KEY);
    await expect(
      call(
        jsonResponse({ error: { type: "rate_limit_error", message: "slow down" } }, 429),
      ),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("opts Sonnet 5.5 into the server-side refusal fallback, and only Sonnet 5.5", () => {
    const sonnet = baseReq({ model: "claude-sonnet-5-5" });
    expect(buildAnthropicBody(sonnet).fallbacks).toBe("default");
    expect(buildAnthropicHeaders(sonnet)["anthropic-beta"]).toBe(FALLBACK_BETA);
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    const haiku = baseReq();
    expect(buildAnthropicBody(haiku)).not.toHaveProperty("fallbacks");
    expect(buildAnthropicHeaders(haiku)).not.toHaveProperty("anthropic-beta");
    // the key travels in the x-api-key header only, never in the body
    expect(JSON.stringify(buildAnthropicBody(sonnet))).not.toContain(KEY);
  });

  it("keeps the reply, usage and model of a refused or truncated call for the audit log", async () => {
    const call = (body: unknown) =>
      callAnthropic(
        baseReq({
          model: "claude-sonnet-5-5",
          fetchImpl: (async () => jsonResponse(body)) as unknown as typeof fetch,
        }),
      ).catch((e: AiError) => e);
    const refused = (await call({
      model: "claude-sonnet-5-5",
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "general_harms" },
      content: [{ type: "text", text: "partial" }],
      usage: { input_tokens: 900, output_tokens: 12 },
    })) as AiError;
    expect(refused.kind).toBe("refusal");
    expect(refused.message).toMatch(/general_harms/);
    expect(refused.raw).toBe("partial");
    expect(refused.usage).toEqual({ input_tokens: 900, output_tokens: 12 });
    expect(refused.model).toBe("claude-sonnet-5-5");
    const cut = (await call({
      model: "claude-sonnet-5-5",
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"count": 5' }],
      usage: { input_tokens: 900, output_tokens: 4000 },
    })) as AiError;
    expect(cut.kind).toBe("truncated");
    expect(cut.raw).toBe('{"count": 5');
    expect(cut.usage?.output_tokens).toBe(4000);
  });

  it("reports network/CORS failures and cancellations", async () => {
    await expect(
      callAnthropic(
        baseReq({
          fetchImpl: (async () => {
            throw new TypeError("Failed to fetch");
          }) as unknown as typeof fetch,
        }),
      ),
    ).rejects.toMatchObject({ kind: "network" });
    await expect(
      callAnthropic(
        baseReq({
          fetchImpl: (async () => {
            throw new DOMException("aborted", "AbortError");
          }) as unknown as typeof fetch,
        }),
      ),
    ).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("OpenAI adapter", () => {
  it("uses Bearer auth and strict json_schema output", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        model: "gpt-5-mini",
        choices: [
          { finish_reason: "stop", message: { content: JSON.stringify(proposal) } },
        ],
        usage: { prompt_tokens: 700, completion_tokens: 150 },
      }),
    );
    const res = await callOpenAi({
      ...baseReq({ apiKey: OPENAI_KEY, model: "gpt-5-mini" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENAI_URL);
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${OPENAI_KEY}`,
    );
    expect(String(init.body)).not.toContain(OPENAI_KEY);
    const body = buildOpenAiBody(baseReq({ model: "gpt-5-mini" }));
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(res.usage).toEqual({ input_tokens: 700, output_tokens: 150 });
  });

  it("maps refusals and length stops", async () => {
    const call = (res: Response) =>
      callOpenAi(baseReq({ fetchImpl: (async () => res) as unknown as typeof fetch }));
    await expect(
      call(jsonResponse({ choices: [{ message: { refusal: "no" } }] })),
    ).rejects.toMatchObject({ kind: "refusal" });
    await expect(
      call(
        jsonResponse({
          choices: [{ finish_reason: "length", message: { content: "{" } }],
        }),
      ),
    ).rejects.toMatchObject({ kind: "truncated", raw: "{" });
    await expect(
      call(
        jsonResponse({
          model: "gpt-5-mini",
          choices: [{ message: { refusal: "I can't help with that." } }],
          usage: { prompt_tokens: 700, completion_tokens: 9 },
        }),
      ),
    ).rejects.toMatchObject({
      kind: "refusal",
      raw: "I can't help with that.",
      usage: { input_tokens: 700, output_tokens: 9 },
      model: "gpt-5-mini",
    });
  });
});

describe("structured client", () => {
  it("refuses to call without a key", async () => {
    const fetchImpl = vi.fn();
    await expect(
      generateStructured({
        provider: "anthropic",
        apiKey: null,
        model: "claude-haiku-4-5",
        system: "s",
        user: "u",
        schemaName: "x",
        jsonSchema: SCENARIO_JSON_SCHEMA,
        validator: ProposalSchema,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ kind: "no_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates the reply with zod and measures latency", async () => {
    let t = 1000;
    const res = await generateStructured({
      provider: "anthropic",
      apiKey: KEY,
      model: "claude-haiku-4-5",
      system: "s",
      user: "u",
      schemaName: "x",
      jsonSchema: SCENARIO_JSON_SCHEMA,
      validator: ProposalSchema,
      now: () => (t += 250),
      fetchImpl: (async () =>
        jsonResponse({
          content: [{ type: "text", text: JSON.stringify(proposal) }],
          stop_reason: "end_turn",
        })) as unknown as typeof fetch,
    });
    expect(res.data.mode).toBe("stratified");
    expect(res.latencyMs).toBe(250);
    expect(() => parseStructured("not json", ProposalSchema)).toThrow(AiError);
    expect(() => parseStructured(JSON.stringify({ count: 3 }), ProposalSchema)).toThrow(
      /schema/,
    );
  });

  it("keeps the raw reply and usage when the reply fails validation", async () => {
    const bad = JSON.stringify({ count: 10 });
    const err = await generateStructured({
      provider: "anthropic",
      apiKey: KEY,
      model: "claude-haiku-4-5",
      system: "s",
      user: "u",
      schemaName: "x",
      jsonSchema: SCENARIO_JSON_SCHEMA,
      validator: ProposalSchema,
      fetchImpl: (async () =>
        jsonResponse({
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: bad }],
          stop_reason: "end_turn",
          usage: { input_tokens: 800, output_tokens: 20 },
        })) as unknown as typeof fetch,
    }).catch((e: AiError) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe("invalid_output");
    expect((err as AiError).raw).toBe(bad);
    expect((err as AiError).usage).toEqual({ input_tokens: 800, output_tokens: 20 });
    expect((err as AiError).model).toBe("claude-haiku-4-5");
  });

  it("explains errors in plain language", () => {
    expect(kindFromStatus(529)).toBe("overloaded");
    expect(kindFromStatus(500)).toBe("server");
    expect(kindFromStatus(400, "insufficient_quota")).toBe("billing");
    expect(describeAiError(new AiError("network", "x"))).toMatch(/CORS/);
    expect(describeAiError(new Error("x"))).toMatch(/Something went wrong/);
    expect(new AiError("rate_limited", "x").retryable).toBe(true);
  });
});

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("key store", () => {
  it("keeps the key for the session by default, on the device only when asked", () => {
    const session = memoryStorage();
    const local = memoryStorage();
    const store = createKeyStore(() => ({ session, local }));
    store.setKey("anthropic", `  ${KEY}  `, false);
    expect(store.getKey("anthropic")).toBe(KEY);
    expect(store.keyLocation("anthropic")).toBe("session");
    expect([...local.data.values()].join()).not.toContain(KEY);
    store.setKey("anthropic", KEY, true);
    expect(store.keyLocation("anthropic")).toBe("device");
    expect(session.data.size).toBe(0);
    store.forgetKey("anthropic");
    expect(store.getKey("anthropic")).toBeNull();
    store.setKey("openai", OPENAI_KEY, false);
    store.forgetAll();
    expect(store.getKey("openai")).toBeNull();
  });

  it("stores only non-secret settings and drops a key pasted as a model", () => {
    const local = memoryStorage();
    const store = createKeyStore(() => ({ session: null, local }));
    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS);
    store.setSettings({
      provider: "openai",
      anthropicModel: "claude-sonnet-5-5",
      openaiModel: OPENAI_KEY,
    });
    const saved = store.getSettings();
    expect(saved.provider).toBe("openai");
    expect(saved.anthropicModel).toBe("claude-sonnet-5-5");
    expect(saved.openaiModel).toBe(DEFAULT_SETTINGS.openaiModel);
    expect([...local.data.values()].join()).not.toContain("TESTKEY");
    expect(normaliseSettings({ anthropicModel: "claude-unknown" }).anthropicModel).toBe(
      DEFAULT_SETTINGS.anthropicModel,
    );
    expect(isValidModelId("gpt-5-mini")).toBe(true);
    expect(isValidModelId("has space")).toBe(false);
  });
});

describe("redaction", () => {
  it("removes keys and key-like tokens", () => {
    expect(redactSecrets(`Incorrect API key provided: ${OPENAI_KEY}`)).not.toContain(
      "TESTKEY",
    );
    expect(redactSecrets("x-api-key: abc123456789")).toBe("[redacted key]");
    expect(redactSecrets("custom-secret-value", "custom-secret-value")).toBe(
      "[redacted key]",
    );
    expect(containsSecret({ nested: [KEY] })).toBe(true);
    expect(containsSecret("ADELAIDE SA 5000")).toBe(false);
  });

  it("leaves a readable message when the provider echoes the key in a header", () => {
    // A 401 body that quotes the header: the known key is replaced first, and the
    // header pattern must not then swallow half of the marker.
    expect(redactSecrets(`invalid x-api-key: ${KEY}`, KEY)).toBe(
      "invalid x-api-key: [redacted key]",
    );
    expect(redactSecrets(`invalid x-api-key: ${KEY}`)).toBe(
      "invalid x-api-key: [redacted key]",
    );
    expect(
      redactSecrets("Authorization: Bearer abcdefgh12345678", "abcdefgh12345678"),
    ).toBe("Authorization: Bearer [redacted key]");
    for (const text of [
      `invalid x-api-key: ${KEY}`,
      `Incorrect API key provided: ${OPENAI_KEY}`,
      "authorization: Bearer abcdefgh12345678",
    ]) {
      const once = redactSecrets(text, KEY);
      expect(redactSecrets(once, KEY)).toBe(once); // idempotent
      expect(containsSecret(once, KEY)).toBe(false);
      expect(once).not.toMatch(/\] key\]/);
    }
  });
});

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "e1",
    timestamp: "2026-10-09T01:00:00.000Z",
    feature: "scenario-config",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    input: { system: "sys", user: "{}" },
    output: JSON.stringify(proposal),
    status: "ok",
    latency_ms: 900,
    usage: { input_tokens: 800, output_tokens: 200 },
    decision: "pending",
    ...over,
  };
}

describe("audit log", () => {
  it("never stores the key, even when a provider echoes it", () => {
    const e = sanitiseEntry(
      entry({
        output: null,
        status: "error",
        error: { kind: "invalid_key", message: `bad ${KEY}` },
      }),
      KEY,
    );
    expect(JSON.stringify(e)).not.toContain(KEY);
  });

  it("exports CSV with escaping and formula-injection guards, and JSON", () => {
    const csv = toCsv([
      entry({
        edited_output: '=HYPERLINK("x")',
        input: { system: "a,b", user: 'say "hi"' },
      }),
    ]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header.split(",")).toContain("latency_ms");
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain('"a,b"');
    expect(JSON.parse(toJson([entry()])).entries).toHaveLength(1);
  });

  it("memory and IndexedDB stores add, update the human decision, list newest first and clear", async () => {
    for (const store of [
      createMemoryAuditStore(),
      createIndexedDbAuditStore(new IDBFactory()),
    ]) {
      await store.add(entry());
      await store.add(entry({ id: "e2", timestamp: "2026-10-09T02:00:00.000Z" }));
      const updated = await store.update("e1", {
        decision: "edited",
        edited_output: `edited with ${KEY}`,
      });
      expect(updated?.decision).toBe("edited");
      expect(updated?.edited_output).not.toContain(KEY);
      expect((await store.list()).map((e) => e.id)).toEqual(["e2", "e1"]);
      expect(await store.update("missing", { decision: "accepted" })).toBeNull();
      await store.clear();
      expect(await store.list()).toHaveLength(0);
    }
  });

  it("falls back to memory when IndexedDB is unavailable", async () => {
    const store = createBrowserAuditStore(null);
    expect(store.persistence()).toBe("memory");
    await store.add(entry());
    expect(await store.list()).toHaveLength(1);
  });
});

const catalogue: ScenarioCatalogue = {
  councils: [
    { name: "Adelaide", count: 2 },
    { name: "Coober Pedy", count: 1 },
    { name: "Unincorporated SA", count: 98 },
  ],
  suburbs: ["ADELAIDE", "NORTH ADELAIDE", "COOBER PEDY", "GLENELG"],
  raCounts: [424, 343, 582, 200, 146],
  decileCounts: Array(10).fill(161),
  noDecile: 82,
  total: 1695,
};

const current: GeneratorSettings = {
  count: 25,
  seed: 2025,
  mode: "uniform",
  weights: {
    remoteness: [0.4, 0.25, 0.2, 0.1, 0.05],
    decile: Array(10).fill(0.1),
  },
  filters: {},
  coordinates: true,
  format: "text",
};

const field = (review: ReturnType<typeof reviewProposal>, key: FieldKey) =>
  review.fields.find((f) => f.key === key)!;

describe("describe a test scenario", () => {
  it("sends the scenario, the current settings and the catalogue, but no suburb list", () => {
    const system = buildSystemPrompt(catalogue);
    expect(system).toContain("Coober Pedy");
    expect(system).toContain("Very Remote Australia: 146 suburbs");
    expect(system).not.toContain("GLENELG");
    expect(system).toMatch(/unsupported/);
    const user = JSON.parse(buildUserMessage("  200 rural addresses  ", current));
    expect(user.scenario).toBe("200 rural addresses");
    expect(user.current_settings.count).toBe(25);
    expect(user.current_settings.filters).toEqual({
      suburb: null,
      council: null,
      remoteness_area: null,
      seifa_decile: null,
    });
  });

  it("keeps the zod contract and the JSON schema in step", () => {
    const required = SCENARIO_JSON_SCHEMA.required as string[];
    expect(required.sort()).toEqual(Object.keys(ProposalSchema.shape).sort());
    expect(ProposalSchema.safeParse(proposal).success).toBe(true);
    // the schema has no length limits, so neither does zod: long lists are kept
    expect(
      ProposalSchema.safeParse({ ...proposal, assumptions: Array(9).fill("x") }).success,
    ).toBe(true);
    expect(ProposalSchema.safeParse({ ...proposal, mode: "random" }).success).toBe(false);
  });

  it("recommends the changed, valid fields and leaves the rest alone", () => {
    const review = reviewProposal(proposal, current, catalogue);
    expect(field(review, "count")).toMatchObject({
      proposed: "500",
      changed: true,
      recommended: true,
    });
    expect(field(review, "seed")).toMatchObject({ changed: false, recommended: false });
    expect(field(review, "mode").recommended).toBe(true);
    expect(field(review, "remoteness_weights")).toMatchObject({
      label: "Quota shares",
      proposed: "20% / 20% / 20% / 20% / 20%",
      recommended: true,
    });
    expect(field(review, "suburb").changed).toBe(false);
    expect(review.checks.invalid_fields).toEqual([]);
  });

  it("flags names that are not in the reference table instead of applying them", () => {
    const review = reviewProposal(
      {
        ...proposal,
        filters: {
          suburb: "Atlantis",
          council: "City of Nowhere",
          remoteness_area: "Remote Australia",
          seifa_decile: 11,
        },
      },
      current,
      catalogue,
    );
    expect(field(review, "suburb")).toMatchObject({ valid: false, recommended: false });
    expect(field(review, "suburb").note).toMatch(/not a suburb/);
    expect(field(review, "council")).toMatchObject({ valid: false });
    expect(field(review, "seifa_decile").valid).toBe(false);
    expect(field(review, "remoteness_area")).toMatchObject({
      proposed: "Remote",
      valid: true,
    });
    expect(review.checks).toMatchObject({
      unknown_suburb: "ATLANTIS",
      unknown_council: "City of Nowhere",
    });
    expect(review.checks.invalid_fields.sort()).toEqual([
      "council",
      "seifa_decile",
      "suburb",
    ]);
    // invalid fields can't be applied even if selected
    const next = applyFields(
      current,
      review,
      new Set<FieldKey>(["suburb", "council", "remoteness_area"]),
    );
    expect(next.filters).toEqual({ suburb: null, council: null, ra: 3, decile: null });
  });

  it("matches council names case-insensitively and clamps the count", () => {
    const review = reviewProposal(
      {
        ...proposal,
        count: 12000,
        filters: { ...proposal.filters, council: "adelaide", suburb: "north adelaide" },
      },
      current,
      catalogue,
    );
    expect(field(review, "council")).toMatchObject({ proposed: "Adelaide", valid: true });
    expect(field(review, "suburb")).toMatchObject({
      proposed: "NORTH ADELAIDE",
      valid: true,
    });
    expect(field(review, "count")).toMatchObject({ proposed: "5,000", valid: true });
    expect(field(review, "count").note).toMatch(/12,000/);
    expect(review.checks.clamped_count).toBe(true);
  });

  it("rejects malformed weights and notes weights the mode will not use", () => {
    const bad = reviewProposal(
      { ...proposal, remoteness_weights: [1, 2] },
      current,
      catalogue,
    );
    expect(field(bad, "remoteness_weights")).toMatchObject({
      valid: false,
      recommended: false,
    });
    const unused = reviewProposal(
      { ...proposal, mode: "population", remoteness_weights: [1, 1, 1, 1, 1] },
      current,
      catalogue,
    );
    expect(field(unused, "remoteness_weights")).toMatchObject({
      valid: true,
      recommended: false,
    });
    expect(field(unused, "remoteness_weights").note).toMatch(/Only used/);
  });

  it("applies only the selected fields and records the human decision", () => {
    const review = reviewProposal(proposal, current, catalogue);
    const recommended = new Set(
      review.fields.filter((f) => f.recommended).map((f) => f.key),
    );
    const all = applyFields(current, review, recommended);
    expect(all).toMatchObject({
      count: 500,
      mode: "stratified",
      format: "csv",
      seed: 2025,
    });
    expect(all.weights.remoteness).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(decisionFor(review, recommended)).toBe("accepted");

    const some = new Set<FieldKey>(["count", "mode"]);
    const partial = applyFields(current, review, some);
    expect(partial).toMatchObject({ count: 500, mode: "stratified", format: "text" });
    expect(partial.weights.remoteness).toEqual(current.weights.remoteness);
    expect(decisionFor(review, some)).toBe("edited");
    expect(decisionFor(review, new Set())).toBe("rejected");

    // a proposal that changes nothing, applied as is, counts as agreement
    const same = reviewProposal(
      {
        ...proposal,
        count: 25,
        mode: "uniform",
        remoteness_weights: null,
        output_format: "text",
      },
      current,
      catalogue,
    );
    expect(decisionFor(same, new Set())).toBe("accepted");
  });

  it("rounds applied weights for the form without dropping any area", () => {
    expect(roundWeights([1 / 3, 2 / 3, 0, 0.125, 0.00001234567])).toEqual([
      0.3333, 0.6667, 0, 0.125, 0.00001235,
    ]);
    const review = reviewProposal(
      { ...proposal, remoteness_weights: [1 / 3, 1 / 3, 1 / 3, 0, 0.000012346] },
      current,
      catalogue,
    );
    const next = applyFields(current, review, new Set<FieldKey>(["remoteness_weights"]));
    expect(next.weights.remoteness).toEqual([0.3333, 0.3333, 0.3333, 0, 0.00001235]);
  });

  it("runs end to end with a mocked provider and keeps the key out of the request body", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        model: "claude-haiku-4-5",
        content: [{ type: "text", text: JSON.stringify(proposal) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1400, output_tokens: 160 },
      }),
    );
    const res = await generateStructured({
      provider: "anthropic",
      apiKey: KEY,
      model: "claude-haiku-4-5",
      system: buildSystemPrompt(catalogue),
      user: buildUserMessage("500 addresses, 100 per remoteness area, as CSV", current),
      schemaName: "generator_config",
      jsonSchema: SCENARIO_JSON_SCHEMA,
      validator: ProposalSchema,
      maxTokens: 4000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.max_tokens).toBe(4000);
    expect(body.output_config.format.schema).toEqual(SCENARIO_JSON_SCHEMA);
    expect(String(init.body)).not.toContain(KEY);
    const review = reviewProposal(res.data, current, catalogue);
    expect(review.normalised.mode).toBe("stratified");
    expect(res.usage).toEqual({ input_tokens: 1400, output_tokens: 160 });
  });
});
