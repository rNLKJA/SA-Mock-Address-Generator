import type { Metadata } from "next";
import Link from "next/link";
import { AuditLogView } from "@/components/ai/audit-log-view";
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = {
  title: "AI audit log",
  description:
    "Every optional AI call made from this browser: the input sent, the output, provider, model, latency, token usage and your decision. Stored locally in IndexedDB, exportable as JSON or CSV.",
  robots: { index: false },
};

export default function AiLogPage() {
  return (
    <>
      <PageHeader eyebrow="Transparency" title="AI audit log">
        <p>
          Every call made by the optional &ldquo;Describe a test scenario&rdquo; feature
          is recorded here: when it happened, which provider and model answered, exactly
          what was sent, what came back, how long it took, the token usage the provider
          reported, which checks the proposal failed, and what you decided to do with it.
          The log lives in this browser&apos;s IndexedDB. This site keeps no copy, and the
          API key is never part of an entry.
        </p>
      </PageHeader>
      <div className="mx-auto max-w-7xl space-y-4 px-4 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Export the log as JSON or CSV to keep a record. The{" "}
          <Link
            className="text-primary underline decoration-primary/40 underline-offset-2"
            href="/methods#ai-use"
          >
            AI use statement
          </Link>{" "}
          explains what the AI does, what it never does and what is sent.
        </p>
        <AuditLogView />
      </div>
    </>
  );
}
