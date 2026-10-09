"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  CircleAlert,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openAiSettings, useAiSettings } from "@/hooks/use-ai-settings";
import {
  auditStore,
  newEntryId,
  sanitiseEntry,
  type AuditEntry,
} from "@/lib/ai/audit-log";
import { generateStructured } from "@/lib/ai/client";
import { AiError, describeAiError } from "@/lib/ai/errors";
import { keyStore } from "@/lib/ai/key-store";
import { PROVIDER_HOST, PROVIDER_LABEL, modelFor, modelLabel } from "@/lib/ai/models";
import { redactSecrets } from "@/lib/ai/redact";
import {
  MAX_SCENARIO_LENGTH,
  ProposalSchema,
  SCENARIO_FEATURE,
  SCENARIO_JSON_SCHEMA,
  applyFields,
  buildSystemPrompt,
  buildUserMessage,
  decisionFor,
  reviewProposal,
  type FieldKey,
  type GeneratorSettings,
  type Proposal,
  type Review,
  type ScenarioCatalogue,
} from "@/lib/ai/scenario-config";
import type { Provider, TokenUsage } from "@/lib/ai/types";
import { cn, formatInt } from "@/lib/utils";

const EXAMPLES = [
  "A fixture of 40 addresses that covers every remoteness area, as CSV.",
  "500 addresses where people actually live, for load-testing a delivery app.",
  "Addresses in the City of Adelaide council only, with coordinates, as JSON.",
  "200 addresses from the most disadvantaged areas for an accessibility review.",
];

type Decision = "pending" | "accepted" | "edited" | "rejected";

interface Result {
  entryId: string;
  proposal: Proposal;
  review: Review;
  provider: Provider;
  model: string;
  latencyMs: number;
  usage: TokenUsage | null;
  decision: Decision;
}

/**
 * Optional "Describe a test scenario" panel (bring your own key). The model
 * proposes settings; nothing changes until the visitor applies them.
 */
