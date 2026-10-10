"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Loader2, Play, RotateCw, Upload } from "lucide-react";
import { MockNotice } from "@/components/common/mock-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CancelledError } from "@/hooks/use-generator-worker";
import { useVerifyWorker } from "@/hooks/use-verify-worker";
import { downloadText } from "@/lib/download";
import type { GenerateOptions } from "@/lib/generator/generate";
import { WEIGHT_MODES, defaultWeights, type WeightMode } from "@/lib/generator/weights";
import { RA_SHORT } from "@/lib/suburbs";
import { cn, formatInt } from "@/lib/utils";
import { parseVerifyParams } from "@/lib/verification/params";
import {
  designLabel,
  generateJSONReport,
  generateMarkdownReport,
  settingsLine,
} from "@/lib/verification/report";
import type { VerificationResult } from "@/lib/verification/types";
import { CheckResults } from "./check-results";
import { SpotCheck } from "./spot-check";

type Shown = { result: VerificationResult } | { error: string } | null;

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function HandoffSettings({ options }: { options: GenerateOptions }) {
  const d = defaultWeights();
  const f = options.filters;
  const filters = [
    f.suburb && `suburb ${f.suburb}`,
    f.council && `council ${f.council}`,
    f.ra !== null && f.ra !== undefined && RA_SHORT[f.ra],
    f.decile !== null && f.decile !== undefined && `decile ${f.decile}`,
  ].filter(Boolean);
  const customWeights =
    !sameList(options.weights.remoteness, d.remoteness) ||
    !sameList(options.weights.decile, d.decile);
  const rows: [string, string][] = [
    ["Seed", String(options.seed)],
    ["Addresses", formatInt(options.count)],
    ["Design", designLabel(options.mode)],
    ["Filters", filters.length ? filters.join(", ") : "none"],
    ["Weights", customWeights ? "custom (carried over)" : "config.py defaults"],
    ["Coordinates", options.coordinates ? "on" : "off"],
  ];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function VerificationApp() {
  const formId = useId();
  const params = useSearchParams();
  const search = params.toString();
  const handoff = useMemo(() => parseVerifyParams(new URLSearchParams(search)), [search]);
  const verify = useVerifyWorker();

  const [shown, setShown] = useState<Shown>(null);
  /** The query string whose hand-off has finished (so a new one shows as busy). */
  const [handoffDone, setHandoffDone] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvMode, setCsvMode] = useState<WeightMode>("uniform");
  const [csvSeed, setCsvSeed] = useState("");
  const [spotOn, setSpotOn] = useState(false);
  const latest = useRef(0);

  const seedTrim = csvSeed.trim();
  const seedError =
    seedTrim === "" || (/^\d+$/.test(seedTrim) && Number(seedTrim) <= 0xffffffff)
      ? null
      : "Use a whole number from 0 to 4,294,967,295, or leave it empty.";

  // The hand-off from /generate runs by itself. State is only set in the
  // promise callbacks.
  useEffect(() => {
    if (handoff.kind !== "ok") return;
    const request = ++latest.current;
    let alive = true;
    verify({ kind: "handoff", options: handoff.options })
      .then((result) => {
        if (!alive) return;
        setHandoffDone(search);
        if (request === latest.current) setShown({ result });
      })
      .catch((e: unknown) => {
        if (!alive || e instanceof CancelledError) return;
        setHandoffDone(search);
        if (request === latest.current)
          setShown({ error: e instanceof Error ? e.message : "Verification failed." });
      });
    return () => {
      alive = false;
    };
  }, [handoff, search, verify]);

  const handoffBusy = handoff.kind === "ok" && handoffDone !== search;
  const busy = handoffBusy || csvBusy || rerunBusy;

  const rerun = useCallback(async () => {
    if (handoff.kind !== "ok") return;
    const request = ++latest.current;
    setRerunBusy(true);
    setSpotOn(false);
    try {
      const result = await verify({ kind: "handoff", options: handoff.options });
      if (request === latest.current) setShown({ result });
    } catch (e) {
      if (e instanceof CancelledError) return;
      if (request === latest.current)
        setShown({ error: e instanceof Error ? e.message : "Verification failed." });
    } finally {
      setRerunBusy(false);
    }
  }, [handoff, verify]);

  const runCsv = useCallback(
    async (text: string) => {
      if (seedError) return;
      const request = ++latest.current;
      setCsvBusy(true);
      setSpotOn(false);
      try {
        const result = await verify({
          kind: "csv",
          csv: text,
          options: { mode: csvMode, seed: seedTrim === "" ? null : Number(seedTrim) },
        });
        if (request === latest.current) setShown({ result });
      } catch (e) {
        if (e instanceof CancelledError) return;
        if (request === latest.current)
          setShown({ error: e instanceof Error ? e.message : "Verification failed." });
      } finally {
        setCsvBusy(false);
      }
    },
    [csvMode, seedError, seedTrim, verify],
  );

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setCsvText(text.length <= 200_000 ? text : "");
    void runCsv(text);
  };

  const result = shown && "result" in shown ? shown.result : null;
  const error =
    handoff.kind === "error"
      ? handoff.error
      : shown && "error" in shown
        ? shown.error
        : null;

  const download = (format: "md" | "json") => {
    if (!result) return;
    const stamp = result.timestamp.slice(0, 19).replace(/:/g, "-");
    const name = `verification-report_${result.seed !== null ? `seed-${result.seed}_` : ""}${stamp}.${format}`;
    if (format === "md")
      downloadText(name, generateMarkdownReport(result), "text/markdown;charset=utf-8");
    else downloadText(name, generateJSONReport(result), "application/json;charset=utf-8");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
      <MockNotice />
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------- Input ---------- */}
        <div className="h-fit min-w-0 space-y-5 lg:sticky lg:top-20">
          <section
            aria-labelledby={`${formId}-handoff`}
            className="space-y-3 rounded-xl border bg-card p-4"
          >
            <h2 id={`${formId}-handoff`} className="font-heading text-lg font-semibold">
              Run from Generate
            </h2>
            {handoff.kind === "ok" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Carried over from /generate. The set is regenerated here with the
                  site&apos;s own generator and every check runs automatically.
                </p>
                <HandoffSettings options={handoff.options} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={rerun} disabled={busy}>
                    <RotateCw aria-hidden /> Run the checks again
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/generate">
                      <ArrowLeft aria-hidden /> Generate another set
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Generate a set on{" "}
                <Link
                  href="/generate"
                  className="text-primary underline decoration-primary/40 underline-offset-2"
                >
                  /generate
                </Link>{" "}
                and choose{" "}
                <strong className="font-medium text-foreground">
                  Verify these results
                </strong>
                : the seed, count, design, filters and weights come with you, and every
                check runs on the identical set. Or check a CSV below.
              </p>
            )}
          </section>

          <section
            aria-labelledby={`${formId}-csv-heading`}
            className="space-y-3 rounded-xl border bg-card p-4"
          >
            <h2
              id={`${formId}-csv-heading`}
              className="font-heading text-lg font-semibold"
            >
              Or check a CSV
            </h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void runCsv(csvText);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-csv`}>
                  CSV in the site&apos;s export format
                </Label>
                <textarea
                  id={`${formId}-csv`}
                  className="min-h-32 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                  placeholder="id,stamp,full_address,street_address,…"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <label
                htmlFor={`${formId}-file`}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm transition-colors",
                  busy
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-primary hover:bg-muted/50",
                )}
              >
                <Upload className="size-4" aria-hidden /> Or upload a CSV file
                <input
                  id={`${formId}-file`}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={busy}
                  onChange={onFile}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${formId}-mode`}>Design</Label>
                  <Select
                    value={csvMode}
                    onValueChange={(v) => setCsvMode(v as WeightMode)}
                  >
                    <SelectTrigger id={`${formId}-mode`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${formId}-seed`}>Seed (optional)</Label>
                  <Input
                    id={`${formId}-seed`}
                    inputMode="numeric"
                    value={csvSeed}
                    onChange={(e) => setCsvSeed(e.target.value)}
                    aria-invalid={Boolean(seedError)}
                    aria-describedby={`${formId}-seed-hint`}
                    placeholder="e.g. 2025"
                  />
                </div>
              </div>
              <p id={`${formId}-seed-hint`} className="text-xs text-muted-foreground">
                {seedError ??
                  "With the seed, the CSV is regenerated and compared byte for byte. Targets assume no filters and the default weights."}
              </p>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || !csvText.trim() || Boolean(seedError)}
              >
                {csvBusy ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Play aria-hidden />
                )}
                {csvBusy ? "Verifying…" : "Verify CSV"}
              </Button>
            </form>
          </section>
        </div>

        {/* ---------- Results ---------- */}
        <section
          aria-labelledby={`${formId}-results`}
          // On a phone, a run carried over from /generate shows its results first.
          className={cn(
            "min-w-0 space-y-4",
            handoff.kind === "ok" && "max-lg:order-first",
          )}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 id={`${formId}-results`} className="font-heading text-lg font-semibold">
                Results
              </h2>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {busy && "Running every check in a Web Worker…"}
                {!busy &&
                  result &&
                  `${settingsLine(result)} · ${result.ms.toFixed(0)} ms in a Web Worker · ${new Date(result.timestamp).toLocaleString("en-AU")}`}
              </p>
            </div>
            {result && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => download("md")}>
                  <Download aria-hidden /> Report (Markdown)
                </Button>
                <Button variant="outline" size="sm" onClick={() => download("json")}>
                  <Download aria-hidden /> JSON
                </Button>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3.5 py-3 text-sm"
            >
              <p className="font-medium text-destructive">The checks could not run</p>
              <p className="mt-1 whitespace-pre-wrap text-ink-soft">{error}</p>
            </div>
          )}

          {busy && !result && (
            <div className="flex h-48 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {handoffBusy
                ? "Regenerating the set and running every check…"
                : "Running every check…"}
            </div>
          )}

          {!busy && !result && !error && (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              Arrive from Generate&apos;s &ldquo;Verify these results&rdquo;, or check a
              CSV, to see the results here.
            </div>
          )}

          {result && (
            <div className={cn("space-y-8", busy && "opacity-60 transition-opacity")}>
              <p className="text-xs text-muted-foreground">
                {result.settingsNote} Design:{" "}
                {designLabel(result.settings?.mode ?? "uniform")}.
              </p>
              <CheckResults result={result} />

              <section
                aria-labelledby={`${formId}-spot`}
                className="space-y-3 rounded-xl border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3
                      id={`${formId}-spot`}
                      className="font-heading text-base font-semibold"
                    >
                      Live spot check (optional)
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Off by default. Reverse-geocodes up to{" "}
                      {formatInt(result.spotSample.length || 10)} sampled points with a
                      live geocoder. Nothing is sent until you turn it on and press the
                      button.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`${formId}-spot-on`}
                      checked={spotOn}
                      onCheckedChange={setSpotOn}
                    />
                    <Label htmlFor={`${formId}-spot-on`}>Turn on</Label>
                  </div>
                </div>
                {spotOn && (
                  <SpotCheck key={result.timestamp} points={result.spotSample} />
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
