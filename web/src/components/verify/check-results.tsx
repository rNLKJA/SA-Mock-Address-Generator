"use client";

import { CheckCircle2, CircleAlert, CircleMinus, Download } from "lucide-react";
import { ScrollTable } from "@/components/common/scroll-table";
import { Button } from "@/components/ui/button";
import { csvField } from "@/lib/generator/format";
import { downloadText } from "@/lib/download";
import { FIT_METHOD_LABEL, cohensWLabel } from "@/lib/stats";
import { cn, formatInt, formatP, formatPctFixed } from "@/lib/utils";
import { overallPassed } from "@/lib/verification/report";
import type {
  DistributionCheck,
  RecordCheck,
  ReproducibilityCheck,
  SetCheck,
  SetCheckStatus,
  SpatialCheck,
  VerificationResult,
} from "@/lib/verification/types";

const SHOWN_FAILURES = 20;

const STATUS_TEXT: Record<SetCheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  "not-run": "Not run",
};

function StatusIcon({
  status,
  className,
}: {
  status: SetCheckStatus;
  className?: string;
}) {
  if (status === "pass")
    return (
      <CheckCircle2
        className={cn(
          "size-4 shrink-0 text-emerald-700 dark:text-emerald-400",
          className,
        )}
        aria-hidden
      />
    );
  if (status === "fail")
    return (
      <CircleAlert
        className={cn("size-4 shrink-0 text-sa-gold", className)}
        aria-hidden
      />
    );
  return (
    <CircleMinus
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      aria-hidden
    />
  );
}

function StatusBadge({ status }: { status: SetCheckStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[0.7rem] font-medium tracking-wide uppercase",
        status === "pass" &&
          "border-emerald-700/30 bg-emerald-700/[0.06] text-emerald-800 dark:text-emerald-300",
        status === "fail" &&
          "border-sa-gold/50 bg-sa-gold/[0.1] text-amber-900 dark:text-sa-gold",
        status === "not-run" && "text-muted-foreground",
      )}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}

