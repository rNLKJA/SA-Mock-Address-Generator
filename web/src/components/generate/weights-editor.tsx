"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EQUAL_DECILE_WEIGHTS,
  EQUAL_REMOTENESS_WEIGHTS,
  configDecileWeights,
  configRemotenessWeights,
  type Weights,
} from "@/lib/generator/weights";
import { RA_SHORT } from "@/lib/suburbs";
import { formatPct } from "@/lib/utils";

interface Props {
  kind: "remoteness" | "decile";
  weights: Weights;
  onChange: (weights: Weights) => void;
  /** Overrides the default legend (the stratified design calls them quota shares). */
  legend?: string;
}

export function WeightsEditor({ kind, weights, onChange, legend }: Props) {
  const values = kind === "remoteness" ? weights.remoteness : weights.decile;
  // Deciles show "D1" to "D10" so they fit the 22rem sidebar; screen readers
  // still hear "Decile 1".
  const labels =
    kind === "remoteness" ? [...RA_SHORT] : values.map((_, i) => `D${i + 1}`);
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);

  const set = (next: number[]) =>
    onChange(
      kind === "remoteness"
        ? { ...weights, remoteness: next }
        : { ...weights, decile: next },
    );

  return (
    <fieldset className="space-y-2 rounded-md border border-dashed border-input p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        {legend ??
          (kind === "remoteness" ? "Remoteness weights" : "IRSAD decile weights")}
      </legend>
      <div
        className={
          kind === "decile" ? "grid grid-cols-2 gap-x-3 gap-y-1.5" : "space-y-1.5"
        }
      >
        {values.map((v, i) => {
          const id = `w-${kind}-${i}`;
          return (
            <div key={id} className="flex items-center gap-2">
              <label htmlFor={id} className="flex-1 truncate text-xs">
                {kind === "decile" ? (
                  <>
                    <span aria-hidden>{labels[i]}</span>
                    <span className="sr-only">Decile {i + 1}</span>
                  </>
                ) : (
                  labels[i]
                )}
              </label>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                // Any non-negative weight is valid (config.py has 0.125 and an
                // AI proposal may have 1/3): a fixed step would make the
                // browser block the form.
                step="any"
                value={Number.isFinite(v) ? v : 0}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = Math.max(0, Number.parseFloat(e.target.value) || 0);
                  set(next);
                }}
                className="h-7 w-16 rounded-md border border-input bg-background px-1.5 text-right font-mono text-xs tabular-nums"
              />
              <span className="w-11 text-right font-mono text-[0.68rem] text-muted-foreground tabular-nums">
                {total > 0 ? formatPct(Math.max(0, v) / total) : "-"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            set(kind === "remoteness" ? configRemotenessWeights() : configDecileWeights())
          }
        >
          <RotateCcw aria-hidden /> config.py
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            set(
              kind === "decile"
                ? [...EQUAL_DECILE_WEIGHTS]
                : [...EQUAL_REMOTENESS_WEIGHTS],
            )
          }
        >
          {kind === "decile" ? "Equal per decile" : "Equal per area"}
        </Button>
      </div>
      {kind === "decile" && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          config.py had six bands (0 to 5) with no definition. Decile d maps to band
          round((d − 1) × 5 / 9) and each band&apos;s weight is split across its deciles.
        </p>
      )}
    </fieldset>
  );
}
