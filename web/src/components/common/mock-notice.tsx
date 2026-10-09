import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function MockNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-lg border border-sa-red/30 bg-sa-red/[0.06] px-3.5 py-3 text-sm",
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-sa-red" aria-hidden />
      <p className="text-ink-soft">
        <strong className="font-mono text-[0.8rem] tracking-wide text-sa-red">
          MOCK: synthetic test data.
        </strong>{" "}
        The street numbers and names are random, so an address can coincide with a real
        one. Use these for software testing only: never for mail, identity checks, or
        paired with a person&apos;s name.
      </p>
    </div>
  );
}
