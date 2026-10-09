import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ReplayApp } from "@/components/replay/replay-app";
import parity from "@/lib/__fixtures__/original-parity.json";

export const metadata: Metadata = {
  title: "2025 replay",
  description:
    "Run a TypeScript port of the original 2025 Python CLI in the browser. Seeded runs print the same bytes as the real Python.",
};

export default function ReplayPage() {
  const cliRuns = parity.cli.length;
  const generatorRuns = parity.generate.length;
  return (
    <>
      <PageHeader eyebrow="Original replay" title="The 2025 CLI, byte for byte">
        <p>
          This is <code>cli.py generate</code> and <code>cli.py options</code> from 2025,
          ported line by line to TypeScript, including its bugs. The original never seeded
          anything: it drew the suburb with pandas <code>DataFrame.sample</code>{" "}
          (NumPy&apos;s legacy Mersenne Twister) and the street number and name with
          Python&apos;s <code>random</code>. The port reimplements both generators, so the
          same seed gives the same output as the real Python.
        </p>
      </PageHeader>
      <div className="mx-auto mb-6 max-w-7xl px-4 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <CheckCircle2
            className="size-3.5 text-emerald-700 dark:text-emerald-400"
            aria-hidden
          />
          Parity tests: {cliRuns} recorded CLI runs and {generatorRuns} generator runs
          from Python {parity.meta.python}, pandas {parity.meta.pandas}, NumPy{" "}
          {parity.meta.numpy} match exactly in CI.
        </p>
      </div>
      <ReplayApp />
    </>
  );
}
