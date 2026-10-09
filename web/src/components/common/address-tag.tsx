import { MockStamp } from "@/components/common/mock-stamp";
import { cn } from "@/lib/utils";

export interface AddressTagProps {
  index?: number;
  fullAddress: string;
  meta?: string[];
  coords?: [number, number] | null;
  className?: string;
}

/** A field-notebook address label: mono address line, stamp, small meta row. */
export function AddressTag({
  index,
  fullAddress,
  meta,
  coords,
  className,
}: AddressTagProps) {
  return (
    <div
      className={cn(
        "group relative rounded-md border border-dashed border-input bg-card px-3 py-2.5 shadow-[0_1px_0_rgb(0_0_0/0.03)]",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {index !== undefined && (
          <span className="mt-px w-9 shrink-0 font-mono text-[0.68rem] text-muted-foreground tabular-nums">
            {String(index).padStart(3, "0")}
          </span>
        )}
        <p className="address-tag min-w-0 flex-1 break-words">{fullAddress}</p>
        <MockStamp className="mt-px shrink-0" />
      </div>
      {(meta?.length || coords) && (
        <p
          className={cn(
            "mt-1 text-xs text-muted-foreground",
            index !== undefined && "pl-11",
          )}
        >
          {meta?.filter(Boolean).join(" · ")}
          {coords && (
            <span className="font-mono">
              {meta?.length ? " · " : ""}
              {coords[1].toFixed(5)}, {coords[0].toFixed(5)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
