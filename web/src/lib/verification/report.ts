/**
 * The one-page verification report, as Markdown and as JSON.
 */
import { WEIGHT_MODES } from "@/lib/generator/weights";
import { MOCK_STAMP, RA_SHORT } from "@/lib/suburbs";
import { formatInt, formatP, formatPctFixed } from "@/lib/utils";
import type { SetCheck, SetCheckStatus, VerificationResult } from "./types";

const STATUS: Record<SetCheckStatus, string> = {
  pass: "PASS",
  fail: "FAIL",
  "not-run": "NOT RUN",
};

/** Overall verdict: every record passes and no set-level check fails. */
export function overallPassed(result: VerificationResult): boolean {
  return (
    result.totalFailedRows === 0 && result.setChecks.every((c) => c.status !== "fail")
  );
}

export function designLabel(mode: string): string {
  return WEIGHT_MODES.find((m) => m.value === mode)?.label ?? mode;
}

/** One line describing the settings the targets came from. */
export function settingsLine(result: VerificationResult): string {
  const s = result.settings;
  if (!s) return "No settings.";
  const parts = [
    `${formatInt(result.count)} addresses`,
    result.seed !== null ? `seed ${result.seed}` : "seed unknown",
    designLabel(s.mode),
  ];
  const f = s.filters;
  if (f.suburb) parts.push(`suburb ${f.suburb}`);
  if (f.council) parts.push(`council ${f.council}`);
  if (f.ra !== null && f.ra !== undefined) parts.push(RA_SHORT[f.ra] ?? `area ${f.ra}`);
  if (f.decile !== null && f.decile !== undefined) parts.push(`decile ${f.decile}`);
  parts.push(s.coordinates ? "coordinates on" : "coordinates off");
  return parts.join(" · ");
}

function setCheckMarkdown(c: SetCheck): string[] {
  const out = [`### ${STATUS[c.status]}: ${c.label}`, "", c.summary, ""];
  if (c.kind === "distribution" && c.details) {
    out.push("| Class | Count | Share | 95% Wilson interval | Target | Target inside |");
    out.push("| --- | ---: | ---: | --- | ---: | :---: |");
    for (const r of c.details.rows) {
      out.push(
        `| ${r.label} | ${formatInt(r.k)} | ${formatPctFixed(r.share, 1)} | ${formatPctFixed(r.lo, 1)} to ${formatPctFixed(r.hi, 1)} | ${formatPctFixed(r.target, 1)} | ${r.targetInside ? "yes" : "no"} |`,
      );
    }
    out.push("");
  }
  if (c.kind === "spatial") {
    if (c.details?.clarkEvans) {
      const ce = c.details.clarkEvans;
      out.push(
        `Classic Clark-Evans (Donnelly edge correction) for ${ce.suburb}, ${formatInt(ce.n)} points: R = ${ce.r.toFixed(3)}, z = ${ce.z.toFixed(2)}, ${formatP(ce.pValue)}.`,
        "",
      );
    }
    out.push(`Known limitation: ${c.limitation}`, "");
  }
  if (c.kind === "reproducibility" && c.details) {
    out.push(`- SHA-256 of the set: \`${c.details.sha256A}\``);
    out.push(`- SHA-256 of the regeneration: \`${c.details.sha256B}\``);
    if (c.details.firstDifference) {
      const d = c.details.firstDifference;
      out.push(`- First difference, line ${d.line}: \`${d.a}\` against \`${d.b}\``);
    }
    out.push("");
  }
  return out;
}

export function generateMarkdownReport(result: VerificationResult): string {
  const lines: string[] = [];
  const passed = overallPassed(result);
  lines.push("# SA Mock Address Lab: verification report", "");
  lines.push(`> ${MOCK_STAMP}. Every address checked here is synthetic.`, "");
  lines.push(`- **Generated:** ${result.timestamp}`);
  lines.push(`- **Seed:** ${result.seed ?? "not given"}`);
  lines.push(`- **Set:** ${settingsLine(result)}`);
  lines.push(
    `- **Source:** ${result.source === "generate" ? "regenerated from /generate" : "CSV"}. ${result.settingsNote}`,
  );
  lines.push("");
  lines.push("## Summary", "");
  const failedSet = result.setChecks.filter((c) => c.status === "fail").length;
  lines.push(
    passed
      ? `**All checks passed.** ${formatInt(result.recordChecks.length)} record-level checks on ${formatInt(result.count)} rows, and no set-level check failed.`
      : `**Some checks failed.** ${formatInt(result.totalFailedRows)} of ${formatInt(result.count)} rows failed at least one record-level check, and ${formatInt(failedSet)} set-level check${failedSet === 1 ? "" : "s"} failed.`,
  );
  lines.push("");

  lines.push("## Record-level checks", "");
  lines.push("| Check | Passed | Failed | Not applicable |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const c of result.recordChecks) {
    lines.push(
      `| ${c.failed ? "FAIL" : "PASS"}: ${c.label} | ${formatInt(c.passed)} | ${formatInt(c.failed)} | ${formatInt(c.skipped)} |`,
    );
  }
  lines.push("");
  for (const c of result.recordChecks.filter((x) => x.failed > 0)) {
    lines.push(`### Failures: ${c.label}`, "");
    for (const f of c.failures.slice(0, 50)) lines.push(`- Row ${f.id}: ${f.reason}`);
    if (c.failures.length > 50)
      lines.push(
        `- … and ${formatInt(c.failures.length - 50)} more (see the JSON report)`,
      );
    lines.push("");
  }

  lines.push("## Set-level checks", "");
  for (const c of result.setChecks) lines.push(...setCheckMarkdown(c));

  lines.push(
    "---",
    "",
    "Generated by the SA Mock Address Lab Verification Lab (/verify).",
    "",
  );
  return lines.join("\n");
}

export function generateJSONReport(result: VerificationResult): string {
  const { spotSample: _spot, ...rest } = result;
  void _spot;
  return `${JSON.stringify(
    {
      stamp: MOCK_STAMP,
      report: "SA Mock Address Lab verification report",
      passed: overallPassed(result),
      ...rest,
    },
    null,
    2,
  )}\n`;
}
