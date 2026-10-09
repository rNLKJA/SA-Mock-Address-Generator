"use client";

import { useId, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { GenerateResult } from "@/lib/generator/generate";
import {
  configDecileWeights,
  configRemotenessWeights,
  type WeightMode,
} from "@/lib/generator/weights";
import { FIT_METHOD_LABEL, cohensWLabel, goodnessOfFit, wilson } from "@/lib/stats";
import { RA_SHORT } from "@/lib/suburbs";
import { cn, formatInt, formatP, formatPct } from "@/lib/utils";

type Dimension = "remoteness" | "decile";
type Target = "sampler" | "config";

interface Row {
  label: string;
  k: number;
  share: number;
  lo: number;
  hi: number;
  target: number;
}

const DECILE_LABELS = [
  ...Array.from({ length: 10 }, (_, i) => `Decile ${i + 1}`),
  "No SEIFA",
];

const MODE_TARGET: Record<WeightMode, string> = {
  uniform: "each category's share of eligible suburbs (uniform sampling)",
  remoteness: "the config.py remoteness weights, renormalised over the filtered areas",
  seifa: "the config.py socio-economic weights spread over IRSAD deciles",
  population: "each category's share of 2021 usual residents",
  stratified:
    "the fixed quotas of the stratified design (remoteness) and what they imply for deciles",
};

/** Seed for Monte Carlo p-values, shown next to the result. */
const FIT_SEED = 2025;

export function TargetCheck({
  result,
  mode,
}: {
  result: GenerateResult;
  mode: WeightMode;
}) {
  const [dimension, setDimension] = useState<Dimension>("remoteness");
  const [target, setTarget] = useState<Target>("sampler");
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  const n = result.addresses.length;
  const rows: Row[] = useMemo(() => {
    const observed =
      dimension === "remoteness" ? result.observed.remoteness : result.observed.decile;
    let probs: number[];
    if (target === "config") {
      probs =
        dimension === "remoteness"
          ? configRemotenessWeights()
          : [...configDecileWeights(), 0];
    } else {
      probs =
        dimension === "remoteness" ? result.expected.remoteness : result.expected.decile;
    }
    const total = probs.reduce((a, b) => a + b, 0) || 1;
    const labels = dimension === "remoteness" ? [...RA_SHORT] : DECILE_LABELS;
    return labels
      .map((label, i) => {
        const [lo, hi] = wilson(observed[i], n);
        return {
          label,
          k: observed[i],
          share: n ? observed[i] / n : 0,
          lo,
          hi,
          target: probs[i] / total,
        };
      })
      .filter((r) => r.k > 0 || r.target > 0);
  }, [dimension, target, result, n]);

  const gof = useMemo(
    () =>
      goodnessOfFit(
        rows.map((r) => r.k),
        rows.map((r) => r.target),
        { seed: FIT_SEED },
      ),
    [rows],
  );
  const impossible = rows.some((r) => r.k > 0 && r.target === 0);
  // A stratified sample's remoteness counts are fixed by its quotas: there is
  // no sampling variation, so a test would be meaningless.
  const fixedByDesign = mode === "stratified" && dimension === "remoteness";
  const maxGap = Math.max(0, ...rows.map((r) => Math.abs(r.share - r.target)));
  const maxValue = Math.min(
    1,
    Math.ceil(
      Math.max(
        ...rows.map((r) => Math.max(fixedByDesign ? r.share : r.hi, r.target)),
        0.1,
      ) * 10,
    ) / 10,
  );
  const ticks = Array.from(
    { length: Math.round(maxValue * 10) + 1 },
    (_, i) => i / 10,
  ).filter((_, i, all) => all.length <= 6 || i % 2 === 0);
  const pct = (v: number) => `${(v / maxValue) * 100}%`;
  const activeRow = active !== null ? rows[active] : null;

  const verdict = (() => {
    if (fixedByDesign) {
      return {
        tone: maxGap < 0.0005 ? ("ok" as const) : ("info" as const),
        text: `Counts are fixed by the stratified design (${result.quotas?.map(formatInt).join(" / ") ?? "quotas"}), so there is no sampling variation to test. Largest gap between the realised share and this target: ${(maxGap * 100).toFixed(2)} percentage points${maxGap > 5e-5 && target === "sampler" ? ", from rounding quotas to whole addresses" : ""}.`,
      };
    }
    if (n < 30) {
      return {
        tone: "info" as const,
        text: "Generate at least a few hundred addresses for a meaningful check.",
      };
    }
    if (impossible) {
      return {
        tone: "alert" as const,
        text: "Some addresses fall in categories this target gives zero weight, so the sample cannot match it.",
      };
    }
    if (!gof)
      return {
        tone: "info" as const,
        text: "Only one category is in play, so there is nothing to test.",
      };
    const method =
      gof.method === "monte-carlo"
        ? `${FIT_METHOD_LABEL[gof.method]} (${formatInt(gof.replicates ?? 0)} draws, seed ${gof.seed})`
        : FIT_METHOD_LABEL[gof.method];
    const stat = `${method[0].toUpperCase()}${method.slice(1)}: ${formatP(gof.pValue)} (χ²(${gof.df}) = ${gof.statistic.toFixed(2)}, n = ${formatInt(gof.n)}, Cohen's w = ${gof.w.toFixed(3)}, ${cohensWLabel(gof.w)}).`;
    if (gof.pValue >= 0.05) {
      return {
        tone: "ok" as const,
        text: `${stat} Consistent with the target: gaps this size turn up by chance ${gof.pValue >= 0.5 ? "often" : "regularly"}.`,
      };
    }
    return {
      tone: "alert" as const,
      text: `${stat} The sample departs from this target by more than chance would explain.`,
    };
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground" id={`${tableId}-dim`}>
            Break down by
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={dimension}
            onValueChange={(v) => v && setDimension(v as Dimension)}
            aria-labelledby={`${tableId}-dim`}
          >
            <ToggleGroupItem value="remoteness">Remoteness</ToggleGroupItem>
            <ToggleGroupItem value="decile">SEIFA decile</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground" id={`${tableId}-target`}>
            Compare with
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={target}
            onValueChange={(v) => v && setTarget(v as Target)}
            aria-labelledby={`${tableId}-target`}
          >
            <ToggleGroupItem value="sampler">This mode&apos;s target</ToggleGroupItem>
            <ToggleGroupItem value="config">README promise (config.py)</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {target === "sampler" ? (
          <>Target: {MODE_TARGET[mode]}.</>
        ) : (
          <>
            Target: the weights in <code className="font-mono text-xs">config.py</code>{" "}
            that the 2025 README said generation followed (they were never applied).
          </>
        )}{" "}
        {fixedByDesign
          ? "Bars show the realised share, fixed by the quotas (so there is no interval); the dark tick is the target."
          : "Bars show the realised share with a 95% Wilson interval; the dark tick is the target."}
      </p>

      <figure
        aria-describedby={`${tableId}-summary`}
        className="rounded-lg border bg-[var(--viz-surface)] p-4"
      >
        <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-5 rounded-r-[3px] bg-[var(--viz-series)]"
            />{" "}
            Realised share
          </span>
          <span className={cn("flex items-center gap-1.5", fixedByDesign && "hidden")}>
            <svg aria-hidden width="20" height="10">
              <line
                x1="2"
                x2="18"
                y1="5"
                y2="5"
                stroke="var(--viz-ci)"
                strokeWidth="1.5"
              />
              <line
                x1="2"
                x2="2"
                y1="2"
                y2="8"
                stroke="var(--viz-ci)"
                strokeWidth="1.5"
              />
              <line
                x1="18"
                x2="18"
                y1="2"
                y2="8"
                stroke="var(--viz-ci)"
                strokeWidth="1.5"
              />
            </svg>
            95% interval
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3.5 w-0.5 bg-[var(--viz-target)]"
            />{" "}
            Target
          </span>
        </figcaption>
        <div className="grid grid-cols-[minmax(5.5rem,auto)_1fr_auto] items-center gap-x-3">
          {rows.map((r, i) => (
            <div
              key={r.label}
              role="group"
              tabIndex={0}
              aria-label={`${r.label}: ${formatPct(r.share)} realised (${formatInt(r.k)} of ${formatInt(n)})${fixedByDesign ? ", fixed by the quotas" : `, 95% interval ${formatPct(r.lo)} to ${formatPct(r.hi)}`}, target ${formatPct(r.target)}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className={cn(
                "col-span-3 grid grid-cols-subgrid items-center rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === i && "bg-foreground/[0.04]",
              )}
            >
              <span className="truncate text-sm">{r.label}</span>
              <div className="relative h-7">
                {ticks.map((t) => (
                  <span
                    key={t}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-[var(--viz-grid)]"
                    style={{ left: pct(t) }}
                  />
                ))}
                <span
                  aria-hidden
                  className="absolute top-1.5 bottom-1.5 left-0 rounded-r-[4px] bg-[var(--viz-series)]"
                  style={{ width: pct(r.share) }}
                />
                <svg
                  aria-hidden
                  className={cn(
                    "absolute inset-0 h-full w-full overflow-visible",
                    fixedByDesign && "hidden",
                  )}
                >
                  <line
                    x1={pct(r.lo)}
                    x2={pct(r.hi)}
                    y1="50%"
                    y2="50%"
                    stroke="var(--viz-ci)"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={pct(r.lo)}
                    x2={pct(r.lo)}
                    y1="30%"
                    y2="70%"
                    stroke="var(--viz-ci)"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={pct(r.hi)}
                    x2={pct(r.hi)}
                    y1="30%"
                    y2="70%"
                    stroke="var(--viz-ci)"
                    strokeWidth="1.5"
                  />
                </svg>
                <span
                  aria-hidden
                  className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--viz-target)]"
                  style={{ left: pct(r.target) }}
                />
              </div>
              <span className="w-28 text-right font-mono text-xs tabular-nums">
                {formatPct(r.share)}
                <span className="text-muted-foreground"> / {formatPct(r.target)}</span>
              </span>
            </div>
          ))}
          <span />
          <div className="relative h-4" aria-hidden>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 font-mono text-[0.65rem] text-muted-foreground"
                style={{ left: pct(t) }}
              >
                {Math.round(t * 100)}%
              </span>
            ))}
          </div>
          <span className="w-28 text-right text-[0.65rem] text-muted-foreground">
            realised / target
          </span>
        </div>
        <p className="mt-3 min-h-5 text-xs text-muted-foreground" aria-live="polite">
          {activeRow
            ? `${activeRow.label}: ${formatInt(activeRow.k)} of ${formatInt(n)} addresses (${formatPct(activeRow.share)}${fixedByDesign ? ", fixed by the quotas" : `, 95% CI ${formatPct(activeRow.lo)} to ${formatPct(activeRow.hi)}`}). Target ${formatPct(activeRow.target)}, so about ${formatInt(Math.round(activeRow.target * n))} expected.`
            : "Hover or focus a row for counts and the expected number."}
        </p>
      </figure>

      <div
        id={`${tableId}-summary`}
        className={cn(
          "flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
          verdict.tone === "ok" && "border-emerald-700/30 bg-emerald-700/[0.06]",
          verdict.tone === "alert" && "border-sa-gold/40 bg-sa-gold/[0.08]",
        )}
      >
        {verdict.tone === "ok" ? (
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
            aria-hidden
          />
        ) : verdict.tone === "alert" ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-sa-gold" aria-hidden />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="space-y-1">
          <p>
            <span className="font-medium">
              {fixedByDesign
                ? "Fixed by design. "
                : verdict.tone === "ok"
                  ? "On target. "
                  : verdict.tone === "alert"
                    ? "Off target. "
                    : "Not enough to test. "}
            </span>
            {verdict.text}
          </p>
          {!fixedByDesign && gof && n >= 30 && gof.method !== "chi-square" && (
            <p className="text-xs text-muted-foreground">
              {gof.method === "exact"
                ? "The sample is small enough to enumerate every possible count vector, so the p-value is exact rather than the chi-square approximation."
                : `${gof.lowExpected} ${gof.lowExpected === 1 ? "category expects" : "categories expect"} fewer than 5 addresses, so the p-value is simulated from the target instead of read from the chi-square curve.`}
            </p>
          )}
          {mode === "stratified" && dimension === "decile" && n >= 30 && (
            <p className="text-xs text-muted-foreground">
              Under the stratified design decile counts vary less than in a simple random
              sample, so this test is conservative: p-values run high.
            </p>
          )}
        </div>
      </div>

      <details className="group rounded-lg border bg-card">
        <summary className="cursor-pointer rounded-lg px-3.5 py-2.5 text-sm font-medium select-none hover:bg-muted/60">
          Show as a table
        </summary>
        <div
          tabIndex={0}
          role="region"
          aria-label="Target check table (scrolls sideways on small screens)"
          className="overflow-x-auto rounded-b-lg px-3.5 pb-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 text-right font-medium">Count</th>
                <th className="py-2 pr-3 text-right font-medium">Realised</th>
                <th className="py-2 pr-3 text-right font-medium">95% Wilson CI</th>
                <th className="py-2 pr-3 text-right font-medium">Target</th>
                <th className="py-2 text-right font-medium">Expected</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {rows.map((r) => (
                <tr key={r.label} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-sans text-sm">{r.label}</td>
                  <td className="py-1.5 pr-3 text-right">{formatInt(r.k)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatPct(r.share)}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatPct(r.lo)} to {formatPct(r.hi)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{formatPct(r.target)}</td>
                  <td className="py-1.5 text-right">{(r.target * n).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
