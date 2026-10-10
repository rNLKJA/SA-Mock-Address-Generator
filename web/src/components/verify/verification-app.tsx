"use client";

import { useCallback, useId, useState, useEffect } from "react";
import { Download, Loader2, Play, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VerificationResult } from "@/lib/verification/types";
import { parseAddressesCSV } from "@/lib/verification/csv-parser";
import {
  generateMarkdownReport,
  generateJSONReport,
  type ReportData,
} from "@/lib/verification/report";
import { downloadText } from "@/lib/download";
import { CheckResults } from "./check-results";
import { PageHeader } from "@/components/common/page-header";
import { MockNotice } from "@/components/common/mock-notice";
import { cn } from "@/lib/utils";
import type { Suburb } from "@/lib/suburbs";
import { runVerification } from "@/lib/verification/verify";

interface VerifyRun {
  result: VerificationResult;
}

export function VerificationApp() {
  const formId = useId();
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<VerifyRun | null>(null);
  const [tab, setTab] = useState("results");
  const [suburbs, setSuburbs] = useState<Suburb[]>([]);

  useEffect(() => {
    fetch("/data/suburbs.json")
      .then((res) => res.json())
      .then((data) => setSuburbs(data.rows))
      .catch((err) => console.error("Failed to load suburbs", err));
  }, []);

  const runVerificationAsync = useCallback(
    async (csvContent: string) => {
      setBusy(true);
      setError(null);
      try {
        const parsed = parseAddressesCSV(csvContent);
        if (parsed.errors.length > 0) {
          setError(`CSV parsing errors:\n${parsed.errors.slice(0, 5).join("\n")}`);
          return;
        }
        if (parsed.addresses.length === 0) {
          setError("No addresses found in CSV.");
          return;
        }
        const result = await runVerification(parsed.addresses, suburbs);
        setRun({ result });
      } catch (e) {
        setRun(null);
        setError(e instanceof Error ? e.message : "Verification failed.");
      } finally {
        setBusy(false);
      }
    },
    [suburbs],
  );

  const onPasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runVerificationAsync(csvText);
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    void runVerificationAsync(text);
  };

  const downloadReport = (format: "md" | "json") => {
    if (!run) return;
    const reportData: ReportData = {
      result: run.result,
      addresses: [],
    };
    const content =
      format === "md"
        ? generateMarkdownReport(reportData)
        : generateJSONReport(reportData);
    const ext = format === "md" ? "md" : "json";
    const mime =
      format === "md" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8";
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    downloadText(`verification-report_${timestamp}.${ext}`, content, mime);
  };

  return (
    <>
      <PageHeader
        eyebrow="Verification Lab"
        title="Verify mock address generation results"
      >
        <p>
          Upload or paste a generated CSV to run comprehensive checks: record-level
          validation (required fields, SA postcodes, reference data matches,
          point-in-polygon, duplicates), set-level tests (distribution goodness-of-fit,
          spatial spread, reproducibility), and a downloadable verification report.
        </p>
      </PageHeader>

      <div className="mx-auto mb-6 max-w-7xl px-4 sm:px-6">
        <MockNotice />
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------- Input ---------- */}
        <div className="h-fit space-y-5 rounded-xl border bg-card p-4 lg:sticky lg:top-20">
          <h2 className="font-heading text-lg font-semibold">Input</h2>

          <form onSubmit={onPasteSubmit} className="space-y-3">
            <Label htmlFor={`${formId}-csv`}>Paste CSV</Label>
            <textarea
              id={`${formId}-csv`}
              className="min-h-[12rem] w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              placeholder="id,stamp,full_address,..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy || !csvText.trim()}>
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Play aria-hidden />
              )}
              {busy ? "Verifying…" : "Verify CSV"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor={`${formId}-file`}>Upload CSV file</Label>
            <label
              htmlFor={`${formId}-file`}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-sm transition-colors",
                busy
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-primary hover:bg-muted/50",
              )}
            >
              <Upload className="size-5" aria-hidden />
              Choose CSV file
              <input
                id={`${formId}-file`}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={busy}
                onChange={onFileUpload}
              />
            </label>
          </div>
        </div>

        {/* ---------- Results ---------- */}
        <section aria-labelledby={`${formId}-results`} className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 id={`${formId}-results`} className="font-heading text-lg font-semibold">
                Results
              </h2>
              {run && (
                <p className="text-sm text-muted-foreground">
                  {run.result.count} addresses · {run.result.totalFailedRows} failed at
                  least one check
                  {run.result.seed !== null && ` · seed ${run.result.seed}`}
                </p>
              )}
            </div>
            {run && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadReport("md")}>
                  <Download aria-hidden /> Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadReport("json")}
                >
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
              <p className="font-medium text-destructive">Verification failed</p>
              <pre className="mt-1 whitespace-pre-wrap text-ink-soft">{error}</pre>
            </div>
          )}

          {!run && !error && !busy && (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              Paste or upload a CSV to start verification.
            </div>
          )}

          {busy && (
            <div className="flex h-64 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Running verification
              checks…
            </div>
          )}

          {run && (
            <Tabs
              value={tab}
              onValueChange={setTab}
              className={cn(busy && "opacity-60 transition-opacity")}
            >
              <TabsList className="h-9">
                <TabsTrigger value="results">Results</TabsTrigger>
              </TabsList>

              <TabsContent value="results" className="mt-2">
                <CheckResults result={run.result} />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>
    </>
  );
}
