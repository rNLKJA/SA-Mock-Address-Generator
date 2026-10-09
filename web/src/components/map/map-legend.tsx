"use client";

import { useTheme } from "next-themes";
import { DECILE_RAMP, NEUTRAL, REMOTENESS_RAMP, type ThemeName } from "@/lib/palette";
import { RA_SHORT } from "@/lib/suburbs";
import { formatInt } from "@/lib/utils";
import type { ColorBy } from "./sa-map";

export interface LegendCounts {
  remoteness?: number[];
  decile?: number[];
  noDecile?: number;
  original?: { ra: number[]; notApplicable: number; unmatched: number };
}

function Swatch({ color, hollow }: { color: string; hollow?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 shrink-0 rounded-[3px] border border-foreground/15"
      style={{ background: hollow ? "transparent" : color }}
    />
  );
}

export function MapLegend({
  colorBy,
  counts,
}: {
  colorBy: ColorBy;
  counts: LegendCounts;
}) {
  const { resolvedTheme } = useTheme();
  const theme: ThemeName = resolvedTheme === "dark" ? "dark" : "light";
  if (colorBy === "none") return null;
  if (colorBy === "seifa") {
    const ramp = DECILE_RAMP[theme];
    return (
      <figure
        className="space-y-2"
        aria-label="Legend: SEIFA IRSAD decile within South Australia"
      >
        <figcaption className="text-xs text-muted-foreground">
          IRSAD decile, ranked within SA (1 = most disadvantaged)
        </figcaption>
        <div className="grid grid-cols-10 gap-0.5">
          {ramp.map((c, i) => (
            <div key={c} className="space-y-1 text-center">
              <div className="h-3 rounded-[2px]" style={{ background: c }} />
              <span className="block font-mono text-[0.65rem] text-muted-foreground">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Swatch color={NEUTRAL[theme]} /> No published decile
          {counts.noDecile !== undefined && ` (${formatInt(counts.noDecile)} suburbs)`}
        </p>
      </figure>
    );
  }
  const ramp = REMOTENESS_RAMP[theme];
  const original = colorBy === "original" ? counts.original : undefined;
  const values = colorBy === "original" ? original?.ra : counts.remoteness;
  return (
    <figure
      className="space-y-1.5"
      aria-label={
        colorBy === "original"
          ? "Legend: 2025 table remoteness"
          : "Legend: remoteness area"
      }
    >
      <figcaption className="text-xs text-muted-foreground">
        {colorBy === "original"
          ? "Remoteness as recorded in the 2025 table (by suburb name)"
          : "ABS Remoteness Area 2021 (majority of residents)"}
      </figcaption>
      <ul className="space-y-1 text-sm">
        {RA_SHORT.map((name, i) => (
          <li key={name} className="flex items-center gap-2">
            <Swatch color={ramp[i]} />
            <span className="flex-1">{name}</span>
            {values && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatInt(values[i])}
              </span>
            )}
          </li>
        ))}
        {original && (
          <>
            <li className="flex items-center gap-2">
              <Swatch color={NEUTRAL[theme]} />
              <span className="flex-1">&ldquo;Not Applicable&rdquo;</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatInt(original.notApplicable)}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Swatch color="" hollow />
              <span className="flex-1">No matching 2025 row</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatInt(original.unmatched)}
              </span>
            </li>
          </>
        )}
      </ul>
    </figure>
  );
}