export function ScenarioAssistant({
  current,
  catalogue,
  onApply,
}: {
  current: GeneratorSettings;
  catalogue: ScenarioCatalogue;
  onApply: (next: GeneratorSettings) => void;
}) {
  const id = useId();
  const { ready, hasKey, settings } = useAiSettings();
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<Set<FieldKey>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const trimmed = scenario.trim();

  const record = async (entry: AuditEntry, apiKey: string) => {
    const store = auditStore();
    try {
      await store.add(sanitiseEntry(entry, apiKey));
      setAuditNotice(
        store.persistence() === "memory"
          ? "IndexedDB is unavailable in this browser, so this call is recorded for this tab only. Export the log before closing the tab if you need to keep it."
          : null,
      );
    } catch {
      setAuditNotice(
        "This call could not be written to the audit log in this browser. The proposal is shown, but there is no record of it.",
      );
    }
  };

  const propose = async () => {
    if (!trimmed) return;
    const provider = settings.provider;
    const model = modelFor(settings);
    const apiKey = keyStore.getKey(provider);
    if (!apiKey) {
      openAiSettings();
      return;
    }
    setBusy(true);
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const system = buildSystemPrompt(catalogue);
    const user = buildUserMessage(trimmed.slice(0, MAX_SCENARIO_LENGTH), current);
    const base = {
      id: newEntryId(),
      timestamp: new Date().toISOString(),
      feature: SCENARIO_FEATURE,
      provider,
      model,
      input: { system, user },
    };
    const started = performance.now();
    try {
      const res = await generateStructured({
        provider,
        apiKey,
        model,
        system,
        user,
        schemaName: "generator_config",
        jsonSchema: SCENARIO_JSON_SCHEMA,
        validator: ProposalSchema,
        maxTokens: 4000,
        signal: controller.signal,
      });
      const review = reviewProposal(res.data, current, catalogue);
      const checks = { ...review.checks, unsupported: res.data.unsupported.length };
      const entry: AuditEntry = {
        ...base,
        model: res.model,
        output: res.raw,
        status: "ok",
        latency_ms: res.latencyMs,
        usage: res.usage,
        decision: "pending",
        checks,
      };
      await record(entry, apiKey);
      setResult({
        entryId: entry.id,
        proposal: res.data,
        review,
        provider,
        model: res.model,
        latencyMs: res.latencyMs,
        usage: res.usage,
        decision: "pending",
      });
      setSelected(new Set(review.fields.filter((f) => f.recommended).map((f) => f.key)));
      setShowUnchanged(false);
    } catch (e) {
      const ai = e instanceof AiError ? e : null;
      const kind = ai?.kind ?? "unknown";
      if (kind !== "aborted") setError(describeAiError(e));
      await record(
        {
          ...base,
          model: ai?.model ?? model,
          output: ai?.raw ?? null,
          status: "error",
          error: {
            kind,
            message: redactSecrets(e instanceof Error ? e.message : String(e), apiKey),
          },
          latency_ms: Math.round(performance.now() - started),
          usage: ai?.usage ?? null,
          decision: "not_applicable",
        },
        apiKey,
      );
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: Decision, applied?: GeneratorSettings) => {
    if (!result) return;
    setResult({ ...result, decision });
    const appliedKeys = result.review.fields
      .filter((f) => f.valid && f.changed && selected.has(f.key))
      .map((f) => f.key);
    try {
      await auditStore().update(result.entryId, {
        decision,
        decided_at: new Date().toISOString(),
        edited_output:
          decision === "edited" && applied
            ? JSON.stringify({ applied_fields: appliedKeys, settings: applied }, null, 2)
            : undefined,
      });
    } catch {
      setAuditNotice(
        "Your decision could not be written to the audit log in this browser.",
      );
    }
  };

  const apply = () => {
    if (!result) return;
    const next = applyFields(current, result.review, selected);
    const decision = decisionFor(result.review, selected);
    onApply(next);
    void decide(decision, next);
    const n = result.review.fields.filter(
      (f) => f.valid && f.changed && selected.has(f.key),
    ).length;
    toast.success(
      n === 0
        ? "Nothing to change: the settings already match."
        : `Applied ${n} ${n === 1 ? "change" : "changes"}. Review the form, then press Generate.`,
    );
  };

  const fields = result?.review.fields ?? [];
  const visible = fields.filter((f) => showUnchanged || f.changed || !f.valid);
  const hidden = fields.length - visible.length;
  const applicable = fields.filter((f) => f.valid && f.changed);
  const selectedCount = applicable.filter((f) => selected.has(f.key)).length;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl border border-dashed border-input bg-card/70"
      data-ai-focus-fallback
      tabIndex={-1}
    >
      <h2 id={`${id}-title`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Sparkles className="size-4 shrink-0 text-sa-blue" aria-hidden />
          <span className="font-heading text-base font-semibold">
            Describe a test scenario
          </span>
          <span className="rounded-full border px-2 py-0.5 font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
            Optional AI · your own key
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>

      {open && (
        <div id={`${id}-panel`} className="space-y-4 border-t px-4 py-4">
          <p className="max-w-3xl text-sm text-ink-soft">
            Say what test data you need. A language model proposes generator settings, and
            you review each change before anything is applied. Sent to{" "}
            {PROVIDER_HOST[settings.provider]}: your description, the current settings and
            the list of councils and remoteness areas. No addresses, nothing about you.
            Every call is recorded in the{" "}
            <Link
              href="/ai-log"
              className="text-primary underline decoration-primary/40 underline-offset-2"
            >
              AI audit log
            </Link>{" "}
            in this browser.
          </p>

          <div className="space-y-1.5">
            <label htmlFor={`${id}-scenario`} className="text-sm font-medium">
              Scenario
            </label>
            <textarea
              id={`${id}-scenario`}
              value={scenario}
              onChange={(e) => setScenario(e.target.value.slice(0, MAX_SCENARIO_LENGTH))}
              rows={3}
              maxLength={MAX_SCENARIO_LENGTH}
              placeholder="For example: 300 addresses spread evenly across remoteness areas, with coordinates, as CSV."
              aria-describedby={`${id}-count`}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p
              id={`${id}-count`}
              className="text-right font-mono text-[0.7rem] text-muted-foreground"
            >
              {scenario.length}/{MAX_SCENARIO_LENGTH}
            </p>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Example scenarios"
          >
            {EXAMPLES.map((ex) => (
              <Button
                key={ex}
                type="button"
                variant="secondary"
                size="xs"
                className="h-auto max-w-full py-1 text-left whitespace-normal"
                onClick={() => setScenario(ex)}
              >
                {ex}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {ready && hasKey ? (
              <Button
                id={`${id}-go`}
                type="button"
                onClick={propose}
                disabled={busy || !trimmed}
              >
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles aria-hidden />
                )}
                {busy ? "Asking the model…" : "Propose settings"}
              </Button>
            ) : (
              <Button
                id={`${id}-go`}
                type="button"
                variant="outline"
                onClick={openAiSettings}
              >
                <KeyRound aria-hidden /> Add your API key
              </Button>
            )}
            {busy && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => abortRef.current?.abort()}
              >
                <X aria-hidden /> Cancel
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {ready && hasKey
                ? `${modelLabel(modelFor(settings))} via ${PROVIDER_LABEL[settings.provider]}. `
                : "Everything else on the site works without a key. "}
              <button
                type="button"
                onClick={openAiSettings}
                className="text-primary underline decoration-primary/40 underline-offset-2"
              >
                AI settings
              </button>
            </span>
          </div>

          {error && (
            <p
              role="alert"
              className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2 text-sm"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden
              />
              {error}
            </p>
          )}
          {auditNotice && (
            <p role="status" className="text-sm text-sa-gold">
              {auditNotice}
            </p>
          )}

          {result && (
            <div
              className="space-y-4 rounded-lg border border-sa-blue/30 bg-sa-blue/[0.04] p-4"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1 rounded-[3px] border-[1.5px] border-sa-blue px-1.5 py-px font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-sa-blue uppercase">
                  <Sparkles className="size-3" aria-hidden /> AI-generated
                </span>
                <span className="text-xs text-muted-foreground">
                  Proposal by {modelLabel(result.model)} via{" "}
                  {PROVIDER_LABEL[result.provider]} · {formatInt(result.latencyMs)} ms
                  {result.usage
                    ? ` · ${formatInt(result.usage.input_tokens)} tokens in, ${formatInt(result.usage.output_tokens)} out`
                    : ""}
                </span>
                {result.decision !== "pending" && (
                  <span className="rounded-full border px-2 py-0.5 text-xs">
                    {result.decision === "rejected"
                      ? "Rejected: nothing changed"
                      : result.decision === "edited"
                        ? "Applied in part"
                        : "Applied"}
                  </span>
                )}
              </div>

              <p className="max-w-3xl text-sm whitespace-pre-wrap">
                {result.proposal.rationale}
              </p>

              {result.proposal.unsupported.length > 0 && (
                <div className="rounded-lg border border-sa-gold/40 bg-sa-gold/[0.08] px-3 py-2 text-sm">
                  <p className="font-medium">This generator cannot do:</p>
                  <ul className="mt-1 list-disc pl-5 text-ink-soft">
                    {result.proposal.unsupported.slice(0, 6).map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.proposal.assumptions.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium">Assumptions</p>
                  <ul className="mt-1 list-disc pl-5 text-ink-soft">
                    {result.proposal.assumptions.slice(0, 6).map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              <fieldset disabled={result.decision !== "pending"} className="min-w-0">
                <legend className="mb-2 text-sm font-medium">
                  Review the proposed changes
                </legend>
                <div className="rounded-lg border bg-card text-sm">
                  <div
                    aria-hidden
                    className="hidden grid-cols-[3rem_10rem_minmax(0,1fr)_minmax(0,1fr)] border-b px-3 py-2 text-xs text-muted-foreground sm:grid"
                  >
                    <span>Apply</span>
                    <span>Setting</span>
                    <span>Now</span>
                    <span>Proposed</span>
                  </div>
                  <ul>
                    {visible.map((f) => {
                      const box = `${id}-f-${f.key}`;
                      return (
                        <li
                          key={f.key}
                          className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-b px-3 py-2.5 last:border-0 sm:grid-cols-[3rem_10rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-0"
                        >
                          <input
                            id={box}
                            type="checkbox"
                            checked={f.valid && f.changed && selected.has(f.key)}
                            disabled={!f.valid || !f.changed}
                            onChange={(e) =>
                              setSelected((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(f.key);
                                else next.delete(f.key);
                                return next;
                              })
                            }
                            className="mt-0.5 size-4 accent-[var(--primary)]"
                          />
                          <label htmlFor={box} className="font-medium sm:font-normal">
                            <span className="sr-only">Apply </span>
                            {f.label}
                          </label>
                          <p className="col-start-2 font-mono text-xs text-muted-foreground sm:col-start-auto">
                            <span className="font-sans sm:hidden">Now: </span>
                            {f.current}
                          </p>
                          <div className="col-start-2 sm:col-start-auto">
                            <span className="text-xs sm:hidden">Proposed: </span>
                            <span
                              className={cn(
                                "font-mono text-xs",
                                !f.valid && "text-destructive line-through",
                              )}
                            >
                              {f.proposed}
                            </span>
                            {f.note && (
                              <span
                                className={cn(
                                  "mt-0.5 block text-xs",
                                  f.valid ? "text-muted-foreground" : "text-destructive",
                                )}
                              >
                                {f.note}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowUnchanged(true)}
                    className="mt-2 text-xs text-primary underline decoration-primary/40 underline-offset-2"
                  >
                    Show {hidden} unchanged {hidden === 1 ? "setting" : "settings"}
                  </button>
                )}
                {result.decision === "pending" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={apply}
                      disabled={selectedCount === 0 && applicable.length > 0}
                    >
                      <ShieldCheck aria-hidden />
                      {applicable.length === 0
                        ? "Keep the current settings"
                        : `Apply ${selectedCount} of ${applicable.length}`}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void decide("rejected")}
                    >
                      Reject
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Applying fills in the form; nothing is generated until you press
                      Generate.
                    </span>
                  </div>
                )}
              </fieldset>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
