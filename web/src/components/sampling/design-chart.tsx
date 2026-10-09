"use client";

import { useId, useState } from "react";
import { DESIGN_COLOR } from "@/lib/palette";
import type { DesignStudy } from "@/lib/sampling/design-study";
import { cn, formatInt, formatPctFixed } from "@/lib/utils";

/**
 * Range plot of the realised remoteness shares across seeds: for each area,
 * one line per design from the 2.5th to the 97.5th percentile of 200 seeds,
 * a dot at the mean, and a dark tick at the config.py target.
 */
export function DesignChart({ study }: { study: DesignStudy }) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const strata = study.designs[0].strata.map((s) => s.label);
  const max = Math.min(
    1,
    Math.ceil(
      Math.max(
        ...study.designs.flatMap((d) =>
          d.strata.map((s) => Math.max(s.range[1], s.target)),
        ),
      ) * 10,
    ) / 10,
  );
  const ticks = Array.from({ length: Math.round(max * 10) + 1 }, (_, i) => i / 10);
  const x = (v: number) => `${(v / max) * 100}%`;

  const describe = (h: number) => {
    const parts = study.designs.map((d) => {
      const s = d.strata[h];
      return d.id === "stratified"
        ? `${d.label} ${formatPctFixed(s.meanShare)} in every seed`
        : `${d.label} ${formatPctFixed(s.meanShare)} on average, 95% of seeds between ${formatPctFixed(s.range[0])} and ${formatPctFixed(s.range[1])}`;
    });
    return `${strata[h]}: target ${formatPctFixed(study.target[h], 0)}. ${parts.join("; ")}.`;
  };

  return (
    <figure
      aria-labelledby={`${id}-cap`}
      className="rounded-xl border bg-[var(--viz-surface)] p-4 sm:p-5"
    >
      <figcaption id={`${id}-cap`} className="sr-only">
        Realised share of each remoteness area across {formatInt(study.replicates)} seeds
        of {formatInt(study.n)} addresses, for the three designs, against the config.py
        target.
      </figcaption>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {study.designs.map((d) => (
          <span key={d.id} className="flex items-center gap-1.5">
            <svg aria-hidden width="22" height="10">
              <line
                x1="2"
                x2="20"
                y1="5"
                y2="5"
                stroke={DESIGN_COLOR[d.id]}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle
                cx="11"
                cy="5"
                r="3.5"
                fill={DESIGN_COLOR[d.id]}
                stroke="var(--viz-surface)"
                strokeWidth="1.5"
              />
            </svg>
            <span className="text-foreground">{d.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3.5 w-0.5 bg-[var(--viz-target)]" />
          Target (config.py)
        </span>
        <span>Line: middle 95% of seeds · dot: mean</span>
      </div>

      <div className="grid grid-cols-[minmax(6.5rem,auto)_1fr] items-center gap-x-3 sm:grid-cols-[minmax(7.5rem,auto)_1fr_auto]">
        {strata.map((label, h) => (
          <div
            key={label}
            role="group"
            tabIndex={0}
            aria-label={describe(h)}
            onMouseEnter={() => setActive(h)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(h)}
            onBlur={() => setActive(null)}
            className={cn(
              "col-span-2 grid grid-cols-subgrid items-center rounded-md py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-3",
              active === h && "bg-foreground/[0.04]",
            )}
          >
            <span className="text-sm">{label}</span>
            <div className="relative h-12">
              {ticks.map((t) => (
                <span
                  key={t}
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-[var(--viz-grid)]"
                  style={{ left: x(t) }}
                />
              ))}
              <span
                aria-hidden
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--viz-target)]"
                style={{ left: x(study.target[h]) }}
              />
              <svg
                aria-hidden
                className="absolute inset-0 h-full w-full overflow-visible"
              >
                {study.designs.map((d, k) => {
                  const s = d.strata[h];
                  const y = `${20 + k * 30}%`;
                  return (
                    <g key={d.id}>
                      <line
                        x1={x(s.range[0])}
                        x2={x(s.range[1])}
                        y1={y}
                        y2={y}
                        stroke={DESIGN_COLOR[d.id]}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={x(s.meanShare)}
                        cy={y}
                        r="4.5"
                        fill={DESIGN_COLOR[d.id]}
                        stroke="var(--viz-surface)"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
            <span className="hidden w-16 text-right font-mono text-xs text-muted-foreground tabular-nums sm:block">
              {formatPctFixed(study.target[h], 0)}
            </span>
          </div>
        ))}
        <span />
        <div className="relative h-4" aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 font-mono text-[0.65rem] text-muted-foreground"
              style={{ left: x(t) }}
            >
              {Math.round(t * 100)}%
            </span>
          ))}
        </div>
        <span className="hidden w-16 text-right text-[0.65rem] text-muted-foreground sm:block">
          target
        </span>
      </div>
      <p className="mt-3 min-h-10 text-xs text-muted-foreground" aria-live="polite">
        {active !== null
          ? describe(active)
          : "Hover or focus an area for the numbers behind each line."}
      </p>
    </figure>
  );
}
