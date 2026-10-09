"use client";

import { useId, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  EQUAL_REMOTENESS_WEIGHTS,
  configRemotenessWeights,
} from "@/lib/generator/weights";
import {
  sampleSizeForShares,
  sampleSizePerStratum,
  zeroEventUpperBound,
  zeroFailureSampleSize,
} from "@/lib/stats";
import { RA_SHORT } from "@/lib/suburbs";
import { formatInt, formatPctFixed } from "@/lib/utils";

type Confidence = "0.9" | "0.95" | "0.99";

const inputClass =
  "h-8 w-20 rounded-md border border-input bg-background px-2 text-right font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";

/** Parse a percentage field ("2" -> 0.02); null when out of (0, max). */
function parsePct(text: string, max = 50): number | null {
  const v = Number(text.trim());
  return Number.isFinite(v) && v > 0 && v < max ? v / 100 : null;
}

function ConfidencePicker({
  value,
  onChange,
  labelId,
}: {
  value: Confidence;
  onChange: (v: Confidence) => void;
  labelId: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as Confidence)}
      aria-labelledby={labelId}
    >
      <ToggleGroupItem value="0.9">90%</ToggleGroupItem>
      <ToggleGroupItem value="0.95">95%</ToggleGroupItem>
      <ToggleGroupItem value="0.99">99%</ToggleGroupItem>
    </ToggleGroup>
  );
}

function Card({
  title,
  question,
  children,
}: {
  title: string;
  question: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{question}</p>
      </div>
      {children}
    </section>
  );
}

