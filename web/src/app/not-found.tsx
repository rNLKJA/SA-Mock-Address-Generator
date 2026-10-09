import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MockStamp } from "@/components/common/mock-stamp";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-5 px-4 py-24 sm:px-6">
      <p className="eyebrow">Error 404</p>
      <h1 className="text-4xl font-semibold">No such place on this map</h1>
      <div className="flex items-center gap-3 rounded-md border border-dashed border-input bg-card px-3 py-2.5">
        <p className="address-tag">404 Nowhere Street, OFF THE MAP SA 0000</p>
        <MockStamp />
      </div>
      <p className="text-muted-foreground">
        The page you asked for doesn&apos;t exist. Unlike the 2025 generator, this site
        won&apos;t silently send you somewhere random instead.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/">Back to the start</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/generate">Generate addresses</Link>
        </Button>
      </div>
    </div>
  );
}
