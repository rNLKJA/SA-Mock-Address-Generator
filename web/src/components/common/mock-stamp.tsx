import { cn } from "@/lib/utils";

/** The red "MOCK" stamp carried by every generated address. */
export function MockStamp({
  className,
  label = "Mock",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn("stamp -rotate-2 select-none", className)}
      title="MOCK: synthetic test data"
    >
      {label}
    </span>
  );
}
