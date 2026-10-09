import type { ReactNode } from "react";
import { RA_NAMES, displayName, type Suburb } from "@/lib/suburbs";
import { cn, formatInt, formatPct } from "@/lib/utils";

export interface OriginalRowView {
  postcode: number;
  council: string;
  remoteness: string;
  ses: number;
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 border-b border-dashed py-1.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", mono && "font-mono text-[0.8rem] tabular-nums")}>
        {children}
      </dd>
    </div>
  );
}

/** Attributes of one rebuilt suburb, optionally beside its 2025 table row. */
export function SuburbCard({
  suburb,
  original,
  className,
  children,
}: {
  suburb: Suburb;
  original?: OriginalRowView | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-xl font-semibold">{displayName(suburb)}</h3>
        <span className="font-mono text-xs text-muted-foreground">SAL {suburb.code}</span>
      </div>
      {children}
      <dl>
        <Row label="Postcode (POA)" mono>
          {suburb.postcode}
          {suburb.postcodes.length > 1 && (
            <span className="text-muted-foreground">
              {" "}
              · also {suburb.postcodes.filter((p) => p !== suburb.postcode).join(", ")}
            </span>
          )}
        </Row>
        <Row label="Council (LGA)">{suburb.council}</Row>
        <Row label="Remoteness">
          {RA_NAMES[suburb.ra]}
          {suburb.raShare < 1 && (
            <span className="text-muted-foreground">
              {" "}
              ({formatPct(suburb.raShare)} of residents)
            </span>
          )}
        </Row>
        <Row label="IRSAD decile">
          {suburb.decileSa === null ? (
            <span className="text-muted-foreground">
              Not published (small population)
            </span>
          ) : (
            <>
              {suburb.decileSa} in SA{" "}
              <span className="text-muted-foreground">
                · {suburb.decileAus} nationally · score {suburb.irsad}
              </span>
            </>
          )}
        </Row>
        <Row label="Residents (2021)" mono>
          {formatInt(suburb.pop)}
        </Row>
        <Row label="Area" mono>
          {suburb.areaKm2 >= 100
            ? formatInt(Math.round(suburb.areaKm2))
            : suburb.areaKm2.toFixed(1)}{" "}
          km²
        </Row>
      </dl>
      {original !== undefined && (
        <div className="mt-3 rounded-lg bg-muted/70 p-3">
          <p className="eyebrow mb-1.5">2025 table said</p>
          {original ? (
            <p className="font-mono text-[0.78rem] leading-relaxed">
              postcode {original.postcode} · {original.council} · {original.remoteness} ·
              SES {original.ses}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No row with this name in the 2025 table.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
