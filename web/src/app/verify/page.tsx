import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { VerificationApp } from "@/components/verify/verification-app";

export const metadata: Metadata = {
  title: "Verify",
  description:
    "Verify a generated set of mock South Australian addresses: record checks against the ABS reference table and suburb boundaries, the design's distribution, spatial spread, byte-for-byte reproducibility and an optional live spot check.",
};

export default function VerifyPage() {
  return (
    <>
      <PageHeader eyebrow="Verification Lab" title="Verify a generated set">
        <p>
          Every record is checked against the site&apos;s own reference data: fields and
          format, the SA postcode, the suburb, its council, remoteness class and IRSAD
          decile, and whether the point lies inside its suburb&apos;s ABS boundary. The
          set as a whole is checked against its design (a goodness-of-fit test with Wilson
          intervals), for spatial spread, and for byte-for-byte reproducibility from the
          seed. Everything runs in your browser.
        </p>
      </PageHeader>
      <Suspense
        fallback={
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 text-sm text-muted-foreground sm:px-6">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the
            Verification Lab…
          </div>
        }
      >
        <VerificationApp />
      </Suspense>
    </>
  );
}