export function CheckResults({ result }: { result: VerificationResult }) {
  const passed = overallPassed(result);
  const failedRecord = result.recordChecks.filter((c) => c.failed > 0).length;
  const setFailed = result.setChecks.filter((c) => c.status === "fail");
  const setNotRun = result.setChecks.filter((c) => c.status === "not-run");

  return (
    <div className="space-y-8">
      <section
        aria-label="Verification summary"
        data-verdict={passed ? "pass" : "fail"}
        className={cn(
          "flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
          passed
            ? "border-emerald-700/30 bg-emerald-700/[0.06]"
            : "border-sa-gold/40 bg-sa-gold/[0.08]",
        )}
      >
        <StatusIcon status={passed ? "pass" : "fail"} className="mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">
            {passed ? "Every check passed." : "Some checks failed."}
          </p>
          <p className="text-ink-soft">
            {formatInt(result.recordChecks.length)} record-level checks on{" "}
            {formatInt(result.count)} rows:{" "}
            {failedRecord === 0
              ? "no row failed."
              : `${formatInt(result.totalFailedRows)} ${result.totalFailedRows === 1 ? "row" : "rows"} failed at least one of ${formatInt(failedRecord)} ${failedRecord === 1 ? "check" : "checks"}.`}{" "}
            {result.setChecks.length} set-level checks:{" "}
            {formatInt(result.setChecks.length - setFailed.length - setNotRun.length)}{" "}
            passed
            {setFailed.length ? `, ${setFailed.length} failed` : ""}
            {setNotRun.length ? `, ${setNotRun.length} not run` : ""}.
          </p>
        </div>
      </section>

      <section aria-labelledby="record-checks-heading" className="space-y-3">
        <div className="space-y-1">
          <h3 id="record-checks-heading" className="font-heading text-base font-semibold">
            Record-level checks
          </h3>
          <p className="text-sm text-muted-foreground">
            Each check runs on every row. Failing rows are listed with the reason and can
            be downloaded. &ldquo;N/A&rdquo; counts rows a check cannot apply to, such as
            point checks when coordinates are off.
          </p>
        </div>
        <ul className="divide-y rounded-xl border bg-card">
          {result.recordChecks.map((c) => (
            <RecordCheckRow key={c.id} check={c} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="set-checks-heading" className="space-y-3">
        <div className="space-y-1">
          <h3 id="set-checks-heading" className="font-heading text-base font-semibold">
            Set-level checks
          </h3>
          <p className="text-sm text-muted-foreground">
            Whether the set as a whole matches its design. The two distribution tests and
            the spatial test share one 5% false-alarm budget (Holm&apos;s method), so an
            honest set fails any of them about 1 time in 20 at most.
          </p>
        </div>
        <div className="space-y-4">
          {result.setChecks.map((c) => (
            <SetCheckCard key={c.id} check={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function failingRowsCsv(check: RecordCheck): string {
  const lines = [["id", "check", "reason"].join(",")];
  for (const f of check.failures)
    lines.push([f.id, check.id, f.reason].map(csvField).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

function RecordCheckRow({ check }: { check: RecordCheck }) {
  const status: SetCheckStatus =
    check.failed > 0 ? "fail" : check.passed === 0 ? "not-run" : "pass";
  return (
    <li
      className="space-y-2 px-3.5 py-3"
      data-check-id={check.id}
      data-status={status}
      aria-label={`${check.label}: ${check.passed} passed, ${check.failed} failed, ${check.skipped} not applicable`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <StatusIcon status={status} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="text-sm font-medium">{check.label}</h4>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {check.description}
          </p>
        </div>
        <p className="w-full pl-7 font-mono text-xs tabular-nums sm:w-auto sm:pl-0 sm:text-right">
          <span className="text-emerald-800 dark:text-emerald-300">
            {formatInt(check.passed)} passed
          </span>
          <span className="text-muted-foreground"> · </span>
          <span
            className={cn(
              check.failed > 0
                ? "font-semibold text-amber-900 dark:text-sa-gold"
                : "text-muted-foreground",
            )}
          >
            {formatInt(check.failed)} failed
          </span>
          {check.skipped > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {formatInt(check.skipped)} N/A
            </span>
          )}
        </p>
      </div>
      {check.failed > 0 && (
        <div className="ml-7 space-y-2 rounded-md border border-sa-gold/30 bg-sa-gold/[0.05] p-2.5">
          <ul
            className="space-y-1 text-xs"
            aria-label={`Failing rows for ${check.label}`}
          >
            {check.failures.slice(0, SHOWN_FAILURES).map((f) => (
              <li key={f.id} className="break-words">
                <span className="font-mono font-medium">Row {f.id}:</span>{" "}
                <span className="text-ink-soft">{f.reason}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {check.failed > SHOWN_FAILURES
                ? `Showing ${SHOWN_FAILURES} of ${formatInt(check.failed)} failing rows.`
                : `${formatInt(check.failed)} failing ${check.failed === 1 ? "row" : "rows"}.`}
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                downloadText(
                  `failing-rows_${check.id}.csv`,
                  failingRowsCsv(check),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download aria-hidden /> Failing rows (CSV)
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function SetCheckCard({ check }: { check: SetCheck }) {
  return (
    <article
      data-check-id={check.id}
      data-status={check.status}
      aria-labelledby={`${check.id}-title`}
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4",
        check.status === "fail" && "border-sa-gold/50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4
          id={`${check.id}-title`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <StatusIcon status={check.status} />
          {check.label}
        </h4>
        <StatusBadge status={check.status} />
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">{check.summary}</p>
      {check.kind === "distribution" && <DistributionDetailsView check={check} />}
      {check.kind === "spatial" && <SpatialDetailsView check={check} />}
      {check.kind === "reproducibility" && <ReproducibilityDetailsView check={check} />}
    </article>
  );
}

/** "0.60" or "< 0.001", for a value under a "p-value" label. */
const pv = (p: number) => formatP(p).replace(/^p = /, "").replace(/^p /, "");

function Stat({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 px-2.5 py-1.5">
      <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm break-words", mono && "font-mono tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}

function StatGrid({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {children}
    </dl>
  );
}

function DistributionDetailsView({ check }: { check: DistributionCheck }) {
  const d = check.details;
  if (!d) return null;
  const t = d.test;
  return (
    <div className="space-y-3">
      {t && (
        <StatGrid label={`${check.label}: test statistics`}>
          <Stat label="Pearson χ²" value={t.chiSquare.toFixed(2)} />
          <Stat label="Degrees of freedom" value={String(t.df)} />
          <Stat label="Asymptotic χ² p-value" value={pv(t.chiSquareP)} />
          {t.method !== "chi-square" && (
            <Stat
              label={`${FIT_METHOD_LABEL[t.method][0].toUpperCase()}${FIT_METHOD_LABEL[t.method].slice(1)} p-value`}
              value={pv(t.pValue)}
            />
          )}
          {d.holm && d.holm.tests > 1 && (
            <Stat
              label={`Holm-adjusted p (${d.holm.tests} tests)`}
              value={pv(d.holm.pAdjusted)}
            />
          )}
          <Stat
            label="Cohen's w"
            value={`${t.cohensW.toFixed(3)} (${cohensWLabel(t.cohensW)})`}
          />
          <Stat label="n" value={formatInt(d.n)} />
          {d.quotas && (
            <Stat label="Quotas" value={d.quotas.map(formatInt).join(" / ")} />
          )}
        </StatGrid>
      )}
      <ScrollTable label={`${check.label}: counts, shares and 95% Wilson intervals`}>
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">
            {check.label}: counts, shares, 95% Wilson intervals and targets
          </caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-1.5 font-medium">
                Class
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Count
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Share
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                95% Wilson interval
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Target
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Inside
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs tabular-nums">
            {d.rows.map((r) => (
              <tr key={r.label} className="border-b last:border-0">
                <th
                  scope="row"
                  className="px-3 py-1.5 text-left font-sans text-sm font-normal"
                >
                  {r.label}
                </th>
                <td className="px-2 py-1.5 text-right">{formatInt(r.k)}</td>
                <td className="px-2 py-1.5 text-right">{formatPctFixed(r.share, 1)}</td>
                <td className="px-2 py-1.5 text-right">
                  {formatPctFixed(r.lo, 1)} to {formatPctFixed(r.hi, 1)}
                </td>
                <td className="px-2 py-1.5 text-right">{formatPctFixed(r.target, 1)}</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right font-sans",
                    !r.targetInside && "font-medium text-amber-900 dark:text-sa-gold",
                  )}
                >
                  {r.targetInside ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}

function km(v: number): string {
  return `${v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3)} km`;
}

function SpatialDetailsView({ check }: { check: SpatialCheck }) {
  const d = check.details;
  return (
    <div className="space-y-3">
      {d && (
        <StatGrid label={`${check.label}: statistics`}>
          <Stat
            label="Points (suburbs)"
            value={`${formatInt(d.points)} (${formatInt(d.suburbs)})`}
          />
          <Stat label="Mean nearest neighbour" value={km(d.meanNnKm)} />
          <Stat label="Expected under the design" value={km(d.expectedNnKm)} />
          <Stat
            label="Middle 95% of re-draws"
            value={`${km(d.simLo)} to ${km(d.simHi)}`}
          />
          <Stat label="Ratio R" value={d.ratio.toFixed(3)} />
          <Stat label="Monte Carlo p-value" value={pv(d.pValue)} />
          {d.holm && d.holm.tests > 1 && (
            <Stat
              label={`Holm-adjusted p (${d.holm.tests} tests)`}
              value={pv(d.holm.pAdjusted)}
            />
          )}
          <Stat
            label="Re-draws (seed)"
            value={`${formatInt(d.replicates)} (${d.seed})`}
          />
          {d.clarkEvans ? (
            <Stat
              label={`Clark-Evans R, ${d.clarkEvans.suburb}`}
              value={`${d.clarkEvans.r.toFixed(3)}, z = ${d.clarkEvans.z.toFixed(2)}, ${formatP(d.clarkEvans.pValue)}`}
            />
          ) : (
            <Stat
              label="Classic Clark-Evans"
              value={`Needs ${d.clarkEvansMin} points in one suburb`}
              mono={false}
            />
          )}
        </StatGrid>
      )}
      <p className="rounded-md border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Known limitation.</span>{" "}
        {check.limitation}
      </p>
    </div>
  );
}

function ReproducibilityDetailsView({ check }: { check: ReproducibilityCheck }) {
  const d = check.details;
  if (!d) return null;
  return (
    <div className="space-y-2">
      <StatGrid label={`${check.label}: bytes and hashes`}>
        <Stat label="Seed and n" value={`${d.seed}, ${formatInt(d.count)}`} />
        <Stat
          label={
            d.compared === "regenerated-twice" ? "Bytes, first run" : "Bytes, your CSV"
          }
          value={formatInt(d.bytesA)}
        />
        <Stat
          label={
            d.compared === "regenerated-twice"
              ? "Bytes, second run"
              : "Bytes, regenerated"
          }
          value={formatInt(d.bytesB)}
        />
        <Stat
          label="Identical"
          value={d.identical ? "yes, byte for byte" : "no"}
          mono={false}
        />
      </StatGrid>
      <dl className="space-y-1 font-mono text-[0.7rem] break-all text-muted-foreground">
        <div>
          <dt className="inline font-sans">SHA-256 A: </dt>
          <dd className="inline">{d.sha256A}</dd>
        </div>
        <div>
          <dt className="inline font-sans">SHA-256 B: </dt>
          <dd className="inline">{d.sha256B}</dd>
        </div>
        {d.firstDifference && (
          <div>
            <dt className="inline font-sans">
              First difference, line {d.firstDifference.line}:{" "}
            </dt>
            <dd className="inline">
              {d.firstDifference.a} | {d.firstDifference.b}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
