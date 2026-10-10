"use client";

import { useState } from "react";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import type { VerificationResult, DistributionCheck, SpatialCheck } from "@/lib/verification/types";
import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/download";
import { cn, formatInt, formatPctFixed, formatP } from "@/lib/utils";

interface CheckResultsProps {
  result: VerificationResult;
}

export function CheckResults({ result }: CheckResultsProps) {
  const allPassed = result.totalFailedRows === 0 && result.setChecks.every((c) => c.passed);

  const downloadFailedIds = (checkId: string, failedIds: number[]) => {
    const csv = `id\n${failedIds.join("\n")}\n`;
    downloadText(`failed-ids_${checkId}.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section
        aria-label="Verification summary"
        className={cn(
          "rounded-lg border p-4",
          allPassed
            ? "border-green-600/40 bg-green-600/[0.06]"
            : "border-amber-600/40 bg-amber-600/[0.06]"
        )}
      >
        <h3 className="text-sm font-semibold">
          {allPassed ? "✅ All checks passed" : "⚠️ Some checks failed"}
        </h3>
        {!allPassed && (
          <p className="mt-1 text-sm text-muted-foreground">
            {formatInt(result.totalFailedRows)} unique records failed at least one check.
          </p>
        )}
      </section>

      {/* Record-level checks */}
      <section aria-labelledby="record-checks-heading">
        <h3 id="record-checks-heading" className="mb-3 font-heading text-base font-semibold">
          Record-Level Checks
        </h3>
        <div className="space-y-3">
          {result.recordChecks.map((check) => {
            const allPass = check.failed === 0;
            const failureRate = check.passed + check.failed > 0
              ? check.failed / (check.passed + check.failed)
              : 0;

            return (
              <article
                key={check.id}
                className={cn(
                  "rounded-lg border p-3",
                  allPass ? "border-border" : "border-amber-600/40 bg-amber-600/[0.04]"
                )}
                aria-label={`${check.label} check result`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium">
                      <span aria-hidden>{allPass ? "✅" : "⚠️"}</span> {check.label}
                      <span className="sr-only">{allPass ? "passed" : "failed"}</span>
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Passed: {formatInt(check.passed)} · Failed: {formatInt(check.failed)}
                      {!allPass && (
                        <span className="ml-1">
                          ({formatPctFixed(failureRate, 2)} failure rate)
                        </span>
                      )}
                    </p>
                    {check.failed > 0 && check.failedIds.length <= 20 && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                        IDs: {check.failedIds.join(", ")}
                      </p>
                    )}
                    {check.failed > 20 && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        IDs: {check.failedIds.slice(0, 20).join(", ")} …{" "}
                        <span className="text-foreground">({formatInt(check.failed - 20)} more)</span>
                      </p>
                    )}
                  </div>
                  {check.failed > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadFailedIds(check.id, check.failedIds)}
                      aria-label={`Download failed IDs for ${check.label}`}
                    >
                      <Download className="size-3.5" aria-hidden /> CSV
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Set-level checks */}
      <section aria-labelledby="set-checks-heading">
        <h3 id="set-checks-heading" className="mb-3 font-heading text-base font-semibold">
          Set-Level Checks
        </h3>
        <div className="space-y-3">
          {result.setChecks.map((check) => (
            <SetCheckCard key={check.id} check={check} />
          ))}
        </div>
      </section>
    </div>
  );
}

interface SetCheckCardProps {
  check: VerificationResult["setChecks"][number];
}

function SetCheckCard({ check }: SetCheckCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = check.details != null;

  // Type guards for specific check types
  const isDistributionCheck = (c: typeof check): c is DistributionCheck =>
    hasDetails && "fit" in (c.details as Record<string, unknown>);

  const isSpatialCheck = (c: typeof check): c is SpatialCheck =>
    hasDetails && "R" in (c.details as Record<string, unknown>);

  return (
    <article
      className={cn(
        "rounded-lg border p-3",
        check.passed ? "border-border" : "border-amber-600/40 bg-amber-600/[0.04]"
      )}
      aria-label={`${check.label} check result`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium">
            <span aria-hidden>{check.passed ? "✅" : "⚠️"}</span> {check.label}
            <span className="sr-only">{check.passed ? "passed" : "failed"}</span>
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">{check.message}</p>

          {/* Expandable details */}
          {expanded && hasDetails && (
            <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-2.5 text-xs">
              {isDistributionCheck(check) && (
                <DistributionDetails check={check} />
              )}
              {isSpatialCheck(check) && (
                <SpatialDetails check={check} />
              )}
              {!isDistributionCheck(check) && !isSpatialCheck(check) && (
                <pre className="overflow-auto font-mono text-[0.7rem]">
                  {JSON.stringify(check.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {hasDetails && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Hide details" : "Show details"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </Button>
        )}
      </div>
    </article>
  );
}

function DistributionDetails({ check }: { check: DistributionCheck }) {
  const { fit, dimension } = check.details;

  return (
    <dl className="space-y-1.5">
      <div>
        <dt className="inline font-medium">Dimension:</dt>{" "}
        <dd className="inline">{dimension === "remoteness" ? "Remoteness" : "SEIFA decile"}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Method:</dt>{" "}
        <dd className="inline">{fit.method}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Statistic:</dt>{" "}
        <dd className="inline font-mono">{fit.statistic.toFixed(4)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">p-value:</dt>{" "}
        <dd className="inline font-mono">{formatP(fit.pValue)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Degrees of freedom:</dt>{" "}
        <dd className="inline font-mono">{fit.df}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Effect size (Cohen's w):</dt>{" "}
        <dd className="inline font-mono">{fit.w.toFixed(4)}</dd>
      </div>
    </dl>
  );
}

function SpatialDetails({ check }: { check: SpatialCheck }) {
  const details = check.details;

  return (
    <dl className="space-y-1.5">
      <div>
        <dt className="inline font-medium">Clark-Evans R:</dt>{" "}
        <dd className="inline font-mono">{details.r.toFixed(4)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Expected:</dt>{" "}
        <dd className="inline font-mono">{details.expected.toFixed(4)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Standard error:</dt>{" "}
        <dd className="inline font-mono">{details.se.toFixed(6)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">z-score:</dt>{" "}
        <dd className="inline font-mono">{details.z.toFixed(4)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">p-value:</dt>{" "}
        <dd className="inline font-mono">{formatP(details.pValue)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Interpretation:</dt>{" "}
        <dd className="inline">
          {details.r < 1 ? "Clustered" : details.r > 1 ? "Dispersed" : "Random"}
          {details.pValue < 0.05 ? " (significant at α=0.05)" : " (not significant)"}
        </dd>
      </div>
    </dl>
  );
}