export function SampleSizeCalculator() {
  const id = useId();
  // 1. share precision
  const [marginA, setMarginA] = useState("2");
  const [confA, setConfA] = useState<Confidence>("0.95");
  const [targets, setTargets] = useState<"config" | "equal">("config");
  const [jointA, setJointA] = useState(false);
  // 2. per-stratum rate
  const [marginB, setMarginB] = useState("5");
  const [planningB, setPlanningB] = useState("50");
  const [confB, setConfB] = useState<Confidence>("0.95");
  const [jointB, setJointB] = useState(false);
  // 3. zero failures
  const [rateC, setRateC] = useState("1");
  const [confC, setConfC] = useState<Confidence>("0.95");

  const mA = parsePct(marginA);
  const weights =
    targets === "config" ? configRemotenessWeights() : [...EQUAL_REMOTENESS_WEIGHTS];
  const a = mA ? sampleSizeForShares(weights, mA, Number(confA), jointA) : null;

  const mB = parsePct(marginB);
  const pB = parsePct(planningB, 100);
  const b = mB && pB ? sampleSizePerStratum(5, mB, Number(confB), pB, jointB) : null;

  const rC = parsePct(rateC);
  const nC = rC ? zeroFailureSampleSize(rC, Number(confC)) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        title="Share precision"
        question="How many addresses so each remoteness area's realised share lands within ±E of its target?"
      >
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-ma`} className="block text-xs text-muted-foreground">
              Margin ±E (percentage points)
            </label>
            <input
              id={`${id}-ma`}
              inputMode="decimal"
              value={marginA}
              onChange={(e) => setMarginA(e.target.value)}
              aria-invalid={!mA}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <p id={`${id}-ca`} className="text-xs text-muted-foreground">
              Confidence
            </p>
            <ConfidencePicker value={confA} onChange={setConfA} labelId={`${id}-ca`} />
          </div>
          <div className="space-y-1">
            <p id={`${id}-ta`} className="text-xs text-muted-foreground">
              Targets
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={targets}
              onValueChange={(v) => v && setTargets(v as "config" | "equal")}
              aria-labelledby={`${id}-ta`}
            >
              <ToggleGroupItem value="config">config.py</ToggleGroupItem>
              <ToggleGroupItem value="equal">Equal</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={jointA}
            onChange={(e) => setJointA(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          All five at once (Bonferroni)
        </label>
        {a ? (
          <>
            <table className="w-full text-sm">
              <caption className="sr-only">Addresses needed per remoteness area</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 font-medium">
                    Area
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                    Target
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                    Normal
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Exact
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs tabular-nums">
                {a.strata.map((s, h) => (
                  <tr key={RA_SHORT[h]} className="border-b last:border-0">
                    <th
                      scope="row"
                      className="py-1.5 pr-2 text-left font-sans text-sm font-normal"
                    >
                      {RA_SHORT[h]}
                    </th>
                    <td className="py-1.5 pr-2 text-right">
                      {formatPctFixed(s.share, 0)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{formatInt(s.normal)}</td>
                    <td className="py-1.5 text-right">
                      {Number.isFinite(s.exact) ? formatInt(s.exact) : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm" aria-live="polite">
              Generate at least{" "}
              <strong className="font-mono font-semibold">{formatInt(a.total)}</strong>{" "}
              addresses with a weighted design.
              {a.total > 5000
                ? " That is more than one run allows (5,000): combine seeds."
                : ""}{" "}
              A stratified design needs no margin: its shares are exact.
            </p>
            <p className="text-xs text-muted-foreground">
              Exact is the smallest n from which the binomial chance that the share lands
              within ±E is at least the confidence, for that n and every larger one. It
              runs a little above the normal approximation because the window can only
              hold whole addresses.
              {a.exact
                ? ""
                : " Beyond 100,000 addresses the exact search stops (n/a) and the total uses the normal approximation."}
              {jointA
                ? ` Each area is sized at ${formatPctFixed(a.confidencePerStratum)} so all five hold together.`
                : ""}
            </p>
          </>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            Enter a margin between 0 and 50 percentage points.
          </p>
        )}
      </Card>

      <Card
        title="Per-area estimate"
        question="How many addresses in each area to estimate a rate there (say, how often your parser rejects an address) within ±E?"
      >
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-mb`} className="block text-xs text-muted-foreground">
              Margin ±E (points)
            </label>
            <input
              id={`${id}-mb`}
              inputMode="decimal"
              value={marginB}
              onChange={(e) => setMarginB(e.target.value)}
              aria-invalid={!mB}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-pb`} className="block text-xs text-muted-foreground">
              Expected rate (%)
            </label>
            <input
              id={`${id}-pb`}
              inputMode="decimal"
              value={planningB}
              onChange={(e) => setPlanningB(e.target.value)}
              aria-invalid={!pB}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <p id={`${id}-cb`} className="text-xs text-muted-foreground">
              Confidence
            </p>
            <ConfidencePicker value={confB} onChange={setConfB} labelId={`${id}-cb`} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={jointB}
            onChange={(e) => setJointB(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          All five at once (Bonferroni)
        </label>
        {b ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm" aria-live="polite">
            <strong className="font-mono font-semibold">{formatInt(b.perStratum)}</strong>{" "}
            per area,{" "}
            <strong className="font-mono font-semibold">{formatInt(b.total)}</strong> in
            total. Use the stratified design with equal quota shares to get exactly that
            many in each area
            {b.total > 5000 ? " (over two or more runs: one run stops at 5,000)" : ""}.
            {jointB
              ? ` Each interval is built at ${formatPctFixed(b.confidencePerStratum)} so all five hold together.`
              : ""}
          </p>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            Enter a margin between 0 and 50 and an expected rate between 0 and 100.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          50% is the worst case: if you expect a rate near 0% or 100%, fewer addresses
          give the same margin. Sizes use the Wilson interval, so they hold where the
          normal approximation does not.
        </p>
      </Card>

      <Card
        title="Zero failures"
        question="If none of n addresses breaks your system, how large must n be to say the failure rate is below a bound?"
      >
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-rc`} className="block text-xs text-muted-foreground">
              Failure rate below (%)
            </label>
            <input
              id={`${id}-rc`}
              inputMode="decimal"
              value={rateC}
              onChange={(e) => setRateC(e.target.value)}
              aria-invalid={!rC}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <p id={`${id}-cc`} className="text-xs text-muted-foreground">
              Confidence
            </p>
            <ConfidencePicker value={confC} onChange={setConfC} labelId={`${id}-cc`} />
          </div>
        </div>
        {rC && nC ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm" aria-live="polite">
            Test <strong className="font-mono font-semibold">{formatInt(nC)}</strong>{" "}
            addresses with no failure: the one-sided exact (Clopper-Pearson) upper bound
            is then {formatPctFixed(zeroEventUpperBound(nC, 1 - Number(confC)), 3)}. The
            &ldquo;rule of three&rdquo; gives about {formatInt(Math.ceil(3 / rC))} at 95%.
          </p>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            Enter a failure rate between 0 and 50%.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          This bounds the failure rate for addresses drawn the way you drew them. A
          uniform sample says little about rare places; stratify if every area matters.
        </p>
      </Card>
    </div>
  );
}
