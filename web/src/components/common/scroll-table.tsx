import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A table wrapper that scrolls sideways on small screens. It is focusable and
 * labelled, so keyboard users can scroll it with the arrow keys.
 */
export function ScrollTable({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={`${label} (scrolls sideways on small screens)`}
      className={cn(
        "overflow-x-auto rounded-xl border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
